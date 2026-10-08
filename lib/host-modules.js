/**
 * Loads the harness's own capability-seam modules.
 *
 * A profile plugin is imported from the profile directory, but the seam packages
 * (`@deepseek-ai/dsh-fs`, `-dsh-shell`, `-dsh-tools`, `-dsh-bash-local`) live in
 * the installed application and are not resolvable by bare specifier from there.
 * They are, however, importable by absolute path, because the harness runs on
 * Electron's Node, which reads straight through `app.asar`.
 *
 * Resolving them at runtime — rather than copying or bundling them — keeps the
 * plugin on the *same* class instances the rest of the composition uses, so
 * `extends FileSystem`, `instanceof FsError`, and duplicate-service detection all
 * behave exactly as they do for a first-party backend.
 *
 * @module dsh-ssh-remote/host-modules
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Candidate `node_modules` roots that may contain the `@deepseek-ai` packages. */
function candidateRoots() {
  const roots = [];
  const fromEnv = process.env.DSH_HOST_MODULES;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) roots.push(fromEnv);

  // Electron sets resourcesPath; the harness payload sits at <resources>/app.asar/dsh.
  if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0) {
    roots.push(join(process.resourcesPath, 'app.asar', 'dsh', 'node_modules'));
  }

  // Derive from the executable: <App>/Contents/MacOS/<exe> -> <App>/Contents/Resources.
  if (typeof process.execPath === 'string' && process.execPath.length > 0) {
    const macOsDir = dirname(process.execPath);
    const contents = dirname(macOsDir);
    roots.push(join(contents, 'Resources', 'app.asar', 'dsh', 'node_modules'));
    roots.push(join(contents, 'resources', 'app.asar', 'dsh', 'node_modules'));
  }

  // Development checkouts and a couple of conventional install locations.
  roots.push(resolve(process.cwd(), 'node_modules'));
  roots.push('/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules');
  return [...new Set(roots)];
}

/** Module entry points this plugin needs, relative to the `@deepseek-ai` scope. */
const REQUIRED = {
  cordis: 'cordis/lib/index.js',
  fs: 'dsh-fs/lib/index.js',
  fsSandbox: 'dsh-fs-sandbox/lib/index.js',
  tools: 'dsh-tools/lib/index.js',
  bashLocal: 'dsh-bash-local/lib/index.js',
  bashSandbox: 'dsh-bash-sandbox/lib/index.js',
};

let cached;

/**
 * Import the harness seam modules.
 * @returns the loaded modules plus the root they came from.
 * @throws when no candidate root supplies every module.
 */
export async function loadHostModules() {
  if (cached !== undefined) return cached;
  const failures = [];
  for (const root of candidateRoots()) {
    const scope = join(root, '@deepseek-ai');
    if (!existsSync(scope)) continue;
    try {
      const [cordis, fs, fsSandbox, tools, bashLocal, bashSandbox] = await Promise.all([
        import(pathToFileURL(join(scope, REQUIRED.cordis)).href),
        import(pathToFileURL(join(scope, REQUIRED.fs)).href),
        import(pathToFileURL(join(scope, REQUIRED.fsSandbox)).href),
        import(pathToFileURL(join(scope, REQUIRED.tools)).href),
        import(pathToFileURL(join(scope, REQUIRED.bashLocal)).href),
        import(pathToFileURL(join(scope, REQUIRED.bashSandbox)).href),
      ]);
      cached = { root: scope, cordis, fs, fsSandbox, tools, bashLocal, bashSandbox };
      return cached;
    } catch (error) {
      failures.push(`${scope}: ${error?.message ?? error}`);
    }
  }
  throw new Error(
    'dsh-ssh-remote cannot locate the harness filesystem/shell modules. '
    + `Tried:\n  ${failures.join('\n  ')}\n`
    + 'Set DSH_HOST_MODULES to the node_modules directory that contains @deepseek-ai.',
  );
}

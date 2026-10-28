#!/usr/bin/env node
/**
 * Register/unregister this plugin with DSH's native plugin manager.
 *
 * Installation is packaged by default: `npm pack` produces a tarball under
 * `<DSH_HOME>/plugin-packages`, and DSH installs that copy into its profile.
 * The source checkout can then be moved or deleted. Pass `--link` for the
 * development workflow that symlinks this checkout instead.
 *
 * The installer also migrates the former profile-local loader when it finds
 * one, preserving its custom SSH configuration.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseDocument, stringify } from 'yaml';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageName = 'dsh-ssh-remote';
const legacyBegin = /^# >>> dsh-ssh-remote(?: \([^\n]*\))? >>>[^\n]*$/gm;
// Early install.sh releases indented the closing comment inside config.
const legacyEnd = /^[\t ]*# <<< dsh-ssh-remote <<<[^\n]*(?:\n|$)/gm;
const configBegin = '# >>> dsh-ssh-remote-config >>>';
const configEnd = '# <<< dsh-ssh-remote-config <<<';

function readYaml(text, strictTags = false) {
  const doc = parseDocument(text);
  if (doc.errors.length) throw doc.errors[0];
  if (strictTags && doc.warnings.length) throw new Error('Unsupported YAML tags in legacy block; no changes made.');
  return doc.toJS({ maxAliasCount: 100 });
}

/** Remove only our legacy loader; retain custom options as a native row override. */
function migratePatch(original) {
  const starts = [...original.matchAll(legacyBegin)], ends = [...original.matchAll(legacyEnd)];
  if (!starts.length && !ends.length) {
    const rows = readYaml(original) ?? [];
    if (!Array.isArray(rows)) throw new Error('Profile patch must be a YAML sequence');
    const containsLegacy = rows.some(row => row?.id === 'ssh-remote' && row.name
      || row?.insert?.some?.(entry => entry?.id === 'ssh-remote' || entry?.name?.includes?.('dsh-ssh-remote')));
    if (containsLegacy) throw new Error('An unmanaged ssh-remote loader exists; migrate it explicitly before installing.');
    return { text: original, migrated: false };
  }
  if (starts.length !== 1 || ends.length !== 1 || ends[0].index < starts[0].index) {
    throw new Error('Malformed legacy dsh-ssh-remote block; no changes made.');
  }
  const start = starts[0].index, end = ends[0].index + ends[0][0].length;
  const rows = readYaml(original.slice(start, end), true);
  if (!Array.isArray(rows)) throw new Error('Invalid legacy plugin block');
  let ssh;
  const retained = [];
  const backends = new Set();
  for (const row of rows) {
    if (['fs-sandbox', 'bash-sandbox', 'pwsh-sandbox'].includes(row?.id) && !row.insert) {
      if (row.name !== undefined && row.name !== `@deepseek-ai/dsh-${row.id}`) throw new Error('Unexpected legacy backend module');
      if (row.disabled !== true || Object.keys(row).some(key => !['id', 'name', 'disabled', 'config'].includes(key))) {
        throw new Error('Unexpected legacy backend settings; no changes made.');
      }
      backends.add(row.id);
      if (row.config !== undefined) retained.push({ id: row.id, config: row.config });
    } else if (Array.isArray(row?.insert) && Object.keys(row).length === 1 && row.insert.length === 1
      && row.insert[0]?.id === 'ssh-remote' && !ssh) {
      ssh = row.insert[0];
      if (!['dsh-ssh-remote', './plugins/dsh-ssh-remote/index.js'].includes(ssh.name)
        || Object.keys(ssh).some(key => !['id', 'name', 'config', 'disabled'].includes(key))) {
        throw new Error('Unexpected legacy SSH loader settings; no changes made.');
      }
    } else throw new Error('Unexpected entry in legacy plugin block; no changes made.');
  }
  if (!ssh || !backends.has('fs-sandbox') || !backends.has('bash-sandbox')) throw new Error('Incomplete legacy plugin block');
  if (ssh.config !== undefined || ssh.disabled !== undefined) retained.push({ id: 'ssh-remote',
    ...(ssh.config === undefined ? {} : { config: ssh.config }),
    ...(ssh.disabled === undefined ? {} : { disabled: ssh.disabled }) });
  const replacement = retained.length ? `${configBegin}\n${stringify(retained)}${configEnd}\n` : '';
  const text = original.slice(0, start) + replacement + original.slice(end);
  // Also reject an additional loader elsewhere in the profile.
  migratePatch(text);
  return { text, migrated: true };
}

/** Prefer the Desktop carrier: the ordinary CLI cannot manage the reserved desktop profile. */
function findDshCli(env = process.env, platform = process.platform) {
  const desktop = '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh';
  const candidates = env.DSH_CLI ? [env.DSH_CLI] : [
    ...(platform === 'darwin' ? [desktop] : []),
    ...(env.PATH ?? '').split(delimiter).map(dir => join(dir, 'dsh')),
  ];
  const cli = candidates.find(path => existsSync(path) && lstatSync(path).isFile()
    || existsSync(path) && lstatSync(path).isSymbolicLink());
  if (!cli) throw new Error('DSH CLI not found. Install DSH or set DSH_CLI to its executable path.');
  return cli;
}

function atomicWrite(path, text) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, text, { mode: 0o600 }); renameSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}

function linkTarget(path) {
  try {
    if (!lstatSync(path).isSymbolicLink()) throw new Error(`Refusing to replace a real directory: ${path}`);
    return readlinkSync(path);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

/** Whether a recorded dependency was installed from this checkout or our tarball. */
function isOwnPackageSpec(base, spec, pluginDir = source) {
  if (typeof spec !== 'string') return false;
  if (spec.startsWith('link:')) {
    try { return resolve(spec.slice('link:'.length)) === pluginDir; }
    catch { return false; }
  }
  if (spec.startsWith('file:')) {
    try {
      const tarball = resolve(spec.slice('file:'.length));
      const name = basename(tarball);
      return dirname(tarball) === join(base, 'plugin-packages')
        && name.startsWith(`${packageName}-`) && name.endsWith('.tgz');
    } catch { return false; }
  }
  return false;
}

/** Build a tarball DSH can install without retaining this checkout. */
function packPlugin(base, pluginDir) {
  const destination = join(base, 'plugin-packages');
  mkdirSync(destination, { recursive: true, mode: 0o755 });
  const npm = process.env.NPM_CLI ?? 'npm';
  const result = spawnSync(npm, ['pack', pluginDir, '--pack-destination', destination, '--json'], {
    env: process.env,
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    throw new Error(`npm pack failed${result.error ? `: ${result.error.message}` : ` (exit ${result.status})`}`);
  }
  let output;
  try { output = JSON.parse(result.stdout); } catch { throw new Error('npm pack returned unreadable JSON'); }
  const filename = output?.[0]?.filename;
  if (typeof filename !== 'string' || filename.includes('/') || filename.includes('\\')
    || !filename.startsWith(`${packageName}-`) || !filename.endsWith('.tgz')) {
    throw new Error(`npm pack returned an unexpected filename: ${String(filename)}`);
  }
  const tarball = join(destination, basename(filename));
  if (!existsSync(tarball)) throw new Error(`npm pack did not create ${tarball}`);
  return tarball;
}

/** Native pnpm operations own dependency/selection bookkeeping; data files are never edited. */
export function updateProfile(action, profile = 'desktop', base = process.env.DSH_HOME ?? join(homedir(), '.dsh'), pluginDir = source, options = {}) {
  if (!['install', 'uninstall'].includes(action)) throw new Error('Usage: dsh-ssh-remote <install|uninstall> [profile] [--link]');
  if (action === 'install' && process.platform === 'win32') throw new Error('This plugin currently supports macOS and Linux; Windows/Pwsh is not supported.');
  if (!/^[\w.-]+$/u.test(profile) || ['.', '..', 'node_modules'].includes(profile)) throw new Error('Invalid profile name');
  const linkInstall = options.link === true;
  base = resolve(base); pluginDir = realpathSync(pluginDir);
  const dir = join(base, 'profiles', profile), manifestPath = join(dir, 'package.json');
  if (!existsSync(manifestPath)) throw new Error(`Profile does not exist: ${dir}. Open Harness once before installing.`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const patch = join(dir, 'cordis.patch.yml'), link = join(dir, 'plugins', packageName);
  const original = existsSync(patch) ? readFileSync(patch, 'utf8') : '';
  const migration = migratePatch(original);
  const previousLink = linkTarget(link);
  const nativeLink = join(dir, 'node_modules', packageName);
  const installed = Object.hasOwn(manifest.dependencies ?? {}, packageName);
  if (!installed) linkTarget(nativeLink);
  if (action === 'install') {
    const metadata = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8'));
    if (metadata.name !== packageName || !metadata.dsh?.bundle?.patch) throw new Error('Not a dsh-ssh-remote bundle');
    const recorded = manifest.dependencies?.[packageName];
    if (installed && !isOwnPackageSpec(base, recorded, pluginDir)) {
      throw new Error('Plugin is installed from another location. Remove it through DSH before changing its source.');
    }
  }
  const needsNative = action === 'install' || installed || manifest.dsh?.profile?.bundles?.includes(packageName);
  const cli = needsNative ? (options.cli ?? findDshCli()) : undefined;
  const run = options.runNative ?? spawnSync;
  let spec;
  if (action === 'install') spec = linkInstall ? `link:${pluginDir}` : `file:${packPlugin(base, pluginDir)}`;
  const files = ['package.json', 'cordis.patch.yml', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'];
  const backup = join(dir, '.ssh-remote-backups', `${Date.now()}-${randomUUID().slice(0, 8)}`);
  mkdirSync(backup, { recursive: true, mode: 0o700 });
  const saved = new Map(files.map(name => [name, existsSync(join(dir, name)) ? readFileSync(join(dir, name)) : undefined]));
  for (const [name, data] of saved) if (data !== undefined) writeFileSync(join(backup, name), data, { mode: 0o600 });
  // Retain the obsolete link until every native operation and patch write succeeds.
  const previousNativeLink = existsSync(nativeLink) && lstatSync(nativeLink).isSymbolicLink() ? readlinkSync(nativeLink) : undefined;
  try {
    if (needsNative) {
      const args = ['plugin', '--profile', profile, ...(action === 'install' ? ['add', spec] : ['remove', packageName])];
      const result = run(cli, args, { env: { ...process.env, DSH_HOME: base }, stdio: 'inherit' });
      if (result.error || result.status !== 0) throw new Error(`DSH native ${action} failed${result.error ? `: ${result.error.message}` : ` (exit ${result.status})`}`);
      const after = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (action === 'install' && (!Object.hasOwn(after.dependencies ?? {}, packageName) || !existsSync(nativeLink))) {
        throw new Error('DSH did not register the plugin dependency');
      }
      if (action === 'install' && linkInstall && realpathSync(nativeLink) !== pluginDir) {
        throw new Error('DSH did not register the development link');
      }
      if (action === 'install') {
        const installedMetadata = JSON.parse(readFileSync(join(nativeLink, 'package.json'), 'utf8'));
        if (installedMetadata.name !== packageName) throw new Error('DSH installed an unexpected plugin package');
      }
      if (action === 'install' && !installed && !after.dsh?.profile?.bundles?.includes(packageName)) throw new Error('DSH did not enable the installed bundle');
      if (action === 'uninstall' && (Object.hasOwn(after.dependencies ?? {}, packageName) || after.dsh?.profile?.bundles?.includes(packageName))) {
        throw new Error('DSH did not remove the plugin registration');
      }
    }
    const currentPatch = existsSync(patch) ? readFileSync(patch, 'utf8') : '';
    if (currentPatch !== original) throw new Error('Profile patch changed during installation; retry after other plugin operations finish.');
    if (migration.text !== original) atomicWrite(patch, migration.text);
    if (previousLink !== undefined) rmSync(link);
  } catch (error) {
    for (const [name, data] of saved) {
      if (name === 'cordis.patch.yml' && (existsSync(patch) ? readFileSync(patch, 'utf8') : '') !== migration.text
        && (existsSync(patch) ? readFileSync(patch, 'utf8') : '') !== original) continue;
      if (data === undefined) rmSync(join(dir, name), { force: true });
      else atomicWrite(join(dir, name), data);
    }
    if (!installed && existsSync(nativeLink) && lstatSync(nativeLink).isSymbolicLink()) rmSync(nativeLink);
    if (previousNativeLink !== undefined && !existsSync(nativeLink)) {
      mkdirSync(dirname(nativeLink), { recursive: true });
      symlinkSync(previousNativeLink, nativeLink, 'dir');
    }
    throw new Error(`${error.message}. Profile files restored; backup: ${backup}`, { cause: error });
  }
  return { profile: dir, source: pluginDir, backup, action, spec, migrated: migration.migrated };
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const flags = args.filter(argument => argument.startsWith('-'));
    const unknown = flags.filter(flag => flag !== '--link');
    if (unknown.length > 0) throw new Error(`Unknown option${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`);
    const action = args[0] ?? 'install';
    const profile = args.slice(1).find(argument => !argument.startsWith('-'))
      ?? process.env.DSH_PROFILE ?? 'desktop';
    const result = updateProfile(action, profile, undefined, undefined, { link: flags.includes('--link') });
    console.log(`${result.action === 'install' ? 'Installed through DSH' : 'Uninstalled'} dsh-ssh-remote: ${result.profile}`);
    if (result.migrated) console.log('Migrated legacy loader; custom SSH configuration preserved.');
    if (result.action === 'install') {
      console.log(result.spec.startsWith('link:')
        ? `Development link: ${result.spec.slice('link:'.length)} (keep the checkout in place)`
        : `Packaged copy: ${result.spec.slice('file:'.length)} (the checkout may be moved or deleted)`);
    }
    console.log(`Backup: ${result.backup}`);
    console.log('Restart DeepSeek Harness. Manage the plugin from its Plugins page. SSH settings, passwords and workspace data are preserved.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

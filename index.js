/**
 * dsh-ssh-remote — run a DSH session against a remote server over SSH.
 *
 * The plugin follows the harness's capability-seam pattern rather than adding
 * remote-specific tools: it mounts an SSH-backed `ctx.fs` and `ctx.shell`, so the
 * existing `read`/`write`/`edit`/`glob`/`grep`/`bash` tools, the Web sidebar file
 * tree, and the file-preview and upload paths all keep working unchanged while
 * executing on the remote host. Three tools cover discovery and mounting:
 * `ssh_hosts`, `ssh_mount`, and `ssh_unmount`.
 *
 * Because the harness composes exactly one provider per seam, the bundle patch in
 * `cordis.patch.yml` disables the built-in `fs-sandbox` and `bash-sandbox`
 * providers; this plugin replaces both.
 *
 * @module dsh-ssh-remote
 */

import { join } from 'node:path';
import { createSshFileSystem } from './lib/fs-remote.js';
import { loadHostModules } from './lib/host-modules.js';
import { MountTable, normalizeLocal, normalizeRemote } from './lib/mounts.js';
import { defaultConfigPaths, describeHost, expandHome, listHosts, parseSshConfig } from './lib/ssh-config.js';
import { SshRunner, targetFor } from './lib/ssh-runner.js';
import { createSshShellExecutor } from './lib/shell-remote.js';
import { dshHome, registerTools } from './lib/tools.js';
import { assertPlaceholderPath, createWorkspaceActions } from './lib/workspace-actions.js';
import { registerSshUi } from './ui/host.js';
import { installWorkspaceRemoval } from './lib/workspace-removal.js';
import { validateHost } from './lib/browse.js';

/** Load the harness seam classes once, before the plugin is instantiated. */
const host = await loadHostModules();

export const name = 'ssh-remote';
// The isolated local delegates are constructed directly, so Cordis cannot
// infer their dependencies. Wait for every backend service before apply runs.
export const inject = ['tools', 'subprocess', 'sandbox', 'sandboxPolicy'];

/** Defaults for every configuration key. */
function defaults() {
  return {
    sshBinary: 'ssh',
    sshConfigPaths: undefined,
    hosts: [],
    mounts: [],
    mirrorRoot: join(dshHome(), 'ssh-remote', 'workspaces'),
    storageFile: join(dshHome(), 'ssh-remote', 'mounts.json'),
    connectTimeoutSec: 10,
    controlPersistSec: 600,
    operationTimeoutMs: 60_000,
    watchIntervalMs: 3_000,
    batchMode: true,
    strictHostKeyChecking: 'accept-new',
    multiplex: true,
    localFallback: true,
    extraSshArgs: [],
    confineMutations: true,
    extraWritableRoots: [],
    diffBasisMaxBytes: 10 * 1024 * 1024,
    timeoutMs: 120_000,
    maxTimeoutMs: 600_000,
    maxOutputBytes: 64_000,
    maxSpillBytes: 64 * 1024 * 1024,
  };
}

function asBoolean(value, fallback, key) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error(`ssh-remote: config.${key} must be a boolean`);
  return value;
}

function asPositiveInt(value, fallback, key) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`ssh-remote: config.${key} must be a positive integer`);
  }
  return number;
}

/**
 * Validate and normalize the plugin configuration.
 * @param raw - the config object supplied by the loader.
 * @returns the resolved configuration.
 */
export function resolveConfig(raw) {
  const fallback = defaults();
  const config = { ...fallback, ...(raw ?? {}) };
  for (const key of ['connectTimeoutSec', 'controlPersistSec', 'operationTimeoutMs', 'watchIntervalMs',
    'diffBasisMaxBytes', 'timeoutMs', 'maxTimeoutMs', 'maxOutputBytes', 'maxSpillBytes']) {
    config[key] = asPositiveInt(config[key], fallback[key], key);
  }
  for (const key of ['batchMode', 'multiplex', 'localFallback', 'confineMutations']) {
    config[key] = asBoolean(config[key], fallback[key], key);
  }
  if (typeof config.sshBinary !== 'string' || config.sshBinary.length === 0) {
    throw new Error('ssh-remote: config.sshBinary must be a non-empty string');
  }
  if (!['default', 'yes', 'no', 'accept-new', 'off'].includes(config.strictHostKeyChecking)) {
    throw new Error('ssh-remote: config.strictHostKeyChecking must be one of default, yes, no, accept-new, off');
  }
  for (const key of ['hosts', 'extraSshArgs', 'extraWritableRoots', 'mounts']) {
    if (!Array.isArray(config[key])) throw new Error(`ssh-remote: config.${key} must be an array`);
  }
  if (config.sshConfigPaths !== undefined && !Array.isArray(config.sshConfigPaths)) {
    throw new Error('ssh-remote: config.sshConfigPaths must be an array of paths');
  }
  if (config.sshConfigPaths?.length > 1) throw new Error('Use one sshConfigPaths file with OpenSSH Include directives');
  for (const key of ['sshConfigPaths', 'hosts', 'extraSshArgs', 'extraWritableRoots']) {
    if ((config[key] ?? []).some(value => typeof value !== 'string' || !value.length || value.includes('\0'))) {
      throw new Error(`ssh-remote: config.${key} must contain non-empty strings`);
    }
  }
  for (const key of ['mirrorRoot', 'storageFile']) {
    if (typeof config[key] !== 'string') throw new Error(`ssh-remote: config.${key} must be an absolute path`);
    config[key] = normalizeLocal(expandHome(config[key]));
  }
  config.extraWritableRoots = config.extraWritableRoots.map(root => {
    if (!root.startsWith('/')) throw new Error('ssh-remote: extraWritableRoots must be remote absolute paths');
    return normalizeRemote(root);
  });
  if (config.sshConfigPaths) config.sshConfigPaths = config.sshConfigPaths.map((path) => expandHome(path));
  return config;
}

/**
 * Mount the SSH execution world.
 * @param ctx - the plugin's cordis context.
 * @param rawConfig - deployment configuration.
 */
export function apply(ctx, rawConfig) {
  if (process.platform === 'win32') throw new Error('ssh-remote currently supports macOS and Linux; Windows/Pwsh routing is not implemented');
  const config = resolveConfig(rawConfig);
  const configPaths = config.sshConfigPaths ?? defaultConfigPaths();
  const blocks = parseSshConfig(configPaths).blocks;

  /** Resolve a mount's host alias, or a literal `user@hostname`, to an ssh destination. */
  const resolveTarget = (alias) => {
    if (alias.includes('@')) {
      const at = alias.indexOf('@');
      const user = alias.slice(0, at);
      const hostname = alias.slice(at + 1);
      return targetFor({ alias: hostname, hostname, user }, { destination: alias });
    }
    return targetFor(describeHost(blocks, alias), { alias });
  };

  const runner = new SshRunner(config);
  const mounts = new MountTable({ storageFile: config.storageFile }).load();

  const runtime = {
    ctx,
    config,
    runner,
    mounts,
    configBlocks: blocks,
    targetOf: resolveTarget,
    local: undefined,
  };

  // Local sessions must keep working exactly as before, so unmounted paths are
  // handed to the harness's own sandboxed backends. They are instantiated in
  // isolated service scopes so they do not claim `ctx.fs` / `ctx.shell` themselves.
  if (config.localFallback) {
    try {
      const fsCtx = ctx.isolate('fs');
      const shellCtx = ctx.isolate('shell');
      runtime.local = {
        fs: new host.fsSandbox.default(fsCtx, {
          cwd: process.cwd(),
          diffBasisMaxBytes: config.diffBasisMaxBytes,
        }),
        shell: new host.bashSandbox.default(shellCtx, {
          cwd: { get: () => undefined },
          timeoutMs: { get: () => config.timeoutMs },
          maxTimeoutMs: { get: () => config.maxTimeoutMs },
          maxOutputBytes: { get: () => config.maxOutputBytes },
          maxSpillBytes: { get: () => config.maxSpillBytes },
          graceMs: { get: () => 3000 },
        }),
      };
    } catch (error) {
      throw new Error('ssh-remote: failed to initialize local sandbox backends', { cause: error });
    }
  }

  // Deployment-declared mounts are applied at boot unless explicitly retired;
  // runtime mounts persist separately so a tool-driven mount survives a reload.
  for (const entry of config.mounts) {
    const alias = typeof (entry?.host ?? entry?.alias) === 'string' ? (entry.host ?? entry.alias) : '';
    const rawDir = entry?.remoteDir ?? entry?.remote_dir;
    const remoteDir = typeof rawDir === 'string' ? rawDir : '';
    if (alias.length === 0 || !remoteDir.startsWith('/')) {
      ctx.logger?.warn?.('ssh-remote: ignoring malformed config.mounts entry %o', entry);
      continue;
    }
    try {
      validateHost(alias);
      const localDir = entry.localDir ?? entry.local_dir;
      const mountRoot = normalizeLocal(localDir === undefined
        ? join(config.mirrorRoot, alias.replace(/[^\w.-]+/gu, '_'), remoteDir.replace(/^\/+/u, '').replace(/[^\w.-]+/gu, '_') || 'root')
        : expandHome(localDir));
      if (mounts.retiredRoots.has(mountRoot)) continue;
      const previous = mounts.mounts.get(mountRoot) ?? mounts.configuredMounts.get(mountRoot);
      if (previous && (previous.alias !== alias || previous.remoteDir !== normalizeRemote(remoteDir))) {
        throw new Error('local placeholder already belongs to another remote directory');
      }
      assertPlaceholderPath(mountRoot, { managed: !!previous, workspaces: ctx.get('workspaceRegistry')?.list() ?? [] });
      mounts.put({ ...previous, localDir: mountRoot, alias, remoteDir, source: 'config' });
    } catch (error) { ctx.logger?.warn?.('ssh-remote: ignoring malformed config.mounts entry: %s', error.message); }
  }

  const listing = listHosts({ paths: configPaths, extraHosts: config.hosts });
  ctx.logger?.info?.(
    'ssh-remote: %d host(s) from %s, %d mount(s)',
    listing.hosts.length,
    listing.configPaths.length > 0 ? listing.configPaths.join(', ') : 'no config file',
    mounts.list().length,
  );
  for (const warning of listing.warnings) ctx.logger?.warn?.('ssh-remote: %s', warning);

  const SshFileSystem = createSshFileSystem(host, runtime);
  const SshShellExecutor = createSshShellExecutor(host, runtime);

  new SshFileSystem(ctx);
  new SshShellExecutor(ctx);
  runtime.workspaceActions = createWorkspaceActions(runtime);
  ctx.inject(['workspaceRegistry'], () => {
    void runtime.workspaceActions.syncTitles().catch(error => ctx.logger?.warn?.('ssh-remote: title sync failed: %s', error.message));
  });
  ctx.inject(['workspaceRegistry', 'sessionPersistence'], (scope) => {
    scope.effect(() => installWorkspaceRemoval(scope, runtime));
  });
  registerTools(ctx, host, runtime);
  new SshRemoteService(ctx, runtime);
  ctx.inject(['typert', 'sshRemote'], (scope) => registerSshUi(scope, host, runtime));
}

/**
 * `ctx.sshRemote` — the plugin's operational handle, so host code and other plugins
 * can inspect the mount table, resolve a destination, or list configured hosts.
 */
class SshRemoteService extends host.cordis.Service {
  constructor(ctx, runtime) {
    super(ctx, 'sshRemote');
    this.runtime = runtime;
    this.mounts = runtime.mounts;
    this.runner = runtime.runner;
    this.config = runtime.config;
  }

  /** The hosts offered by the configured SSH config files. */
  listHosts() {
    return listHosts({ paths: this.config.sshConfigPaths ?? defaultConfigPaths(), extraHosts: this.config.hosts });
  }

  /** Resolve an alias (or a literal `user@hostname`) to an ssh destination. */
  resolveTarget(alias) {
    return this.runtime.targetOf(alias);
  }
}

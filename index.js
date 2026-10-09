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
import { MountTable } from './lib/mounts.js';
import { defaultConfigPaths, describeHost, expandHome, listHosts, parseSshConfig } from './lib/ssh-config.js';
import { SshRunner, targetFor } from './lib/ssh-runner.js';
import { createSshShellExecutor } from './lib/shell-remote.js';
import { dshHome, registerTools } from './lib/tools.js';
import { createWorkspaceActions } from './lib/workspace-actions.js';
import { registerSshUi } from './ui/host.js';
import { installWorkspaceRemoval } from './lib/workspace-removal.js';

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
  const config = { ...defaults(), ...(raw ?? {}) };
  config.connectTimeoutSec = asPositiveInt(config.connectTimeoutSec, 10, 'connectTimeoutSec');
  config.controlPersistSec = asPositiveInt(config.controlPersistSec, 600, 'controlPersistSec');
  config.operationTimeoutMs = asPositiveInt(config.operationTimeoutMs, 60_000, 'operationTimeoutMs');
  config.watchIntervalMs = asPositiveInt(config.watchIntervalMs, 3_000, 'watchIntervalMs');
  config.diffBasisMaxBytes = asPositiveInt(config.diffBasisMaxBytes, 10 * 1024 * 1024, 'diffBasisMaxBytes');
  config.timeoutMs = asPositiveInt(config.timeoutMs, 120_000, 'timeoutMs');
  config.maxTimeoutMs = asPositiveInt(config.maxTimeoutMs, 600_000, 'maxTimeoutMs');
  config.maxOutputBytes = asPositiveInt(config.maxOutputBytes, 64_000, 'maxOutputBytes');
  config.maxSpillBytes = asPositiveInt(config.maxSpillBytes, 64 * 1024 * 1024, 'maxSpillBytes');
  config.batchMode = asBoolean(config.batchMode, true, 'batchMode');
  config.multiplex = asBoolean(config.multiplex, true, 'multiplex');
  config.localFallback = asBoolean(config.localFallback, true, 'localFallback');
  config.confineMutations = asBoolean(config.confineMutations, true, 'confineMutations');
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
  if (config.sshConfigPaths) config.sshConfigPaths = config.sshConfigPaths.map((path) => expandHome(path));
  config.mirrorRoot = expandHome(String(config.mirrorRoot));
  config.storageFile = expandHome(String(config.storageFile));
  return config;
}

/**
 * Mount the SSH execution world.
 * @param ctx - the plugin's cordis context.
 * @param rawConfig - deployment configuration.
 */
export function apply(ctx, rawConfig) {
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
  const mounts = new MountTable({ storageFile: config.storageFile, resolveHost: resolveTarget }).load();

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
    const alias = String(entry.host ?? entry.alias ?? '');
    const remoteDir = String(entry.remoteDir ?? entry.remote_dir ?? '');
    if (alias.length === 0 || !remoteDir.startsWith('/')) {
      ctx.logger?.warn?.('ssh-remote: ignoring malformed config.mounts entry %o', entry);
      continue;
    }
    const localDir = entry.localDir ?? entry.local_dir;
    const mountRoot = localDir === undefined
      ? join(config.mirrorRoot, alias.replace(/[^\w.-]+/gu, '_'), remoteDir.replace(/^\/+/u, '').replace(/[^\w.-]+/gu, '_'))
      : expandHome(String(localDir));
    // A user-removed configured mount must stay removed across restarts.
    if (mounts.retiredRoots.has(mountRoot)) continue;
    mounts.put({
      localDir: mountRoot,
      alias,
      remoteDir,
    });
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

  new SshFileSystem(ctx, config);
  new SshShellExecutor(ctx, config);
  runtime.workspaceActions = createWorkspaceActions(runtime);
  ctx.inject(['workspaceRegistry'], () => runtime.workspaceActions.syncTitles());
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

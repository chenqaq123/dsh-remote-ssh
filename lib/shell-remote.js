/**
 * Shell backend that routes each command to the remote host or to the local
 * sandboxed executor, depending on which world the calling session lives in.
 *
 * Rather than reimplementing process management, this executor subclasses the
 * harness's own `LocalBashExecutor` and swaps only the process boundary: a command
 * that belongs to a mounted workspace runs on the remote host through one
 * multiplexed `ssh` invocation, and everything else is handed to the local
 * sandboxed executor unchanged. Deadlines, output budgets, spill files, background
 * handles, `readOutput`, and `kill` therefore keep exactly the semantics the `bash`
 * tool already expects.
 *
 * @module dsh-ssh-remote/shell-remote
 */

import { existsSync } from 'node:fs';
import { remoteContains } from './mounts.js';
import { shellQuote } from './remote-protocol.js';

/** Default process budgets, mirroring `@deepseek-ai/dsh-bash-local`. */
const DEFAULTS = {
  timeoutMs: 120_000,
  maxTimeoutMs: 600_000,
  maxOutputBytes: 64_000,
  maxSpillBytes: 64 * 1024 * 1024,
  graceMs: 3_000,
};

/** A read-only stand-in for the schemastery accessor `LocalBashExecutor` expects. */
function readonly(value) {
  return { get: () => value };
}

/**
 * Build the shell executor class.
 * @param host - loaded host modules (`bashLocal`).
 * @param runtime - shared plugin runtime (config, runner, mounts, local delegate).
 * @returns a `ShellExecutor` subclass registering itself as `ctx.shell`.
 */
export function createSshShellExecutor(host, runtime) {
  const { LocalBashExecutor, ENV_OVERRIDES } = host.bashLocal;
  const config = runtime.config;

  class RoutedShellExecutor extends LocalBashExecutor {
    constructor(ctx) {
      // The parent reads its budgets through schemastery accessors; supplying
      // read-only stand-ins keeps that contract without a schema dependency.
      super(ctx, {
        cwd: readonly(undefined),
        timeoutMs: readonly(config.timeoutMs ?? DEFAULTS.timeoutMs),
        maxTimeoutMs: readonly(config.maxTimeoutMs ?? DEFAULTS.maxTimeoutMs),
        maxOutputBytes: readonly(config.maxOutputBytes ?? DEFAULTS.maxOutputBytes),
        maxSpillBytes: readonly(config.maxSpillBytes ?? DEFAULTS.maxSpillBytes),
        graceMs: readonly(DEFAULTS.graceMs),
      });
      this.remote = runtime;
    }

    get localShell() {
      return runtime.local?.shell;
    }

    /** Remote commands run on a host this process does not own. */
    get sandboxMode() {
      return undefined;
    }

    /**
     * Route the request: a command whose working directory sits inside a mount is
     * remote, everything else stays with the local sandboxed executor.
     */
    resolve(request) {
      const mounts = this.remote.mounts;
      mounts.assertActivePath(request?.workdir);
      const mount = mounts.match(request?.workdir);
      if (mount === undefined) {
        if (this.localShell !== undefined) {
          return { ...super.resolve(request), localRequest: request };
        }
        throw new Error('ssh-remote: select a mounted remote workspace before executing commands');
      }
      return this.remoteSpec(request, mount);
    }

    /** Build the resolved spec for a remote execution inside `mount`. */
    remoteSpec(request, mount) {
      const spec = super.resolve(request);
      const workdir = spec.workdir;
      const remoteWorkdir = typeof workdir === 'string' && workdir.length > 0 && remoteContains(mount.localDir, workdir)
        ? this.remote.mounts.toRemote(mount, workdir, undefined)
        : mount.remoteDir;
      return { ...spec, mount, remoteWorkdir, workdir: mount.localDir };
    }

    /** Build the remote command line: change directory, then run the caller's shell. */
    remoteCommand(spec) {
      const environment = { ...ENV_OVERRIDES, ...spec.env, ...spec.dshEnv };
      const assignments = Object.entries(environment)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) throw new Error(`Invalid environment variable: ${key}`);
          return `${key}=${shellQuote(String(value))}`;
        })
        .join(' ');
      const runner = assignments.length > 0
        ? `${assignments} bash -c ${shellQuote(spec.command)}`
        : `bash -c ${shellQuote(spec.command)}`;
      // SSH and remote programs can both exit 255. Add a diagnostic from the
      // remote side only when the command itself returns that status. Preserve
      // the status and never retry a command which may already have had effects.
      const command = `cd ${shellQuote(spec.remoteWorkdir)} && ${runner}`;
      return `sh -c ${shellQuote(`${command}\ndsh_remote_status=$?\nif [ "$dsh_remote_status" -eq 255 ]; then\n  printf '\\n%s\\n' '远程命令返回 255（SSH 已执行该命令）；请检查服务器端程序及其退出码。' >&2\nfi\nexit "$dsh_remote_status"`)}`;
    }

    async execute(spec) {
      if (spec.localRequest !== undefined) {
        const local = this.localShell;
        return local.execute(local.resolve(spec.localRequest));
      }
      if (this.remote.mounts.mounts.get(spec.mount.localDir) !== spec.mount) throw new Error('远程工作区已断开，请重新连接。');
      if ((spec.sandboxPolicy?.mode ?? runtime.ctx?.sandboxPolicy?.defaultMode) === 'read-only') {
        throw new Error('Remote shell is unavailable under a read-only policy');
      }
      const target = this.remote.targetOf(spec.mount.alias);
      // `ctx.subprocess` resolves argv[0] as the program, so the ssh binary leads.
      const argv = [config.sshBinary, ...this.remote.runner.argv(target, this.remoteCommand(spec))];
      return this.executeArgv(spec, argv);
    }

    /** The local `ssh` process needs a local working directory, not the remote one. */
    spawnSpec(spec, argv, stdoutMaxBytes, signal) {
      return super.spawnSpec({ ...spec, workdir: existsSync(spec.mount.localDir) ? spec.mount.localDir : process.cwd() }, argv, stdoutMaxBytes, signal);
    }
  }

  return RoutedShellExecutor;
}

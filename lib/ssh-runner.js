/**
 * `ssh` process runner for the remote backend.
 *
 * Every operation is one short-lived `ssh` invocation. Latency is kept low by
 * OpenSSH connection multiplexing: the first call establishes a master
 * connection on a private control socket and later calls reuse it, so only the
 * round trip to the remote helper remains. The control socket lives in a
 * user-private directory and is named from a hash of the destination, which keeps
 * the path well under the `sun_path` limit.
 *
 * @module dsh-ssh-remote/ssh-runner
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, lstatSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { buildRemoteCommand, splitFramed } from './remote-protocol.js';

/** Directory holding control sockets for this plugin. */
export function controlDirectory() {
  // macOS TMPDIR is too long for sun_path once OpenSSH appends "." + 16
  // random characters while creating the listener. Keep a short, private POSIX
  // directory instead; never follow an attacker-controlled directory symlink.
  const directory = join('/tmp', `dsh-ssh-${process.getuid?.() ?? 'user'}`);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || (process.getuid && stat.uid !== process.getuid())) throw new Error('Unsafe SSH control directory');
  chmodSync(directory, 0o700);
  return directory;
}

/**
 * A resolved remote destination.
 * @typedef {object} RemoteTarget
 * @property {string} destination - the `ssh` destination argument.
 * @property {string} [alias] - the `~/.ssh/config` alias, when there is one.
 * @property {string} hostname - the effective host name, for display.
 * @property {string} [user] - the effective user.
 * @property {number} [port] - the effective port.
 * @property {string} label - `user@host` (or alias) for messages.
 */

/** Build the ssh destination plus any explicit overrides for a target. */
export function targetFor(host, { alias, destination } = {}) {
  if (alias !== undefined) {
    return {
      destination: alias,
      alias,
      hostname: host.hostname,
      user: host.user,
      port: host.port,
      label: alias,
    };
  }
  const name = destination ?? host.alias;
  return {
    destination: destination ?? (host.user === undefined ? name : `${host.user}@${name}`),
    hostname: host.hostname,
    user: host.user,
    port: host.port,
    label: destination ?? (host.user === undefined ? name : `${host.user}@${name}`),
  };
}

export class SshRunner {
  /**
   * @param config - resolved plugin configuration.
   */
  constructor(config) {
    this.config = config;
  }

  /** Control socket path for one destination. */
  socketPath(target) {
    if (this.config.multiplex === false) return undefined;
    const digest = createHash('sha1').update(JSON.stringify([target.destination, target.port,
      this.config.sshConfigPaths, this.config.extraSshArgs])).digest('hex').slice(0, 16);
    return join(controlDirectory(), `cm-${digest}`);
  }

  /**
   * Build the full `ssh` argument vector for one invocation.
   * @param target - resolved destination.
   * @param remoteCommand - the command string to run remotely.
   * @returns argv for `spawn`.
   */
  argv(target, remoteCommand) {
    const config = this.config;
    if (!target.destination || target.destination.startsWith('-') || /[\s\0]/u.test(target.destination)) throw new Error('Invalid SSH destination');
    const argv = ['-T'];
    if (config.sshConfigPaths?.length) argv.push('-F', config.sshConfigPaths[0]);
    argv.push('-o', `BatchMode=${config.batchMode ? 'yes' : 'no'}`);
    argv.push('-o', `ConnectTimeout=${config.connectTimeoutSec}`);
    argv.push('-o', 'ServerAliveInterval=15');
    argv.push('-o', 'ServerAliveCountMax=3');
    argv.push('-o', 'LogLevel=ERROR');
    argv.push('-o', config.multiplex ? 'ControlMaster=auto' : 'ControlMaster=no');
    if (!config.multiplex) argv.push('-o', 'ControlPath=none');
    const socket = this.socketPath(target);
    if (socket !== undefined) {
      argv.push('-o', `ControlPath=${socket}`);
      argv.push('-o', `ControlPersist=${config.controlPersistSec}s`);
    }
    if (config.strictHostKeyChecking !== 'default') {
      argv.push('-o', `StrictHostKeyChecking=${config.strictHostKeyChecking}`);
    }
    if (target.alias === undefined) {
      if (target.port !== undefined) argv.push('-p', String(target.port));
      if (target.identityFile !== undefined) argv.push('-i', target.identityFile);
    }
    for (const extra of config.extraSshArgs) argv.push(extra);
    argv.push('--', target.destination, remoteCommand);
    return argv;
  }

  /**
   * Run one helper operation and collect its complete output.
   *
   * `stdout` is bounded by `maxStdoutBytes`; the helper is responsible for the
   * real bound (it refuses oversized reads), so this is a defensive cap only.
   *
   * @param options - destination, operation, arguments, optional stdin payload.
   * @returns the exit code and captured streams.
   */
  run({ target, op, args = [], input, signal, timeoutMs, maxStdoutBytes = 64 * 1024 * 1024 }) {
    signal?.throwIfAborted();
    const remoteCommand = buildRemoteCommand(op, args);
    const argv = this.argv(target, remoteCommand);
    const deadlineMs = timeoutMs ?? this.config.operationTimeoutMs ?? 60_000;
    return new Promise((resolvePromise, reject) => {
      let child;
      try {
        child = spawn(this.config.sshBinary, argv, { stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (error) {
        reject(error);
        return;
      }
      const stdout = [];
      const stderr = [];
      child.stdin.on('error', () => {}); // SSH may exit before receiving a write payload.
      let stdoutBytes = 0;
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        fn(value);
      };
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(reject, new Error(`ssh ${target.label}: ${op} timed out after ${deadlineMs} ms`));
      }, deadlineMs);
      timer.unref?.();
      const onAbort = () => {
        child.kill('SIGKILL');
        finish(reject, signal.reason ?? new Error('aborted'));
      };
      if (signal !== undefined) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }
      child.stdout.on('data', (chunk) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > maxStdoutBytes) {
          child.kill('SIGKILL');
          finish(reject, new Error(`ssh ${target.label}: ${op} exceeded ${maxStdoutBytes} bytes of output`));
          return;
        }
        stdout.push(chunk);
      });
      child.stderr.on('data', (chunk) => {
        if (stderr.length < 64) stderr.push(chunk);
      });
      child.on('error', (error) => finish(reject, error));
      child.on('close', (code) => finish(resolvePromise, {
        code: code ?? -1,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr).toString('utf8'),
      }));
      if (input === undefined) child.stdin.end();
      else child.stdin.end(input);
    });
  }

  /**
   * Run one helper operation and stream its payload instead of buffering it.
   *
   * The header line is resolved before the first chunk is yielded, so a caller
   * sees a typed failure without reading the body.
   *
   * @param options - destination, operation, arguments.
   * @returns the parsed header plus an async iterator over payload chunks.
   */
  async stream({ target, op, args = [], signal, timeoutMs }) {
    signal?.throwIfAborted();
    const remoteCommand = buildRemoteCommand(op, args);
    const argv = this.argv(target, remoteCommand);
    const child = spawn(this.config.sshBinary, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stderrChunks = [];
    child.stderr.on('data', (chunk) => {
      if (stderrChunks.length < 64) stderrChunks.push(chunk);
    });

    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs ?? this.config.operationTimeoutMs ?? 60_000);
    timer.unref?.();
    const onAbort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', onAbort, { once: true });

    const exit = new Promise((resolvePromise) => {
      child.on('error', () => resolvePromise(-1));
      child.on('close', (code) => resolvePromise(code ?? -1));
    });

    let buffered = Buffer.alloc(0);
    const iterator = child.stdout[Symbol.asyncIterator]();
    const readHeader = async () => {
      while (buffered.indexOf(0x0a) === -1) {
        const { value, done } = await iterator.next();
        if (done === true) break;
        buffered = Buffer.concat([buffered, value]);
        if (buffered.indexOf(10) < 0 && buffered.length > 8192) throw new Error('Remote header exceeds 8192 bytes');
      }
      const newline = buffered.indexOf(0x0a);
      if (newline === -1) {
        const code = await exit;
        clearTimeout(timer);
        throw Object.assign(new Error(`ssh ${target.label}: ${op} exited ${code} with no header`), { remoteExit: code });
      }
      const header = buffered.subarray(0, newline).toString('utf8').split(' ');
      buffered = buffered.subarray(newline + 1);
      return header;
    };

    let header;
    try { header = await readHeader(); } catch (error) {
      clearTimeout(timer); signal?.removeEventListener('abort', onAbort); child.kill('SIGKILL');
      throw error;
    }
    const self = this;
    async function* chunks() {
      try {
        if (buffered.length > 0) yield buffered;
        for (;;) {
          const { value, done } = await iterator.next();
          if (done === true) break;
          if (value.length > 0) yield value;
        }
        const code = await exit;
        if (code !== 0) {
          const detail = Buffer.concat(stderrChunks).toString('utf8').trim();
          throw new Error(`ssh ${self.config.sshBinary} ${target.label}: ${op} exited ${code}${detail.length > 0 ? `: ${detail}` : ''}`);
        }
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }
    }
    return { header, chunks: chunks() };
  }

  /** Close the multiplexed master connection for a destination, if any. */
  async close(target) {
    const socket = this.socketPath(target);
    if (socket === undefined) return false;
    await new Promise((resolvePromise) => {
      const child = spawn(this.config.sshBinary, [...(this.config.sshConfigPaths?.length ? ['-F', this.config.sshConfigPaths[0]] : []),
        '-O', 'exit', '-o', `ControlPath=${socket}`, '--', target.destination], {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      const done = () => { clearTimeout(timer); resolvePromise(); };
      child.on('error', done);
      child.on('close', done);
    });
    return true;
  }

  /** Verify a destination is reachable and report the helper's capability line. */
  async hello(target, signal) {
    const result = await this.run({
      target,
      op: 'hello',
      signal,
      timeoutMs: this.config.connectTimeoutSec * 1000 + 15_000,
    });
    if (result.code !== 0) {
      const detail = result.stderr.trim();
      throw new Error(`ssh ${target.label} failed (exit ${result.code})${detail.length > 0 ? `: ${detail}` : ''}`);
    }
    return splitFramed(result.stdout).header.slice(1).join(' ').trim();
  }
}

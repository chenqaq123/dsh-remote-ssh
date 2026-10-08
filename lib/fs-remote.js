/**
 * Filesystem backend that routes each call to the remote host or to the local
 * sandbox, depending on which world the calling session lives in.
 *
 * The whole harness reads and writes files through `ctx.fs`, so mounting this
 * backend is what moves the agent's filesystem — and the Web sidebar's file tree,
 * file previews, and uploads — onto the remote host, with no change to any tool
 * schema. Every remote primitive is one multiplexed `ssh` invocation against
 * `lib/remote.sh`.
 *
 * Routing is decided by the session's workspace, which the harness passes as `cwd`:
 * a session whose cwd sits inside a mount works remotely; every other session keeps
 * using the local sandboxed backend, so installing this plugin never changes what a
 * local session can do. The chosen world is recorded in the opaque target key, so
 * follow-up calls that receive only a target stay in the same world.
 *
 * Remote deviations from `@deepseek-ai/dsh-fs-local`, both recorded in the README:
 * `resolve` is syntactic (no round trip, so remote target identity is the normalized
 * remote path rather than a realpath), and remote `watch` polls instead of using
 * native notifications, because SSH exposes no filesystem event stream.
 *
 * @module dsh-ssh-remote/fs-remote
 */

import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { joinRemote, remoteContains } from './mounts.js';
import { fsCodeForExit, parseListPayload, parseStatHeader, parseWriteHeader, splitFramed } from './remote-protocol.js';

const BINARY_SAMPLE_BYTES = 8192;
const LOCAL_PREFIX = 'local:';
const REMOTE_PREFIX = 'remote:';

/** Remote type letter to the seam's type vocabulary. */
function mapType(letter) {
  if (letter === 'd') return 'directory';
  if (letter === 'f') return 'file';
  if (letter === 'l') return 'symlink';
  return 'other';
}

function normalizeLineEndings(content) {
  return content.replaceAll('\r\n', '\n');
}

function detectLineEndings(raw) {
  const sample = raw.slice(0, 4096);
  const crlfCount = sample.split('\r\n').length - 1;
  return crlfCount > sample.split('\n').length - 1 - crlfCount ? 'CRLF' : 'LF';
}

function restoreLineEndings(content, lineEndings) {
  return lineEndings === 'LF' ? content : normalizeLineEndings(content).split('\n').join('\r\n');
}

function countOccurrences(content, needle) {
  let count = 0;
  let index = 0;
  for (;;) {
    const found = content.indexOf(needle, index);
    if (found === -1) return count;
    count += 1;
    index = found + needle.length;
  }
}

/**
 * Build the filesystem backend class.
 * @param host - loaded host modules (`fs`).
 * @param runtime - shared plugin runtime (config, runner, mounts, local delegate).
 * @returns a `FileSystem` subclass registering itself as `ctx.fs`.
 */
export function createSshFileSystem(host, runtime) {
  const { FileSystem, FsError, FsTargetKey, FsVersion } = host.fs;

  return class RoutedFileSystem extends FileSystem {
    constructor(ctx) {
      super(ctx);
      this.config = runtime.config;
      /** Per-target tail promise, so read-guard-write stays one critical section. */
      this.locks = new Map();
    }

    get localFs() {
      return runtime.local?.fs;
    }

    /**
     * This backend is not a sandbox: remote mutations are fenced by the mount
     * containment rail instead, and local targets are fenced by the local delegate.
     * Reporting `undefined` keeps the tool layer from advertising escalation fields
     * this backend cannot honour uniformly.
     */
    get sandboxMode() {
      return undefined;
    }

    /** Decide which world a call belongs to. */
    decide(cwd, path) {
      const mounts = runtime.mounts;
      mounts.assertActivePath(cwd);
      if (isAbsolute(path)) mounts.assertActivePath(path);
      const byCwd = mounts.match(cwd);
      const byLocal = isAbsolute(path) ? mounts.match(path) : undefined;
      if (byCwd && byLocal && byCwd.localDir !== byLocal.localDir) {
        throw new FsError('Cannot cross remote workspaces in one request', 'FS_IO_ERROR');
      }
      const mount = byCwd ?? byLocal;
      if (mount) return { world: 'remote', mount };
      if (this.localFs !== undefined) return { world: 'local' };
      throw new FsError(
        'no remote workspace is mounted and no local backend is available: run the ssh_mount tool first',
        'FS_IO_ERROR',
      );
    }

    /** World and mount recorded in a target key built by this backend. */
    worldOf(target) {
      const key = String(target?.targetKey ?? '');
      if (key.startsWith(LOCAL_PREFIX)) return { world: 'local', path: key.slice(LOCAL_PREFIX.length) };
      if (key.startsWith(REMOTE_PREFIX)) {
        const [localDir, alias, remoteDir, path] = JSON.parse(key.slice(REMOTE_PREFIX.length));
        const mount = runtime.mounts.mounts.get(localDir);
        if (!mount || mount.alias !== alias || mount.remoteDir !== remoteDir) {
          throw new FsError('Remote workspace disconnected; reconnect before continuing', 'FS_IO_ERROR');
        }
        return { world: 'remote', path, mount };
      }
      throw new FsError('Invalid filesystem target; resolve the path again', 'FS_IO_ERROR');
    }

    remoteKey(mount, path) {
      return FsTargetKey(REMOTE_PREFIX + JSON.stringify([mount.localDir, mount.alias, mount.remoteDir, path]));
    }

    /** Re-target a composite target at the local delegate's own key space. */
    localTarget(target) {
      return { targetKey: FsTargetKey(this.worldOf(target).path), displayPath: target.displayPath };
    }

    /** Run one helper operation, translating a nonzero exit into a typed FsError. */
    async call(mount, op, args, { input, signal, verb } = {}) {
      if (runtime.mounts.mounts.get(mount.localDir) !== mount) throw new FsError('Remote workspace disconnected; resolve again', 'FS_IO_ERROR');
      const target = runtime.targetOf(mount.alias);
      let result;
      try {
        result = await runtime.runner.run({
          target,
          op,
          args,
          input,
          signal,
          timeoutMs: this.config.operationTimeoutMs,
        });
      } catch (error) {
        if (signal?.aborted) throw new FsError(`${verb ?? op} aborted`, 'FS_ABORTED', { cause: error });
        throw new FsError(`remote ${op} failed on ${target.label}: ${error.message}`, 'FS_IO_ERROR', { cause: error });
      }
      if (result.code !== 0) {
        const code = fsCodeForExit(result.code);
        const detail = result.stderr.trim().split('\n')[0] ?? '';
        throw new FsError(
          `remote ${op} on ${target.label} failed (${code})${detail.length > 0 ? `: ${detail}` : ''}`,
          code,
        );
      }
      return splitFramed(result.stdout);
    }

    /** Fence mutations to this mount; this is a lexical check, not an OS sandbox. */
    assertWritable(world, displayPath, sandboxPolicy) {
      if ((sandboxPolicy?.mode ?? runtime.ctx?.sandboxPolicy?.defaultMode) === 'read-only') {
        throw new FsError('Remote filesystem is read-only', 'FS_SANDBOX_DENIED');
      }
      if (!this.config.confineMutations) return;
      if ([world.mount.remoteDir, ...this.config.extraWritableRoots].some((root) => remoteContains(root, world.path))) return;
      throw new FsError(`cannot write "${displayPath}": outside this remote workspace`, 'FS_SANDBOX_DENIED');
    }

    /** Serialize mutating operations per target. */
    async withLock(key, op) {
      const run = (this.locks.get(key) ?? Promise.resolve()).then(op, op);
      const tail = run.then(() => undefined, () => undefined);
      this.locks.set(key, tail);
      try {
        return await run;
      } finally {
        if (this.locks.get(key) === tail) this.locks.delete(key);
      }
    }

    /**
     * Resolve a path into whichever world the calling session belongs to.
     *
     * No round trip happens for remote paths: the target key is the normalized
     * mount identity and absolute remote path. That keeps a remote tool call at one `ssh` invocation
     * instead of two, at the cost of symlink aliases not sharing an identity.
     */
    async resolve(path, opts) {
      if (opts?.signal?.aborted) throw new FsError('resolve aborted', 'FS_ABORTED');
      if (typeof path !== 'string' || path.trim().length === 0) {
        throw new FsError('file_path must be a non-empty string', 'FS_NOT_FOUND');
      }
      const decision = this.decide(opts?.cwd, path);
      if (decision.world === 'local') {
        const inner = await this.localFs.resolve(path, opts);
        return {
          targetKey: FsTargetKey(LOCAL_PREFIX + String(inner.targetKey)),
          displayPath: inner.displayPath,
        };
      }
      const remote = runtime.mounts.toRemote(decision.mount, path, opts?.cwd);
      return { targetKey: this.remoteKey(decision.mount, remote), displayPath: remote };
    }

    processPath(target) {
      return this.worldOf(target).path;
    }

    processPathFromHostPath(hostPath) {
      if (typeof hostPath !== 'string' || !isAbsolute(hostPath)) return undefined;
      for (const mount of runtime.mounts.list()) {
        if (remoteContains(mount.localDir, hostPath)) {
          return runtime.mounts.toRemote(mount, hostPath, undefined);
        }
      }
      return this.localFs?.processPathFromHostPath?.(hostPath);
    }

    fileUrl(target) {
      if (this.worldOf(target).world === 'local') return this.localFs.fileUrl(this.localTarget(target));
      return pathToFileURL(this.processPath(target)).href;
    }

    contains(parent, child) {
      const left = this.worldOf(parent);
      const right = this.worldOf(child);
      if (left.world !== right.world) return false;
      if (left.world === 'local') return this.localFs.contains(this.localTarget(parent), this.localTarget(child));
      return left.mount.localDir === right.mount.localDir && remoteContains(left.path, right.path);
    }

    async stat(target, signal) {
      if (signal?.aborted) throw new FsError('stat aborted', 'FS_ABORTED');
      const world = this.worldOf(target);
      if (world.world === 'local') return this.localFs.stat(this.localTarget(target), signal);
      const { header } = await this.call(world.mount, 'stat', [world.path], { signal, verb: 'stat' });
      const info = parseStatHeader(header);
      if (info === undefined) return undefined;
      return { version: FsVersion(info.version), type: mapType(info.type), size: info.size };
    }

    async lstat(path, opts, signal) {
      if (signal?.aborted) throw new FsError('lstat aborted', 'FS_ABORTED');
      if (typeof path !== 'string' || path.trim().length === 0) {
        throw new FsError('file_path must be a non-empty string', 'FS_NOT_FOUND');
      }
      const decision = this.decide(opts?.cwd, path);
      if (decision.world === 'local') return this.localFs.lstat(path, opts, signal);
      const remote = runtime.mounts.toRemote(decision.mount, path, opts?.cwd);
      const { header } = await this.call(decision.mount, 'lstat', [remote], { signal, verb: 'lstat' });
      const info = parseStatHeader(header);
      if (info === undefined) return undefined;
      return { version: FsVersion(info.version), type: mapType(info.type), size: info.size };
    }

    async readText(target, signal) {
      const world = this.worldOf(target);
      if (world.world === 'local') return this.localFs.readText(this.localTarget(target), signal);
      const { payload } = await this.call(world.mount, 'read', [world.path, '-1'], { signal, verb: 'read' });
      if (payload.subarray(0, BINARY_SAMPLE_BYTES).includes(0)) {
        throw new FsError(`cannot read "${target.displayPath}": binary file`, 'FS_NOT_TEXT');
      }
      return this.decode(payload, 'read', target.displayPath);
    }

    decode(buffer, verb, displayPath) {
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        throw new FsError(`cannot ${verb} "${displayPath}": invalid UTF-8 text`, 'FS_NOT_TEXT');
      }
    }

    async streamText(target, signal) {
      const world = this.worldOf(target);
      if (world.world === 'local') return this.localFs.streamText(this.localTarget(target), signal);
      const sshTarget = runtime.targetOf(world.mount.alias);
      const { chunks } = await runtime.runner.stream({
        target: sshTarget,
        op: 'read',
        args: [world.path, '-1'],
        signal,
        timeoutMs: this.config.operationTimeoutMs,
      });
      const displayPath = target.displayPath;
      const that = this;
      return (async function* decode() {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        let sampled = 0;
        try {
          for await (const chunk of chunks) {
            if (sampled < BINARY_SAMPLE_BYTES) {
              const sample = chunk.subarray(0, Math.min(chunk.length, BINARY_SAMPLE_BYTES - sampled));
              if (sample.includes(0)) throw new FsError(`cannot read "${displayPath}": binary file`, 'FS_NOT_TEXT');
              sampled += sample.length;
            }
            yield decoder.decode(chunk, { stream: true });
          }
          yield decoder.decode();
        } catch (error) {
          if (error instanceof TypeError) throw that.notText('read', displayPath);
          throw error;
        }
      })();
    }

    notText(verb, displayPath) {
      return new FsError(`cannot ${verb} "${displayPath}": invalid UTF-8 text`, 'FS_NOT_TEXT');
    }

    async readBytes(target, signal, maxBytes) {
      const world = this.worldOf(target);
      if (world.world === 'local') return this.localFs.readBytes(this.localTarget(target), signal, maxBytes);
      const { payload } = await this.call(world.mount, 'read', [world.path, String(maxBytes)], { signal, verb: 'read' });
      return new Uint8Array(payload);
    }

    async readByteRange(target, range, signal) {
      const world = this.worldOf(target);
      if (world.world === 'local') return this.localFs.readByteRange(this.localTarget(target), range, signal);
      const { payload } = await this.call(
        world.mount,
        'readrange',
        [world.path, String(range.offset), String(range.length)],
        { signal, verb: 'read' },
      );
      return new Uint8Array(payload);
    }

    async listDir(target, signal) {
      const world = this.worldOf(target);
      if (world.world === 'local') return this.localFs.listDir(this.localTarget(target), signal);
      const { payload } = await this.call(world.mount, 'list', [world.path], { signal, verb: 'list' });
      return parseListPayload(payload)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((record) => {
          const type = mapType(record.type);
          const childRemote = joinRemote(world.path, record.name);
          return {
            name: record.name,
            type,
            target: {
              targetKey: this.remoteKey(world.mount, childRemote),
              displayPath: joinRemote(target.displayPath, record.name),
            },
            ...record.version !== undefined && record.version !== '' ? { version: FsVersion(record.version) } : {},
            ...type === 'file' ? { size: record.size } : {},
          };
        });
    }

    async writeText(target, content, expected, signal, sandboxPolicy) {
      const world = this.worldOf(target);
      if (world.world === 'local') {
        return this.localFs.writeText(this.localTarget(target), content, expected, signal, sandboxPolicy);
      }
      this.assertWritable(world, target.displayPath, sandboxPolicy);
      const policy = expected?.kind === 'replaceIfVersion'
        ? 'must-exist'
        : expected?.kind === 'createIfAbsent' ? 'must-absent' : 'any';
      const expectedVersion = expected?.kind === 'replaceIfVersion' ? String(expected.version) : '-';
      return this.withLock(String(target.targetKey), async () => {
        const { header, payload } = await this.call(
          world.mount,
          'write',
          [world.path, '-', expectedVersion, policy, String(this.config.diffBasisMaxBytes)],
          { input: Buffer.from(content, 'utf8'), signal, verb: 'write' },
        );
        const outcome = parseWriteHeader(header, payload);
        let before = null;
        if (outcome.oldBytes > 0 && !outcome.oldBuffer.includes(0)) {
          try {
            before = normalizeLineEndings(new TextDecoder('utf-8', { fatal: true }).decode(outcome.oldBuffer));
          } catch {
            before = null;
          }
        }
        return {
          operation: outcome.existed ? 'update' : 'create',
          version: FsVersion(outcome.version),
          before,
          after: normalizeLineEndings(content),
        };
      });
    }

    async editText(target, edit, expected, signal, sandboxPolicy) {
      const world = this.worldOf(target);
      if (world.world === 'local') {
        return this.localFs.editText(this.localTarget(target), edit, expected, signal, sandboxPolicy);
      }
      this.assertWritable(world, target.displayPath, sandboxPolicy);
      return this.withLock(String(target.targetKey), async () => {
        const { header, payload } = await this.call(world.mount, 'read', [world.path, '-1'], { signal, verb: 'edit' });
        const version = header[1];
        if (expected !== undefined && String(expected.version) !== version) {
          throw new FsError(`cannot edit "${target.displayPath}": file changed since it was read`, 'FS_STALE_VERSION');
        }
        if (payload.subarray(0, BINARY_SAMPLE_BYTES).includes(0)) {
          throw new FsError(`cannot edit "${target.displayPath}": binary file`, 'FS_NOT_TEXT');
        }
        const original = this.decode(payload, 'edit', target.displayPath);
        const lineEndings = detectLineEndings(original);
        const normalized = normalizeLineEndings(original);
        const oldNorm = normalizeLineEndings(edit.oldString);
        if (oldNorm.length === 0) throw new FsError('old_string must be a non-empty string', 'FS_EDIT_NOT_FOUND');
        const newNorm = normalizeLineEndings(edit.newString);
        const replacements = countOccurrences(normalized, oldNorm);
        if (replacements === 0) {
          throw new FsError(`old_string was not found in "${target.displayPath}"`, 'FS_EDIT_NOT_FOUND');
        }
        if (edit.replaceAll !== true && replacements > 1) {
          throw new FsError(
            `old_string matched ${replacements} times in "${target.displayPath}"; provide a more specific old_string or set replace_all to true`,
            'FS_AMBIGUOUS_EDIT',
          );
        }
        const edited = normalized.split(oldNorm).join(newNorm);
        const body = restoreLineEndings(edited, lineEndings);
        const written = await this.call(
          world.mount,
          'write',
          [world.path, '-', version, 'must-exist', String(this.config.diffBasisMaxBytes)],
          { input: Buffer.from(body, 'utf8'), signal, verb: 'edit' },
        );
        const outcome = parseWriteHeader(written.header, written.payload);
        return {
          version: FsVersion(outcome.version),
          before: normalizeLineEndings(original),
          after: edited,
        };
      });
    }

    /**
     * Observe a target for changes. Remote targets poll a fingerprint, because SSH
     * exposes no filesystem event stream; local targets keep the delegate's native
     * watching.
     */
    async watch(target, changed, signal) {
      signal.throwIfAborted();
      const world = this.worldOf(target);
      if (world.world === 'local') return this.localFs.watch(this.localTarget(target), changed, signal);

      const directory = (await this.stat(target, signal))?.type === 'directory';
      signal.throwIfAborted();
      const mount = world.mount;
      const remotePath = world.path;

      const fingerprint = async () => {
        if (runtime.mounts.mounts.get(mount.localDir) !== mount) throw new FsError('Remote workspace disconnected', 'FS_IO_ERROR');
        if (directory) {
          const { payload } = await this.call(mount, 'list', [remotePath], { verb: 'watch', signal });
          return createHash('sha1')
            .update(parseListPayload(payload).map((record) => `${record.name}\u0000${record.version}`).join('\u0001'))
            .digest('hex');
        }
        const result = await runtime.runner.run({
          target: runtime.targetOf(mount.alias),
          op: 'stat',
          args: [remotePath],
          signal,
          timeoutMs: this.config.operationTimeoutMs,
        });
        return result.code === 0 ? result.stdout.toString('utf8').trim() : `absent:${result.code}`;
      };

      let last = await fingerprint();
      let stopped = false;
      let inFlight = false;
      /** @type {NodeJS.Timeout | undefined} */
      let timer;
      const stop = () => {
        stopped = true;
        if (timer !== undefined) clearInterval(timer);
        signal.removeEventListener('abort', stop);
      };
      timer = setInterval(() => {
        if (stopped || inFlight) return;
        inFlight = true;
        void fingerprint().then((next) => {
          if (stopped || next === last) return;
          last = next;
          changed();
        }, (error) => {
          if (!stopped) changed(error instanceof Error ? error : new Error(String(error)));
        }).finally(() => { inFlight = false; });
      }, this.config.watchIntervalMs);
      timer.unref?.();
      signal.addEventListener('abort', stop, { once: true });
      if (signal.aborted) stop();
      return async () => {
        stop();
      };
    }
  };
}

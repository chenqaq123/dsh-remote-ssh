/** Shared workspace operations for the chat tools and desktop panel. */
import { mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeRemote } from './mounts.js';
import { describeHost } from './ssh-config.js';
import { validateHost } from './browse.js';

export function createWorkspaceActions(runtime) {
  const { config, mounts, runner } = runtime;
  const statuses = new Map();
  const pending = new Set();
  const getMount = (localPath) => {
    const mount = mounts.list().find((entry) => entry.localDir === localPath);
    if (!mount) throw new Error('这个远程工作区已断开，请重新连接。');
    return mount;
  };
  async function probe(alias, remoteDir, signal) {
    signal?.throwIfAborted();
    const target = runtime.targetOf(alias);
    const banner = await runner.hello(target, signal);
    const result = await runner.run({ target, op: 'stat', args: [remoteDir], signal,
      timeoutMs: config.operationTimeoutMs });
    if (result.code !== 0) throw new Error(`无法访问远程目录：${result.stderr.trim() || `SSH exit ${result.code}`}`);
    const header = result.stdout.subarray(0, result.stdout.indexOf(10)).toString('utf8').split(' ');
    if (header[1] === 'absent') throw new Error(`远程目录不存在：${remoteDir}`);
    if (header[1] !== 'd') throw new Error(`这个路径不是目录：${remoteDir}`);
    signal?.throwIfAborted();
    return banner;
  }
  return {
    list() {
      return mounts.list().map((mount) => ({ alias: mount.alias, remoteDir: mount.remoteDir,
        localDir: mount.localDir, status: 'saved', checkedAt: null, message: '',
        ...statuses.get(mount.localDir) }));
    },
    async connect({ host, remote_path, local_path }, signal) {
      const alias = String(host ?? '').trim();
      validateHost(alias);
      const rawPath = String(remote_path ?? '');
      if (!rawPath.startsWith('/') || rawPath.includes('\0')) throw new Error('请填写以 / 开头的远程绝对路径。');
      const remoteDir = normalizeRemote(rawPath);
      const existing = mounts.list().find((m) => m.alias === alias && m.remoteDir === remoteDir);
      const key = JSON.stringify([alias, remoteDir]);
      if (pending.has(key)) throw new Error('这个工作区正在连接，请稍候。');
      const segment = remoteDir.replace(/^\/+|\/+$/gu, '').replace(/[^\w.-]+/gu, '_') || 'root';
      const suffix = createHash('sha256').update(key).digest('hex').slice(0, 8);
      const localDir = local_path ?? existing?.localDir
        ?? join(config.mirrorRoot, alias.replace(/[^\w.-]+/gu, '_'), `${segment}-${suffix}`);
      if (!isAbsolute(localDir)) throw new Error('本地工作区路径必须是绝对路径。');
      const previous = mounts.list().find((m) => m.localDir === localDir);
      if (previous && (previous.alias !== alias || previous.remoteDir !== remoteDir)) {
        throw new Error('这个本地工作区已对应其他远程目录，请选择其他路径。');
      }
      pending.add(key);
      try {
        const banner = await probe(alias, remoteDir, signal);
        mkdirSync(localDir, { recursive: true, mode: 0o755 });
        const facts = describeHost(runtime.configBlocks, alias);
        mounts.put({ localDir, alias, remoteDir, hostname: facts.hostname,
          ...(facts.user === undefined ? {} : { user: facts.user }),
          ...(facts.port === undefined ? {} : { port: facts.port }) });
        try { mounts.save(); } catch (error) {
          if (previous) mounts.put(previous); else mounts.remove(localDir, false);
          throw error;
        }
        statuses.set(localDir, { status: 'connected', checkedAt: new Date().toISOString(), message: '' });
        return { alias, remoteDir, localDir, banner };
      } catch (error) {
        if (existing) statuses.set(existing.localDir, { status: 'error', checkedAt: new Date().toISOString(), message: error.message });
        throw error;
      } finally { pending.delete(key); }
    },
    async check(localPath, signal) {
      const mount = getMount(localPath);
      try {
        await probe(mount.alias, mount.remoteDir, signal);
        statuses.set(localPath, { status: 'connected', checkedAt: new Date().toISOString(), message: '' });
      } catch (error) {
        statuses.set(localPath, { status: 'error', checkedAt: new Date().toISOString(), message: error.message });
        throw error;
      }
      return this.list().find((m) => m.localDir === localPath);
    },
    async disconnect(localPath) {
      const mount = getMount(localPath);
      mounts.remove(localPath);
      try { mounts.save(); } catch (error) { mounts.put(mount); throw error; }
      statuses.delete(localPath);
      // Other workspaces may share the same SSH master connection.
      const shared = mounts.list().some((m) => m.alias === mount.alias);
      const closed = shared ? false : await runner.close(runtime.targetOf(mount.alias)).catch(() => false);
      return { alias: mount.alias, remoteDir: mount.remoteDir, localDir: localPath, closed };
    },
  };
}

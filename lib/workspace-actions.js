/** Shared workspace operations for the chat tools and desktop panel. */
import { lstatSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeLocal, normalizeRemote, remoteContains } from './mounts.js';
import { describeHost, expandHome } from './ssh-config.js';
import { validateHost } from './browse.js';
import { isAutomaticTitle, normalizeWorkspaceName, remoteHostnameFromBanner, workspaceLabels, workspaceNameFromTitle } from './workspace-labels.js';

/** New mappings may use empty placeholders, never an existing local project. */
export function assertPlaceholderPath(localDir, { managed = false, workspaces = [] } = {}) {
  if (managed) return;
  const canonical = path => { try { return realpathSync(path); } catch { return path; } };
  const path = canonical(localDir);
  if (workspaces.some(w => remoteContains(canonical(w.path), path) || remoteContains(path, canonical(w.path)))) {
    throw new Error('这个路径属于已有本地工作区，请选择独立的空目录作为远程占位目录。');
  }
  let info;
  try { info = lstatSync(localDir); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (!info.isDirectory() || info.isSymbolicLink() || readdirSync(localDir).length) {
    throw new Error('远程占位路径必须是空目录，不能使用已有本地项目或符号链接。');
  }
}

export function createWorkspaceActions(runtime) {
  const { config, mounts, runner } = runtime;
  const statuses = new Map();
  const pending = new Set();
  const busy = runtime.workspaceBusy ??= new Set();
  const registry = () => runtime.ctx?.get?.('workspaceRegistry');
  const canonical = path => { try { return realpathSync(path); } catch { return path; } };
  const findWorkspace = mount => registry()?.list().find(w => canonical(w.path) === canonical(mount.localDir));
  const labels = mount => {
    const workspace = findWorkspace(mount);
    if (!mount.renameRequested && workspace && !isAutomaticTitle(workspace, mount)) {
      return workspaceLabels({ ...mount, name: workspaceNameFromTitle(workspace.title, mount) });
    }
    return workspaceLabels(mount);
  };
  async function updateTitle(mount, workspace) {
    const next = labels(mount);
    if (registry().list().some(w => w.id !== workspace.id && w.title === next.title)) {
      throw new Error('同一主机上已有同名工作区，请使用其他名称。');
    }
    const oldTitle = workspace.title;
    const previous = { ...mount };
    if (oldTitle !== next.title) await workspace.setTitle(next.title);
    try {
      Object.assign(mount, { name: next.name, workspaceTitle: next.title, renameRequested: false });
      mounts.save();
    } catch (error) {
      for (const key of Object.keys(mount)) if (!(key in previous)) delete mount[key];
      Object.assign(mount, previous);
      if (oldTitle !== next.title) await workspace.setTitle(oldTitle);
      throw error;
    }
  }
  async function refreshHostname(mount, banner) {
    const remoteHostname = remoteHostnameFromBanner(banner);
    if (!remoteHostname || remoteHostname === mount.remoteHostname) return;
    const previous = { ...mount };
    Object.assign(mount, { name: labels(mount).name, remoteHostname });
    try {
      const workspace = findWorkspace(mount);
      if (workspace) await updateTitle(mount, workspace);
      else mounts.save();
    } catch (error) {
      for (const key of Object.keys(mount)) if (!(key in previous)) delete mount[key];
      Object.assign(mount, previous);
      throw error;
    }
  }
  const getMount = (localPath) => {
    const mount = mounts.get(localPath);
    if (!mount) throw new Error('这个远程工作区已断开，请重新连接。');
    return mount;
  };

  /**
   * Store a password the user typed, before the connection that needs it.
   *
   * A rejected password is stored too: the panel offers it back for correction,
   * and clearing the entry is the explicit way to fall back to key auth.
   */
  const rememberPassword = (alias, password) => {
    if (typeof password !== 'string' || password.length === 0) return;
    if (runtime.secrets === undefined) throw new Error('密码存储不可用，请检查插件配置中的 secretsFile。');
    runtime.secrets.set(alias, password);
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
    rememberPassword,
    list() {
      const known = [...mounts.list(), ...mounts.listDisconnected()];
      const result = known.map((mount) => ({ alias: mount.alias, ...labels(mount), remoteDir: mount.remoteDir,
        workspaceId: findWorkspace(mount)?.id,
        localDir: mount.localDir, status: mounts.mounts.has(mount.localDir) ? 'saved' : 'disconnected', checkedAt: null, message: '',
        hasPassword: runtime.secrets?.has(mount.alias) ?? false,
        ...statuses.get(mount.localDir) }));
      const knownRoots = new Set(known.map((mount) => mount.localDir));
      for (const workspace of registry()?.list?.() ?? []) {
        let localDir;
        try { localDir = typeof workspace.path === 'string' ? normalizeLocal(workspace.path) : undefined; } catch { continue; }
        if (!localDir || knownRoots.has(localDir) || !mounts.retiredRoots.has(localDir)) continue;
        const alias = / · ([^·]+)$/u.exec(workspace.title ?? '')?.[1] ?? '';
        result.push({ alias, name: workspace.title, hostname: alias || 'unknown', title: workspace.title, remoteDir: '',
          workspaceId: workspace.id, localDir, status: 'disconnected', checkedAt: null,
          message: '远程映射信息已丢失，请在上方重新选择服务器和目录后连接。', hasPassword: alias ? runtime.secrets?.has(alias) ?? false : false,
          orphaned: true });
      }
      return result;
    },
    async connect({ host, remote_path, local_path, name, password }, signal) {
      const requestedName = normalizeWorkspaceName(name);
      const alias = String(host ?? '').trim();
      validateHost(alias);
      const rawPath = String(remote_path ?? '');
      if (!rawPath.startsWith('/') || rawPath.includes('\0')) throw new Error('请填写以 / 开头的远程绝对路径。');
      const remoteDir = normalizeRemote(rawPath);
      const existing = [...mounts.list(), ...mounts.listDisconnected()].find((m) => m.alias === alias && m.remoteDir === remoteDir);
      const key = JSON.stringify([alias, remoteDir]);
      if (pending.has(key)) throw new Error('这个工作区正在连接，请稍候。');
      const segment = remoteDir.replace(/^\/+|\/+$/gu, '').replace(/[^\w.-]+/gu, '_') || 'root';
      const suffix = createHash('sha256').update(key).digest('hex').slice(0, 8);
      const rawLocal = local_path ?? existing?.localDir
        ?? join(config.mirrorRoot, alias.replace(/[^\w.-]+/gu, '_'), `${segment}-${suffix}`);
      if (typeof rawLocal !== 'string' || rawLocal.split(sep).includes('..')) {
        throw new Error('本地工作区路径不能包含 ..。');
      }
      const localDir = normalizeLocal(expandHome(rawLocal));
      if (busy.has(localDir)) throw new Error('这个工作区正在处理其他操作，请稍后重试。');
      const previous = mounts.get(localDir, { includeDisconnected: false });
      const disconnected = mounts.get(localDir);
      const prior = previous ?? disconnected;
      if (previous && (previous.alias !== alias || previous.remoteDir !== remoteDir)) {
        throw new Error('这个本地工作区已对应其他远程目录，请选择其他路径。');
      }
      if (disconnected && (disconnected.alias !== alias || disconnected.remoteDir !== remoteDir)) {
        throw new Error('这个本地工作区已对应其他远程目录，请选择其他路径。');
      }
      assertPlaceholderPath(localDir, { managed: !!previous || !!disconnected || mounts.retiredRoots.has(localDir), workspaces: registry()?.list() ?? [] });
      pending.add(key);
      busy.add(localDir);
      try {
        rememberPassword(alias, password);
        const banner = await probe(alias, remoteDir, signal);
        assertPlaceholderPath(localDir, { managed: !!previous || !!disconnected || mounts.retiredRoots.has(localDir), workspaces: registry()?.list() ?? [] });
        mkdirSync(localDir, { recursive: true, mode: 0o755 });
        const facts = describeHost(runtime.configBlocks, alias);
        mounts.put({ ...prior, localDir, alias, remoteDir, hostname: facts.hostname,
          remoteHostname: remoteHostnameFromBanner(banner) ?? prior?.remoteHostname,
          name: requestedName ?? prior?.name ?? workspaceLabels({ alias, remoteDir }).name,
          renameRequested: requestedName !== undefined || prior?.renameRequested === true,
          ...(facts.user === undefined ? {} : { user: facts.user }),
          ...(facts.port === undefined ? {} : { port: facts.port }) });
        try { mounts.save(); } catch (error) {
          if (previous) mounts.put(previous);
          else {
            mounts.remove(localDir, false);
            if (disconnected) {
              mounts.disconnectedMounts.set(localDir, disconnected);
              mounts.retiredRoots.add(localDir);
            }
          }
          throw error;
        }
        statuses.set(localDir, { status: 'connected', checkedAt: new Date().toISOString(), message: '' });
        return { alias, remoteDir, localDir, banner, ...workspaceLabels(mounts.mounts.get(localDir)) };
      } catch (error) {
        if (existing) statuses.set(existing.localDir, { status: 'error', checkedAt: new Date().toISOString(), message: error.message });
        throw error;
      } finally { pending.delete(key); busy.delete(localDir); }
    },
    async open(localPath, signal) {
      localPath = normalizeLocal(expandHome(localPath));
      signal?.throwIfAborted();
      if (!registry()) throw new Error('工作区服务尚未就绪，请稍后重试。');
      if (busy.has(localPath)) throw new Error('这个工作区正在处理其他操作，请稍后重试。');
      const mount = getMount(localPath);
      const existing = findWorkspace(mount);
      if (registry().list().some(w => w.id !== existing?.id && w.title === labels(mount).title)) {
        throw new Error('同一主机上已有同名工作区，请使用其他名称。');
      }
      busy.add(localPath);
      try {
        mkdirSync(mount.localDir, { recursive: true, mode: 0o755 });
        if (existing) return { workspaceId: existing.id };
        const workspace = await registry().create(localPath);
        await updateTitle(mount, workspace);
        return { workspaceId: workspace.id };
      } finally { busy.delete(localPath); }
    },
    async syncTitles() {
      for (const mount of mounts.list()) {
        const workspace = findWorkspace(mount);
        if (!workspace || busy.has(mount.localDir)) continue;
        busy.add(mount.localDir);
        try {
          if (workspace.title !== labels(mount).title || !mount.workspaceTitle) await updateTitle(mount, workspace);
        } catch (error) { runtime.ctx?.logger?.warn?.('ssh-remote: could not update workspace title: %s', error.message); }
        finally { busy.delete(mount.localDir); }
      }
    },
    async check(localPath, signal, { password } = {}) {
      localPath = normalizeLocal(expandHome(localPath));
      if (busy.has(localPath)) throw new Error('这个工作区正在处理其他操作，请稍后重试。');
      const mount = getMount(localPath);
      const wasDisconnected = !mounts.mounts.has(mount.localDir);
      busy.add(localPath);
      try {
        rememberPassword(mount.alias, password);
        const banner = await probe(mount.alias, mount.remoteDir, signal);
        await refreshHostname(mount, banner);
        if (wasDisconnected) {
          mounts.put(mount);
          try { mounts.save(); } catch (error) {
            mounts.remove(mount.localDir, false);
            mounts.disconnectedMounts.set(mount.localDir, mount);
            mounts.retiredRoots.add(mount.localDir);
            throw error;
          }
        }
        statuses.set(localPath, { status: 'connected', checkedAt: new Date().toISOString(), message: '' });
      } catch (error) {
        statuses.set(localPath, { status: 'error', checkedAt: new Date().toISOString(), message: error.message });
        throw error;
      } finally { busy.delete(localPath); }
      return this.list().find((m) => m.localDir === localPath);
    },
    async disconnect(localPath) {
      localPath = normalizeLocal(expandHome(localPath));
      if (busy.has(localPath)) throw new Error('这个工作区正在处理其他操作，请稍后重试。');
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

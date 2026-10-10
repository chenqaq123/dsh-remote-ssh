/**
 * Mount table: the mapping that lets a remote directory act as a session workspace.
 *
 * The harness identifies a workspace by an absolute local directory string and
 * passes it to every filesystem and shell call as `cwd`. A remote backend needs to
 * turn that string into a remote directory. A mount records one such pairing —
 * a local directory the GUI can create, open, and list, and the remote directory
 * it stands for — so the existing workspace, sidebar, and session flows keep
 * working unchanged while every read, write, and command lands on the remote host.
 *
 * Absolute paths that fall outside every mount are treated as remote paths
 * verbatim, because models naturally echo the remote spelling they saw in a tool
 * result.
 *
 * @module dsh-ssh-remote/mounts
 */

import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, normalize, parse, posix, sep } from 'node:path';

/** Normalize local roots once, keeping the filesystem root intact. */
export function normalizeLocal(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) {
    throw new Error('本地工作区路径必须是绝对路径。');
  }
  const value = normalize(path);
  return value.length > parse(value).root.length && value.endsWith(sep) ? value.slice(0, -1) : value;
}

/** Normalize a remote (POSIX) absolute path without resolving symlinks. */
export function normalizeRemote(path) {
  const collapsed = posix.normalize(path);
  return collapsed.length > 1 && collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed;
}

/** Join remote path segments. */
export function joinRemote(...parts) {
  return normalizeRemote(posix.join(...parts));
}

/** True when `child` is `parent` or lives beneath it. */
export function remoteContains(parent, child) {
  const base = normalizeRemote(parent);
  const target = normalizeRemote(child);
  if (base === target) return true;
  return target.startsWith(base.endsWith('/') ? base : `${base}/`);
}

/** Convert a local absolute path into a comparison-safe POSIX form. */
function localToPosix(path) {
  return sep === '/' ? path : path.split(sep).join('/');
}

/**
 * One local directory standing in for one remote directory.
 * @typedef {object} Mount
 * @property {string} localDir - absolute local directory used as the workspace.
 * @property {string} alias - `~/.ssh/config` alias (or host name) to connect to.
 * @property {string} remoteDir - absolute remote directory.
 * @property {string} [createdAt] - ISO timestamp, for display.
 */

export class MountTable {
  /**
   * @param options - persistence path.
   */
  constructor({ storageFile }) {
    this.storageFile = storageFile;
    /** @type {Map<string, Mount>} */
    this.mounts = new Map();
    this.retiredRoots = new Set();
    // Configuration owns routing; persisted metadata must never resurrect a
    // mount after its declaration is deleted.
    this.configuredMounts = new Map();
  }

  /** Load persisted mounts, ignoring an unreadable or malformed file. */
  load() {
    let text;
    try {
      text = readFileSync(this.storageFile, 'utf8');
    } catch {
      return this;
    }
    try {
      const parsed = JSON.parse(text);
      for (const root of Array.isArray(parsed.retiredRoots) ? parsed.retiredRoots : []) {
        try { this.retiredRoots.add(normalizeLocal(root)); } catch { /* Skip malformed roots. */ }
      }
      for (const entry of Array.isArray(parsed.configuredMounts) ? parsed.configuredMounts : []) {
        if (typeof entry?.alias !== 'string' || typeof entry?.remoteDir !== 'string' || !entry.remoteDir.startsWith('/')) continue;
        try {
          const localDir = normalizeLocal(entry.localDir);
          this.configuredMounts.set(localDir, { ...entry, localDir, remoteDir: normalizeRemote(entry.remoteDir) });
        } catch { /* Skip malformed metadata. */ }
      }
      for (const entry of Array.isArray(parsed.mounts) ? parsed.mounts : []) {
        if (typeof entry?.alias !== 'string' || typeof entry?.remoteDir !== 'string' || !entry.remoteDir.startsWith('/')) continue;
        try {
          const localDir = normalizeLocal(entry.localDir);
          const map = entry.source === 'config' ? this.configuredMounts : this.mounts;
          map.set(localDir, { ...entry, localDir, remoteDir: normalizeRemote(entry.remoteDir) });
        } catch { /* One invalid entry must not hide the others. */ }
      }
    } catch {
      /* A corrupt store must not stop the plugin from loading. */
    }
    return this;
  }

  /** Persist the current table. */
  save() {
    mkdirSync(dirname(this.storageFile), { recursive: true, mode: 0o700 });
    const entries = [...this.mounts.values()];
    const body = { version: 3, mounts: entries.filter(m => m.source !== 'config'),
      configuredMounts: [...this.configuredMounts.values()], retiredRoots: [...this.retiredRoots] };
    const temp = `${this.storageFile}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
      renameSync(temp, this.storageFile);
    } finally { rmSync(temp, { force: true }); }
  }

  /** Add or replace a mount. */
  put(mount) {
    const localDir = normalizeLocal(mount.localDir);
    if (typeof mount.remoteDir !== 'string' || !mount.remoteDir.startsWith('/') || mount.remoteDir.includes('\0')) {
      throw new Error('远程工作区路径必须是绝对路径。');
    }
    this.retiredRoots.delete(localDir);
    const entry = { ...mount, localDir, remoteDir: normalizeRemote(mount.remoteDir), createdAt: mount.createdAt ?? new Date().toISOString() };
    this.mounts.set(localDir, entry);
    if (entry.source === 'config') this.configuredMounts.set(localDir, entry);
    else this.configuredMounts.delete(localDir);
    return entry;
  }

  /** Remove a mount by local directory. */
  remove(localDir, retire = true) {
    localDir = normalizeLocal(localDir);
    if (retire) this.retiredRoots.add(localDir);
    this.configuredMounts.delete(localDir);
    return this.mounts.delete(localDir);
  }

  /** All mounts, insertion-ordered with the most recently added first. */
  list() {
    return [...this.mounts.values()].reverse();
  }

  /** The mount whose local root contains `cwd`, or undefined for an unmounted one. */
  match(cwd) {
    if (typeof cwd !== 'string' || cwd.length === 0) return undefined;
    if (!isAbsolute(cwd)) return undefined;
    const local = normalizeLocal(cwd);
    const normalized = localToPosix(local);
    const exact = this.mounts.get(local);
    if (exact !== undefined) return exact;
    for (const mount of this.list().sort((a, b) => b.localDir.length - a.localDir.length)) {
      if (remoteContains(localToPosix(mount.localDir), normalized)) return mount;
    }
    return undefined;
  }

  /** A disconnected workspace must never fall through to local execution. */
  assertActivePath(path, ErrorType = Error) {
    if (typeof path !== 'string') return;
    const active = this.match(path);
    const inactive = [...this.configuredMounts.keys()].filter(root => !this.mounts.has(root));
    for (const root of [...this.retiredRoots, ...inactive]) {
      if (remoteContains(root, path) && (!active || root.length >= active.localDir.length)) {
        throw new ErrorType('远程工作区已断开，请在远程工作区面板中重新连接。', 'FS_IO_ERROR');
      }
    }
  }

  /**
   * Translate a path from the harness's world into the remote world.
   * @param mount - the mount to translate within.
   * @param path - absolute or relative path as the caller spelled it.
   * @param cwd - the caller's working directory, when it has one.
   * @returns an absolute remote path.
   */
  toRemote(mount, path, cwd) {
    const posixPath = posix.normalize(localToPosix(path));
    const localRoot = localToPosix(normalizeLocal(mount.localDir));
    if (remoteContains(localRoot, posixPath)) {
      const suffix = posixPath.slice(localRoot.length).replace(/^\/+/, '');
      return joinRemote(mount.remoteDir, suffix);
    }
    if (posix.isAbsolute(posixPath)) return normalizeRemote(posixPath);
    const base = typeof cwd === 'string' && cwd.length > 0
      ? this.toRemote(mount, cwd, undefined)
      : mount.remoteDir;
    return joinRemote(base, posixPath);
  }
}

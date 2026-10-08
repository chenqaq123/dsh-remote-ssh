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
import { dirname } from 'node:path';
import { posix, sep } from 'node:path';

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
   * @param options - persistence path and the host resolver used for new mounts.
   */
  constructor({ storageFile, resolveHost }) {
    this.storageFile = storageFile;
    this.resolveHost = resolveHost;
    /** @type {Map<string, Mount>} */
    this.mounts = new Map();
    this.retiredRoots = new Set();
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
      this.retiredRoots = new Set((parsed.retiredRoots ?? []).filter((path) => typeof path === 'string' && path.startsWith('/')));
      for (const entry of parsed.mounts ?? []) {
        if (typeof entry?.localDir === 'string' && typeof entry?.alias === 'string' && typeof entry?.remoteDir === 'string') {
          this.mounts.set(entry.localDir, entry);
        }
      }
    } catch {
      /* A corrupt store must not stop the plugin from loading. */
    }
    return this;
  }

  /** Persist the current table. */
  save() {
    mkdirSync(dirname(this.storageFile), { recursive: true, mode: 0o700 });
    const body = { version: 2, mounts: [...this.mounts.values()], retiredRoots: [...this.retiredRoots] };
    const temp = `${this.storageFile}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
      renameSync(temp, this.storageFile);
    } finally { rmSync(temp, { force: true }); }
  }

  /** Add or replace a mount. */
  put(mount) {
    this.retiredRoots.delete(mount.localDir);
    this.mounts.set(mount.localDir, { ...mount, createdAt: mount.createdAt ?? new Date().toISOString() });
    return this.mounts.get(mount.localDir);
  }

  /** Remove a mount by local directory. */
  remove(localDir, retire = true) {
    if (retire) this.retiredRoots.add(localDir);
    return this.mounts.delete(localDir);
  }

  /** All mounts, insertion-ordered with the most recently added first. */
  list() {
    return [...this.mounts.values()].reverse();
  }

  /** The mount a call belongs to, given the session cwd it carries. */
  route(cwd) {
    return this.match(cwd);
  }

  /** The mount whose local root contains `cwd`, or undefined for an unmounted one. */
  match(cwd) {
    if (typeof cwd !== 'string' || cwd.length === 0) return undefined;
    const normalized = localToPosix(cwd);
    const exact = this.mounts.get(cwd) ?? this.mounts.get(normalized);
    if (exact !== undefined) return exact;
    for (const mount of this.list().sort((a, b) => b.localDir.length - a.localDir.length)) {
      if (remoteContains(mount.localDir, normalized)) return mount;
    }
    return undefined;
  }

  /** A disconnected workspace must never fall through to local execution. */
  assertActivePath(path) {
    if (typeof path !== 'string') return;
    const active = this.match(path);
    for (const root of this.retiredRoots) {
      if (remoteContains(root, path) && (!active || root.length >= active.localDir.length)) {
        throw new Error('远程工作区已断开，请在远程工作区面板中重新连接。');
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
    const posixPath = localToPosix(path);
    for (const candidate of [mount]) {
      if (remoteContains(candidate.localDir, posixPath)) {
        const suffix = posixPath.slice(candidate.localDir.length);
        return normalizeRemote(`${candidate.remoteDir}${suffix}`);
      }
    }
    if (posix.isAbsolute(posixPath)) return normalizeRemote(posixPath);
    const base = typeof cwd === 'string' && cwd.length > 0
      ? this.toRemote(mount, cwd, undefined)
      : mount.remoteDir;
    return joinRemote(base, posixPath);
  }

  /** Best-effort reverse translation, used for messages and tool output. */
  toLocal(cwd, remotePath) {
    const mount = this.route(cwd);
    if (mount === undefined) return remotePath;
    if (!remoteContains(mount.remoteDir, remotePath)) return remotePath;
    const suffix = normalizeRemote(remotePath).slice(normalizeRemote(mount.remoteDir).length);
    return `${mount.localDir.replace(/\/$/u, '')}${suffix}`;
  }

  /** Resolve the SSH destination a mount connects through. */
  targetOf(mount) {
    return this.resolveHost(mount.alias);
  }
}

/**
 * Local password store for SSH hosts that authenticate with a password.
 *
 * A password is written once from the desktop panel and then replayed to `ssh` by
 * the askpass helper, so the user never types it again. It is keyed by the
 * destination the plugin would hand to `ssh` — the `~/.ssh/config` alias, or a
 * literal `user@host` — which is the only name every layer already agrees on.
 *
 * The file is private to the current user (0600 in a 0700 directory) and is
 * rewritten atomically, so a crash mid-write cannot leave a truncated store. The
 * whole map is cached in memory: reading a keychain or a file for every remote
 * operation would put a disk round trip in front of every file read.
 *
 * @module dsh-ssh-remote/secrets
 */

import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

/** Longest password accepted; well past any real credential, short of a mistake. */
export const MAX_PASSWORD_LENGTH = 512;

/**
 * Validate a password before it can be stored or replayed.
 * @param value - the candidate password.
 * @returns the password, unchanged.
 * @throws when it could never be typed at an SSH prompt.
 */
export function assertPassword(value) {
  if (typeof value !== 'string' || value.length === 0) throw new Error('密码不能为空。');
  if (value.length > MAX_PASSWORD_LENGTH) throw new Error(`密码不能超过 ${MAX_PASSWORD_LENGTH} 个字符。`);
  if (/[\r\n\0]/u.test(value)) throw new Error('密码不能包含换行符，因为 SSH 只读取一行。');
  return value;
}

/** Validate a store key: the destination string passed to `ssh`. */
function assertAlias(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) throw new Error('无效的服务器名称。');
  if (value.startsWith('-') || /[\s\0]/u.test(value)) throw new Error('无效的服务器名称。');
  return value;
}

/**
 * A `secrets.json` reader and writer.
 *
 * Failures are reported through `warn` rather than thrown: an unreadable or
 * corrupt store must not stop the plugin from loading, and the user can always
 * enter the password again.
 */
export class SecretStore {
  /**
   * @param options - the store file plus a warning sink.
   */
  constructor({ file, warn } = {}) {
    if (typeof file !== 'string' || !file.startsWith('/')) throw new Error('ssh-remote: secrets file must be an absolute path');
    this.file = file;
    this.warn = typeof warn === 'function' ? warn : () => {};
    /** @type {Map<string, string> | undefined} loaded lazily, then authoritative. */
    this.secrets = undefined;
  }

  /** Load the store once; a missing or malformed file yields an empty one. */
  load() {
    if (this.secrets !== undefined) return this.secrets;
    this.secrets = new Map();
    let text;
    try {
      text = readFileSync(this.file, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') this.warn(`cannot read ${this.file}: ${error.message}`);
      return this.secrets;
    }
    this.tighten();
    try {
      const parsed = JSON.parse(text);
      for (const [alias, password] of Object.entries(parsed?.secrets ?? {})) {
        if (typeof password !== 'string' || password.length === 0) continue;
        try { this.secrets.set(assertAlias(alias), password); } catch { /* Skip an unusable key. */ }
      }
    } catch (error) {
      this.warn(`ignoring malformed ${this.file}: ${error.message}`);
    }
    return this.secrets;
  }

  /** Re-apply 0600 when the file was made readable by other users. */
  tighten() {
    try {
      if ((statSync(this.file).mode & 0o077) !== 0) {
        chmodSync(this.file, 0o600);
        this.warn(`${this.file} was readable by other users; permissions were tightened to 0600`);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') this.warn(`cannot check permissions of ${this.file}: ${error.message}`);
    }
  }

  /** A stored password, or undefined when this destination has none. */
  get(alias) {
    try { return this.load().get(assertAlias(alias)); } catch { return undefined; }
  }

  /** True when this destination has a stored password. */
  has(alias) {
    return this.get(alias) !== undefined;
  }

  /** The destinations with a stored password. */
  aliases() {
    return [...this.load().keys()];
  }

  /** Store (or replace) one password and persist the change. */
  set(alias, password) {
    const key = assertAlias(alias);
    assertPassword(password);
    this.load().set(key, password);
    this.save();
  }

  /** Forget one password. Returns whether something was removed. */
  delete(alias) {
    let removed = false;
    try { removed = this.load().delete(assertAlias(alias)); } catch { return false; }
    if (removed) this.save();
    return removed;
  }

  /** Replace the store atomically, private to the current user. */
  save() {
    const body = { version: 1, secrets: Object.fromEntries(this.load()) };
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = `${this.file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
      renameSync(temp, this.file);
    } finally { rmSync(temp, { force: true }); }
  }
}

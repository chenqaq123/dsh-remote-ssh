import { posix } from 'node:path';
import { splitFramed, parseListPayload } from './remote-protocol.js';

export function validateHost(host) {
  if (typeof host !== 'string' || !host || host.startsWith('-') || /[\s\0]/u.test(host)) {
    throw new Error('请选择有效的 SSH 服务器。');
  }
  return host;
}

/** Decode a bounded folder listing. Paths use byte framing, including newlines. */
export function parseBrowse(buffer) {
  const { header, payload } = splitFramed(buffer);
  const length = Number(header[1]);
  if (header[0] !== '#B' || !Number.isSafeInteger(length) || length < 1 || payload[length] !== 10) {
    throw new Error('Invalid remote directory response');
  }
  const path = payload.subarray(0, length).toString('utf8');
  const end = payload.lastIndexOf(Buffer.from('#E '));
  if (end < length + 1 || !/^#E [01]\n$/u.test(payload.subarray(end).toString())) {
    throw new Error('Incomplete remote directory response');
  }
  const directories = parseListPayload(payload.subarray(length + 1, end)).map(({ name }) => {
    if (!name || name === '.' || name === '..' || /[\/\0]/u.test(name)) throw new Error('Invalid directory name');
    return { name, path: posix.join(path, name), hidden: name.startsWith('.') };
  });
  if (!path.startsWith('/')) throw new Error('Invalid remote directory path');
  return { path, parent: path === '/' ? null : posix.dirname(path), directories,
    truncated: payload[end + 3] === 49 };
}

export async function browseRemote(runtime, { host, path = '', show_hidden = false }, signal) {
  validateHost(host);
  if (path && (!path.startsWith('/') || path.includes('\0'))) throw new Error('请输入以 / 开头的路径。');
  signal?.throwIfAborted();
  const result = await runtime.runner.run({ target: runtime.targetOf(host), op: 'browse',
    args: [path, show_hidden ? '1' : '0'], signal, timeoutMs: runtime.config.operationTimeoutMs,
    maxStdoutBytes: 2 * 1024 * 1024 });
  if (result.code !== 0) {
    if (result.code === 43) throw new Error('没有权限浏览这个目录，请选择其他目录。');
    if (result.code === 41 || result.code === 42) throw new Error('目录不存在或已被移走，请返回上级目录。');
    throw new Error(result.stderr.trim() || `SSH 连接失败（${result.code}）`);
  }
  return parseBrowse(result.stdout);
}

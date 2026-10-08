/**
 * Wire protocol for the remote helper (`lib/remote.sh`).
 *
 * Every filesystem primitive is one `ssh` invocation. Arguments travel as octal
 * escape strings so that no path, newline, or binary byte can be reinterpreted by
 * either the local shell (there is none) or the remote login shell; file content
 * always travels on stdin and comes back on stdout, never through argv. Results
 * are framed by a single header line so the payload stays byte-exact.
 *
 * @module dsh-ssh-remote/remote-protocol
 */

import { readFileSync } from 'node:fs';

/** The remote helper script, shipped beside this module. */
export const REMOTE_SCRIPT = readFileSync(new URL('./remote.sh', import.meta.url), 'utf8');

/** POSIX single-quote a token for the remote login shell. */
export function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

/**
 * Encode a string so the remote `printf %b` reconstructs its exact bytes.
 * @param value - any string (typically a remote absolute path).
 * @returns an octal escape sequence containing no shell metacharacters.
 */
export function encodeArg(value) {
  const bytes = Buffer.from(String(value), 'utf8');
  let out = '';
  for (const byte of bytes) out += `\\${byte.toString(8).padStart(3, '0')}`;
  return out;
}

/**
 * Build the single command string handed to `ssh` as the remote command.
 * @param op - helper operation name.
 * @param args - operation arguments, encoded here.
 * @returns the remote command string.
 */
export function buildRemoteCommand(op, args = []) {
  const tokens = ['sh', '-c', REMOTE_SCRIPT, 'dsh-remote', op, ...args.map(encodeArg)];
  return tokens.map(shellQuote).join(' ');
}

/** Exit codes the helper uses; the client maps them onto the ctx.fs taxonomy. */
export const REMOTE_EXIT = {
  NOT_FOUND: 41,
  NOT_DIRECTORY: 42,
  PERMISSION_DENIED: 43,
  NOT_REGULAR_FILE: 44,
  TOO_LARGE: 45,
  STALE_VERSION: 48,
  IO_ERROR: 49,
  NOT_OBSERVED: 50,
};

/** Map a helper exit code onto the stable ctx.fs error code vocabulary. */
export function fsCodeForExit(code) {
  switch (code) {
    case REMOTE_EXIT.NOT_FOUND: return 'FS_NOT_FOUND';
    case REMOTE_EXIT.NOT_DIRECTORY: return 'FS_NOT_DIRECTORY';
    case REMOTE_EXIT.PERMISSION_DENIED: return 'FS_PERMISSION_DENIED';
    case REMOTE_EXIT.NOT_REGULAR_FILE: return 'FS_NOT_REGULAR_FILE';
    case REMOTE_EXIT.TOO_LARGE: return 'FS_TOO_LARGE';
    case REMOTE_EXIT.STALE_VERSION: return 'FS_STALE_VERSION';
    case REMOTE_EXIT.NOT_OBSERVED: return 'FS_NOT_OBSERVED';
    default: return 'FS_IO_ERROR';
  }
}

/**
 * Split a framed response into its header fields and payload bytes.
 * @param buffer - the complete stdout of one helper invocation.
 * @returns the header tokens and the bytes following the first newline.
 * @throws when the response carries no header line.
 */
export function splitFramed(buffer) {
  const newline = buffer.indexOf(0x0a);
  if (newline === -1) throw new Error('remote helper returned no header line');
  const header = buffer.subarray(0, newline).toString('utf8');
  return { header: header.split(' '), payload: buffer.subarray(newline + 1) };
}

/**
 * Parse the `#S` stat header.
 * @param header - header tokens including the `#S` tag.
 * @returns the metadata, or `undefined` when the path is absent.
 */
export function parseStatHeader(header) {
  if (header[1] === 'absent') return undefined;
  return {
    type: header[1],
    size: Number.parseInt(header[2], 10),
    version: header[3],
  };
}

/**
 * Parse the `#W` write header.
 * @param header - header tokens including the `#W` tag.
 * @param payload - bytes following the header (previous content when captured).
 * @returns the write outcome facts.
 */
export function parseWriteHeader(header, payload) {
  const existed = header[1] === '1';
  const version = header[2];
  const type = header[3];
  const oldBytes = Number.parseInt(header[4], 10);
  const oldBuffer = oldBytes > 0 ? payload.subarray(0, oldBytes) : Buffer.alloc(0);
  return { existed, version, type, oldBytes, oldBuffer };
}

/**
 * Parse the `T` records emitted by the `list` operation.
 *
 * Each record is a header line `T <type> <size> <version> <nameBytes>` followed by
 * exactly `nameBytes` name bytes and one newline, which keeps names containing
 * spaces, tabs, or newlines intact.
 * @param payload - the bytes following the response header line.
 * @returns one entry per child, in wire order.
 */
export function parseListPayload(payload) {
  const entries = [];
  let offset = 0;
  while (offset < payload.length) {
    const newline = payload.indexOf(0x0a, offset);
    if (newline === -1) throw new Error('Incomplete remote directory record');
    const header = payload.subarray(offset, newline).toString('utf8').split(' ');
    offset = newline + 1;
    if (header[0] !== 'T' || header.length !== 5) throw new Error('Invalid remote directory record');
    const [, type, size, version, nameBytes] = header;
    const length = Number(nameBytes);
    if (!Number.isSafeInteger(length) || length < 1 || offset + length >= payload.length || payload[offset + length] !== 10) {
      throw new Error('Incomplete remote directory name');
    }
    const name = payload.subarray(offset, offset + length).toString('utf8');
    offset += length + 1;
    entries.push({
      name,
      type,
      size: Number.parseInt(size, 10),
      version,
    });
  }
  return entries;
}

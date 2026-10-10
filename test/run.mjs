/**
 * Tests that run without the harness: the remote helper protocol, the SSH config
 * reader, and the local↔remote path mapping.
 *
 * The remote helper is exercised exactly as `sshd` would run it — `sh -c <script>
 * dsh-remote <op> <octal args>` with content on stdin — so these tests validate the
 * real wire behavior rather than a JavaScript restatement of it.
 *
 * Usage: node test/run.mjs
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { encodeArg, parseListPayload, parseStatHeader, parseWriteHeader, REMOTE_SCRIPT, splitFramed } from '../lib/remote-protocol.js';
import { joinRemote, MountTable, normalizeRemote, remoteContains } from '../lib/mounts.js';
import { describeHost, listHosts, parseSshConfig, resolveHost } from '../lib/ssh-config.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}\n       ${error.message}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/** Run the remote helper the way sshd does: `sh -c <script> dsh-remote <op> <args>`. */
function remote(op, args = [], input) {
  const result = spawnSync('sh', ['-c', REMOTE_SCRIPT, 'dsh-remote', op, ...args.map(encodeArg)], {
    input: input ?? Buffer.alloc(0),
    maxBuffer: 64 * 1024 * 1024,
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr.toString('utf8') };
}

const sandbox = mkdtempSync(join(tmpdir(), 'dsh-ssh-remote-test-'));

section('remote helper: hello');
test('reports host facts', () => {
  const result = remote('hello');
  assert.equal(result.code, 0);
  const { header } = splitFramed(result.stdout);
  assert.equal(header[0], '#H');
  assert.match(header.slice(1).join(' '), /^host=.* kernel=.* gnu_stat=/u);
});

section('remote helper: stat');
test('absent path prints #S absent', () => {
  const result = remote('stat', [join(sandbox, 'nope')]);
  assert.equal(result.code, 0);
  assert.equal(splitFramed(result.stdout).header[1], 'absent');
});

test('reports file type, size and a version', () => {
  const file = join(sandbox, 'a.txt');
  writeFileSync(file, 'hello');
  const info = parseStatHeader(splitFramed(remote('stat', [file]).stdout).header);
  assert.equal(info.type, 'f');
  assert.equal(info.size, 5);
  assert.match(info.version, /^\d+:\d+:5:\d+:\d+$/u);
});

test('reports directory type', () => {
  const dir = join(sandbox, 'adir');
  mkdirSync(dir);
  assert.equal(parseStatHeader(splitFramed(remote('stat', [dir]).stdout).header).type, 'd');
});

test('lstat does not follow a symlink, stat does', () => {
  const target = join(sandbox, 'link-target.txt');
  const link = join(sandbox, 'link.txt');
  writeFileSync(target, 'x');
  try {
    symlinkSync(target, link);
  } catch {
    return; // symlinks unavailable in this environment
  }
  assert.equal(parseStatHeader(splitFramed(remote('lstat', [link]).stdout).header).type, 'l');
  assert.equal(parseStatHeader(splitFramed(remote('stat', [link]).stdout).header).type, 'f');
});

section('remote helper: read');
test('returns header plus exact bytes', () => {
  const file = join(sandbox, 'read.txt');
  writeFileSync(file, 'line1\nline2\n');
  const { header, payload } = splitFramed(remote('read', [file, '-1']).stdout);
  assert.equal(header[0], '#V');
  assert.equal(payload.toString('utf8'), 'line1\nline2\n');
});

test('preserves trailing newlines and CRLF exactly', () => {
  const file = join(sandbox, 'crlf.txt');
  writeFileSync(file, 'a\r\nb\r\n\r\n');
  const { payload } = splitFramed(remote('read', [file, '-1']).stdout);
  assert.equal(payload.toString('utf8'), 'a\r\nb\r\n\r\n');
});

test('round-trips binary bytes', () => {
  const file = join(sandbox, 'bin.dat');
  const bytes = Buffer.from([0, 1, 2, 255, 254, 10, 13, 0]);
  writeFileSync(file, bytes);
  const { payload } = splitFramed(remote('read', [file, '-1']).stdout);
  assert.deepEqual(payload, bytes);
});

test('missing file exits 41', () => {
  assert.equal(remote('read', [join(sandbox, 'missing'), '-1']).code, 41);
});

test('directory exits 44', () => {
  assert.equal(remote('read', [sandbox, '-1']).code, 44);
});

test('cap exceeded exits 45', () => {
  const file = join(sandbox, 'big.txt');
  writeFileSync(file, 'x'.repeat(100));
  assert.equal(remote('read', [file, '10']).code, 45);
});

section('remote helper: readrange');
test('returns the requested byte window', () => {
  const file = join(sandbox, 'window.txt');
  writeFileSync(file, '0123456789');
  const { payload } = splitFramed(remote('readrange', [file, '3', '4']).stdout);
  assert.equal(payload.toString('utf8'), '3456');
});

test('a window past the end is empty', () => {
  const file = join(sandbox, 'window2.txt');
  writeFileSync(file, 'abc');
  const { payload } = splitFramed(remote('readrange', [file, '10', '5']).stdout);
  assert.equal(payload.length, 0);
});

test('offset 0 is the first byte', () => {
  const file = join(sandbox, 'window3.txt');
  writeFileSync(file, 'abcdef');
  const { payload } = splitFramed(remote('readrange', [file, '0', '2']).stdout);
  assert.equal(payload.toString('utf8'), 'ab');
});

section('remote helper: list');
test('lists files and directories with binary-safe names', () => {
  const dir = join(sandbox, 'listing');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'plain.txt'), 'abc');
  writeFileSync(join(dir, 'with space.txt'), 'de');
  mkdirSync(join(dir, 'sub'));
  const payload = splitFramed(remote('list', [dir]).stdout).payload;
  const entries = parseListPayload(payload);
  const names = entries.map((entry) => entry.name).sort();
  assert.deepEqual(names, ['plain.txt', 'sub', 'with space.txt']);
  const plain = entries.find((entry) => entry.name === 'plain.txt');
  assert.equal(plain.type, 'f');
  assert.equal(plain.size, 3);
  assert.equal(entries.find((entry) => entry.name === 'sub').type, 'd');
});

test('includes dotfiles and excludes . and ..', () => {
  const dir = join(sandbox, 'dots');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.hidden'), 'h');
  writeFileSync(join(dir, '..odd'), 'o');
  const names = parseListPayload(splitFramed(remote('list', [dir]).stdout).payload).map((entry) => entry.name);
  assert.deepEqual(names.sort(), ['..odd', '.hidden']);
});

test('a name containing a newline survives', () => {
  const dir = join(sandbox, 'weird');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'a\nb.txt'), 'x');
  const names = parseListPayload(splitFramed(remote('list', [dir]).stdout).payload).map((entry) => entry.name);
  assert.deepEqual(names, ['a\nb.txt']);
});

test('missing directory exits 41, file exits 42', () => {
  assert.equal(remote('list', [join(sandbox, 'no-such-dir')]).code, 41);
  assert.equal(remote('list', [join(sandbox, 'a.txt')]).code, 42);
});

section('remote helper: write');
test('creates a file and reports create with a version', () => {
  const file = join(sandbox, 'new.txt');
  const result = remote('write', [file, '-', '-', 'any', '-1'], Buffer.from('fresh\n'));
  assert.equal(result.code, 0);
  const { header } = splitFramed(result.stdout);
  const outcome = parseWriteHeader(header, Buffer.alloc(0));
  assert.equal(outcome.existed, false);
  assert.equal(readFileSync(file, 'utf8'), 'fresh\n');
});

test('updates a file, reporting the previous content for the diff basis', () => {
  const file = join(sandbox, 'update.txt');
  writeFileSync(file, 'old\n');
  const result = remote('write', [file, '-', '-', 'any', '1048576'], Buffer.from('new\n'));
  const { header, payload } = splitFramed(result.stdout);
  const outcome = parseWriteHeader(header, payload);
  assert.equal(outcome.existed, true);
  assert.equal(outcome.oldBuffer.toString('utf8'), 'old\n');
  assert.equal(readFileSync(file, 'utf8'), 'new\n');
});

test('creates missing parent directories', () => {
  const file = join(sandbox, 'deep', 'er', 'still.txt');
  assert.equal(remote('write', [file, '-', '-', 'any', '-1'], Buffer.from('deep')).code, 0);
  assert.equal(readFileSync(file, 'utf8'), 'deep');
});

test('preserves the existing mode when mode is -', () => {
  const file = join(sandbox, 'mode.txt');
  writeFileSync(file, 'x');
  chmodSync(file, 0o640);
  remote('write', [file, '-', '-', 'any', '-1'], Buffer.from('y'));
  assert.equal(readFileSync(file, 'utf8'), 'y');
  assert.equal(spawnSync('sh', ['-c', `stat -c '%a' '${file}' 2>/dev/null || stat -f '%Lp' '${file}'`]).stdout.toString().trim(), '640');
});

test('must-exist policy on a missing file exits 48', () => {
  assert.equal(remote('write', [join(sandbox, 'absent.txt'), '-', '-', 'must-exist', '-1'], Buffer.from('x')).code, 48);
});

test('must-absent policy on an existing file exits 50', () => {
  assert.equal(remote('write', [join(sandbox, 'a.txt'), '-', '-', 'must-absent', '-1'], Buffer.from('x')).code, 50);
});

test('stale expected version exits 48 and leaves content untouched', () => {
  const file = join(sandbox, 'stale.txt');
  writeFileSync(file, 'original');
  const code = remote('write', [file, '-', '1:2:3:4:5', 'must-exist', '-1'], Buffer.from('changed')).code;
  assert.equal(code, 48);
  assert.equal(readFileSync(file, 'utf8'), 'original');
});

test('a matching expected version succeeds and changes the version', () => {
  const file = join(sandbox, 'versioned.txt');
  writeFileSync(file, 'v1');
  const before = parseStatHeader(splitFramed(remote('stat', [file]).stdout).header).version;
  const result = remote('write', [file, '-', before, 'must-exist', '-1'], Buffer.from('v2'));
  assert.equal(result.code, 0);
  const after = parseStatHeader(splitFramed(remote('stat', [file]).stdout).header).version;
  assert.notEqual(before, after);
});

test('writing to a directory exits 44', () => {
  assert.equal(remote('write', [sandbox, '-', '-', 'any', '-1'], Buffer.from('x')).code, 44);
});

test('empty content produces an empty file', () => {
  const file = join(sandbox, 'empty.txt');
  assert.equal(remote('write', [file, '-', '-', 'any', '-1'], Buffer.alloc(0)).code, 0);
  assert.equal(readFileSync(file, 'utf8'), '');
});

section('remote helper: paths with hostile characters');
test('handles spaces, quotes, globs, and dollar signs', () => {
  const dir = join(sandbox, 'hostile');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "we ird'\"$`{}[]*?.txt");
  assert.equal(remote('write', [file, '-', '-', 'any', '-1'], Buffer.from('content')).code, 0);
  const { payload } = splitFramed(remote('read', [file, '-1']).stdout);
  assert.equal(payload.toString('utf8'), 'content');
  const names = parseListPayload(splitFramed(remote('list', [dir]).stdout).payload).map((entry) => entry.name);
  assert.deepEqual(names, ["we ird'\"$`{}[]*?.txt"]);
});

test('handles a newline inside a file path', () => {
  const file = join(sandbox, 'new\nline.txt');
  assert.equal(remote('write', [file, '-', '-', 'any', '-1'], Buffer.from('nl')).code, 0);
  assert.equal(readFileSync(file, 'utf8'), 'nl');
});

section('protocol encoding');
test('encodeArg produces only octal escapes', () => {
  assert.equal(encodeArg('/a b'), '\\057\\141\\040\\142');
  assert.equal(encodeArg(''), '');
  // The encoding must not be able to terminate a single-quoted shell token.
  assert.ok(!encodeArg("it's \"quoted\" $HOME `x`").includes("'"));
});

section('ssh config parser');
test('parses Host blocks with hostname, user, port and identity file', () => {
  const path = join(sandbox, 'sshconfig');
  writeFileSync(path, [
    '# comment',
    'Host alpha',
    '  HostName 10.0.0.1',
    '  User alice',
    '  Port 2222',
    '  IdentityFile ~/.ssh/id_alpha',
    '',
    'Host beta gamma',
    '  HostName 10.0.0.2',
    '',
    'Host *.internal',
    '  User nobody',
    '',
  ].join('\n'));
  const { blocks } = parseSshConfig([path]);
  const alpha = describeHost(blocks, 'alpha');
  assert.equal(alpha.hostname, '10.0.0.1');
  assert.equal(alpha.user, 'alice');
  assert.equal(alpha.port, 2222);
  assert.match(alpha.identityFile, /id_alpha$/u);
  assert.equal(describeHost(blocks, 'gamma').hostname, '10.0.0.2');
  assert.equal(resolveHost(blocks, 'alpha').options.user, 'alice');
});

test('applies first-value-wins across blocks', () => {
  const path = join(sandbox, 'sshconfig2');
  writeFileSync(path, 'Host one\n  User first\nHost one\n  User second\n  Port 22\n');
  const { blocks } = parseSshConfig([path]);
  const options = resolveHost(blocks, 'one').options;
  assert.equal(options.user, 'first');
  assert.equal(options.port, '22');
});

test('honors negation patterns', () => {
  const path = join(sandbox, 'sshconfig3');
  writeFileSync(path, 'Host *.example.com !bad.example.com\n  User u\n');
  const { blocks } = parseSshConfig([path]);
  assert.equal(resolveHost(blocks, 'good.example.com').options.user, 'u');
  assert.equal(resolveHost(blocks, 'bad.example.com').options.user, undefined);
});

test('accepts Keyword=value form', () => {
  const path = join(sandbox, 'sshconfig4');
  writeFileSync(path, 'Host eq\n  HostName=10.9.9.9\n  User=bob\n');
  const { blocks } = parseSshConfig([path]);
  assert.equal(describeHost(blocks, 'eq').hostname, '10.9.9.9');
  assert.equal(describeHost(blocks, 'eq').user, 'bob');
});

test('follows Include directives', () => {
  const dir = join(sandbox, 'inc');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'extra.conf'), 'Host included\n  HostName 10.5.5.5\n');
  writeFileSync(join(dir, 'main.conf'), `Include ${dir}/*.conf\nHost direct\n  HostName 10.6.6.6\n`);
  const { blocks } = parseSshConfig([join(dir, 'main.conf')]);
  assert.equal(describeHost(blocks, 'included').hostname, '10.5.5.5');
  assert.equal(describeHost(blocks, 'direct').hostname, '10.6.6.6');
});

test('listHosts lists concrete aliases and reports patterns', () => {
  const path = join(sandbox, 'sshconfig5');
  writeFileSync(path, 'Host real\n  HostName 1.2.3.4\nHost *.wild\n  User x\n');
  const listing = listHosts({ paths: [path] });
  assert.deepEqual(listing.hosts.map((entry) => entry.alias), ['real']);
  assert.deepEqual(listing.patterns, ['*.wild']);
});

section('mount path mapping');
test('normalizes and joins remote paths', () => {
  assert.equal(normalizeRemote('/a/b/../c/'), '/a/c');
  assert.equal(joinRemote('/a', 'b', 'c'), '/a/b/c');
});

test('remoteContains respects segment boundaries', () => {
  assert.equal(remoteContains('/a/b', '/a/b/c'), true);
  assert.equal(remoteContains('/a/b', '/a/bc'), false);
  assert.equal(remoteContains('/a/b', '/a/b'), true);
});

test('routes by cwd, maps absolute local paths, and treats foreign absolutes as remote', () => {
  const table = new MountTable({ storageFile: join(sandbox, 'mounts.json') });
  table.put({ localDir: '/local/proj', alias: 'h', remoteDir: '/remote/proj' });
  const mount = table.match('/local/proj');
  assert.equal(mount.alias, 'h');
  assert.equal(table.toRemote(mount, 'src/a.ts', '/local/proj'), '/remote/proj/src/a.ts');
  assert.equal(table.toRemote(mount, '/local/proj/src/a.ts', undefined), '/remote/proj/src/a.ts');
  assert.equal(table.toRemote(mount, '/etc/hosts', undefined), '/etc/hosts');
  assert.equal(table.match('/local/proj/sub').remoteDir, '/remote/proj');
  assert.equal(table.match('/somewhere/else'), undefined);
});

test('persists and reloads mounts', () => {
  const file = join(sandbox, 'persist', 'mounts.json');
  const first = new MountTable({ storageFile: file, resolveHost: () => ({}) });
  first.put({ localDir: '/l', alias: 'a', remoteDir: '/r' });
  first.save();
  const second = new MountTable({ storageFile: file, resolveHost: () => ({}) }).load();
  assert.deepEqual(second.list().map((entry) => entry.remoteDir), ['/r']);
});

test('a corrupt store does not break loading', () => {
  const file = join(sandbox, 'corrupt.json');
  writeFileSync(file, '{not json');
  const table = new MountTable({ storageFile: file, resolveHost: () => ({}) }).load();
  assert.deepEqual(table.list(), []);
});

rmSync(sandbox, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

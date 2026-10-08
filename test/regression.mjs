import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REMOTE_SCRIPT, encodeArg, parseListPayload } from '../lib/remote-protocol.js';
import { parseBrowse, browseRemote } from '../lib/browse.js';
import { MountTable, normalizeRemote } from '../lib/mounts.js';
import { SshRunner, targetFor } from '../lib/ssh-runner.js';
import { createSshFileSystem } from '../lib/fs-remote.js';
import { createSshShellExecutor } from '../lib/shell-remote.js';

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-regression-')));
test.after(() => rmSync(scratch, { recursive: true, force: true }));
const helper = (op, args) => spawnSync('sh', ['-c', REMOTE_SCRIPT, 'dsh-test', op, ...args.map(encodeArg)]);

test('folder browser handles home, Unicode, symlinks, hidden folders and hostile names', () => {
  const dir = join(scratch, 'browse'); mkdirSync(dir);
  for (const name of ['project', '项目', 'space and \' quote', 'line\n', 'back\\slash', '.hidden']) mkdirSync(join(dir, name));
  writeFileSync(join(dir, 'file.txt'), 'not a directory'); symlinkSync(join(dir, 'project'), join(dir, 'linked'));
  const result = helper('browse', [dir, '0']); assert.equal(result.status, 0);
  const parsed = parseBrowse(result.stdout);
  assert.equal(parsed.path, dir); assert.equal(parsed.parent, scratch);
  assert.equal(parsed.truncated, false);
  assert.deepEqual(parsed.directories.map((d) => d.name).sort(), ['project', '项目', 'space and \' quote', 'line\n', 'back\\slash', 'linked'].sort());
  assert.ok(parseBrowse(helper('browse', [dir, '1']).stdout).directories.some((d) => d.hidden));
  assert.equal(parseBrowse(helper('browse', [join(dir, 'line\n'), '0']).stdout).path, join(dir, 'line\n'));
  assert.equal(parseBrowse(helper('browse', [join(dir, 'linked'), '0']).stdout).path, join(dir, 'project'));
  assert.equal(parseBrowse(helper('browse', ['/', '0']).stdout).parent, null);
  const home = spawnSync('sh', ['-c', REMOTE_SCRIPT, 'test', 'browse', '', encodeArg('0')], { env: { ...process.env, HOME: dir } });
  assert.equal(parseBrowse(home.stdout).path, dir);
  assert.equal(helper('browse', [join(dir, 'file.txt'), '0']).status, 42);
});

test('large directory listings are bounded and explicitly marked', () => {
  const dir = join(scratch, 'many'); mkdirSync(dir);
  for (let i = 0; i < 501; i++) mkdirSync(join(dir, `folder-${i}`));
  const result = parseBrowse(helper('browse', [dir, '0']).stdout);
  assert.equal(result.directories.length, 500); assert.equal(result.truncated, true);
});

test('malformed or truncated framing is rejected', () => {
  assert.throws(() => parseListPayload(Buffer.from('T d 0 - 9\nshort\n')));
  assert.throws(() => parseBrowse(Buffer.from('#B 1\n/\n')));
  assert.throws(() => parseBrowse(Buffer.from('#B 1\n/\nT d 0 - 2\n..\n#E 0\n')));
  assert.equal(normalizeRemote('/project/back\\slash'), '/project/back\\slash');
});

test('browse rejects injection, relative paths and aborts before SSH', async () => {
  const runtime = { runner: { run() { throw new Error('SSH must not run'); } } };
  await assert.rejects(() => browseRemote(runtime, { host: '-bad' }), /有效/);
  await assert.rejects(() => browseRemote(runtime, { host: 'dev', path: 'relative' }), /开头/);
  await assert.rejects(() => browseRemote(runtime, { host: 'dev' }, AbortSignal.abort()), { name: 'AbortError' });
});

function fixture() {
  const mounts = new MountTable({ storageFile: join(scratch, 'mounts.json') });
  mounts.put({ localDir: '/mirror/a', alias: 'a', remoteDir: '/project' });
  mounts.put({ localDir: '/mirror/b', alias: 'b', remoteDir: '/project' });
  const calls = [];
  const runtime = { mounts, config: { confineMutations: true, extraWritableRoots: [], extraSshArgs: [] },
    ctx: {}, targetOf: (alias) => ({ alias }), local: { fs: { async resolve(path) { return { targetKey: path, displayPath: path }; } } },
    runner: { async run(request) { calls.push(request); return { code: 0, stderr: '', stdout: Buffer.from(request.op === 'list' ? '#L\nT f 1 v 1\nx\n' : '#S f 1 v\n') }; } } };
  class FsError extends Error { constructor(message, code) { super(message); this.code = code; } }
  const Fs = createSshFileSystem({ fs: { FileSystem: class {}, FsError, FsTargetKey: String, FsVersion: String } }, runtime);
  return { runtime, fs: new Fs({}), calls };
}

test('same remote path on different servers keeps unique targets, children and containment', async () => {
  const { fs, calls } = fixture();
  const a = await fs.resolve('/project', { cwd: '/mirror/a' }), b = await fs.resolve('/project', { cwd: '/mirror/b' });
  assert.notEqual(a.targetKey, b.targetKey); assert.equal(fs.contains(a, b), false);
  await fs.stat(a); await fs.stat(b);
  assert.deepEqual(calls.map((c) => c.target.alias), ['a', 'b']);
  const children = await fs.listDir(b);
  await fs.stat(children[0].target); assert.equal(calls.at(-1).target.alias, 'b');
  assert.equal((await fs.resolve('/project', { cwd: '/local' })).targetKey, 'local:/project');
  await assert.rejects(() => fs.resolve('/mirror/b/x', { cwd: '/mirror/a' }), /cross/);
});

test('disconnect persists a guard and invalidates resolved targets', async () => {
  const { fs, runtime } = fixture(); const target = await fs.resolve('x', { cwd: '/mirror/a' });
  runtime.mounts.remove('/mirror/a'); runtime.mounts.save();
  assert.throws(() => fs.worldOf(target), /disconnected/);
  await assert.rejects(() => fs.resolve('x', { cwd: '/mirror/a' }), /已断开/);
  const cold = new MountTable({ storageFile: runtime.mounts.storageFile }).load();
  assert.throws(() => cold.assertActivePath('/mirror/a/x'), /已断开/);
  cold.put({ localDir: '/mirror/a', alias: 'a', remoteDir: '/project' });
  assert.doesNotThrow(() => cold.assertActivePath('/mirror/a/x'));
});

test('nested mappings prefer the most specific root; writes stay with the selected mount', async () => {
  const { fs, runtime } = fixture();
  runtime.mounts.put({ localDir: '/mirror/a/sub', alias: 'b', remoteDir: '/other' });
  assert.equal(runtime.mounts.match('/mirror/a/sub/x').remoteDir, '/other');
  const target = await fs.resolve('/other/x', { cwd: '/mirror/a' });
  await assert.rejects(() => fs.writeText(target, 'no'), (e) => e.code === 'FS_SANDBOX_DENIED');
  const own = await fs.resolve('x', { cwd: '/mirror/a' });
  await assert.rejects(() => fs.writeText(own, 'no', undefined, undefined, { mode: 'read-only' }), (e) => e.code === 'FS_SANDBOX_DENIED');
});

test('literal destinations, disabled multiplexing, custom config and option boundaries', () => {
  const target = targetFor({ alias: 'dev.example.com', user: 'demo' }, { destination: 'demo@dev.example.com' });
  assert.equal(target.destination, 'demo@dev.example.com');
  const runner = new SshRunner({ multiplex: false, sshConfigPaths: ['/tmp/config'], extraSshArgs: [] });
  const argv = runner.argv(target, 'true');
  assert.ok(argv.includes('ControlMaster=no')); assert.ok(argv.includes('ControlPath=none'));
  assert.deepEqual(argv.slice(0, 3), ['-T', '-F', '/tmp/config']);
  assert.deepEqual(argv.slice(-3), ['--', 'demo@dev.example.com', 'true']);
  assert.throws(() => runner.argv({ destination: '-bad' }, 'true'), /Invalid/);
});

test('shell specs are independent and environment names cannot inject shell code', () => {
  const { runtime } = fixture();
  class Base { resolve(request) { return request; } spawnSpec(spec) { return spec; } }
  const Shell = createSshShellExecutor({ bashLocal: { LocalBashExecutor: Base, ENV_OVERRIDES: {} } }, runtime);
  const shell = new Shell({});
  const a = shell.resolve({ workdir: '/mirror/a', command: 'pwd' });
  const b = shell.resolve({ workdir: '/mirror/b', command: 'pwd' });
  assert.equal(a.mount.alias, 'a'); assert.equal(b.mount.alias, 'b');
  assert.equal(a.remoteWorkdir, '/project');
  assert.throws(() => shell.remoteCommand({ ...a, env: { 'X; touch bad': 'value' } }), /Invalid environment/);
  runtime.mounts.remove('/mirror/a'); assert.throws(() => shell.resolve({ workdir: '/mirror/a' }), /已断开/);
});

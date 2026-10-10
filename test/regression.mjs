import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync, lstatSync, readlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { REMOTE_SCRIPT, encodeArg, parseListPayload, splitFramed, parseWriteHeader } from '../lib/remote-protocol.js';
import { parseBrowse, browseRemote } from '../lib/browse.js';
import { MountTable, normalizeRemote } from '../lib/mounts.js';
import { SshRunner, targetFor } from '../lib/ssh-runner.js';
import { createSshFileSystem } from '../lib/fs-remote.js';
import { createSshShellExecutor } from '../lib/shell-remote.js';

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-regression-')));
test.after(() => rmSync(scratch, { recursive: true, force: true }));
const helper = (op, args, input) => spawnSync('sh', ['-c', REMOTE_SCRIPT, 'dsh-test', op, ...args.map(encodeArg)], { input });

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

test('read versions support guarded writes through symlink chains without replacing links', () => {
  const dir = join(scratch, 'symlink-write'); mkdirSync(dir);
  const real = join(dir, 'real\n'), first = join(dir, 'first'), link = join(dir, 'link');
  writeFileSync(real, 'original'); symlinkSync('real\n', first); symlinkSync(first, link);
  const version = splitFramed(helper('read', [link, '-1']).stdout).header[1];
  const written = helper('write', [link, '-', version, 'must-exist', '1024'], Buffer.from('changed'));
  assert.equal(written.status, 0, written.stderr.toString());
  assert.equal(readFileSync(real, 'utf8'), 'changed');
  assert.equal(readlinkSync(first), 'real\n'); assert.equal(readlinkSync(link), first);
  assert.equal(lstatSync(link).isSymbolicLink(), true);
  const framed = splitFramed(written.stdout);
  assert.equal(parseWriteHeader(framed.header, framed.payload).oldBuffer.toString(), 'original');
  assert.equal(helper('write', [link, '-', version, 'must-exist', '1024'], Buffer.from('stale')).status, 48);
  assert.equal(readFileSync(real, 'utf8'), 'changed');
  assert.equal(helper('write', [link, '-', '-', 'any', '1024'], Buffer.from('unconditional')).status, 0);
  assert.equal(readlinkSync(link), first); assert.equal(readFileSync(real, 'utf8'), 'unconditional');
});

test('guarded uploads reject file changes made while stdin is still arriving', async () => {
  const dir = join(scratch, 'slow-guard'); mkdirSync(dir);
  const file = join(dir, 'target'); writeFileSync(file, 'old');
  const version = splitFramed(helper('read', [file, '-1']).stdout).header[1];
  const child = spawn('sh', ['-c', REMOTE_SCRIPT, 'test', 'write', ...[file, '-', version, 'must-exist', '1024'].map(encodeArg)]);
  const done = new Promise((resolve, reject) => { child.once('close', resolve); child.once('error', reject); });
  child.stdin.on('error', () => {}); child.stdin.write('incoming');
  try {
    const deadline = Date.now() + 2000;
    while (!readdirSync(dir).some(name => name.startsWith('.dsh-new-'))) {
      assert.ok(Date.now() < deadline, 'helper did not start reading stdin');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    writeFileSync(file, 'concurrent change'); child.stdin.end();
    assert.equal(await done, 48); assert.equal(readFileSync(file, 'utf8'), 'concurrent change');
  } finally { child.kill('SIGKILL'); }
});

test('writes preserve dangling links, reject loops and report non-directory ancestors accurately', () => {
  const dir = join(scratch, 'link-edges'); mkdirSync(dir);
  const link = join(dir, 'dangling'); symlinkSync('new/target', link);
  assert.equal(helper('write', [link, '-', '-', 'must-absent', '1024'], Buffer.from('new')).status, 0);
  assert.equal(readFileSync(join(dir, 'new/target'), 'utf8'), 'new');
  assert.equal(readlinkSync(link), 'new/target');
  symlinkSync('loop', join(dir, 'loop'));
  assert.equal(helper('write', [join(dir, 'loop'), '-', '-', 'any', '1024'], Buffer.from('x')).status, 49);
  assert.equal(helper('write', [join(dir, 'new/target/child'), '-', '-', 'any', '1024'], Buffer.from('x')).status, 42);
});

test('malformed byte limits fail closed and empty diff bases stay distinct from unavailable ones', () => {
  const file = join(scratch, 'empty-basis'); writeFileSync(file, '');
  for (const cap of ['Infinity', 'undefined', 'NaN', '-2', '999999999999999999999999']) {
    assert.equal(helper('read', [file, cap]).status, 49);
    assert.equal(helper('write', [file, '-', '-', 'any', cap], Buffer.from('x')).status, 49);
  }
  const out = helper('write', [file, '-', '-', 'any', '1024'], Buffer.from('updated'));
  const parsed = splitFramed(out.stdout);
  assert.equal(parseWriteHeader(parsed.header, parsed.payload).oldBytes, 0);
  const skipped = splitFramed(helper('write', [file, '-', '-', 'any', '1'], Buffer.from('next')).stdout);
  assert.equal(parseWriteHeader(skipped.header, skipped.payload).oldBytes, -1);
});

test('mount roots normalize on insertion and reload; suffixes keep their separator', () => {
  const storageFile = join(scratch, 'normalized-mounts.json');
  const table = new MountTable({ storageFile });
  const mount = table.put({ localDir: '/mirror/proj/', alias: 'dev', remoteDir: '/srv/app/' });
  assert.equal(mount.localDir, '/mirror/proj');
  assert.equal(table.toRemote(mount, '/mirror/proj/src/a.js'), '/srv/app/src/a.js');
  assert.equal(table.toRemote(mount, '/mirror/proj/./src/a.js'), '/srv/app/src/a.js');
  assert.equal(table.toRemote(mount, 'src/a.js', '/mirror/proj/'), '/srv/app/src/a.js');
  writeFileSync(storageFile, JSON.stringify({ mounts: [{ ...mount, localDir: '/mirror/proj/' }], retiredRoots: ['/mirror/retired/'] }));
  const cold = new MountTable({ storageFile }).load();
  assert.equal(cold.match('/mirror/proj/').localDir, '/mirror/proj');
  assert.equal(cold.toRemote(cold.list()[0], '/mirror/proj/src/a.js'), '/srv/app/src/a.js');
  assert.throws(() => cold.assertActivePath('/mirror/retired/x'), /已断开/);
  assert.throws(() => table.put({ localDir: 'relative', alias: 'dev', remoteDir: '/srv/app' }), /绝对/);
  const root = table.put({ localDir: '/', alias: 'root', remoteDir: '/srv' });
  assert.equal(table.toRemote(root, '/src/a.js'), '/srv/src/a.js');
});

test('configured metadata persists separately and never reinstates a deleted declaration', () => {
  const storageFile = join(scratch, 'configured-mounts.json'); const table = new MountTable({ storageFile });
  table.put({ localDir: '/mirror/runtime', alias: 'dev', remoteDir: '/runtime' });
  table.put({ localDir: '/mirror/configured', alias: 'dev', remoteDir: '/configured', source: 'config', name: '自定义名称' });
  table.save(); const cold = new MountTable({ storageFile }).load();
  assert.deepEqual(cold.list().map(m => m.remoteDir), ['/runtime']);
  assert.equal(cold.match('/mirror/configured/x'), undefined);
  assert.equal(cold.configuredMounts.get('/mirror/configured').name, '自定义名称');
  assert.throws(() => cold.assertActivePath('/mirror/configured/x'), /已断开/);
  cold.save();
  const again = new MountTable({ storageFile }).load();
  assert.throws(() => again.assertActivePath('/mirror/configured/x'), /已断开/);
  again.put(again.configuredMounts.get('/mirror/configured'));
  assert.doesNotThrow(() => again.assertActivePath('/mirror/configured/x'));
});

test('workspace policies fence session subdirectories, grant extra roots, and honor approved full access', async () => {
  const { fs, runtime } = fixture(); runtime.config.extraWritableRoots = ['/shared'];
  const world = path => fs.worldOf({ targetKey: fs.remoteKey(runtime.mounts.match('/mirror/a'), path) });
  const policy = { mode: 'workspace-write', workspaceRoot: '/mirror/a/sub' };
  assert.doesNotThrow(() => fs.assertWritable(world('/project/sub/x'), 'x', policy));
  assert.throws(() => fs.assertWritable(world('/project/sibling'), 'x', policy), e => e.code === 'FS_SANDBOX_DENIED');
  assert.doesNotThrow(() => fs.assertWritable(world('/shared/x'), 'x', policy));
  assert.doesNotThrow(() => fs.assertWritable(world('/outside/x'), 'x', { ...policy, mode: 'danger-full-access' }));
  runtime.config.confineMutations = false;
  assert.throws(() => fs.assertWritable(world('/shared/x'), 'x', { mode: 'read-only' }), e => e.code === 'FS_SANDBOX_DENIED');
  runtime.mounts.retiredRoots.add('/mirror/retired');
  await assert.rejects(() => fs.resolve('x', { cwd: '/mirror/retired' }), e => e.code === 'FS_IO_ERROR');
});

function simulatedRunner(code, timeoutMs = 200) {
  const runner = new SshRunner({ sshBinary: process.execPath, operationTimeoutMs: timeoutMs });
  runner.argv = () => ['--input-type=module', '-e', code];
  return runner;
}

test('healthy streams and buffered transfers survive their total duration; stalled streams time out', async () => {
  const code = "process.stdout.write('#V v 6 f\\n'); for(let i=0;i<6;i++){await new Promise(r=>setTimeout(r,80));process.stdout.write('x');}";
  const runner = simulatedRunner(code);
  const streamed = await runner.stream({ target: { label: 'test' }, op: 'read' });
  let text = ''; for await (const chunk of streamed.chunks) text += chunk;
  assert.equal(text, 'xxxxxx');
  const collected = await runner.run({ target: { label: 'test' }, op: 'read' });
  assert.equal(collected.code, 0); assert.equal(splitFramed(collected.stdout).payload.toString(), 'xxxxxx');
  const backpressured = await runner.stream({ target: { label: 'test' }, op: 'read' });
  await new Promise(resolve => setTimeout(resolve, 300));
  let buffered = ''; for await (const chunk of backpressured.chunks) buffered += chunk;
  assert.equal(buffered, 'xxxxxx');
  const stalled = await simulatedRunner("process.stdout.write('#V v 1 f\\n'); setInterval(()=>{},1000);")
    .stream({ target: { label: 'test' }, op: 'read' });
  await assert.rejects(async () => { for await (const _ of stalled.chunks) {} }, /idle/);
});

test('large uploads renew the idle timeout while stdin continues to make progress', async () => {
  const runner = simulatedRunner("let size=0; process.stdin.on('data',c=>{size+=c.length;process.stdin.pause();setTimeout(()=>process.stdin.resume(),40)});process.stdin.on('end',()=>process.stdout.write(String(size)));", 250);
  const input = Buffer.alloc(2 * 1024 * 1024, 120);
  const result = await runner.run({ target: { label: 'test' }, op: 'write', input });
  assert.equal(result.code, 0); assert.equal(result.stdout.toString(), String(input.length));
});

test('stream failures carry stable FS codes before and after the header; cancellation is FS_ABORTED', async () => {
  const { fs, runtime } = fixture(); const target = await fs.resolve('x', { cwd: '/mirror/a' });
  runtime.runner = simulatedRunner('process.exit(41)');
  await assert.rejects(() => fs.streamText(target), e => e.code === 'FS_NOT_FOUND');
  runtime.runner = simulatedRunner("process.stdout.write('#V v 1 f\\n'); process.exit(43)");
  const text = await fs.streamText(target);
  await assert.rejects(async () => { for await (const _ of text) {} }, e => e.code === 'FS_PERMISSION_DENIED');
  await assert.rejects(() => fs.streamText(target, AbortSignal.abort()), e => e.code === 'FS_ABORTED');
});

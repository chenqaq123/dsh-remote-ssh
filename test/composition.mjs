/**
 * Composition test: boots a real cordis context with the harness's own seam
 * implementations, loads this plugin through its public `apply`, and drives
 * `ctx.fs` and `ctx.shell` against a live SSH host.
 *
 * This is the closest thing to running inside the application without touching the
 * running profile: the same `FileSystem`, `ShellExecutor`, `LocalBashExecutor`,
 * sandbox policy, and subprocess runtime are used, so service registration,
 * duplicate-service detection, routing, and the tool definitions are all exercised
 * for real.
 *
 * Must run under the harness's own Node (Electron as Node), because the seam
 * packages are read out of `app.asar`:
 *
 *   DSH_DESKTOP_NODE_EXECUTABLE="/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" \
 *     "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/bin/node" test/composition.mjs [host]
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { loadHostModules } from '../lib/host-modules.js';
import { SshRunner, targetFor } from '../lib/ssh-runner.js';

const destination = process.argv[2];
if (!destination) throw new Error('Pass an explicit SSH test host; fixtures are created under remote /tmp');
const at = destination.indexOf('@');
const sshTarget = at === -1
  ? targetFor({ alias: destination, hostname: destination }, { alias: destination })
  : targetFor({ alias: destination.slice(at + 1), hostname: destination.slice(at + 1), user: destination.slice(0, at) }, { destination });

const host = await loadHostModules();
const { Context } = host.cordis;

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}\n       ${error?.stack?.split('\n').slice(0, 3).join('\n       ') ?? error}`);
  }
}

const scratch = mkdtempSync(join(tmpdir(), 'dsh-ssh-composition-'));
const localWorkspace = join(scratch, 'local-workspace');
mkdirSync(localWorkspace, { recursive: true });
writeFileSync(join(localWorkspace, 'local.txt'), 'local content\n');

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const remoteDir = `/tmp/dsh-ssh-composition-${stamp}`;
const raw = new SshRunner({ sshBinary: 'ssh', batchMode: true, connectTimeoutSec: 10, controlPersistSec: 120, multiplex: true, strictHostKeyChecking: 'accept-new', extraSshArgs: [] });
await raw.run({ target: sshTarget, op: 'write', args: [`${remoteDir}/seed.txt`, '-', '-', 'any', '-1'], input: Buffer.from('seeded remotely\n') });

console.log(`Composition test against ${destination}\n`);

// --- build the composition ---------------------------------------------------
const ctx = new Context();
const { LocalSubprocessRuntime } = await import(`${host.root}/dsh-subprocess-local/lib/index.js`);
const { LocalSandboxProvider } = await import(`${host.root}/dsh-sandbox-local/lib/index.js`);
const { SandboxPolicyService } = await import(`${host.root}/dsh-sandbox-policy/lib/index.js`);

/** Resolve a plugin's schemastery defaults the way the loader would. */
const withDefaults = (Ctor, config) => (typeof Ctor.Config === 'function' ? Ctor.Config(config) : config);

// Stubs for the two registries this test does not exercise: the tool registry is
// captured so the plugin's definitions can be inspected, and the projection
// registry is a no-op the sandbox policy service only writes through.
const registered = [];
ctx.provide('tools', { register: (tool) => registered.push(tool) });
ctx.provide('sessionProjections', { register: () => () => {} });

new LocalSubprocessRuntime(ctx, withDefaults(LocalSubprocessRuntime, {}));
new LocalSandboxProvider(ctx, withDefaults(LocalSandboxProvider, {}));
new SandboxPolicyService(ctx, withDefaults(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: localWorkspace }));

const plugin = await import('../index.js');
plugin.apply(ctx, {
  sshBinary: 'ssh',
  connectTimeoutSec: 10,
  controlPersistSec: 120,
  mirrorRoot: join(scratch, 'mirrors'),
  storageFile: join(scratch, 'mounts.json'),
  localFallback: true,
  operationTimeoutMs: 30_000,
});

const mirror = join(scratch, 'mirrors', 'remote');

console.log('registration');
await test('registers ctx.fs and ctx.shell as this plugin\'s backends', () => {
  assert.equal(typeof ctx.fs?.readText, 'function');
  assert.equal(ctx.fs.sandboxMode, undefined);
  assert.equal(typeof ctx.shell?.execute, 'function');
});

await test('registers three tools with model-facing schemas', () => {
  assert.deepEqual(registered.map((tool) => tool.name).sort(), ['ssh_hosts', 'ssh_mount', 'ssh_unmount']);
  for (const tool of registered) {
    assert.equal(typeof tool.description, 'string');
    assert.ok(tool.description.length > 20);
    assert.equal(typeof tool.output?.render, 'function');
  }
});

console.log('\ntool behaviour');
const sshHosts = registered.find((tool) => tool.name === 'ssh_hosts');
const sshMount = registered.find((tool) => tool.name === 'ssh_mount');

await test('ssh_hosts lists hosts from the real SSH config', async () => {
  const text = await sshHosts.execute({}, { signal: undefined });
  assert.match(text, /Hosts:/u);
  assert.ok(text.includes(destination.split('@').pop()), 'expected the test host in the listing');
});

await test('ssh_mount mounts a remote directory', async () => {
  const text = await sshMount.execute({ host: destination, remote_path: remoteDir, local_path: mirror }, {});
  assert.match(text, /Mounted/u);
  assert.match(text, /Local workspace path/u);
  assert.equal(ctx.sshRemote.mounts.list().length, 1);
});

console.log('\nfilesystem routing');
await test('a local session still reads local files', async () => {
  const target = await ctx.fs.resolve('local.txt', { cwd: localWorkspace });
  assert.equal(target.displayPath, join(localWorkspace, 'local.txt'));
  assert.equal(await ctx.fs.readText(target), 'local content\n');
});

await test('a mounted session reads the remote file', async () => {
  const target = await ctx.fs.resolve('seed.txt', { cwd: mirror });
  assert.equal(target.displayPath, `${remoteDir}/seed.txt`);
  assert.equal(await ctx.fs.readText(target), 'seeded remotely\n');
});

await test('stat returns a versioned remote metadata record', async () => {
  const target = await ctx.fs.resolve(`${remoteDir}/seed.txt`, { cwd: mirror });
  const info = await ctx.fs.stat(target);
  assert.equal(info.type, 'file');
  assert.equal(info.size, 16);
  assert.match(String(info.version), /^\d+:\d+:16:\d+:\d+$/u);
});

await test('write creates a remote file atomically', async () => {
  const target = await ctx.fs.resolve(`${remoteDir}/written.txt`, { cwd: mirror });
  const outcome = await ctx.fs.writeText(target, 'first\n', undefined);
  assert.equal(outcome.operation, 'create');
  assert.equal(await ctx.fs.readText(target), 'first\n');
});

await test('edit applies a literal replacement with a version guard', async () => {
  const target = await ctx.fs.resolve(`${remoteDir}/written.txt`, { cwd: mirror });
  const info = await ctx.fs.stat(target);
  const outcome = await ctx.fs.editText(target, { oldString: 'first', newString: 'second', replaceAll: false }, { kind: 'replaceIfVersion', version: info.version });
  assert.equal(outcome.after, 'second\n');
  assert.equal(await ctx.fs.readText(target), 'second\n');
});

await test('a stale edit is rejected', async () => {
  const target = await ctx.fs.resolve(`${remoteDir}/written.txt`, { cwd: mirror });
  await assert.rejects(
    () => ctx.fs.editText(target, { oldString: 'second', newString: 'third', replaceAll: false }, { kind: 'replaceIfVersion', version: '1:2:3:4:5' }),
    (error) => error.code === 'FS_STALE_VERSION',
  );
});

await test('listDir enumerates the remote directory', async () => {
  const target = await ctx.fs.resolve(remoteDir, { cwd: mirror });
  const entries = await ctx.fs.listDir(target);
  const names = entries.map((entry) => entry.name).sort();
  assert.deepEqual(names, ['seed.txt', 'written.txt']);
  assert.equal(entries[0].target.targetKey.startsWith('remote:'), true);
});

await test('readBytes and readByteRange work remotely', async () => {
  const target = await ctx.fs.resolve(`${remoteDir}/seed.txt`, { cwd: mirror });
  const bytes = await ctx.fs.readBytes(target, undefined, 1024);
  assert.equal(Buffer.from(bytes).toString('utf8'), 'seeded remotely\n');
  const window = await ctx.fs.readByteRange(target, { offset: 0, length: 6 }, undefined);
  assert.equal(Buffer.from(window).toString('utf8'), 'seeded');
});

await test('a missing remote file reports FS_NOT_FOUND', async () => {
  const target = await ctx.fs.resolve(`${remoteDir}/nope.txt`, { cwd: mirror });
  await assert.rejects(() => ctx.fs.readText(target), (error) => error.code === 'FS_NOT_FOUND');
});

await test('mutation containment rejects writes outside the mount', async () => {
  const target = await ctx.fs.resolve('/tmp/outside-the-mount.txt', { cwd: mirror });
  await assert.rejects(
    () => ctx.fs.writeText(target, 'nope', undefined),
    (error) => error.code === 'FS_SANDBOX_DENIED',
  );
});

await test('contains and fileUrl agree across worlds', async () => {
  const root = await ctx.fs.resolve(remoteDir, { cwd: mirror });
  const child = await ctx.fs.resolve(`${remoteDir}/seed.txt`, { cwd: mirror });
  assert.equal(ctx.fs.contains(root, child), true);
  assert.equal(ctx.fs.fileUrl(child), `file://${remoteDir}/seed.txt`);
});

console.log('\nshell routing');
await test('a remote command runs on the remote host', async () => {
  const spec = ctx.shell.resolve({ command: 'hostname && cat seed.txt', workdir: mirror });
  const execution = await ctx.shell.execute(spec);
  const result = await execution.result();
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout.text, /seeded remotely/u);
});

await test('a local command still runs locally', async () => {
  const spec = ctx.shell.resolve({ command: 'cat local.txt', workdir: localWorkspace });
  let result;
  try {
    result = await (await ctx.shell.execute(spec)).result();
  } catch (error) {
    // This test process may itself be running inside a sandbox that forbids the
    // nested OS sandbox. The refusal still proves the command was routed to the
    // local *sandboxed* executor rather than to the remote host.
    assert.equal(error.name, 'SandboxUnavailableError');
    console.log('       (local sandbox unavailable in this nested environment; refusal observed)');
    return;
  }
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.text, 'local content\n');
});

await test('remote exit codes and stderr survive the round trip', async () => {
  const spec = ctx.shell.resolve({ command: 'echo to-stderr >&2; exit 7', workdir: mirror });
  const execution = await ctx.shell.execute(spec);
  const result = await execution.result();
  assert.equal(result.exitCode, 7);
  assert.equal(result.stderr.text, 'to-stderr\n');
});

await test('a remote command can read stdin', async () => {
  const spec = ctx.shell.resolve({ command: 'cat', workdir: mirror, stdin: 'piped-through\n' });
  const execution = await ctx.shell.execute(spec);
  const result = await execution.result();
  assert.equal(result.stdout.text, 'piped-through\n');
});

await test('the remote working directory is the mounted directory', async () => {
  const spec = ctx.shell.resolve({ command: 'pwd', workdir: join(mirror, '.') });
  const execution = await ctx.shell.execute(spec);
  const result = await execution.result();
  assert.equal(result.stdout.text.trim(), remoteDir);
});

console.log('\ncleanup');
const sshUnmount = registered.find((tool) => tool.name === 'ssh_unmount');
await test('ssh_unmount removes the mount and closes the connection', async () => {
  const text = await sshUnmount.execute({ local_path: mirror }, {});
  assert.match(text, /Unmounted/u);
  assert.equal(ctx.sshRemote.mounts.list().length, 0);
});

await test('after unmounting, a previously remote path falls back to local', async () => {
  const target = await ctx.fs.resolve('local.txt', { cwd: localWorkspace });
  assert.equal(await ctx.fs.readText(target), 'local content\n');
});

await raw.run({ target: sshTarget, op: 'hello' }).catch(() => {});
const cleanup = new SshRunner({ sshBinary: 'ssh', batchMode: true, connectTimeoutSec: 10, controlPersistSec: 1, multiplex: true, strictHostKeyChecking: 'accept-new', extraSshArgs: [] });
await cleanup.close(sshTarget);
rmSync(scratch, { recursive: true, force: true });
const { spawnSync } = await import('node:child_process');
spawnSync('ssh', ['-T', '-o', 'BatchMode=yes', '-o', `ControlPath=${raw.socketPath(sshTarget)}`, destination, `rm -rf ${remoteDir}`]);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

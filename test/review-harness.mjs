/** Regression tests through the installed Harness tools and policy service. */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync, symlinkSync, readlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadHostModules } from '../lib/host-modules.js';
import { REMOTE_SCRIPT, encodeArg } from '../lib/remote-protocol.js';
import * as plugin from '../index.js';

const host = await loadHostModules();
const { LocalSubprocessRuntime } = await import(`${host.root}/dsh-subprocess-local/lib/index.js`);
const { LocalSandboxProvider } = await import(`${host.root}/dsh-sandbox-local/lib/index.js`);
const { SandboxPolicyService } = await import(`${host.root}/dsh-sandbox-policy/lib/index.js`);
const fsTools = await import(`${host.root}/dsh-tool-fs/lib/index.js`);
const editorTools = await import(`${host.root}/dsh-tool-str-replace-editor/lib/index.js`);
const bashTools = await import(`${host.root}/dsh-tool-bash/lib/index.js`);
const defaults = (Ctor, config) => typeof Ctor.Config === 'function' ? Ctor.Config(config) : config;
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-review-harness-')));
const local = join(scratch, 'local'), remote = join(scratch, 'remote'), mirror = join(scratch, 'mirror');
mkdirSync(local); mkdirSync(remote);
writeFileSync(join(local, 'seed.txt'), 'local seed\n'); writeFileSync(join(remote, 'seed.txt'), 'remote seed\n');
const fibers = [];
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`ok   ${name}`); }
async function boot(config) {
  const ctx = new host.cordis.Context(), registered = new Map(), modes = new Map();
  ctx.provide('tools', { register: tool => registered.set(tool.name, tool), get: name => registered.get(name) });
  ctx.provide('systemPrompt', { section() {}, getSectionOrder: () => 0 });
  ctx.provide('shellEnv', { collect: () => ({}) });
  ctx.provide('sessionProjections', { register: () => () => {}, stateOf: session => modes.get(session.id) });
  new LocalSubprocessRuntime(ctx, defaults(LocalSubprocessRuntime, {}));
  new LocalSandboxProvider(ctx, defaults(LocalSandboxProvider, {}));
  new SandboxPolicyService(ctx, defaults(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: local }));
  const fiber = ctx.plugin(plugin, { sshConfigPaths: [], mirrorRoot: join(scratch, 'mirrors'),
    storageFile: join(scratch, 'mounts.json'), ...config });
  fibers.push(fiber); await fiber.await();
  const calls = [];
  ctx.sshRemote.runtime.runner.hello = async () => 'host=test kernel=Linux gnu_stat=1';
  ctx.sshRemote.runtime.runner.run = async ({ op, args, input }) => {
    calls.push(op);
    const result = spawnSync('sh', ['-c', REMOTE_SCRIPT, 'test', op, ...args.map(encodeArg)], { input });
    return { code: result.status, stdout: result.stdout, stderr: result.stderr.toString() };
  };
  fsTools.apply(ctx, fsTools.Config({})); editorTools.apply(ctx, editorTools.Config({}));
  bashTools.apply(ctx, { enableRunInBackground: false });
  return { ctx, registered, modes, calls };
}
try {
  const f = await boot({ mounts: [null, 42, { host: 'bad', remoteDir: 'relative' }, { host: '-option', remoteDir: remote },
    { host: 'dev', remoteDir: remote, localDir: `${mirror}/` }, { host: 'auto', remoteDir: remote }] });
  await test('invalid config entries are skipped; explicit and automatic roots are normalized', () => {
    assert.equal(f.ctx.sshRemote.mounts.list().length, 2);
    assert.equal(f.ctx.sshRemote.mounts.match(mirror).localDir, mirror);
    for (const bad of [null, 42, {}]) assert.throws(() => plugin.resolveConfig({ sshConfigPaths: [bad] }), /strings/);
    assert.throws(() => plugin.resolveConfig({ extraWritableRoots: ['relative'] }), /absolute/);
  });
  await test('filesystem and shell expose the deployment mode to real tools and permission presets', () => {
    assert.equal(f.ctx.fs.sandboxMode, 'workspace-write'); assert.equal(f.ctx.shell.sandboxMode, 'workspace-write');
    assert.ok(f.registered.get('write').parameters.properties.sandbox_permissions);
    assert.ok(f.registered.get('edit').parameters.properties.sandbox_permissions);
  });
  for (const [world, cwd, seedRoot] of [['local', local, local], ['remote', mirror, remote]]) {
    const session = { id: `${world}-read-only`, header: { cwd } }; f.modes.set(session.id, 'read-only');
    const exec = { agent: { session }, callId: `call-${world}` };
    const denied = error => error instanceof host.fs.FsError && error.code === 'FS_SANDBOX_DENIED';
    await test(`${world}: real write, edit and str_replace_editor honor the session's read-only override`, async () => {
      await assert.rejects(() => f.registered.get('write').execute({ file_path: join(cwd, 'seed.txt'), content: 'bad' }, exec), denied);
      await assert.rejects(() => f.registered.get('edit').execute({ file_path: join(cwd, 'seed.txt'), old_string: 'seed', new_string: 'bad' }, exec), denied);
      await assert.rejects(() => f.registered.get('str_replace_editor').execute({ command: 'str_replace', path: join(cwd, 'seed.txt'), old_str: 'seed', new_str: 'bad' }, exec), denied);
      await assert.rejects(() => f.registered.get('str_replace_editor').execute({ command: 'create', path: join(cwd, 'denied.txt'), file_text: 'bad' }, exec), denied);
      assert.equal(readFileSync(join(seedRoot, 'seed.txt'), 'utf8'), `${world} seed\n`);
      assert.ok(!f.calls.includes('write'), 'denied remote writes must not invoke the helper');
    });
    await test(`${world}: a writable session remains writable in the same composition`, async () => {
      const writable = { agent: { session: { id: `${world}-writable`, header: { cwd } } } };
      const result = await f.registered.get('write').execute({ file_path: join(cwd, 'ok.txt'), content: 'ok' }, writable);
      assert.equal(result.operation, 'create'); assert.equal(readFileSync(join(seedRoot, 'ok.txt'), 'utf8'), 'ok');
      f.calls.length = 0;
    });
  }
  await test('real bash tools receive read-only session policy for local and remote commands', async () => {
    const args = { command: 'printf bad > shell-denied.txt', description: 'Check read-only policy' };
    const localExec = { agent: { session: { id: 'local-read-only', header: { cwd: local } } }, signal: new AbortController().signal };
    const localResult = await f.registered.get('bash').execute(args, localExec);
    assert.equal(localResult.sandbox.mode, 'read-only'); assert.equal(localResult.sandbox.denied, true);
    assert.equal(existsSync(join(local, 'shell-denied.txt')), false);
    const runner = f.ctx.sshRemote.runtime.runner, originalArgv = runner.argv;
    runner.argv = () => { throw new Error('SSH must not be started for a read-only session'); };
    try {
      const remoteExec = { agent: { session: { id: 'remote-read-only', header: { cwd: mirror } } }, signal: new AbortController().signal };
      await assert.rejects(() => f.registered.get('bash').execute(args, remoteExec), /read-only/);
    } finally { runner.argv = originalArgv; }
  });
  await test('real remote editing preserves symlinks, target versions, and empty before content', async () => {
    symlinkSync('seed.txt', join(remote, 'link'));
    const exec = { agent: { session: { id: 'remote-edit', header: { cwd: mirror } } } };
    const target = await f.ctx.fs.resolve('link', { cwd: mirror }); const version = (await f.ctx.fs.stat(target)).version;
    f.ctx.on('fs/edit-intent', () => ({ kind: 'replaceIfVersion', version }));
    const result = await f.registered.get('edit').execute({ file_path: 'link', old_string: 'seed', new_string: 'edited' }, exec);
    assert.equal(result.before, 'remote seed\n'); assert.equal(readlinkSync(join(remote, 'link')), 'seed.txt');
    assert.equal(readFileSync(join(remote, 'seed.txt'), 'utf8'), 'remote edited\n');
    writeFileSync(join(remote, 'empty.txt'), '');
    const written = await f.registered.get('write').execute({ file_path: 'empty.txt', content: 'filled' }, exec);
    assert.equal(written.before, '');
  });
  await test('a local workspace-write session cannot write into a different remote workspace', async () => {
    const exec = { agent: { session: { id: 'local-boundary', header: { cwd: local } } } };
    await assert.rejects(() => f.registered.get('write').execute({ file_path: join(mirror, 'seed.txt'), content: 'bad' }, exec),
      error => error.code === 'FS_SANDBOX_DENIED');
    assert.equal(readFileSync(join(remote, 'seed.txt'), 'utf8'), 'remote edited\n');
  });
  await test('real tool escalation requires approval and allows only the approved call', async () => {
    const session = { id: 'remote-escalation', header: { cwd: mirror } };
    f.modes.set(session.id, 'read-only');
    const exec = { agent: { session }, callId: 'escalation' };
    const outside = join(scratch, 'outside.txt');
    const args = { file_path: outside, content: 'approved', sandbox_permissions: 'danger-full-access', justification: 'test grant' };
    await assert.rejects(() => f.registered.get('write').execute(args, exec), /requires approval/);
    let allowed = false, requests = 0;
    f.ctx.provide('approval', { async request() { requests++; return allowed ? 'allowed-once' : 'rejected'; } });
    await assert.rejects(() => f.registered.get('write').execute(args, exec), /rejected/);
    allowed = true; await f.registered.get('write').execute(args, exec);
    assert.equal(readFileSync(outside, 'utf8'), 'approved'); assert.equal(requests, 2);
    await assert.rejects(() => f.registered.get('write').execute({ file_path: outside, content: 'unapproved' }, exec),
      error => error.code === 'FS_SANDBOX_DENIED');
    assert.equal(readFileSync(outside, 'utf8'), 'approved');
  });
  await test('new mounts reject local project directories and traversal before any remote probe', async () => {
    const calls = f.calls.length;
    for (const path of [local, join(scratch, 'x') + '/../hijack', 'relative']) {
      await assert.rejects(() => f.ctx.sshRemote.runtime.workspaceActions.connect({ host: 'dev', remote_path: remote, local_path: path }));
    }
    assert.equal(f.calls.length, calls);
  });
  await test('removing config declarations does not reload them as runtime mounts', async () => {
    f.ctx.sshRemote.mounts.save();
    const cold = await boot({ mounts: [] });
    assert.equal(cold.ctx.sshRemote.mounts.list().length, 0);
    assert.equal(cold.ctx.sshRemote.mounts.configuredMounts.size, 2);
    await assert.rejects(() => cold.ctx.fs.resolve('seed.txt', { cwd: mirror }), error => error.code === 'FS_IO_ERROR');
    const restored = await boot({ mounts: [{ host: 'dev', remoteDir: remote, localDir: mirror }] });
    assert.equal(restored.ctx.sshRemote.mounts.match(mirror).remoteDir, remote);
  });
  console.log(`\n${passed} review regressions passed through real Harness tools.`);
} finally {
  for (const fiber of fibers) await fiber.dispose();
  rmSync(scratch, { recursive: true, force: true });
}

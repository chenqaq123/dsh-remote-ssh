/**
 * Local startup regression against the installed harness's real Cordis and
 * sandbox implementations. No SSH host or model API is needed.
 *
 * DSH_DESKTOP_NODE_EXECUTABLE="/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" \
 *   "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/bin/node" test/local-startup.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadHostModules } from '../lib/host-modules.js';
import * as plugin from '../index.js';

const host = await loadHostModules();
const { LocalSubprocessRuntime } = await import(`${host.root}/dsh-subprocess-local/lib/index.js`);
const { LocalSandboxProvider } = await import(`${host.root}/dsh-sandbox-local/lib/index.js`);
const { SandboxPolicyService } = await import(`${host.root}/dsh-sandbox-policy/lib/index.js`);
const defaults = (Ctor, config) => typeof Ctor.Config === 'function' ? Ctor.Config(config) : config;
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-local-startup-')));
const localWorkspace = join(scratch, 'workspace');
mkdirSync(localWorkspace);
writeFileSync(join(localWorkspace, 'local.txt'), 'local content\n');
let passed = 0;
let failed = 0;
const fibers = [];
async function test(name, run) {
  try {
    await run();
    passed++;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}\n     ${error.stack}`);
  }
}

let ready;
try {
  for (const delayed of ['tools', 'subprocess', 'sandbox', 'sandboxPolicy']) {
    const ctx = new host.cordis.Context();
    const registered = [];
    ctx.provide('sessionProjections', { register: () => () => {} });
    const providers = {
      tools: () => ctx.provide('tools', { register: (tool) => registered.push(tool) }),
      subprocess: () => new LocalSubprocessRuntime(ctx, defaults(LocalSubprocessRuntime, {})),
      sandbox: () => new LocalSandboxProvider(ctx, defaults(LocalSandboxProvider, {})),
      sandboxPolicy: () => new SandboxPolicyService(ctx, defaults(SandboxPolicyService, {
        mode: 'workspace-write', workspaceRoot: localWorkspace,
      })),
    };
    for (const [name, provide] of Object.entries(providers)) if (name !== delayed) provide();
    const retiredRoot = join(scratch, `${delayed}-retired`);
    writeFileSync(join(scratch, `${delayed}-mounts.json`), JSON.stringify({
      version: 2, mounts: [], retiredRoots: [retiredRoot],
    }));
    const fiber = await ctx.plugin(plugin, {
      sshConfigPaths: [], storageFile: join(scratch, `${delayed}-mounts.json`),
      mirrorRoot: join(scratch, `${delayed}-mirrors`), localFallback: true,
      mounts: [{ host: 'example.invalid', remoteDir: '/retired', localDir: retiredRoot }],
    });
    fibers.push(fiber);
    await test(`waits while ${delayed} is unavailable`, () => {
      assert.equal(ctx.get('sshRemote') === undefined, true, 'plugin started before its dependency was ready');
    });
    providers[delayed]();
    await fiber.await();
    await test(`initializes local backends when ${delayed} becomes available`, async () => {
      assert.ok(ctx.sshRemote.runtime.local?.fs);
      assert.ok(ctx.sshRemote.runtime.local?.shell);
      assert.deepEqual(registered.map((tool) => tool.name).sort(), ['ssh_hosts', 'ssh_mount', 'ssh_unmount']);
      const target = await ctx.fs.resolve('local.txt', { cwd: localWorkspace });
      assert.equal(await ctx.fs.readText(target), 'local content\n');
    });
    if (delayed === 'sandboxPolicy') ready = ctx;
  }

  await test('explicitly removed configured mounts stay removed after startup', () => {
    assert.equal(ready.sshRemote.mounts.list().length, 0);
    assert.throws(() => ready.sshRemote.mounts.assertActivePath(join(scratch, 'sandboxPolicy-retired')), /已断开/);
  });

  await test('writes and edits local files without an SSH mount', async () => {
    const target = await ready.fs.resolve('written.txt', { cwd: localWorkspace });
    await ready.fs.writeText(target, 'before\n');
    await ready.fs.editText(target, { oldString: 'before', newString: 'after', replaceAll: false });
    assert.equal(await ready.fs.readText(target), 'after\n');
  });
  await test('still rejects local writes under a read-only policy', async () => {
    const target = await ready.fs.resolve('denied.txt', { cwd: localWorkspace });
    await assert.rejects(
      () => ready.fs.writeText(target, 'must not be written', undefined, undefined, {
        mode: 'read-only', workspaceRoot: localWorkspace,
      }),
      (error) => error.code === 'FS_SANDBOX_DENIED',
    );
  });
  await test('executes a local command through the real sandbox', async () => {
    const spec = ready.shell.resolve({ command: 'cat local.txt', workdir: localWorkspace });
    const result = await (await ready.shell.execute(spec)).result();
    assert.equal(result.exitCode, 0, result.stderr.text);
    assert.equal(result.stdout.text, 'local content\n');
    assert.equal(result.sandbox.mode, 'workspace-write');
    assert.equal(result.sandbox.denied, false);
    assert.ok(result.sandbox.enforcement, 'expected an OS sandbox enforcement backend');
  });
  await test('preserves remote routing and local fallback after adding a mount', async () => {
    assert.ok(ready.sshRemote.runtime.local?.fs, 'local fallback must be ready before checking routes');
    const mirror = join(scratch, 'remote-mirror');
    ready.sshRemote.mounts.put({ localDir: mirror, remoteDir: '/remote-project', alias: 'example.invalid' });
    const remoteTarget = await ready.fs.resolve('remote.txt', { cwd: mirror });
    assert.equal(ready.fs.processPath(remoteTarget), '/remote-project/remote.txt');
    const remoteSpec = ready.shell.resolve({ command: 'pwd', workdir: mirror });
    assert.equal(remoteSpec.remoteWorkdir, '/remote-project');
    assert.equal(remoteSpec.mount.alias, 'example.invalid');
    const localTarget = await ready.fs.resolve('local.txt', { cwd: localWorkspace });
    assert.equal(await ready.fs.readText(localTarget), 'local content\n');
    assert.ok(ready.shell.resolve({ command: 'pwd', workdir: localWorkspace }).localRequest);
  });
  await test('upgrades existing remote names when the workspace service becomes ready', async () => {
    let title;
    let changed;
    const renamed = new Promise(resolve => { changed = resolve; });
    const workspace = { id: 'test-remote', path: join(scratch, 'remote-mirror'), title: 'remote-mirror',
      async setTitle(value) { this.title = value; title = value; changed(); } };
    ready.provide('workspaceRegistry', { list: () => [workspace] });
    let timer;
    try {
      await Promise.race([renamed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('name migration did not start')), 2000); })]);
      assert.equal(title, 'remote-project · example.invalid');
    } finally { clearTimeout(timer); }
  });
} finally {
  for (const fiber of fibers) await fiber.dispose();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

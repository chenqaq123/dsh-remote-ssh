/** Real Gateway validation and local-only SSH simulation; no network required. */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { REMOTE_SCRIPT, encodeArg } from '../lib/remote-protocol.js';
import { loadHostModules } from '../lib/host-modules.js';
import { MountTable } from '../lib/mounts.js';
import { createWorkspaceActions } from '../lib/workspace-actions.js';
import { registerSshUi } from '../ui/host.js';

const host = await loadHostModules();
const { TypertRegistry } = await import(`${host.root}/dsh-typert-registry/lib/index.js`);
const { TypertGatewayService } = await import(`${host.root}/dsh-api-gateway/lib/index.js`);
const { ClientModuleRegistry } = await import(`${host.root}/dsh-client-modules/lib/index.js`);
const scratch = mkdtempSync(join(tmpdir(), 'dsh-ui-rpc-'));
let calls = 0, closed = 0, failure = false;
const ctx = new host.cordis.Context();
new TypertRegistry(ctx);
const gateway = new TypertGatewayService(ctx, TypertGatewayService.Config({}));
ctx.provide('sshRemote', { listHosts: () => ({ hosts: [{ alias: 'test-host', hostname: 'test.invalid' }], warnings: [] }) });
const runtime = {
  ctx, configBlocks: [], config: { mirrorRoot: join(scratch, 'mirrors'), operationTimeoutMs: 1000 },
  mounts: new MountTable({ storageFile: join(scratch, 'mounts.json'), resolveHost: () => ({}) }),
  targetOf: (alias) => ({ alias }),
  runner: {
    async hello() { calls++; if (failure) throw new Error('Permission denied (publickey)'); return 'host=GPU-DEV kernel=Linux gnu_stat=1'; },
    async run({ op, args }) {
      calls++;
      if (op === 'browse') {
        const result = spawnSync('sh', ['-c', REMOTE_SCRIPT, 'dsh-test', op, ...args.map(encodeArg)]);
        return { code: result.status, stdout: result.stdout, stderr: result.stderr.toString() };
      }
      return { code: 0, stdout: Buffer.from('#S d 0 0\n'), stderr: '' };
    },
    async close() { closed++; return true; },
  },
};
runtime.workspaceActions = createWorkspaceActions(runtime);
await registerSshUi(ctx, host, runtime);
const invoke = (method, request) => gateway.invoke({ namespace: 'sshRemoteUi', method,
  args: request === undefined ? {} : { request } });
let passed = 0;
async function test(name, run) { await run(); console.log(`ok   ${name}`); passed++; }
try {
  await test('discovers the browser bundle from the real local Loader specifier', () => {
    const registry = Object.create(ClientModuleRegistry.prototype);
    registry.ctx = { loader: {} }; registry.pkgMeta = new Map();
    const meta = registry.resolveMeta('../index.js', import.meta.url);
    assert.equal(meta.packageName, 'dsh-ssh-remote');
    assert.equal(meta.meta.clientPath, new URL('../ui/client.js', import.meta.url).pathname);
  });
  await test('lists configured aliases without connecting or exposing keys', async () => {
    const result = await invoke('list');
    assert.equal(result.hosts[0].alias, 'test-host'); assert.equal(calls, 0);
    assert.deepEqual(result.mounts, []);
  });
  await test('rejects malformed RPC input before attempting SSH', async () => {
    await assert.rejects(() => invoke('connect', { host: 42, remote_path: '/project' }));
    await assert.rejects(() => invoke('connect', { host: 'test-host', remote_path: '/project', extra: 'bad' }));
    assert.equal(calls, 0);
  });
  await test('rejects relative paths and SSH option injection', async () => {
    await assert.rejects(() => invoke('connect', { host: 'test-host', remote_path: 'project' }));
    await assert.rejects(() => invoke('connect', { host: '-ProxyCommand=bad', remote_path: '/project' }));
    assert.equal(calls, 0);
  });
  await test('browse RPC validates its schema and returns real helper directory framing', async () => {
    await assert.rejects(() => invoke('browse', { host: 'test-host', path: scratch, extra: true }));
    const result = await invoke('browse', { host: 'test-host', path: scratch });
    assert.ok(result.path.endsWith(scratch.split('/').pop()));
    assert.deepEqual(result.directories, []); assert.equal(runtime.mounts.list().length, 0);
    await assert.rejects(() => invoke('browse', { host: 'test-host', path: 'relative' }));
  });
  let mount, second;
  await test('connects, persists, and reports a verified workspace', async () => {
    mount = await invoke('connect', { host: 'test-host', remote_path: '/project' });
    assert.equal(mount.hostname, 'gpu-dev');
    assert.equal(mount.title, 'project 🟢 gpu-dev');
    const snapshot = await invoke('list');
    assert.equal(snapshot.mounts[0].status, 'connected');
    assert.equal(snapshot.mounts[0].localDir, mount.localDir);
    const cold = new MountTable({ storageFile: runtime.mounts.storageFile, resolveHost: () => ({}) }).load();
    assert.equal(cold.list()[0].remoteDir, '/project');
  });
  await test('reconnecting the same directory reuses its saved workspace', async () => {
    const again = await invoke('connect', { host: 'test-host', remote_path: '/project' });
    assert.equal(again.localDir, mount.localDir); assert.equal(runtime.mounts.list().length, 1);
  });
  await test('checks a saved connection through the authenticated method', async () => {
    assert.equal((await invoke('check', { local_path: mount.localDir })).status, 'connected');
  });
  await test('records authentication failure without removing the saved mapping', async () => {
    failure = true;
    await assert.rejects(() => invoke('check', { local_path: mount.localDir }), /Permission denied/);
    assert.equal((await invoke('list')).mounts[0].status, 'error');
    await assert.rejects(() => invoke('connect', { host: 'test-host', remote_path: '/failed' }));
    assert.equal(runtime.mounts.list().length, 1); failure = false;
  });
  await test('disconnecting one workspace preserves another shared connection', async () => {
    second = await invoke('connect', { host: 'test-host', remote_path: '/other-project' });
    await invoke('disconnect', { local_path: mount.localDir });
    assert.equal(closed, 0); assert.equal(runtime.mounts.list().length, 1);
    await assert.rejects(() => invoke('check', { local_path: mount.localDir }));
  });
  await test('disconnecting the last workspace closes the SSH master', async () => {
    await invoke('disconnect', { local_path: second.localDir });
    assert.equal(closed, 1); assert.equal((await invoke('list')).mounts.length, 0);
  });
  await test('an aborted connection does not publish a mount', async () => {
    const controller = new AbortController(); controller.abort(); const before = calls;
    await assert.rejects(() => runtime.workspaceActions.connect({ host: 'test-host', remote_path: '/cancelled' }, controller.signal));
    assert.equal(calls, before); assert.equal(runtime.mounts.list().length, 0);
  });
  console.log(`\n${passed} passed, 0 failed`);
} finally { rmSync(scratch, { recursive: true, force: true }); }

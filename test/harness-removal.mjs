/** Real Harness registry + controller, with isolated in-memory persistence only. */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadHostModules } from '../lib/host-modules.js';
import { installWorkspaceRemoval } from '../lib/workspace-removal.js';
import { MountTable } from '../lib/mounts.js';
import { registerSshUi } from '../ui/host.js';

const host = await loadHostModules();
const { WorkspaceRegistry } = await import(`${host.root}/dsh-workspace/lib/index.js`);
const { WorkspaceController } = await import(`${host.root}/dsh-api-workspace-controller/lib/index.js`);
const { TypertRegistry } = await import(`${host.root}/dsh-typert-registry/lib/index.js`);
const { TypertGatewayService } = await import(`${host.root}/dsh-api-gateway/lib/index.js`);
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-harness-removal-')));
const remotePath = join(scratch, 'remote'), localPath = join(scratch, 'local');
mkdirSync(remotePath); mkdirSync(localPath);
const records = new Map(); const headers = [
  { id: 'remote-chat', cwd: remotePath, createdAt: 1 },
  { id: 'old-ungrouped', cwd: remotePath, createdAt: 2 },
  { id: 'local-chat', cwd: localPath, createdAt: 3 },
];
let state = { initialized: true, workspaceIds: [], archivedSessionIds: [], pinnedSessionIds: [] };
const table = {
  get size() { return records.size; }, get: id => records.get(id), entries: () => records.entries(), keys: () => records.keys(),
  async put(id, record) { records.set(id, record); }, async delete(id) { records.delete(id); },
  async update(id, fn) { const next = fn(records.get(id)); records.set(id, next); return next; },
};
const ctx = new host.cordis.Context(); new TypertRegistry(ctx);
const gateway = new TypertGatewayService(ctx, TypertGatewayService.Config({}));
ctx.provide('sessionPersistence', { async list() { return headers.map(header => ({ header })); } });
ctx.provide('storageDomain', { async open() { return { table: () => table, global: { get: () => state, async set(next) { state = next; } }, async close() {} }; } });
const fiber = ctx.plugin(WorkspaceRegistry); await fiber.await();
let dispose;
try {
  const registry = ctx.workspaceRegistry;
  const remote = await registry.create(remotePath), local = await registry.create(localPath);
  await remote.attachSession('remote-chat'); await local.attachSession('local-chat');
  const mounts = new MountTable({ storageFile: join(scratch, 'mounts.json') });
  mounts.put({ localDir: remotePath, alias: 'test.invalid', remoteDir: '/project' });
  const runtime = { mounts, runner: { async close() { return true; } }, targetOf: alias => ({ alias }) };
  const originalDescriptor = Object.getOwnPropertyDescriptor(registry, 'delete');
  dispose = installWorkspaceRemoval(ctx, runtime);
  const controller = new WorkspaceController(ctx);
  assert.deepEqual(await controller.delete({ workspaceId: remote.id }), { deleted: true });
  assert.equal(registry.get(remote.id), undefined);
  assert.deepEqual([...registry.archivedSessionIds].sort(), ['old-ungrouped', 'remote-chat']);
  assert.equal(mounts.list().length, 0);
  assert.equal(headers.length, 3, 'session history must be preserved');
  await controller.delete({ workspaceId: local.id });
  assert.equal(registry.archivedSessionIds.includes('local-chat'), false);
  await registry.unarchiveSession('remote-chat'); await registry.unarchiveSession('old-ungrouped');
  mounts.put({ localDir: remotePath, alias: 'test.invalid', remoteDir: '/project' });
  await registerSshUi(ctx, host, runtime);
  const invoke = request => gateway.invoke({ namespace: 'sshRemoteUi', method: 'remove', args: { request } });
  await assert.rejects(() => invoke({ local_path: remotePath, unexpected: true }));
  assert.equal(mounts.list().length, 1);
  assert.deepEqual((await invoke({ local_path: remotePath })).archivedSessionIds.sort(), ['old-ungrouped', 'remote-chat']);
  assert.equal(mounts.list().length, 0);
  dispose(); assert.deepEqual(Object.getOwnPropertyDescriptor(registry, 'delete'), originalDescriptor);
  await registry.unarchiveSession('remote-chat');
  const restored = await registry.create(remotePath);
  await controller.delete({ workspaceId: restored.id });
  assert.equal(registry.archivedSessionIds.includes('remote-chat'), false);
  console.log('Real Harness controller/registry and Gateway removal passed: archives, orphan recovery, local deletion unchanged, histories retained, lifecycle restored.');
} finally { dispose?.(); await fiber.dispose(); rmSync(scratch, { recursive: true, force: true }); }

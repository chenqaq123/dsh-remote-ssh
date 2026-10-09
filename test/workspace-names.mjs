import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { MountTable } from '../lib/mounts.js';
import { createWorkspaceActions } from '../lib/workspace-actions.js';

function fixture(t) {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-names-')));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const records = new Map();
  const registry = {
    list: () => [...records.values()],
    async create(path) {
      path = realpathSync(path);
      if (!records.has(path)) records.set(path, { id: path, path, title: basename(path), async setTitle(title) { this.title = title; } });
      return records.get(path);
    },
  };
  const mounts = new MountTable({ storageFile: join(scratch, 'mounts.json') });
  const runtime = { ctx: { get: () => registry }, mounts, configBlocks: [],
    config: { mirrorRoot: join(scratch, 'mirrors') }, targetOf: alias => ({ alias }),
    runner: { async hello() { return 'hello'; }, async run() { return { code: 0, stdout: Buffer.from('#S d 0 0\n') }; } } };
  const actions = createWorkspaceActions(runtime);
  return { scratch, records, registry, runtime, mounts, actions };
}

test('custom names persist and native workspaces display the SSH hostname', async t => {
  const f = fixture(t);
  const connected = await f.actions.connect({ host: 'dev.example.com', remote_path: '/team/project', name: '  实验项目  ' });
  const result = await f.actions.open(connected.localDir);
  assert.equal(f.registry.list()[0].id, result.workspaceId);
  assert.equal(f.registry.list()[0].title, '实验项目 · SSH dev.example.com');
  assert.equal(f.actions.list()[0].name, '实验项目');
  const stored = new MountTable({ storageFile: f.mounts.storageFile }).load().list()[0];
  assert.equal(stored.name, '实验项目'); assert.equal(stored.workspaceTitle, '实验项目 · SSH dev.example.com');
  const again = await f.actions.connect({ host: 'dev.example.com', remote_path: '/team/project' });
  assert.equal(again.localDir, connected.localDir); assert.equal(again.name, '实验项目');
});

test('existing automatic titles are upgraded without changing paths or recreating removed groups', async t => {
  const f = fixture(t); const localDir = join(f.scratch, 'encoded_project_hash'); mkdirSync(localDir);
  f.mounts.put({ localDir, alias: 'dev', hostname: 'dev.example.com', remoteDir: '/team/project' });
  f.mounts.put({ localDir: join(f.scratch, 'orphan'), alias: 'dev', remoteDir: '/orphan' });
  await f.registry.create(localDir); const identity = f.mounts.mounts.get(localDir);
  await f.actions.syncTitles();
  assert.equal(f.registry.list().length, 1);
  assert.equal(f.registry.list()[0].title, 'project · SSH dev.example.com');
  assert.equal(f.registry.list()[0].path, localDir);
  assert.equal(f.mounts.mounts.get(localDir), identity, 'name changes must not invalidate in-flight commands');
});

test('native renames are preserved and explicit new names replace earlier names without duplicating the host', async t => {
  const f = fixture(t); const mount = await f.actions.connect({ host: 'dev', remote_path: '/project' });
  await f.actions.open(mount.localDir);
  await f.registry.list()[0].setTitle('从侧边栏改的名字');
  assert.equal(f.actions.list()[0].name, '从侧边栏改的名字');
  await f.actions.open(mount.localDir); await f.actions.open(mount.localDir);
  assert.equal(f.registry.list()[0].title, '从侧边栏改的名字 · SSH dev');
  await f.actions.connect({ host: 'dev', remote_path: '/project', name: '新名称' });
  await f.actions.open(mount.localDir);
  assert.equal(f.registry.list()[0].title, '新名称 · SSH dev');
});

test('invalid names are rejected before SSH and blank names use the remote folder', async t => {
  const f = fixture(t); let calls = 0; f.runtime.runner.hello = async () => { calls++; return ''; };
  for (const name of ['a\nb', 'x'.repeat(81), 42]) {
    await assert.rejects(() => f.actions.connect({ host: 'dev', remote_path: '/project', name }), /名称/);
  }
  assert.equal(calls, 0);
  assert.equal((await f.actions.connect({ host: 'dev', remote_path: '/project', name: '   ' })).name, 'project');
});

test('failed persistence restores both the native title and saved metadata', async t => {
  const f = fixture(t); const mount = await f.actions.connect({ host: 'dev', remote_path: '/project', name: '新名字' });
  const workspace = await f.registry.create(mount.localDir); const previous = { ...f.mounts.mounts.get(mount.localDir) };
  f.mounts.save = () => { throw new Error('disk full'); };
  await assert.rejects(() => f.actions.open(mount.localDir), /disk full/);
  assert.equal(workspace.title, basename(mount.localDir));
  assert.deepEqual(f.mounts.mounts.get(mount.localDir), previous);
});

test('duplicate names are rejected before creating an extra native group', async t => {
  const f = fixture(t);
  const first = await f.actions.connect({ host: 'dev', remote_path: '/one/project' });
  await f.actions.open(first.localDir);
  const second = await f.actions.connect({ host: 'dev', remote_path: '/two/project' });
  await assert.rejects(() => f.actions.open(second.localDir), /同名/);
  assert.equal(f.registry.list().length, 1);
  await f.actions.connect({ host: 'dev', remote_path: '/two/project', name: '另一个项目' });
  await f.actions.open(second.localDir); assert.equal(f.registry.list().length, 2);
});

test('opening a disconnected or busy workspace cannot recreate its native registration', async t => {
  const f = fixture(t); const mount = await f.actions.connect({ host: 'dev', remote_path: '/project' });
  f.runtime.workspaceBusy.add(mount.localDir);
  await assert.rejects(() => f.actions.open(mount.localDir), /其他操作/);
  f.runtime.workspaceBusy.clear(); f.mounts.remove(mount.localDir);
  await assert.rejects(() => f.actions.open(mount.localDir), /已断开/);
  assert.equal(f.registry.list().length, 0);
});

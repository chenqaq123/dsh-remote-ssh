import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MountTable } from '../lib/mounts.js';
import { installWorkspaceRemoval } from '../lib/workspace-removal.js';

function fixture(t, { orphan = false, disconnected = false } = {}) {
  const scratch = mkdtempSync(join(tmpdir(), 'dsh-remove-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const localDir = join(scratch, 'remote'); mkdirSync(localDir);
  const workspace = { id: 'remote-workspace', path: localDir, sessionIds: ['remote-chat'] };
  const workspaces = new Map(orphan ? [] : [[workspace.id, workspace]]);
  workspaces.set('local-workspace', { id: 'local-workspace', path: join(scratch, 'local'), sessionIds: ['local-chat'] });
  const headers = [{ id: 'remote-chat', cwd: localDir }, { id: 'old-ungrouped', cwd: localDir }, { id: 'local-chat', cwd: join(scratch, 'local') }];
  const archived = new Set(['already-archived']); const pins = new Set(['remote-chat']); const active = new Set(); const events = [];
  const registry = {
    get archivedSessionIds() { return [...archived]; }, get pinnedSessionIds() { return [...pins]; },
    list() { return [...workspaces.values()]; }, get(id) { return workspaces.get(id); },
    async delete(id) { events.push(['delete', id]); return workspaces.delete(id); },
    async archiveSession(id) { events.push(['archive', id]); archived.add(id); pins.delete(id); },
    async unarchiveSession(id) { archived.delete(id); }, async pinSession(id) { pins.add(id); },
  };
  const originalDelete = registry.delete;
  const ctx = { workspaceRegistry: registry, sessionPersistence: { async list() { return headers.map(header => ({ header })); } },
    get() { return undefined; }, async waterfall(_event, { sessionId }) { return active.has(sessionId) ? [{ kind: 'turn' }] : []; } };
  const mounts = new MountTable({ storageFile: join(scratch, 'mounts.json') });
  mounts.put({ localDir, alias: 'dev-server', remoteDir: '/project' });
  if (disconnected) mounts.remove(localDir);
  mounts.save();
  const runtime = { mounts, runner: { async close() { events.push(['close']); return true; } }, targetOf: alias => ({ alias }) };
  const dispose = installWorkspaceRemoval(ctx, runtime); t.after(dispose);
  return { runtime, ctx, registry, archived, pins, active, events, localDir, headers, workspaces, dispose, originalDelete };
}

test('native sidebar deletion archives remote and old ungrouped sessions before removing both registrations', async t => {
  const f = fixture(t);
  assert.equal(await f.registry.delete('remote-workspace'), true);
  assert.deepEqual(f.events.map(([kind]) => kind), ['archive', 'archive', 'delete', 'close']);
  assert.deepEqual([...f.archived].sort(), ['already-archived', 'old-ungrouped', 'remote-chat']);
  assert.equal(f.workspaces.has('remote-workspace'), false); assert.ok(f.workspaces.has('local-workspace'));
  assert.equal(f.runtime.mounts.list().length, 0);
  assert.throws(() => new MountTable({ storageFile: f.runtime.mounts.storageFile }).load().assertActivePath(f.localDir), /已断开/);
});

test('the panel can remove an old orphaned mount without recreating its workspace', async t => {
  const f = fixture(t, { orphan: true });
  const result = await f.runtime.removeWorkspace(f.localDir);
  assert.equal(result.removed, true); assert.equal(f.workspaces.size, 1);
  assert.deepEqual(result.archivedSessionIds.sort(), ['old-ungrouped', 'remote-chat']);
});

test('previously disconnected workspace registrations can still be removed from the sidebar', async t => {
  const f = fixture(t, { disconnected: true });
  await f.registry.delete('remote-workspace'); assert.ok(f.archived.has('remote-chat'));
  assert.equal(f.events.some(([kind]) => kind === 'close'), false);
});

test('removed config declarations still archive sessions and retire the placeholder on native deletion', async t => {
  const f = fixture(t);
  f.runtime.mounts.put({ ...f.runtime.mounts.list()[0], source: 'config' }); f.runtime.mounts.save();
  f.runtime.mounts = new MountTable({ storageFile: f.runtime.mounts.storageFile }).load();
  assert.equal(f.runtime.mounts.list().length, 0);
  await f.registry.delete('remote-workspace');
  assert.ok(f.archived.has('remote-chat')); assert.ok(f.archived.has('old-ungrouped'));
  assert.equal(f.runtime.mounts.configuredMounts.size, 0);
  assert.ok(f.runtime.mounts.retiredRoots.has(f.localDir));
});

test('failed inactive config removal restores metadata without activating its route', async t => {
  const f = fixture(t);
  f.runtime.mounts.put({ ...f.runtime.mounts.list()[0], source: 'config' }); f.runtime.mounts.save();
  f.runtime.mounts = new MountTable({ storageFile: f.runtime.mounts.storageFile }).load();
  const save = f.runtime.mounts.save.bind(f.runtime.mounts); let fail = true;
  f.runtime.mounts.save = () => { if (fail) { fail = false; throw new Error('disk full'); } save(); };
  await assert.rejects(() => f.runtime.removeWorkspace(f.localDir), /disk full/);
  assert.equal(f.runtime.mounts.list().length, 0); assert.ok(f.runtime.mounts.configuredMounts.has(f.localDir));
  assert.ok(!f.runtime.mounts.retiredRoots.has(f.localDir));
  assert.deepEqual([...f.archived], ['already-archived']); assert.ok(f.pins.has('remote-chat'));
});

test('local deletion is unchanged and plugin unload restores the native method', async t => {
  const f = fixture(t);
  await f.registry.delete('local-workspace'); assert.equal(f.archived.has('local-chat'), false);
  assert.equal(f.runtime.mounts.list().length, 1);
  f.dispose(); assert.equal(f.registry.delete, f.originalDelete); assert.equal(f.runtime.removeWorkspace, undefined);
  await f.registry.delete('remote-workspace'); assert.equal(f.archived.has('remote-chat'), false);
});

test('active work refuses removal before any archive or unmount', async t => {
  const f = fixture(t); f.active.add('old-ungrouped');
  await assert.rejects(() => f.runtime.removeWorkspace(f.localDir), /仍有任务/);
  assert.deepEqual(f.events, []); assert.equal(f.runtime.mounts.list().length, 1);
  assert.deepEqual([...f.archived], ['already-archived']); assert.ok(f.pins.has('remote-chat'));
});

test('failed archive rolls back only newly archived chats and restores pins', async t => {
  const f = fixture(t); const archive = f.registry.archiveSession;
  f.registry.archiveSession = async id => { if (id === 'old-ungrouped') throw new Error('archive write failed'); await archive(id); };
  await assert.rejects(() => f.runtime.removeWorkspace(f.localDir), /archive write failed/);
  assert.deepEqual([...f.archived], ['already-archived']); assert.ok(f.pins.has('remote-chat'));
  assert.ok(f.workspaces.has('remote-workspace')); assert.equal(f.runtime.mounts.list().length, 1);
});

test('failed mount persistence preserves workspace registration and archives', async t => {
  const f = fixture(t); const save = f.runtime.mounts.save.bind(f.runtime.mounts); let fail = true;
  f.runtime.mounts.save = () => { if (fail) { fail = false; throw new Error('disk full'); } save(); };
  await assert.rejects(() => f.runtime.removeWorkspace(f.localDir), /disk full/);
  assert.ok(f.workspaces.has('remote-workspace')); assert.equal(f.runtime.mounts.list().length, 1);
  assert.deepEqual([...f.archived], ['already-archived']); assert.ok(f.pins.has('remote-chat'));
});

test('failed native deletion restores remote routing and archive state', async t => {
  const f = fixture(t); f.dispose();
  f.registry.delete = async () => { throw new Error('registry write failed'); };
  const dispose = installWorkspaceRemoval(f.ctx, f.runtime); t.after(dispose);
  await assert.rejects(() => f.runtime.removeWorkspace(f.localDir), /registry write failed/);
  assert.equal(f.runtime.mounts.list().length, 1);
  assert.equal(new MountTable({ storageFile: f.runtime.mounts.storageFile }).load().list().length, 1);
  assert.deepEqual([...f.archived], ['already-archived']); assert.ok(f.pins.has('remote-chat'));
});

test('another workspace sharing the SSH host keeps its control connection', async t => {
  const f = fixture(t);
  f.runtime.mounts.put({ localDir: join(f.localDir, 'other'), alias: 'dev-server', remoteDir: '/other' });
  await f.runtime.removeWorkspace(f.localDir); assert.equal(f.events.some(([kind]) => kind === 'close'), false);
});

test('unknown paths and simultaneous connection changes are refused', async t => {
  const f = fixture(t);
  await assert.rejects(() => f.runtime.removeWorkspace('/unknown'), /找不到/);
  f.runtime.workspaceBusy.add(f.localDir);
  await assert.rejects(() => f.runtime.removeWorkspace(f.localDir), /其他操作/);
  assert.deepEqual(f.events, []);
});

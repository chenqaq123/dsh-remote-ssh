/** Remote workspace removal joins Harness registrations, archives and mounts. */
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

const canonical = (path) => {
  try { return realpathSync(path); } catch { return resolve(path); }
};

export function installWorkspaceRemoval(ctx, runtime) {
  const registry = ctx.workspaceRegistry;
  const originalDelete = registry.delete;
  const descriptor = Object.getOwnPropertyDescriptor(registry, 'delete');
  const busy = runtime.workspaceBusy ??= new Set();
  const knownRoot = (path) => {
    if (typeof path !== 'string') return undefined;
    const target = canonical(path);
    return [...runtime.mounts.mounts.keys(), ...runtime.mounts.retiredRoots]
      .find((root) => canonical(root) === target);
  };

  async function remove(localPath) {
    const root = knownRoot(localPath);
    if (!root) throw new Error('找不到这个远程工作区，请刷新后重试。');
    if (busy.has(root)) throw new Error('这个工作区正在处理其他操作，请稍后重试。');
    busy.add(root);
    const mount = runtime.mounts.mounts.get(root);
    const newlyArchived = [];
    const previousPins = [...registry.pinnedSessionIds];
    let mountRemoved = false;
    try {
      const path = canonical(root);
      const workspace = registry.list().find((entry) => canonical(entry.path) === path);
      // Old native deletions leave sessions ungrouped. Recover their ownership
      // from stored/live cwd, never by title or by a remote path shared by hosts.
      const headers = (await ctx.sessionPersistence.list()).map((entry) => entry.header);
      const live = ctx.get('sessions')?.list() ?? [];
      const ids = new Set(workspace?.sessionIds ?? []);
      const currentHeaders = new Map([...headers, ...live.map((entry) => entry.header)].map((header) => [header.id, header]));
      for (const header of currentHeaders.values()) {
        if (typeof header?.cwd === 'string' && canonical(header.cwd) === path) ids.add(header.id);
      }
      const archived = new Set(registry.archivedSessionIds);
      // Preflight the whole group so a running session does not leave an earlier
      // session archived. archiveSession checks again at its own write boundary.
      for (const sessionId of ids) {
        if (archived.has(sessionId)) continue;
        const activity = await ctx.waterfall('workspace/session-activity', { sessionId }, () => Promise.resolve([]));
        if (activity.length) throw new Error('工作区中仍有任务在运行，请先结束任务，再移除工作区。');
      }
      for (const sessionId of ids) {
        if (archived.has(sessionId)) continue;
        await registry.archiveSession(sessionId);
        newlyArchived.push(sessionId);
      }
      // Persist the routing guard before deleting the registration. If the
      // registry write fails, restore both the mapping and archive changes.
      if (mount) {
        runtime.mounts.remove(root); mountRemoved = true;
        runtime.mounts.save();
      }
      if (workspace) await originalDelete.call(registry, workspace.id);
      if (mount && !runtime.mounts.list().some((entry) => entry.alias === mount.alias)) {
        try { await runtime.runner.close(runtime.targetOf(mount.alias)); } catch { /* Removal is already durable; socket cleanup is best effort. */ }
      }
      return { removed: true, localDir: root, archivedSessionIds: [...ids] };
    } catch (error) {
      const failures = [];
      if (mountRemoved) {
        runtime.mounts.put(mount);
        try { runtime.mounts.save(); } catch (e) { failures.push(e); }
      }
      for (const id of newlyArchived.reverse()) {
        try { await registry.unarchiveSession(id); } catch (e) { failures.push(e); }
      }
      for (const id of previousPins.slice().reverse()) {
        if (!newlyArchived.includes(id)) continue;
        try { await registry.pinSession(id); } catch (e) { failures.push(e); }
      }
      if (failures.length) throw new AggregateError([error, ...failures], '移除未完成，恢复工作区状态时发生错误，请刷新后重试。');
      if (error?.name === 'WorkspaceActiveSessionError') {
        throw new Error('工作区中仍有任务在运行，请先结束任务，再移除工作区。', { cause: error });
      }
      throw error;
    } finally { busy.delete(root); }
  }

  // Harness rc.2 has no before-delete hook. Wrap only this service instance's
  // public method so native sidebar deletion also handles remote mounts. Local
  // workspaces delegate unchanged. Restore the method when the plugin unloads.
  const routedDelete = function (id) {
    const workspace = registry.get(id);
    const root = workspace && knownRoot(workspace.path);
    return root ? remove(root).then(() => true) : originalDelete.call(this, id);
  };
  registry.delete = routedDelete;
  runtime.removeWorkspace = remove;
  return () => {
    // Cordis returns a fresh callable proxy on every property read. Compare the
    // stored descriptor instead of a proxied method when restoring this hook.
    if (Object.getOwnPropertyDescriptor(registry, 'delete')?.value === routedDelete) {
      if (descriptor) Object.defineProperty(registry, 'delete', descriptor);
      else delete registry.delete;
    }
    if (runtime.removeWorkspace === remove) delete runtime.removeWorkspace;
  };
}

/**
 * Server → workspace → conversation tree for the remote sidebar and panel.
 *
 * Mounts remain the durable store; the tree is derived on every refresh from
 * `workspaceActions.list()` plus the registry/persistence projections, so it
 * can never disagree with the removal or recovery flows that read the same
 * sources.
 *
 * @module dsh-ssh-remote/workspace-tree
 */

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

/** Connection status ranks highest first: a live server shows 可连接; per-workspace errors render on their own cards. */
const STATUS_RANK = { connected: 3, error: 2, saved: 1, disconnected: 0 };

/**
 * Build the remote workspace tree.
 * @param runtime - the plugin runtime (ctx, config, mounts, workspaceActions…).
 * @returns `{ servers: [...] }` with workspaces and their conversations nested.
 */
export async function buildWorkspaceTree(runtime) {
  const { ctx } = runtime;
  const canonical = (path) => { try { return realpathSync(path); } catch { return resolve(path); } };

  const entries = runtime.workspaceActions.list();

  const servers = new Map();
  for (const mount of entries) {
    const alias = mount.alias || 'unknown';
    if (!servers.has(alias)) {
      servers.set(alias, { alias, hostname: (mount.hostname || alias).toLowerCase(),
        hasPassword: false, workspaces: [] });
    }
    const server = servers.get(alias);
    if (mount.hasPassword) server.hasPassword = true;
    server.workspaces.push({ ...mount, conversations: [] });
  }

  let persisted = [];
  let live = [];
  try { persisted = await ctx.get?.('sessionPersistence')?.list?.() ?? []; } catch { /* Tree renders without conversations. */ }
  try { live = ctx.get?.('sessions')?.list?.() ?? []; } catch { /* Same. */ }
  const liveIds = new Set(live.map((entry) => entry.header?.id).filter(Boolean));
  const headers = new Map();
  for (const header of [...persisted.map((entry) => entry.header), ...live.map((entry) => entry.header)]) {
    if (typeof header?.cwd === 'string' && header.id) headers.set(header.id, header);
  }
  const archived = new Set(ctx.get?.('workspaceRegistry')?.archivedSessionIds ?? []);
  const pinned = new Set(ctx.get?.('workspaceRegistry')?.pinnedSessionIds ?? []);
  const registered = ctx.get?.('workspaceRegistry')?.list?.() ?? [];

  for (const server of servers.values()) {
    for (const workspace of server.workspaces) {
      if (workspace.orphaned || typeof workspace.localDir !== 'string') continue;
      const root = canonical(workspace.localDir);
      const account = registered.find((w) => canonical(w.path) === root);
      const ordered = [...account?.sessionIds ?? []];
      const ids = new Set(ordered);
      for (const [id, header] of headers) {
        if (!ids.has(id) && canonical(header.cwd) === root) { ids.add(id); ordered.push(id); }
      }
      workspace.conversations = ordered.map((id) => ({ id, cwd: headers.get(id)?.cwd ?? '',
        live: liveIds.has(id), archived: archived.has(id), pinned: pinned.has(id) }));
    }
  }

  return { servers: [...servers.values()].map((server) => {
    const all = server.workspaces;
    const status = all.reduce((best, workspace) => (STATUS_RANK[workspace.status] > STATUS_RANK[best] ? workspace.status : best), 'disconnected');
    const message = all.find((workspace) => workspace.status === 'error')?.message ?? '';
    return { alias: server.alias, hostname: server.hostname, hasPassword: server.hasPassword, status, message,
      workspaces: all };
  }) };
}

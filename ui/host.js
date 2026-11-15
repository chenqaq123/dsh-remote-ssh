/** Desktop RPCs use the harness's existing authenticated Connection/Gateway. */
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browseRemote } from '../lib/browse.js';
import { buildWorkspaceTree } from '../lib/workspace-tree.js';
import { normalizeLocal } from '../lib/mounts.js';

export async function registerSshUi(ctx, host, runtime) {
  const [{ z }, { TypertRemoteService }] = await Promise.all([
    import(pathToFileURL(join(dirname(host.root), 'zod/index.js')).href),
    import(pathToFileURL(join(host.root, 'dsh-typert-protocol/lib/index.js')).href),
  ]);
  class SshRemoteUi extends TypertRemoteService {
    constructor(scope) { super(scope, 'sshRemoteUi'); }
    list() {
      const listing = runtime.ctx.sshRemote.listHosts();
      return { hosts: listing.hosts.map((h) => ({ alias: h.alias, hostname: h.hostname,
        user: h.user ?? '', port: h.port ?? 22, hasPassword: runtime.secrets?.has(h.alias) ?? false })),
        mounts: runtime.workspaceActions.list(), warnings: listing.warnings };
    }
    browse(request, signal) { return browseRemote(runtime, request, signal); }
    connect(request, signal) { return runtime.workspaceActions.connect(request, signal); }
    open(request, signal) { return runtime.workspaceActions.open(request.local_path, signal); }
    check(request, signal) {
      return runtime.workspaceActions.check(request.local_path, signal, { password: request.password });
    }
    disconnect(request) { return runtime.workspaceActions.disconnect(request.local_path); }
    forgetPassword(request) { return { removed: runtime.secrets?.delete(request.host) ?? false }; }
    remove(request) {
      if (!runtime.removeWorkspace) throw new Error('工作区服务尚未就绪，请稍后重试。');
      return runtime.removeWorkspace(request.local_path, { retain: false });
    }
    /** Remove an already archived conversation from the remote sidebar only. */
    forgetSession(request) {
      const localDir = normalizeLocal(request.local_path);
      const registry = runtime.ctx.get?.('workspaceRegistry');
      const workspace = registry?.list().find((entry) => normalizeLocal(entry.path) === localDir);
      if (!workspace?.sessionIds.includes(request.session_id)) throw new Error('会话不属于这个远程工作区。');
      if (!registry.archivedSessionIds.includes(request.session_id)) throw new Error('请先归档会话，再从远程列表移除。');
      const updates = [];
      for (const map of [runtime.mounts.mounts, runtime.mounts.disconnectedMounts, runtime.mounts.configuredMounts]) {
        const previous = map.get(localDir);
        if (previous !== undefined) updates.push({ map, previous });
      }
      if (updates.length === 0) throw new Error('找不到这个远程工作区的映射记录。');
      for (const { map, previous } of updates) map.set(localDir, { ...previous,
        removedSessionIds: [...new Set([...(previous.removedSessionIds ?? []), request.session_id])] });
      try { runtime.mounts.save(); }
      catch (error) { for (const { map, previous } of updates) map.set(localDir, previous); throw error; }
      return { removed: true, sessionId: request.session_id };
    }
    tree() { return buildWorkspaceTree(runtime); }
  }
  new SshRemoteUi(ctx);
  const label = { name: z.string(), hostname: z.string(), title: z.string() };
  const mount = z.object({ alias: z.string(), ...label, remoteDir: z.string(), localDir: z.string(),
    workspaceId: z.string().optional(),
    status: z.enum(['saved', 'connected', 'disconnected', 'error']), checkedAt: z.string().nullable(), message: z.string(),
    hasPassword: z.boolean(), orphaned: z.boolean().optional() });
  const conversationNode = z.object({ id: z.string(), cwd: z.string(), live: z.boolean(),
    archived: z.boolean(), pinned: z.boolean() });
  const workspaceNode = z.object({ alias: z.string(), ...label, remoteDir: z.string(), localDir: z.string(),
    workspaceId: z.string().optional(),
    status: z.enum(['saved', 'connected', 'disconnected', 'error']), checkedAt: z.string().nullable(), message: z.string(),
    hasPassword: z.boolean(), orphaned: z.boolean().optional(),
    conversations: z.array(conversationNode) });
  const serverNode = z.object({ alias: z.string(), hostname: z.string(), hasPassword: z.boolean(),
    status: z.enum(['connected', 'saved', 'disconnected', 'error']), message: z.string(),
    workspaces: z.array(workspaceNode) });
  const pathRequest = z.object({ local_path: z.string().min(1).max(8192) }).strict();
  const password = z.string().min(1).max(512);
  const checkRequest = z.object({ local_path: z.string().min(1).max(8192), password: password.optional() }).strict();
  const definitions = {
    browse: { request: z.object({ host: z.string().min(1).max(512), path: z.string().max(8192).optional(),
      show_hidden: z.boolean().optional(), password: password.optional() }).strict(), cancel: true,
      result: z.object({ path: z.string(), parent: z.string().nullable(), truncated: z.boolean(),
        directories: z.array(z.object({ name: z.string(), path: z.string(), hidden: z.boolean() })) }) },
    list: { result: z.object({ hosts: z.array(z.object({ alias: z.string(), hostname: z.string(),
      user: z.string(), port: z.number(), hasPassword: z.boolean() })), mounts: z.array(mount),
      warnings: z.array(z.string()) }) },
    connect: { request: z.object({ host: z.string().min(1).max(512), remote_path: z.string().min(1).max(8192),
      name: z.string().max(80).optional(), password: password.optional() }).strict(),
      cancel: true, result: z.object({ alias: z.string(), ...label, remoteDir: z.string(), localDir: z.string(),
        banner: z.string() }) },
    open: { request: pathRequest, result: z.object({ workspaceId: z.string() }) },
    check: { request: checkRequest, cancel: true, result: mount },
    forgetPassword: { request: z.object({ host: z.string().min(1).max(512) }).strict(),
      result: z.object({ removed: z.boolean() }) },
    disconnect: { request: pathRequest, result: z.object({ alias: z.string(), remoteDir: z.string(), localDir: z.string(), closed: z.boolean() }) },
    remove: { request: pathRequest, result: z.object({ removed: z.literal(true), localDir: z.string(), archivedSessionIds: z.array(z.string()) }) },
    forgetSession: { request: pathRequest.extend({ session_id: z.string().min(1).max(256) }).strict(),
      result: z.object({ removed: z.literal(true), sessionId: z.string() }) },
    tree: { result: z.object({ servers: z.array(serverNode) }) },
  };
  const codec = (method, kind, schema) => ({ mode: 'strict',
    typeSymbol: `dsh-ssh-remote-ui#${method}:${kind}`, create: () => schema });
  ctx.typert.register({ package: 'dsh-ssh-remote-ui', face: 'host', schemas: [],
    invocations: Object.entries(definitions).map(([method, def]) => ({
      id: `dsh-ssh-remote-ui#sshRemoteUi/${method}`, service: 'sshRemoteUi', namespace: 'sshRemoteUi', method,
      invocation: { kind: 'direct' }, parameters: def.request
        ? [{ name: 'request', wire: 'request', source: 'json', codec: codec(method, 'request', def.request) }] : [],
      ...(def.cancel ? { cancellation: { parameter: 'signal' } } : {}),
      result: codec(method, 'result', def.result),
    })), model: { services: [], events: [], objects: [] } });
}

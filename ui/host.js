/** Desktop RPCs use the harness's existing authenticated Connection/Gateway. */
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browseRemote } from '../lib/browse.js';

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
        user: h.user ?? '', port: h.port ?? 22 })),
        mounts: runtime.workspaceActions.list(), warnings: listing.warnings };
    }
    browse(request, signal) { return browseRemote(runtime, request, signal); }
    connect(request, signal) { return runtime.workspaceActions.connect(request, signal); }
    open(request, signal) { return runtime.workspaceActions.open(request.local_path, signal); }
    check(request, signal) { return runtime.workspaceActions.check(request.local_path, signal); }
    disconnect(request) { return runtime.workspaceActions.disconnect(request.local_path); }
    remove(request) {
      if (!runtime.removeWorkspace) throw new Error('工作区服务尚未就绪，请稍后重试。');
      return runtime.removeWorkspace(request.local_path);
    }
  }
  new SshRemoteUi(ctx);
  const label = { name: z.string(), hostname: z.string(), title: z.string() };
  const mount = z.object({ alias: z.string(), ...label, remoteDir: z.string(), localDir: z.string(),
    workspaceId: z.string().optional(),
    status: z.enum(['saved', 'connected', 'error']), checkedAt: z.string().nullable(), message: z.string() });
  const pathRequest = z.object({ local_path: z.string().min(1).max(8192) }).strict();
  const definitions = {
    browse: { request: z.object({ host: z.string().min(1).max(512), path: z.string().max(8192).optional(),
      show_hidden: z.boolean().optional() }).strict(), cancel: true,
      result: z.object({ path: z.string(), parent: z.string().nullable(), truncated: z.boolean(),
        directories: z.array(z.object({ name: z.string(), path: z.string(), hidden: z.boolean() })) }) },
    list: { result: z.object({ hosts: z.array(z.object({ alias: z.string(), hostname: z.string(),
      user: z.string(), port: z.number() })), mounts: z.array(mount), warnings: z.array(z.string()) }) },
    connect: { request: z.object({ host: z.string().min(1).max(512), remote_path: z.string().min(1).max(8192), name: z.string().max(80).optional() }).strict(),
      cancel: true, result: z.object({ alias: z.string(), ...label, remoteDir: z.string(), localDir: z.string(), banner: z.string() }) },
    open: { request: pathRequest, result: z.object({ workspaceId: z.string() }) },
    check: { request: pathRequest, cancel: true, result: mount },
    disconnect: { request: pathRequest, result: z.object({ alias: z.string(), remoteDir: z.string(), localDir: z.string(), closed: z.boolean() }) },
    remove: { request: pathRequest, result: z.object({ removed: z.literal(true), localDir: z.string(), archivedSessionIds: z.array(z.string()) }) },
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

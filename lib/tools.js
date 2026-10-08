/**
 * Model-facing tools for discovering SSH servers and mounting remote workspaces.
 *
 * These are the only tools this plugin registers. Everything else the agent does —
 * reading, editing, searching, running commands — keeps using the harness's normal
 * `read`/`write`/`edit`/`glob`/`grep`/`bash` tools, which simply land on the remote
 * host once a workspace is mounted.
 *
 * @module dsh-ssh-remote/tools
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { listHosts } from './ssh-config.js';

/** The harness home, used for persistence and mirror directories. */
export function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh');
}

/**
 * Register the SSH tools.
 * @param ctx - registrant context carrying `ctx.tools`.
 * @param host - loaded host modules (`tools`).
 * @param runtime - shared plugin runtime.
 */
export function registerTools(ctx, host, runtime) {
  const { defineTool } = host.tools;
  const config = runtime.config;

  ctx.tools.register(defineTool({
    name: 'ssh_hosts',
    description:
      'List the remote servers defined in the SSH configuration (~/.ssh/config and any Include files), '
      + 'together with the remote workspaces currently mounted. Use this before ssh_mount to discover a '
      + 'usable host alias.',
    parameters: {
      show_patterns: {
        type: 'boolean',
        description: 'Also list wildcard/pattern-only Host entries, which cannot be used as a mount target.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const listing = listHosts({ paths: config.sshConfigPaths, extraHosts: config.hosts });
      const lines = [];
      lines.push(`SSH config: ${listing.configPaths.length > 0 ? listing.configPaths.join(', ') : '(none found)'}`);
      if (listing.hosts.length === 0) {
        lines.push('No concrete Host entries found. Add one to ~/.ssh/config or set plugin config `hosts`.');
      } else {
        lines.push('', 'Hosts:');
        for (const entry of listing.hosts) {
          const target = `${entry.user === undefined ? '' : `${entry.user}@`}${entry.hostname}${entry.port === undefined ? '' : `:${entry.port}`}`;
          const extras = [
            entry.identityFile === undefined ? undefined : `key=${entry.identityFile}`,
            entry.proxyJump === undefined ? undefined : `proxyjump=${entry.proxyJump}`,
          ].filter((part) => part !== undefined);
          lines.push(`- ${entry.alias} -> ${target}${extras.length > 0 ? `  ${extras.join(' ')}` : ''}`);
        }
      }
      if (args.show_patterns === true && listing.patterns.length > 0) {
        lines.push('', `Pattern-only entries (not mountable directly): ${listing.patterns.join(', ')}`);
      }
      for (const warning of listing.warnings) lines.push(`warning: ${warning}`);

      const mounts = runtime.mounts.list();
      lines.push('', mounts.length === 0 ? 'Mounted remote workspaces: none.' : 'Mounted remote workspaces (newest first):');
      for (const mount of mounts) {
        lines.push(`- ${mount.localDir}  =>  ${mount.alias}:${mount.remoteDir}`);
      }
      if (mounts.length === 0) {
        lines.push('Call ssh_mount with a host alias and a remote directory to create one.');
      }
      return lines.join('\n');
    },
  }));

  ctx.tools.register(defineTool({
    name: 'ssh_mount',
    description:
      'Mount a directory on a remote SSH server as a workspace. File and bash operations whose working '
      + 'directory uses the returned local workspace path run on that remote host. '
      + 'Returns the local path that represents the remote directory; open a session on that path to work there. '
      + 'Requires key-based (non-interactive) SSH authentication.',
    parameters: {
      host: {
        type: 'string',
        required: true,
        description: 'SSH host alias from ~/.ssh/config (as used by `ssh <alias>`), or a literal user@hostname.',
      },
      remote_path: {
        type: 'string',
        required: true,
        description: 'Absolute directory on the remote host, e.g. /home/me/project.',
      },
      local_path: {
        type: 'string',
        description: 'Local directory to represent the remote directory. Defaults to a path under the plugin mirror root.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const mounted = await runtime.workspaceActions.connect(args, exec.signal);
      const { alias, remoteDir: remotePath, localDir, banner } = mounted;

      return [
        `Mounted ${alias}:${remotePath}`,
        `Remote: ${banner}`,
        `Local workspace path: ${localDir}`,
        '',
        'The mount is ready. This does not change the current session workspace.',
        `Open a session whose workspace is ${localDir} to work in that directory, `
        + 'or pass that path explicitly as the working directory.',
      ].join('\n');
    },
  }));

  ctx.tools.register(defineTool({
    name: 'ssh_unmount',
    description:
      'Remove a mounted remote workspace and close its multiplexed SSH connection. The remote files are never '
      + 'touched; only the local mapping and the persistent registration are removed.',
    parameters: {
      local_path: {
        type: 'string',
        required: true,
        description: 'The local workspace path returned by ssh_mount.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const localDir = String(args.local_path);
      const mount = await runtime.workspaceActions.disconnect(localDir);
      const { closed } = mount;

      return `Unmounted ${localDir} (was ${mount.alias}:${mount.remoteDir}). `
        + `SSH master connection ${closed ? 'closed' : 'left as-is'}.`;
    },
  }));
}

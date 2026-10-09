/** User-facing names stay separate from the local routing directory. */
import { basename, posix } from 'node:path';

export function normalizeWorkspaceName(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 80 || /[\x00-\x1f\x7f]/u.test(value)) {
    throw new Error('工作区名称请使用不超过 80 个字符的单行文字。');
  }
  return value.trim() || undefined;
}

export function workspaceLabels(mount) {
  const hostname = mount.hostname || mount.alias;
  const name = mount.name || posix.basename(mount.remoteDir) || mount.alias;
  return { name, hostname, title: `${name} · SSH ${hostname}` };
}

export function isAutomaticTitle(workspace, mount) {
  return workspace.title === basename(mount.localDir) || workspace.title === mount.workspaceTitle;
}

/** User-facing names stay separate from the local routing directory. */
import { basename, posix } from 'node:path';
import { isIP } from 'node:net';

export function normalizeWorkspaceName(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 80 || /[\x00-\x1f\x7f]/u.test(value)) {
    throw new Error('工作区名称请使用不超过 80 个字符的单行文字。');
  }
  return value.trim() || undefined;
}

export function workspaceLabels(mount) {
  const alias = mount.alias.split('@').pop();
  const hostname = (isIP(alias) ? mount.remoteHostname || mount.hostname || alias : alias).toLowerCase();
  const name = mount.name || posix.basename(mount.remoteDir) || mount.alias;
  return { name, hostname, title: `${name} · ${hostname}` };
}

/** The helper reports the machine's hostname, independently of its SSH address. */
export function remoteHostnameFromBanner(banner) {
  const hostname = /(?:^|\s)host=([a-z\d][a-z\d._-]*)(?=\s|$)/iu.exec(banner)?.[1].toLowerCase();
  return hostname === 'unknown' ? undefined : hostname;
}

/** Preserve native renames while removing only this mount's managed suffix. */
export function workspaceNameFromTitle(title, mount) {
  const { hostname } = workspaceLabels(mount);
  const suffixes = [
    ` · ${hostname}`,
    ` 🟢 ${hostname}`,
    ` 🟢 ${mount.hostname || mount.alias}`,
    ` · SSH ${mount.hostname || mount.alias}`,
    ` · SSH ${hostname}`,
    mount.workspaceTitle?.match(/(?: · SSH | 🟢 | · )\S+$/u)?.[0],
  ];
  const suffix = suffixes.find(value => value && title.endsWith(value));
  return suffix ? title.slice(0, -suffix.length) : title;
}

export function isAutomaticTitle(workspace, mount) {
  return workspace.title === basename(mount.localDir) || workspace.title === mount.workspaceTitle;
}

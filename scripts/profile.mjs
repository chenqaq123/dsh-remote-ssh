#!/usr/bin/env node
/** Install a stable checkout/package into a Harness profile without dependencies. */
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync, copyFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const begin = '# >>> dsh-ssh-remote (managed by scripts/profile.mjs) >>>';
const end = '# <<< dsh-ssh-remote <<<';
const managed = /^# >>> dsh-ssh-remote[^\n]*\n[\s\S]*?^# <<< dsh-ssh-remote <<<[^\n]*(?:\n|$)/gm;

export function updateProfile(action, profile = 'desktop', base = process.env.DSH_HOME ?? join(homedir(), '.dsh'), pluginDir = source) {
  if (!['install', 'uninstall'].includes(action)) throw new Error('Usage: dsh-ssh-remote <install|uninstall> [profile]');
  if (action === 'install' && process.platform === 'win32') throw new Error('This plugin currently supports macOS and Linux; Windows/Pwsh is not supported.');
  if (!/^[\w.-]+$/u.test(profile) || profile === '.' || profile === '..') throw new Error('Invalid profile name');
  const dir = join(base, 'profiles', profile);
  if (!existsSync(dir)) throw new Error(`Profile does not exist: ${dir}. Open Harness once before installing.`);
  const patch = join(dir, 'cordis.patch.yml');
  const link = join(dir, 'plugins', 'dsh-ssh-remote');
  const original = existsSync(patch) ? readFileSync(patch, 'utf8') : '';
  const blocks = [...original.matchAll(managed)];
  if (blocks.length > 1 || (original.includes('# >>> dsh-ssh-remote') && blocks.length === 0)) throw new Error('Malformed managed block; restore a backup first.');
  if (!blocks.length && /id:\s*['"]?ssh-remote\b/u.test(original)) throw new Error('An unmanaged ssh-remote entry already exists; no changes made.');
  let previousLink;
  try {
    if (!lstatSync(link).isSymbolicLink()) throw new Error(`Refusing to replace a real directory: ${link}`);
    previousLink = readlinkSync(link);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const template = readFileSync(join(pluginDir, 'cordis.patch.yml'), 'utf8')
    .replace("name: 'dsh-ssh-remote'", "name: './plugins/dsh-ssh-remote/index.js'");
  // Reinstall preserves the complete block, including user-edited configuration.
  const next = action === 'uninstall' ? original.replace(managed, '') : blocks.length ? original
    : `${original}${original.endsWith('\n') || !original ? '' : '\n'}\n${begin}\n${template}${end}\n`;
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  let backup;
  if (next !== original && existsSync(patch)) { backup = `${patch}.${suffix}.bak`; copyFileSync(patch, backup); }
  const tempPatch = `${patch}.${suffix}.tmp`, tempLink = `${link}.${suffix}.tmp`;
  mkdirSync(dirname(link), { recursive: true });
  try {
    if (action === 'install') { symlinkSync(pluginDir, tempLink, 'dir'); renameSync(tempLink, link); }
    else if (previousLink !== undefined) rmSync(link);
    if (next !== original) { writeFileSync(tempPatch, next, { mode: 0o600 }); renameSync(tempPatch, patch); }
  } catch (error) {
    rmSync(link, { force: true });
    if (previousLink !== undefined) symlinkSync(previousLink, link, 'dir');
    throw error;
  } finally { rmSync(tempLink, { force: true }); rmSync(tempPatch, { force: true }); }
  return { profile: dir, source: pluginDir, backup, action };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = updateProfile(process.argv[2], process.argv[3] ?? process.env.DSH_PROFILE ?? 'desktop');
    console.log(`${result.action === 'install' ? 'Installed' : 'Uninstalled'} dsh-ssh-remote: ${result.profile}`);
    if (result.backup) console.log(`Backup: ${result.backup}`);
    console.log('Restart DeepSeek Harness. Remote files and saved mount data are preserved.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

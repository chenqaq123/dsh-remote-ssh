import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readlinkSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateProfile } from '../scripts/profile.mjs';

test('install/update/uninstall preserves profile settings, backups and workspace data', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-install-test-'));
  try {
    const profile = join(root, 'profiles', 'desktop'); mkdirSync(profile, { recursive: true });
    const patch = join(profile, 'cordis.patch.yml'); writeFileSync(patch, '# unrelated plugin\n- id: other\n  disabled: false\n');
    const original = readFileSync(patch, 'utf8');
    const first = updateProfile('install', 'desktop', root);
    assert.equal(readFileSync(first.backup, 'utf8'), original);
    assert.equal(readlinkSync(join(profile, 'plugins', 'dsh-ssh-remote')), fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/u, ''));
    assert.match(readFileSync(patch, 'utf8'), /name: '.\/plugins\/dsh-ssh-remote\/index.js'/);
    const custom = readFileSync(patch, 'utf8').replace('hosts: []', 'hosts: [dev-server]'); writeFileSync(patch, custom);
    updateProfile('install', 'desktop', root); assert.equal(readFileSync(patch, 'utf8'), custom);
    assert.equal(readdirSync(profile).filter((f) => f.endsWith('.bak')).length, 1);
    const mounts = join(root, 'mounts.json'); writeFileSync(mounts, 'preserve me');
    updateProfile('uninstall', 'desktop', root);
    assert.equal(readFileSync(patch, 'utf8').trim(), original.trim());
    assert.equal(readFileSync(mounts, 'utf8'), 'preserve me');
    assert.equal(existsSync(join(profile, 'plugins', 'dsh-ssh-remote')), false);
    updateProfile('uninstall', 'desktop', root);
    assert.throws(() => updateProfile('install', '../escape', root), /Invalid/);
    mkdirSync(join(profile, 'plugins', 'dsh-ssh-remote'));
    assert.throws(() => updateProfile('install', 'desktop', root), /real directory/);
    assert.equal(readFileSync(patch, 'utf8').trim(), original.trim());
  } finally { rmSync(root, { recursive: true, force: true }); }
});

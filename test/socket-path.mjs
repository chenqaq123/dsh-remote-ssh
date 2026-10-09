import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { lstatSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import { SshRunner } from '../lib/ssh-runner.js';

test('a long macOS TMPDIR does not leak into ControlPath', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { SshRunner } from ${JSON.stringify(new URL('../lib/ssh-runner.js', import.meta.url).href)};
    const runner = new SshRunner({ multiplex: true });
    process.stdout.write(runner.socketPath({ destination: 'test.invalid' }));
  `], { encoding: 'utf8', env: { ...process.env, TMPDIR: '/var/folders/example/' + 'long-temp-directory/'.repeat(10) } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^\/tmp\/dsh-ssh-\w+\/cm-[0-9a-f]{16}$/u);
  // BSD sun_path is 104 bytes including its terminator; OpenSSH adds 17 bytes.
  assert.ok(Buffer.byteLength(result.stdout) + 17 < 104);
  const stat = lstatSync(dirname(result.stdout));
  assert.ok(stat.isDirectory()); assert.equal(stat.mode & 0o777, 0o700);
  assert.equal(stat.uid, process.getuid());
});

test('the OS can bind an OpenSSH-style temporary listener at the generated path', async () => {
  const runner = new SshRunner({ multiplex: true });
  const socket = runner.socketPath({ destination: `test-${randomBytes(8).toString('hex')}.invalid` });
  const path = socket + '.' + randomBytes(8).toString('hex');
  const server = createServer();
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(path, resolve); });
    assert.equal(server.listening, true);
  } finally {
    if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('different destinations and configs retain separate short control sockets', () => {
  const runner = new SshRunner({ multiplex: true, sshConfigPaths: ['/tmp/a.conf'] });
  const other = new SshRunner({ multiplex: true, sshConfigPaths: ['/tmp/b.conf'] });
  assert.notEqual(runner.socketPath({ destination: 'a' }), runner.socketPath({ destination: 'b' }));
  assert.notEqual(runner.socketPath({ destination: 'a' }), other.socketPath({ destination: 'a' }));
  assert.equal(new SshRunner({ multiplex: false }).socketPath({ destination: 'a' }), undefined);
});

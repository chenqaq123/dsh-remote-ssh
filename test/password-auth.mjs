/**
 * Password authentication, end to end, with the real OpenSSH client.
 *
 * The plugin never speaks SSH itself: it spawns `ssh` and lets OpenSSH do the
 * authentication, so the only honest way to prove that a stored password works is
 * to point a real client at a server that accepts nothing else. That server is
 * `ssh2` here, with exec requests handed to the local shell, so the plugin's
 * remote helper runs exactly as it would on a real host.
 *
 * The suite also pins the properties the feature rests on: the password never
 * appears in an argv, it is sent only while a connection is being authenticated,
 * and every later operation rides the multiplexed master connection.
 *
 * Usage: node test/password-auth.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isPasswordRequired, stripMarker } from '../lib/auth.js';
import { SecretStore } from '../lib/secrets.js';
import { describeHost, parseSshConfig } from '../lib/ssh-config.js';
import { SshRunner, targetFor } from '../lib/ssh-runner.js';

const PASSWORD = 'correct horse battery staple';
const USER = 'tester';
// ssh2 is a development dependency; a checkout without devDependencies simply
// reports the suite as skipped instead of failing.
const ssh2 = await import('ssh2').then((module) => module.default).catch(() => undefined);
const skip = ssh2 === undefined ? 'ssh2 is not installed; run npm install first' : false;

/**
 * One SSH server that authenticates exactly one account, one way.
 *
 * @param options - the host key, the accepted method, and the password.
 * @returns the server, its port, an authentication counter, and a closer.
 */
async function startServer({ hostKey, method = 'password', password = PASSWORD } = {}) {
  const state = { authentications: 0, methods: [] };
  const server = new ssh2.Server({ hostKeys: [hostKey] }, (client) => {
    client.on('error', () => {});
    client.on('authentication', (auth) => {
      state.methods.push(auth.method);
      if (auth.username !== USER || auth.method !== method) { auth.reject([method]); return; }
      const accept = () => { state.authentications += 1; auth.accept(); };
      if (method === 'keyboard-interactive') {
        // One hidden prompt, answered the way a terminal would answer it.
        auth.prompt([{ prompt: `${USER}@127.0.0.1's password: `, echo: false }], 'ssh-remote test', '',
          (answers) => { if (answers[0] === password) accept(); else auth.reject([method]); });
        return;
      }
      if (method === 'password' && auth.password === password) accept();
      else auth.reject([method]);
    });
    client.on('ready', () => {
      client.on('session', (acceptSession) => {
        const session = acceptSession();
        session.on('exec', (acceptExec, _rejectExec, info) => {
          const stream = acceptExec();
          const child = spawn('sh', ['-c', info.command]);
          stream.on('error', () => {});
          child.stdin.on('error', () => {});
          child.stdout.on('data', (chunk) => stream.write(chunk));
          child.stderr.on('data', (chunk) => stream.stderr.write(chunk));
          stream.on('data', (chunk) => child.stdin.write(chunk));
          stream.on('end', () => child.stdin.end());
          child.on('close', (code) => { stream.exit(code ?? 1); stream.end(); });
        });
      });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    state,
    port: server.address().port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Write an SSH config naming both test servers, plus a throwaway client key so
 * the client offers a key first — the way a real password host behaves.
 */
function writeConfig(dir, hosts) {
  const path = join(dir, 'ssh_config');
  const key = join(dir, 'id_ed25519');
  spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key], { stdio: 'ignore' });
  const blocks = Object.entries(hosts).map(([alias, port]) => [
    `Host ${alias}`, '  HostName 127.0.0.1', `  Port ${port}`, `  User ${USER}`,
    `  IdentityFile ${key}`, '  IdentityAgent none', '  IdentitiesOnly yes',
    `  UserKnownHostsFile ${join(dir, `known_hosts-${alias}`)}`, '  StrictHostKeyChecking accept-new',
  ].join('\n'));
  writeFileSync(path, `${blocks.join('\n\n')}\n`);
  return path;
}

test('password authentication over a real ssh client', { skip }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-password-auth-'));
  // A real host key in OpenSSH's own format, exactly like a server's.
  const hostKey = join(dir, 'host_ed25519');
  spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', hostKey], { stdio: 'ignore' });
  const hostKeyPem = readFileSync(hostKey);
  const password = await startServer({ hostKey: hostKeyPem });
  const keyOnly = await startServer({ hostKey: hostKeyPem, method: 'publickey' });
  const interactive = await startServer({ hostKey: hostKeyPem, method: 'keyboard-interactive' });
  t.after(async () => {
    await password.close();
    await keyOnly.close();
    await interactive.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const configPath = writeConfig(dir, { 'pw-host': password.port, 'pw-keyonly': keyOnly.port, 'pw-touch': interactive.port });
  const blocks = parseSshConfig([configPath]).blocks;
  const secrets = new SecretStore({ file: join(dir, 'secrets.json') });
  const runner = new SshRunner({
    sshBinary: 'ssh',
    sshConfigPaths: [configPath],
    batchMode: true,
    connectTimeoutSec: 5,
    controlPersistSec: 10,
    multiplex: true,
    strictHostKeyChecking: 'accept-new',
    extraSshArgs: [],
    operationTimeoutMs: 10_000,
  }, secrets);
  const target = (alias) => targetFor(describeHost(blocks, alias), { alias });

  await t.test('a server that only offers a password is reported as needing one', async () => {
    await assert.rejects(() => runner.hello(target('pw-host')), (error) => {
      assert.ok(isPasswordRequired(error), `expected a password request, got: ${error.message}`);
      assert.doesNotMatch(stripMarker(error.message), /ssh-password-required/u);
      assert.match(error.message, /需要密码认证/u);
      return true;
    });
    assert.equal(secrets.has('pw-host'), false);
  });

  await t.test('a key-only server keeps failing with the plain diagnostic', async () => {
    await assert.rejects(() => runner.hello(target('pw-keyonly')), (error) => {
      assert.equal(isPasswordRequired(error), false, `a key-only host must not ask for a password: ${error.message}`);
      assert.match(error.message, /Permission denied \(publickey\)/u);
      return true;
    });
  });

  await t.test('a stored password authenticates, and every later operation reuses the master', async () => {
    secrets.set('pw-host', PASSWORD);
    assert.equal(statSync(secrets.file).mode & 0o777, 0o600);
    assert.match(await runner.hello(target('pw-host')), /host=.*kernel=/u);
    for (let index = 0; index < 3; index += 1) {
      const result = await runner.run({ target: target('pw-host'), op: 'stat', args: [dir] });
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout.toString('utf8'), /^#S d /u);
    }
    assert.equal(password.state.authentications, 1, 'only the master connection should authenticate');
  });

  await t.test('the password never reaches the argument vector or the helper on disk', () => {
    const argv = runner.argv(target('pw-host'), 'true');
    assert.ok(argv.includes('NumberOfPasswordPrompts=1'));
    assert.ok(argv.includes('BatchMode=no'), 'a password host cannot use batch mode');
    assert.ok(!argv.join('\n').includes(PASSWORD));
    assert.ok(!argv.join('\n').includes('sshpass'));
    const helper = runner.askpassEnv(target('pw-host')).SSH_ASKPASS;
    assert.equal(statSync(helper).mode & 0o777, 0o700);
    assert.ok(!readFileSync(helper, 'utf8').includes(PASSWORD));
    assert.deepEqual(runner.askpassEnv(target('pw-keyonly')), {}, 'hosts without a stored password stay untouched');
  });

  await t.test('a rejected password fails with a clear error instead of hanging', async () => {
    await runner.close(target('pw-host'));
    secrets.set('pw-host', 'not the password');
    const started = Date.now();
    await assert.rejects(() => runner.hello(target('pw-host')), (error) => {
      assert.ok(isPasswordRequired(error), `expected a password complaint, got: ${error.message}`);
      assert.match(error.message, /认证失败/u);
      return true;
    });
    assert.ok(Date.now() - started < 10_000, 'a rejected password must fail fast');
  });

  await t.test('a closed master re-authenticates from the store without prompting', async () => {
    const before = password.state.authentications;
    secrets.set('pw-host', PASSWORD);
    assert.match(await runner.hello(target('pw-host')), /host=/u);
    assert.equal(password.state.authentications, before + 1, 'the stored password must be replayed');
    await runner.close(target('pw-host'));
  });

  await t.test('keyboard-interactive servers are answered with the same password', async () => {
    secrets.set('pw-touch', PASSWORD);
    assert.match(await runner.hello(target('pw-touch')), /host=/u);
    assert.ok(interactive.state.methods.includes('keyboard-interactive'));
    await runner.close(target('pw-touch'));
  });
});

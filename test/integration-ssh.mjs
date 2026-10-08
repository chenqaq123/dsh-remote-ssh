/**
 * Integration test against a real SSH server.
 *
 * Exercises the same primitives the FileSystem backend uses, but through the real
 * `ssh` binary, so quoting, sshd's command handling, connection multiplexing, exit
 * codes, and byte fidelity are all validated for real.
 *
 * Usage: node test/integration-ssh.mjs [host-alias-or-user@host]
 */

import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { parseListPayload, parseStatHeader, parseWriteHeader, splitFramed } from '../lib/remote-protocol.js';
import { SshRunner, targetFor } from '../lib/ssh-runner.js';

const destination = process.argv[2];
if (!destination) throw new Error('Pass an explicit SSH test host; fixtures are created under remote /tmp');
const at = destination.indexOf('@');
const host = at === -1
  ? { alias: destination, hostname: destination }
  : { alias: destination.slice(at + 1), hostname: destination.slice(at + 1), user: destination.slice(0, at) };
const target = targetFor(host, at === -1 ? { alias: destination } : { destination });

const runner = new SshRunner({
  sshBinary: 'ssh',
  batchMode: true,
  connectTimeoutSec: 10,
  controlPersistSec: 120,
  multiplex: true,
  strictHostKeyChecking: 'accept-new',
  extraSshArgs: [],
});

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}\n       ${error.message}`);
  }
}

function call(op, args, options = {}) {
  return runner.run({ target, op, args, ...options });
}

/** Run a raw command remotely, for test fixture setup only. */
function raw(command) {
  const result = spawnSync('ssh', ['-T', '-o', 'BatchMode=yes', '-o', `ControlPath=${runner.socketPath(target)}`, destination, command], {
    encoding: 'utf8',
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const base = `/tmp/dsh-ssh-remote-it-${stamp}`;

console.log(`Integration test against ${destination} (${base})\n`);

console.log('connection');
await test('hello reports remote facts', async () => {
  const banner = await runner.hello(target);
  assert.match(banner, /host=.* kernel=/u);
  console.log(`       ${banner}`);
});

const setup = raw(`mkdir -p ${base}/sub && printf 'alpha\\n' > ${base}/plain.txt && printf 'old\\n' > ${base}/edit.txt && printf '\\000\\001\\377' > ${base}/bin.dat`);
if (setup.code !== 0) {
  console.error(`cannot create remote fixtures: ${setup.stderr}`);
  process.exit(1);
}

console.log('\nremote helper over ssh');
await test('stat reports a file', async () => {
  const header = splitFramed((await call('stat', [`${base}/plain.txt`])).stdout).header;
  const info = parseStatHeader(header);
  assert.equal(info.type, 'f');
  assert.equal(info.size, 6);
  assert.match(info.version, /^\d+:\d+:6:\d+:\d+$/u);
});

await test('stat reports a directory', async () => {
  const info = parseStatHeader(splitFramed((await call('stat', [base])).stdout).header);
  assert.equal(info.type, 'd');
});

await test('stat reports absence for a missing path', async () => {
  const info = parseStatHeader(splitFramed((await call('stat', [`${base}/nope`])).stdout).header);
  assert.equal(info, undefined);
});

await test('read returns exact bytes', async () => {
  const { payload } = splitFramed((await call('read', [`${base}/plain.txt`, '-1'])).stdout);
  assert.equal(payload.toString('utf8'), 'alpha\n');
});

await test('read round-trips binary content', async () => {
  const { payload } = splitFramed((await call('read', [`${base}/bin.dat`, '-1'])).stdout);
  assert.deepEqual(payload, Buffer.from([0, 1, 255]));
});

await test('readrange windows into a file', async () => {
  const { payload } = splitFramed((await call('readrange', [`${base}/plain.txt`, '1', '3'])).stdout);
  assert.equal(payload.toString('utf8'), 'lph');
});

await test('list enumerates children in a stable, typed way', async () => {
  const payload = splitFramed((await call('list', [base])).stdout).payload;
  const entries = parseListPayload(payload);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  assert.deepEqual([...byName.keys()].sort(), ['bin.dat', 'edit.txt', 'plain.txt', 'sub']);
  assert.equal(byName.get('sub').type, 'd');
  assert.equal(byName.get('plain.txt').type, 'f');
  assert.equal(byName.get('plain.txt').size, 6);
});

await test('write creates a file, then updates it and returns the old content', async () => {
  const created = splitFramed((await call('write', [`${base}/created.txt`, '-', '-', 'any', '1048576'], { input: Buffer.from('one\n') })).stdout);
  assert.equal(parseWriteHeader(created.header, created.payload).existed, false);
  const updated = splitFramed((await call('write', [`${base}/created.txt`, '-', '-', 'any', '1048576'], { input: Buffer.from('two\n') })).stdout);
  const outcome = parseWriteHeader(updated.header, updated.payload);
  assert.equal(outcome.existed, true);
  assert.equal(outcome.oldBuffer.toString('utf8'), 'one\n');
  assert.equal(splitFramed((await call('read', [`${base}/created.txt`, '-1'])).stdout).payload.toString('utf8'), 'two\n');
});

await test('stale version guard rejects a concurrent overwrite', async () => {
  const current = splitFramed((await call('stat', [`${base}/edit.txt`])).stdout);
  const version = parseStatHeader(current.header).version;
  const ok = await call('write', [`${base}/edit.txt`, '-', version, 'must-exist', '-1'], { input: Buffer.from('new\n') });
  assert.equal(ok.code, 0);
  const stale = await call('write', [`${base}/edit.txt`, '-', version, 'must-exist', '-1'], { input: Buffer.from('stale\n') });
  assert.equal(stale.code, 48);
  assert.equal(splitFramed((await call('read', [`${base}/edit.txt`, '-1'])).stdout).payload.toString('utf8'), 'new\n');
});

await test('paths with quotes, spaces and dollar signs survive ssh quoting', async () => {
  const awkward = `${base}/we ird'"$HOME\`x\`.txt`;
  const write = await call('write', [awkward, '-', '-', 'any', '-1'], { input: Buffer.from('awkward\n') });
  assert.equal(write.code, 0);
  const read = splitFramed((await call('read', [awkward, '-1'])).stdout);
  assert.equal(read.payload.toString('utf8'), 'awkward\n');
  const names = parseListPayload(splitFramed((await call('list', [base])).stdout).payload).map((entry) => entry.name);
  assert.ok(names.includes(`we ird'"$HOME\`x\`.txt`));
});

await test('error codes map to the fs taxonomy', async () => {
  assert.equal((await call('read', [`${base}/missing`, '-1'])).code, 41);
  assert.equal((await call('read', [base, '-1'])).code, 44);
  assert.equal((await call('read', [`${base}/plain.txt`, '2'])).code, 45);
  assert.equal((await call('list', [`${base}/plain.txt`])).code, 42);
});

console.log('\nmultiplexing');
await test('a warm connection is fast', async () => {
  const measure = async () => {
    const started = process.hrtime.bigint();
    await call('stat', [base]);
    return Number(process.hrtime.bigint() - started) / 1e6;
  };
  await measure();
  const samples = [];
  for (let index = 0; index < 5; index += 1) samples.push(await measure());
  const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  console.log(`       average warm round trip: ${average.toFixed(1)} ms`);
  assert.ok(average < 2000, `expected a warm round trip under 2 s, got ${average} ms`);
});

raw(`rm -rf ${base}`);
await runner.close(target);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

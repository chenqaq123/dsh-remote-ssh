import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createSshShellExecutor } from '../lib/shell-remote.js';

const Shell = createSshShellExecutor({ bashLocal: { LocalBashExecutor: class {}, ENV_OVERRIDES: {} } }, { config: {} });
const shell = new Shell({});
function run(command, extra = {}, input) {
  return spawnSync('sh', ['-c', shell.remoteCommand({ command, remoteWorkdir: '/tmp', ...extra })], { input, encoding: 'utf8' });
}

test('remote exit 255 is preserved and identified as a command failure', () => {
  const result = run('printf before; exit 255');
  assert.equal(result.status, 255); assert.equal(result.stdout, 'before');
  assert.match(result.stderr, /远程命令返回 255（SSH 已执行该命令）/);
});

test('successful and other failed commands retain their output, input and exit code', () => {
  const success = run('cat; printf "%s" "$EXAMPLE"', { env: { EXAMPLE: "a ' quoted $value" } }, 'input\n');
  assert.equal(success.status, 0); assert.equal(success.stdout, "input\na ' quoted $value"); assert.equal(success.stderr, '');
  const failure = run('printf failure >&2; exit 42');
  assert.equal(failure.status, 42); assert.equal(failure.stderr, 'failure');
  const directory = run('printf must-not-run', { remoteWorkdir: '/nonexistent-dsh-test-directory' });
  assert.notEqual(directory.status, 0); assert.equal(directory.stdout, '');
});

test('remote failures are neither retried nor normalized to success', () => {
  const result = run('(printf once; exit 255) && printf should-not-run');
  assert.equal(result.stdout, 'once'); assert.equal(result.status, 255);
});

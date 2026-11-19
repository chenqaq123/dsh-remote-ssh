import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const clientSource = readFileSync(new URL('../ui/client.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function localeRuntime() {
  const start = clientSource.indexOf('    const UI_COPY = ');
  const end = clientSource.indexOf('\n    const needsPassword', start);
  assert.ok(start > 0 && end > start, 'locale helper block is present');
  const helpers = runInNewContext(
    `${clientSource.slice(start, end)}; ({
      UI_COPY,
      translateFor,
      baselineLocale,
      interpolateCopy,
      tr,
      setLocaleRuntime: (value) => { localeRuntime = value; },
    })`,
  );

  const hostStart = clientSource.indexOf('    function localizeHostError(message) {');
  const hostEnd = clientSource.indexOf('\n    function friendly(error)', hostStart);
  assert.ok(hostStart > 0 && hostEnd > hostStart, 'host error mapper is present');
  Object.assign(helpers, runInNewContext(
    `${clientSource.slice(hostStart, hostEnd)}; ({ localizeHostError })`,
    helpers,
  ));
  return helpers;
}

test('English and Chinese dictionaries own the same keys', () => {
  const { UI_COPY } = localeRuntime();
  assert.deepEqual(Object.keys(UI_COPY.en).sort(), Object.keys(UI_COPY.zh).sort());
  assert.equal(UI_COPY.en['panel.title'], 'Remote Workspaces');
  assert.equal(UI_COPY.zh['panel.title'], '远程工作区');
});

test('every statically referenced copy key exists in both dictionaries', () => {
  const { UI_COPY } = localeRuntime();
  const keys = [...clientSource.matchAll(/\btr\(\s*'([^']+)'/gu)].map((match) => match[1]);
  for (const key of new Set(keys)) {
    assert.ok(Object.hasOwn(UI_COPY.en, key), `missing en copy for ${key}`);
    assert.ok(Object.hasOwn(UI_COPY.zh, key), `missing zh copy for ${key}`);
  }
});

test('unsupported Harness languages fall back to English', () => {
  const { translateFor, tr, setLocaleRuntime } = localeRuntime();
  assert.equal(translateFor('ja', 'panel.title'), 'Remote Workspaces');
  setLocaleRuntime({
    getSnapshot: () => ({ active: 'ja' }),
    bind: () => () => '不应使用',
  });
  assert.equal(tr('panel.title'), 'Remote Workspaces');
});

test('Chinese and English use the active Harness locale with placeholders', () => {
  const { tr, setLocaleRuntime } = localeRuntime();
  setLocaleRuntime({
    getSnapshot: () => ({ active: 'zh-CN' }),
    bind: (namespace) => (key, params) =>
      namespace === 'ssh-remote' && key === 'workspace.checkedAll'
        ? `已检查 ${params.alias} 的 ${params.count} 个工作区。`
        : key,
  });
  assert.equal(tr('workspace.checkedAll', { alias: 'dev', count: 2 }), '已检查 dev 的 2 个工作区。');

  setLocaleRuntime({
    getSnapshot: () => ({ active: 'en-US' }),
    bind: (namespace) => (key, params) =>
      namespace === 'ssh-remote' && key === 'workspace.checkedAll'
        ? `Checked ${params.count} workspaces on ${params.alias}.`
        : key,
  });
  assert.equal(tr('workspace.checkedAll', { alias: 'dev', count: 2 }), 'Checked 2 workspaces on dev.');
});

test('the bundled dictionary is used when no locale service is attached', () => {
  const { tr, setLocaleRuntime } = localeRuntime();
  setLocaleRuntime(undefined);
  assert.equal(tr('common.cancel'), 'Cancel');
});

test('known Host errors map to localized copy', () => {
  const { localizeHostError, setLocaleRuntime } = localeRuntime();
  setLocaleRuntime({
    getSnapshot: () => ({ active: 'en' }),
    bind: () => () => '',
  });
  assert.equal(
    localizeHostError('密码不能超过 128 个字符。'),
    'The password must be at most 128 characters.',
  );
  assert.equal(
    localizeHostError('SSH 连接失败（255）'),
    'SSH connection failed (255).',
  );
  assert.equal(
    localizeHostError('远程目录不存在：/srv/missing'),
    'The remote directory does not exist: /srv/missing',
  );
  assert.equal(
    localizeHostError('找不到这个远程工作区，请重新打开远程工作区面板后重试。'),
    'Remote workspace not found. Reopen the Remote Workspaces panel and try again.',
  );
  assert.equal(
    localizeHostError('这是一条未知错误'),
    '这是一条未知错误',
  );
});

test('the client registers three-argument dictionaries and follows the active locale', () => {
  assert.match(clientSource, /inject: \[[^\]]*'locale'/u);
  assert.match(
    clientSource,
    /locale\.register\(LOCALE_NS, 'en', UI_COPY\.en\)[\s\S]*locale\.register\(LOCALE_NS, 'zh', UI_COPY\.zh\)/u,
  );
  assert.match(clientSource, /getSnapshot\?\.\(\)\.active/u);
  assert.doesNotMatch(clientSource, /getSnapshot\?\.\(\)\.revision/u);
});

test('native sidebar and React panel refresh when the locale changes', () => {
  const localeSubscription = clientSource.split('\n').find((line) => line.includes('const offLocale='));
  assert.ok(localeSubscription, 'the native sidebar subscribes to locale changes');
  assert.match(localeSubscription, /ctx\.locale/u);
  assert.match(localeSubscription, /\.subscribe\?\./u);
  assert.match(localeSubscription, /schedule\(\)/u);
  assert.match(clientSource, /localizeComponent\(RemotePanel\)/u);
  assert.match(clientSource, /useSyncExternalStore\(/u);
  assert.match(
    clientSource,
    /locale: LOCALE_NS, label: \(\) => tr\('app\.name'\)/u,
  );
});

test('the client bundle declares the Harness locale dependency', () => {
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-locale'));
});

console.log(`\n${passed} tests passed`);

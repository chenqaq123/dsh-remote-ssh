/**
 * `~/.ssh/config` reader for the SSH remote plugin.
 *
 * The parser follows OpenSSH's own precedence rules closely enough to answer the
 * two questions this plugin asks: "which servers does the user have?" and "what
 * are the effective HostName/User/Port for this alias?". Connections always go
 * through the system `ssh` binary with the alias as destination, so OpenSSH
 * itself remains the authority for keys, agents, proxy jumps and anything else
 * this reader does not model; these values are for display, for picking, and for
 * resolving an alias to a concrete host.
 *
 * @module dsh-ssh-remote/ssh-config
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/** Directives that take a single effective value; the first match wins in OpenSSH. */
const SCALAR_KEYS = new Set([
  'hostname', 'user', 'port', 'proxyjump', 'proxycommand', 'identityfile',
  'identityagent', 'certificatefile', 'connecttimeout', 'controlmaster',
  'controlpath', 'controlpersist', 'stricthostkeychecking', 'userknownhostsfile',
  'forwardagent', 'requesttty', 'serveraliveinterval', 'setenv', 'remotecommand',
  'compression', 'preferredauthentications', 'identitiesonly',
]);

/** Expand a leading `~` and return an absolute path. */
export function expandHome(value, home = homedir()) {
  if (value === '~') return home;
  if (value.startsWith('~/')) return join(home, value.slice(2));
  return value;
}

/**
 * Translate an OpenSSH host pattern (`*`, `?`, `!` negation) into a RegExp.
 * @param pattern - one pattern token from a `Host` line.
 * @returns a matcher for candidate host names.
 */
function patternToRegExp(pattern) {
  let source = '^';
  for (const char of pattern) {
    if (char === '*') source += '[^]*';
    else if (char === '?') source += '.';
    else source += char.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  }
  return new RegExp(source + '$', 'u');
}

/** Tokenize one config line into a keyword and its arguments, honoring quotes. */
function tokenize(line) {
  const tokens = [];
  let current = '';
  let quote = null;
  let started = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote !== null) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }
    if (char === '#' && !started) break;
    if (char === ' ' || char === '\t') {
      if (started) {
        tokens.push(current);
        current = '';
        started = false;
      }
      continue;
    }
    // `Keyword=value` is accepted by OpenSSH as well.
    if (char === '=' && tokens.length === 0 && started) {
      tokens.push(current);
      current = '';
      started = false;
      continue;
    }
    current += char;
    started = true;
  }
  if (started) tokens.push(current);
  return tokens;
}

/** Minimal glob expansion for `Include` directives (`*`, `?`, `${VAR}`). */
function expandGlob(pattern) {
  const env = (text) => text.replace(/\$\{(\w+)\}|\$(\w+)/gu, (_all, braced, bare) => process.env[braced ?? bare] ?? '');
  const expanded = expandHome(env(pattern));
  if (!expanded.includes('*') && !expanded.includes('?')) return existsSync(expanded) ? [expanded] : [];
  const directory = dirname(expanded);
  const name = expanded.slice(directory.length + 1);
  let names;
  try {
    names = readdirSync(directory);
  } catch {
    return [];
  }
  const matcher = patternToRegExp(name);
  return names.filter((entry) => matcher.test(entry)).sort().map((entry) => join(directory, entry));
}

/**
 * Read and parse a set of SSH config files.
 * @param paths - config files to read, in precedence order.
 * @returns the ordered `Host`/`Match` blocks plus any parse warnings.
 */
export function parseSshConfig(paths) {
  const blocks = [];
  const warnings = [];
  const seen = new Set();

  const readInto = (file, depth) => {
    if (depth > 8) {
      warnings.push(`Include depth exceeded at ${file}`);
      return;
    }
    const resolved = resolve(expandHome(file));
    if (seen.has(resolved)) return;
    seen.add(resolved);
    let text;
    try {
      text = readFileSync(resolved, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') warnings.push(`cannot read ${resolved}: ${error.message}`);
      return;
    }
    let current = null;
    for (const rawLine of text.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith('#')) continue;
      const tokens = tokenize(line);
      if (tokens.length === 0) continue;
      const keyword = tokens[0].toLowerCase();
      const values = tokens.slice(1);
      if (keyword === 'host') {
        current = { kind: 'host', patterns: values, options: {}, file: resolved, line: blocks.length };
        blocks.push(current);
        continue;
      }
      if (keyword === 'match') {
        // `Match` blocks cannot be evaluated statically; record and ignore them.
        current = { kind: 'match', patterns: values, options: {}, file: resolved, line: blocks.length };
        blocks.push(current);
        continue;
      }
      if (keyword === 'include') {
        for (const value of values) {
          for (const included of expandGlob(value)) readInto(included, depth + 1);
        }
        continue;
      }
      if (current === null) {
        // A global directive before any Host block.
        current = { kind: 'global', patterns: ['*'], options: {}, file: resolved, line: -1 };
        blocks.push(current);
      }
      const key = keyword;
      if (SCALAR_KEYS.has(key)) {
        if (current.options[key] === undefined) current.options[key] = values[0] ?? '';
      } else {
        (current.options[key] ??= []).push(values[0] ?? '');
      }
    }
  };

  for (const path of paths) readInto(path, 0);
  return { blocks, warnings };
}

/** True when a `Host` pattern list contains glob or negation syntax. */
export function isPatternOnly(patterns) {
  return patterns.length === 0 || patterns.some((pattern) => /[*?![\]]/u.test(pattern));
}

/**
 * Resolve one alias against parsed blocks using OpenSSH's first-value-wins rule.
 * @param blocks - parsed config blocks in file order.
 * @param alias - the destination the user would type (`ssh <alias>`).
 * @returns the effective scalar options plus the list of matching patterns.
 */
export function resolveHost(blocks, alias) {
  const options = {};
  const matchedPatterns = [];
  for (const block of blocks) {
    if (block.kind !== 'host') continue;
    let positive = false;
    let negated = false;
    for (const pattern of block.patterns) {
      const negate = pattern.startsWith('!');
      const body = negate ? pattern.slice(1) : pattern;
      if (patternToRegExp(body).test(alias)) {
        if (negate) negated = true;
        else positive = true;
      }
    }
    if (!positive || negated) continue;
    matchedPatterns.push(...block.patterns);
    for (const [key, value] of Object.entries(block.options)) {
      if (options[key] === undefined) options[key] = value;
    }
  }
  return { options, matchedPatterns };
}

/** Default config files consulted when the deployment does not name any. */
export function defaultConfigPaths(home = homedir()) {
  const paths = [];
  const main = join(home, '.ssh', 'config');
  if (existsSync(main)) paths.push(main);
  return paths;
}

/**
 * List the servers a user can reach, preferring concrete aliases over patterns.
 * @param options - config paths and an optional extra alias list.
 * @returns display rows, one per usable destination.
 */
export function listHosts({ paths, extraHosts = [] } = {}) {
  const configPaths = (paths ?? defaultConfigPaths()).map((path) => resolve(expandHome(path)));
  const { blocks, warnings } = parseSshConfig(configPaths);
  const rows = [];
  const seen = new Set();

  for (const block of blocks) {
    if (block.kind !== 'host') continue;
    const concrete = block.patterns.filter((pattern) => !isPatternOnly([pattern]));
    for (const alias of concrete) {
      if (seen.has(alias)) continue;
      seen.add(alias);
      rows.push(describeHost(blocks, alias));
    }
  }
  for (const alias of extraHosts) {
    if (seen.has(alias)) continue;
    seen.add(alias);
    rows.push(describeHost(blocks, alias));
  }

  const patterns = blocks
    .filter((block) => block.kind === 'host' && block.patterns.length > 0 && isPatternOnly(block.patterns))
    .flatMap((block) => block.patterns)
    .filter((pattern) => !pattern.startsWith('!'));

  return { hosts: rows, patterns: [...new Set(patterns)], warnings, configPaths };
}

/**
 * Describe one destination alias.
 * @param blocks - parsed config blocks.
 * @param alias - the destination alias.
 * @returns the effective connection facts for display.
 */
export function describeHost(blocks, alias) {
  const { options } = resolveHost(blocks, alias);
  const port = Number.parseInt(options.port ?? '', 10);
  return {
    alias,
    hostname: options.hostname ?? alias,
    user: options.user,
    port: Number.isSafeInteger(port) && port > 0 ? port : undefined,
    identityFile: options.identityfile ? expandHome(options.identityfile) : undefined,
    proxyJump: options.proxyjump,
  };
}

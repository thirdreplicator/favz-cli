'use strict';
// Turn agent config into tool names. A port of spike/extract.py.
// Only names leave this module. Environment values, headers, URL paths and raw
// argument lists are dropped here, as the file is read.

const path = require('path');
const { looksSecret } = require('./guard');

const UNKNOWN = 'unknown:';
const NPM_LAUNCHERS = new Set(['npx', 'bunx', 'pnpx']);
const NPM_MANAGERS = new Set(['npm', 'pnpm', 'yarn']);
const NPM_SUBCOMMANDS = new Set(['exec', 'dlx']);
const NPM_URL_WRAPPERS = new Set(['mcp-remote', 'supergateway']);
const NPM_SCRIPT_RUNNERS = new Set(['tsx', 'ts-node']);
const PY_LAUNCHERS = new Set(['uvx', 'pipx']);
const PY_SUBCOMMANDS = new Set(['run', 'tool']);
const CONTAINER_COMMANDS = new Set(['docker', 'podman']);
const INTERPRETERS = new Set(['python', 'python3', 'py', 'node', 'bun', 'deno', 'bash', 'sh', 'tsx', 'ts-node', 'php', 'ruby']);
const DOCKER_VALUE_FLAGS = new Set(['-e', '--env', '-v', '--volume', '-p', '--publish', '--name',
  '--network', '--mount', '-w', '--workdir', '--env-file']);
const SAFE_NAME = /^[A-Za-z0-9@/._+-]{1,100}$/;
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

const basename = (text) => path.posix.basename(text.replace(/\\/g, '/'));
const words = (text) => text.split(/\s+/).filter(Boolean);

function flagValue(args, flags) {
  for (let i = 0; i + 1 < args.length; i++) if (flags.has(args[i])) return args[i + 1];
  return null;
}

function firstPlain(args, skip = new Set()) {
  return args.find((a) => !a.startsWith('-') && !skip.has(a)) || null;
}

function stripNpmVersion(pkg) {
  const at = pkg.lastIndexOf('@');
  return at > 0 ? pkg.slice(0, at) : pkg;
}

function looksLikePath(text) {
  return /^[/.~]/.test(text) || text.includes('\\') || /^[A-Za-z]:[\\/]/.test(text);
}

function nameMcpServer(entry) {
  const name = rawName(entry);
  const colon = name.indexOf(':');
  const kind = name.slice(0, colon), value = name.slice(colon + 1);
  if (kind === 'url') return /^[a-z0-9.-]{1,100}$/.test(value) ? name : UNKNOWN;
  if (value && !SAFE_NAME.test(value)) return kind === 'local' ? 'local:inline' : UNKNOWN;
  return name;
}

function rawName(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return UNKNOWN;

  const url = entry.url || entry.serverUrl;
  if (typeof url === 'string' && url) {
    let host = '';
    try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { host = ''; }
    return host ? `url:${host}` : UNKNOWN;
  }

  const command = entry.command;
  if (typeof command !== 'string' || !command.trim()) return UNKNOWN;
  let args = Array.isArray(entry.args) ? entry.args.filter((a) => typeof a === 'string') : [];
  // Some configs put a whole shell line in `command`, sometimes led by VAR=value pairs.
  const parts = words(command);
  while (parts.length && ENV_ASSIGNMENT.test(parts[0])) parts.shift();
  if (!parts.length) return UNKNOWN;
  args = parts.slice(1).concat(args);
  const base = basename(parts[0]).toLowerCase().replace(/\.exe$/, '').replace(/\.cmd$/, '');
  // Windows configs wrap the real launcher: cmd /c npx -y some-server
  if (base === 'cmd' && args.length && ['/c', '/k'].includes(args[0].toLowerCase())) {
    if (args.length < 2) return UNKNOWN;
    return rawName({ command: args[1], args: args.slice(2) });
  }

  if (NPM_LAUNCHERS.has(base) || (NPM_MANAGERS.has(base) && args.length && NPM_SUBCOMMANDS.has(args[0]))) {
    const pkg = flagValue(args, new Set(['--package', '-p'])) || firstPlain(args, NPM_SUBCOMMANDS);
    if (!pkg) return UNKNOWN;
    const bare = stripNpmVersion(pkg);
    const rest = args.slice(args.indexOf(pkg) + 1);
    if (NPM_URL_WRAPPERS.has(bare)) { // the real tool is the remote server it connects to
      const target = rest.find((a) => a.startsWith('http://') || a.startsWith('https://'));
      return target ? rawName({ url: target }) : UNKNOWN;
    }
    if (NPM_SCRIPT_RUNNERS.has(bare)) { // npx tsx src/server.ts is a local script
      const script = firstPlain(rest);
      return script ? `local:${basename(script)}` : UNKNOWN;
    }
    return `npm:${bare}`;
  }

  if (PY_LAUNCHERS.has(base) || (base === 'uv' && args.length && PY_SUBCOMMANDS.has(args[0]))) {
    const pkg = flagValue(args, new Set(['--from'])) || firstPlain(args, PY_SUBCOMMANDS);
    if (!pkg) return UNKNOWN;
    if (INTERPRETERS.has(pkg)) return rawName({ command: pkg, args: args.slice(args.indexOf(pkg) + 1) });
    if (looksLikePath(pkg)) return `local:${basename(pkg.replace(/\/+$/, ''))}`;
    return 'pypi:' + pkg.split(/[=<>~!@[\s]/)[0];
  }

  if (CONTAINER_COMMANDS.has(base)) {
    const rest = args.includes('run') ? args.slice(args.indexOf('run') + 1) : args;
    let skipNext = false;
    for (const arg of rest) {
      if (skipNext) skipNext = false;
      else if (DOCKER_VALUE_FLAGS.has(arg)) skipNext = true;
      // strip the tag, but not a registry port such as "host:5000/image"
      else if (!arg.startsWith('-')) return `docker:${arg.replace(/:[^/]*$/, '')}`;
    }
    return UNKNOWN;
  }

  if (INTERPRETERS.has(base)) {
    const module = flagValue(args, new Set(['-m']));
    if (module) return `pymod:${module}`;
    const script = firstPlain(args);
    return script ? `local:${basename(script)}` : UNKNOWN;
  }

  return `cmd:${base}`;
}

// Parse JSON, allowing // comments and trailing commas (common in .vscode files).
function loadsLenient(text) {
  try { return JSON.parse(text); } catch (e) { /* try again below */ }
  const noComments = text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*/g, (m, str) => str || '');
  try { return JSON.parse(noComments.replace(/,(\s*[}\]])/g, '$1')); } catch (e) { return null; }
}

const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v);

function serverNames(servers) {
  return isMap(servers) ? Object.values(servers).map((entry) => 'mcp:' + nameMcpServer(entry)) : [];
}

function hookNames(hooks) {
  const names = [];
  if (!isMap(hooks)) return names;
  for (const [event, groups] of Object.entries(hooks)) {
    for (const group of Array.isArray(groups) ? groups : []) {
      const inner = isMap(group) ? group.hooks : null;
      for (const hook of Array.isArray(inner) ? inner : []) {
        const parts = isMap(hook) && typeof hook.command === 'string' ? words(hook.command) : [];
        let scripted = false;
        while (parts.length && ENV_ASSIGNMENT.test(parts[0])) {
          // VAR=value prefixes can hold secrets. VAR=$(...) or a ";" means a shell script.
          scripted = scripted || parts[0].includes('$') || parts[0].includes(';');
          parts.shift();
        }
        if (parts.length && SAFE_NAME.test(event)) {
          const binary = scripted ? '' : basename(parts[0].replace(/^["']+|["']+$/g, ''));
          names.push(`hook:${event}:${SAFE_NAME.test(binary) ? binary : 'inline'}`);
        }
      }
    }
  }
  return names;
}

// Names from a Claude Code settings file: MCP servers, hooks and enabled plugins.
function settingsNames(data) {
  if (!isMap(data)) return [];
  const names = serverNames(data.mcpServers).concat(hookNames(data.hooks));
  if (isMap(data.enabledPlugins)) {
    for (const [key, enabled] of Object.entries(data.enabledPlugins)) if (enabled === true) names.push(`plugin:${key}`);
  }
  return names;
}

// Every name passes the secret guard last. One that fails becomes "<kind>:redacted".
function guarded(names) {
  return [...new Set(names.map((n) => (looksSecret(n) ? `${n.split(':')[0]}:redacted` : n)))].sort();
}

module.exports = { nameMcpServer, loadsLenient, serverNames, hookNames, settingsNames, guarded, SAFE_NAME };

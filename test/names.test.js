'use strict';
const test = require('node:test');
const assert = require('node:assert');
const vectors = require('./vectors.json');
const { nameMcpServer, hookNames, settingsNames, guarded, loadsLenient } = require('../lib/names');
const { looksSecret, safeName } = require('../lib/guard');

test('MCP server names match the Python rules', () => {
  for (const [entry, expected] of vectors.servers) assert.strictEqual(nameMcpServer(entry), expected, JSON.stringify(entry).slice(0, 60));
});

test('hook names match the Python rules', () => {
  for (const [hooks, expected] of vectors.hooks) assert.deepStrictEqual(hookNames(hooks), expected);
});

test('the secret guard matches the Python rules', () => {
  for (const [name, expected] of vectors.secrets) assert.strictEqual(looksSecret(name), expected, name.slice(0, 12));
});

test('env, headers and args never reach a name', () => {
  const fake = 'ghp_' + 'a1B2c3D4e5'.repeat(3);
  const names = settingsNames({
    mcpServers: { one: { command: 'npx', args: ['-y', 'some-mcp', '--key', fake], env: { KEY: fake }, headers: { Authorization: fake } } },
    enabledPlugins: { 'a@b': true, 'off@b': false },
  });
  assert.deepStrictEqual(names, ['mcp:npm:some-mcp', 'plugin:a@b']);
});

test('a name that looks secret is redacted', () => {
  const fake = 'ghp_' + 'a1B2c3D4e5'.repeat(3);
  assert.deepStrictEqual(guarded([`mcp:npm:${fake}`, 'skill:ok']), ['mcp:redacted', 'skill:ok']);
  assert.strictEqual(safeName('mcp:npm:has space'), false);
});

test('comments and trailing commas are allowed', () => {
  assert.deepStrictEqual(loadsLenient('{ // note\n "a": "http://x", }'), { a: 'http://x' });
  assert.strictEqual(loadsLenient('not json'), null);
});

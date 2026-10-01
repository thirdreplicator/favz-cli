'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { repoName, jsonPath, snapshot, diff, followText } = require('../lib/follow');

test('takes owner/name or a GitHub link, and refuses anything else', () => {
  assert.strictEqual(repoName('vercel/next.js'), 'vercel/next.js');
  assert.strictEqual(repoName(' https://github.com/Vercel/Next.js.git/ '), 'Vercel/Next.js');
  for (const bad of ['', 'a', 'a/b/c', '../x', 'a/..', 'a b/c', 'a/b?x=1']) assert.strictEqual(repoName(bad), null, bad);
  assert.strictEqual(jsonPath('Vercel/Next.js'), '/repos/vercel/next.js.json');
});

const DATA = {
  repo: 'Dana/Repo',
  tools_now: [{ tool: 'skill:b' }, { tool: 'mcp:npm:a' }],
  changes: [{ day: '2026-09-20', event: 'add', tool: 'skill:b' }, { day: '2026-09-01', event: 'add', tool: 'mcp:npm:a' }],
};

test('the first look lists the tools, a later one says what came and went', () => {
  const first = snapshot(DATA, '2026-09-25');
  assert.deepStrictEqual(first, { repo: 'Dana/Repo', checked: '2026-09-25', tools: ['mcp:npm:a', 'skill:b'], last: '2026-09-20' });
  assert.strictEqual(diff(null, first), null);
  assert.match(followText(first, null), /Runs a, b\./);

  const later = snapshot({ ...DATA, tools_now: [{ tool: 'skill:b' }, { tool: 'skill:c' }] }, '2026-10-01');
  const change = diff(first, later);
  assert.deepStrictEqual(change, { since: '2026-09-25', added: ['skill:c'], removed: ['mcp:npm:a'] });
  const text = followText(later, change);
  assert.match(text, /Added since 2026-09-25: c\./);
  assert.match(text, /Removed since 2026-09-25: a\./);
  assert.match(text, /favz\.co\/repos\/dana\/repo\.html/);
  assert.match(followText(first, diff(first, first)), /No change since 2026-09-25/);
});

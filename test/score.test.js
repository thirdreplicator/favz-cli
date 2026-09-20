'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { summarize, validSummary, score, TITLES } = require('../lib/score');
const { scan } = require('../lib/scan');

const KNOWN = {
  sample_repos: 1000, median_tools: 6,
  names: ['mcp:npm:@playwright/mcp', 'mcp:npm:ctx', 'mcp:npm:shadcn', 'skill:frontend-design', 'hook:Stop:inline'],
  stats: [[150, 100, 0.1], [140, 100, 0.5], [70, 50, null], [70, 60, null], [30, 30, null]],
  pairs: [[0, 1, 30], [0, 2, 20], [0, 3, 40]],
  aliases: { 'mcp:url:ctx.example.com': 'mcp:npm:ctx' },
};

test('only public names are kept; the rest become counts', () => {
  const summary = summarize(['mcp:npm:@playwright/mcp', 'mcp:url:ctx.example.com', 'skill:my-private-thing',
    'agent:acme-deploy', 'mcp:unknown:', 'mcp:redacted'], KNOWN);
  assert.deepStrictEqual(summary, { tools: ['mcp:npm:@playwright/mcp', 'mcp:npm:ctx'], other: { skill: 1, agent: 1, mcp: 2 } });
  assert.ok(!JSON.stringify(summary).includes('acme'));
});

test('the server refuses a summary with names it does not publish', () => {
  assert.ok(validSummary({ tools: ['mcp:npm:ctx'], other: { skill: 3 } }, KNOWN));
  assert.ok(!validSummary({ tools: ['skill:my-private-thing'], other: {} }, KNOWN));
  assert.ok(!validSummary({ tools: ['mcp:npm:ctx', 'mcp:npm:ctx'], other: {} }, KNOWN));
  assert.ok(!validSummary({ tools: [], other: { skill: -1 } }, KNOWN));
  assert.ok(!validSummary({ tools: [], other: { note: 1 } }, KNOWN));
  assert.ok(!validSummary({ tools: [], other: { skill: 'lots' } }, KNOWN));
  assert.ok(!validSummary(null, KNOWN));
});

test('an empty setup is a level 1 Wanderer', () => {
  const card = score({ tools: [], other: {} }, KNOWN);
  assert.deepStrictEqual([card.level, card.class, card.title, card.suggestions], [1, 'Wanderer', 'Novice', []]);
});

test('class, level and suggestions for a small front-end setup', () => {
  const card = score({ tools: ['mcp:npm:@playwright/mcp', 'skill:frontend-design'], other: { hook: 2 } }, KNOWN);
  assert.strictEqual(card.class, 'Illusionist');
  assert.strictEqual(card.total, 4);
  assert.ok(card.level > 1 && card.level < 20);
  // suggestions never include a tool already present, and rank by share of overlap
  assert.deepStrictEqual(card.suggestions.map((s) => s.tool), ['mcp:npm:ctx', 'mcp:npm:shadcn']);
  assert.deepStrictEqual(card.suggestions[0], { tool: 'mcp:npm:ctx', with: 'mcp:npm:@playwright/mcp', both: 30, of: 100 });
});

test('the level never leaves 1 to 20', () => {
  const card = score({ tools: KNOWN.names, other: { skill: 9000, agent: 9000, command: 9000, hook: 9000, plugin: 9000, mcp: 9000 } }, KNOWN);
  assert.ok(card.level >= 1 && card.level <= 20);
  assert.strictEqual(card.title, TITLES[Math.ceil(card.level / 4) - 1]);
});

test('scan reads names from a home folder and nothing else', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'favz-'));
  const fake = 'ghp_' + 'a1B2c3D4e5'.repeat(3);
  fs.mkdirSync(path.join(home, '.claude', 'skills', 'my-skill'), { recursive: true });
  fs.mkdirSync(path.join(home, '.claude', 'skills', 'not-a-skill'));
  fs.mkdirSync(path.join(home, '.claude', 'agents'));
  fs.writeFileSync(path.join(home, '.claude', 'skills', 'my-skill', 'SKILL.md'), 'body');
  fs.writeFileSync(path.join(home, '.claude', 'agents', 'bad name!.md'), 'body');
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({
    mcpServers: { a: { command: 'npx', args: ['-y', 'pkg-a'], env: { K: fake } } },
    projects: { '/work': { mcpServers: { b: { url: 'https://b.example.com/x?k=' + fake } } }, '/else': { mcpServers: { c: { command: 'npx', args: ['pkg-c'] } } } },
  }));
  const found = scan({ home, cwd: '/work' });
  assert.deepStrictEqual(found.names, ['agent:redacted', 'mcp:npm:pkg-a', 'mcp:url:b.example.com', 'skill:my-skill']);
  assert.ok(!JSON.stringify(found).includes(fake));
  fs.rmSync(home, { recursive: true });
});

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { likeYou, sinceLast, remember } = require('../lib/discover');
const { likeYouText } = require('../lib/card');

// 1,000 repos. a and b are big and go together a little; c goes with a much more than chance.
const KNOWN = {
  aliases: { 'mcp:url:a.example.com': 'mcp:npm:a' },
  census: {
    date: '2026-09-25', repos: 1000,
    names: ['mcp:npm:a', 'mcp:npm:b', 'skill:c', 'skill:d'],
    now: [200, 300, 50, 40], grew: [5, 3, 10, 0],
    pages: ['tools/a.html', 'tools/b.html', 'tools/c.html', 'tools/d.html'],
    pairs: [[0, 1, 70], [0, 2, 40], [1, 3, 4], [2, 3, 20]],
  },
};

test('ranks what repos with your tools run beyond chance, and skips what you have', () => {
  const picks = likeYou(['mcp:url:a.example.com', 'skill:my-private-thing'], KNOWN);
  assert.deepStrictEqual(picks.map((p) => p.tool), ['skill:c', 'mcp:npm:b']);
  assert.deepStrictEqual(picks[0], { tool: 'skill:c', with: 'mcp:npm:a', both: 40, of: 200, repos: 50, grew: 10,
    growing: true, page: 'https://favz.co/tools/c.html' });
  assert.ok(!likeYou(['mcp:npm:b'], KNOWN).some((p) => p.tool === 'skill:d'), 'pairs under 5 repos do not count');
  assert.deepStrictEqual(likeYou(['mcp:npm:a'], { aliases: {} }), [], 'an old known.json without a census');
});

test('a later run says what is new and what moved', () => {
  const picks = likeYou(['mcp:npm:a'], KNOWN);
  const seen = { day: '2026-09-20', census: '2026-09-19', shown: { 'mcp:npm:b': 290 } };
  const since = sinceLast(picks, KNOWN, seen);
  assert.deepStrictEqual(since, { day: '2026-09-20', census: '2026-09-19', sameCensus: false, fresh: ['skill:c'],
    moved: [{ tool: 'mcp:npm:b', was: 290, now: 300 }] });
  assert.strictEqual(sinceLast(picks, KNOWN, null), null);
  assert.deepStrictEqual(remember(picks, KNOWN, '2026-09-25'),
    { day: '2026-09-25', census: '2026-09-25', shown: { 'skill:c': 50, 'mcp:npm:b': 300 } });
  const text = likeYouText(picks, since, 1000);
  assert.match(text, /1 new on your list/);
  assert.match(text, /c \(new\): 40 of/);
  assert.match(text, /b: 290 → 300 repos \(\+10\)/);
  assert.match(text, /c \(new\): 40 of the 200 repos with a run it, \+10 repos in 30 days/);
  assert.match(text, /https:\/\/favz\.co\/tools\/c\.html/);
});

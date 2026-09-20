'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'favz-srv-'));
process.env.FAVZ_PROFILES = path.join(dir, 'profiles');
process.env.FAVZ_KNOWN = path.join(dir, 'known.json');
fs.mkdirSync(process.env.FAVZ_PROFILES);
fs.writeFileSync(process.env.FAVZ_KNOWN, JSON.stringify({
  sample_repos: 1000, median_tools: 6, names: ['mcp:npm:ctx', 'mcp:npm:other'], stats: [[140, 100, 0.5], [50, 40, null]],
  pairs: [[0, 1, 20]], aliases: {},
}));
const { handle } = require('../server/profile_server');

let server, base;
test.before(() => new Promise((resolve) => {
  server = http.createServer(handle).listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); });
}));
test.after(() => { server.close(); fs.rmSync(dir, { recursive: true }); });

const post = (url, body) => fetch(base + url, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

test('publish, view, update, delete', async () => {
  const made = await (await post('/api/profile', { summary: { tools: ['mcp:npm:ctx'], other: { skill: 4 } }, level: 20 })).json();
  assert.match(made.url, /^https:\/\/favz\.co\/p\/[A-Za-z0-9_-]{12}$/);
  const html = await (await fetch(`${base}/p/${made.id}`)).text();
  assert.match(html, /Level \d+ \w+/);
  assert.ok(html.includes('noindex') && html.includes('ctx') && !html.includes('Level 20'));
  assert.ok(!fs.readFileSync(path.join(process.env.FAVZ_PROFILES, `${made.id}.json`), 'utf8').includes(made.token));

  const again = await (await post('/api/profile', { summary: { tools: ['mcp:npm:ctx', 'mcp:npm:other'], other: {} }, id: made.id, token: made.token })).json();
  assert.strictEqual(again.id, made.id);
  const wrong = await (await post('/api/profile', { summary: { tools: [], other: {} }, id: made.id, token: 'guess' })).json();
  assert.notStrictEqual(wrong.id, made.id); // a wrong token makes a new profile, never edits this one

  assert.strictEqual((await post('/api/profile/delete', { id: made.id, token: 'guess' })).status, 404);
  assert.strictEqual((await post('/api/profile/delete', { id: made.id, token: made.token })).status, 200);
  assert.strictEqual((await fetch(`${base}/p/${made.id}`)).status, 404);
});

test('each day adds a line to the timeline, and months on Favz raise the level', async () => {
  const summary = { tools: ['mcp:npm:ctx'], other: { skill: 4 }, projects: 3 };
  const first = await (await post('/api/profile', { summary })).json();
  assert.strictEqual(first.before, null);
  assert.strictEqual(first.history.length, 1);
  assert.strictEqual(first.history[0].projects, 3);

  const same = await (await post('/api/profile', { summary, id: first.id, token: first.token })).json();
  assert.strictEqual(same.history.length, 1); // the same day replaces its own line

  // Pretend the first runs were months ago. Only the server's own file can say so.
  const file = path.join(process.env.FAVZ_PROFILES, `${first.id}.json`);
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  stored.history = [{ ...stored.history[0], day: '2020-01-05' }, { ...stored.history[0], day: '2020-02-05' }];
  fs.writeFileSync(file, JSON.stringify(stored));
  const later = await (await post('/api/profile', { summary, id: first.id, token: first.token, history: [], months: 99 })).json();
  assert.strictEqual(later.history.length, 3);
  assert.strictEqual(later.before.day, '2020-02-05');
  assert.strictEqual(later.card.level, first.card.level + 2);
  const html = await (await fetch(`${base}/p/${first.id}`)).text();
  assert.ok(html.includes('Timeline') && html.includes('2020-01-05') && html.includes(`Level ${later.card.level} `));
});

test('bad input is refused', async () => {
  assert.strictEqual((await post('/api/profile', { summary: { tools: ['skill:<script>alert(1)</script>'], other: {} } })).status, 400);
  assert.strictEqual((await post('/api/profile', { summary: { tools: [], other: {}, projects: 1e9 } })).status, 400);
  assert.strictEqual((await post('/api/profile', 'not json')).status, 400);
  assert.strictEqual((await post('/api/profile', '[1]')).status, 400);
  assert.strictEqual((await post('/api/profile', 'x'.repeat(70 * 1024)).catch(() => ({ status: 413 }))).status, 413);
  assert.strictEqual((await fetch(`${base}/p/..%2F..%2Fetc%2Fpasswd`)).status, 404);
  assert.strictEqual((await fetch(`${base}/api/profile`)).status, 404);
});

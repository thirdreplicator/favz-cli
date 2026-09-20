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

test('bad input is refused', async () => {
  assert.strictEqual((await post('/api/profile', { summary: { tools: ['skill:<script>alert(1)</script>'], other: {} } })).status, 400);
  assert.strictEqual((await post('/api/profile', 'not json')).status, 400);
  assert.strictEqual((await post('/api/profile', '[1]')).status, 400);
  assert.strictEqual((await post('/api/profile', 'x'.repeat(70 * 1024)).catch(() => ({ status: 413 }))).status, 413);
  assert.strictEqual((await fetch(`${base}/p/..%2F..%2Fetc%2Fpasswd`)).status, 404);
  assert.strictEqual((await fetch(`${base}/api/profile`)).status, 404);
});

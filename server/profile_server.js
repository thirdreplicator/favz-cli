'use strict';
// Profile pages for the `favz` command. Standard library only. Runs behind Caddy on 127.0.0.1:8082.
//
// It accepts only tool names Favz already publishes, plus counts. It works the card out again
// itself, so a sent level is never trusted. It stores the summary, two dates, and the day each
// tool was first seen. It keeps no IP addresses and writes no request log.

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { validSummary, score } = require('../lib/score');
const { short, COMMAND } = require('../lib/card');

const KNOWN_FILE = process.env.FAVZ_KNOWN || '/var/www/favz/known.json';
const STORE = process.env.FAVZ_PROFILES || '/var/lib/favz/profiles';
const PORT = Number(process.env.FAVZ_PORT || 8082);
const SITE = 'https://favz.co';
const ID = /^[A-Za-z0-9_-]{12}$/;
const MAX_BODY = 64 * 1024;
const MAX_PROFILES = 50000;
const MAX_NEW_PER_HOUR = 600;

let known = null, knownTime = 0;
function loadKnown() {
  const time = fs.statSync(KNOWN_FILE).mtimeMs;
  if (time !== knownTime) { known = JSON.parse(fs.readFileSync(KNOWN_FILE, 'utf8')); knownTime = time; }
  return known;
}

const hash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const sameHash = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const fileOf = (id) => path.join(STORE, `${id}.json`);
const today = () => new Date().toISOString().slice(0, 10);
const esc = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function readProfile(id) {
  if (typeof id !== 'string' || !ID.test(id)) return null;
  try { return JSON.parse(fs.readFileSync(fileOf(id), 'utf8')); } catch (e) { return null; }
}

function owns(profile, token) {
  return Boolean(profile) && typeof token === 'string' && sameHash(profile.token_hash, hash(token));
}

let windowStart = 0, windowCount = 0;
function roomForNew() {
  if (Date.now() - windowStart > 3600e3) { windowStart = Date.now(); windowCount = 0; }
  return ++windowCount <= MAX_NEW_PER_HOUR && fs.readdirSync(STORE).length < MAX_PROFILES;
}

function save(body) {
  if (!validSummary(body.summary, loadKnown())) return [400, { error: 'summary refused' }];
  const summary = { tools: body.summary.tools, other: body.summary.other };
  let id = body.id, token = body.token, profile = readProfile(id);
  if (!owns(profile, token)) {
    if (!roomForNew()) return [429, { error: 'try again later' }];
    id = crypto.randomBytes(9).toString('base64url');
    token = crypto.randomBytes(32).toString('hex');
    profile = { token_hash: hash(token), created: today(), first_seen: {} };
  }
  // The day this server first saw each tool. The sender cannot set it.
  const firstSeen = {};
  for (const tool of summary.tools) firstSeen[tool] = profile.first_seen[tool] || today();
  Object.assign(profile, { updated: today(), summary, first_seen: firstSeen });
  fs.writeFileSync(fileOf(id), JSON.stringify(profile), { mode: 0o600 });
  return [200, { id, token, url: `${SITE}/p/${id}` }];
}

function remove(body) {
  const profile = readProfile(body.id);
  if (!owns(profile, body.token)) return [404, { error: 'not found' }];
  fs.rmSync(fileOf(body.id));
  return [200, { deleted: true }];
}

function page(profile) {
  const current = loadKnown();
  const names = new Set(current.names);
  const summary = { tools: profile.summary.tools.filter((t) => names.has(t)), other: profile.summary.other };
  const card = score(summary, current);
  const heading = `Level ${card.level} ${card.class} · ${card.title}`;
  const counts = Object.entries(card.count).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${esc(k)}`).join(' · ');
  const rows = summary.tools.map((t) => `<tr><td><code>${esc(short(t))}</code></td><td>${esc(t.split(':')[0])}</td>` +
    `<td>${esc(profile.first_seen[t] || '')}</td></tr>`).join('');
  const lines = [
    `<p>${card.total} tools set up. The median public setup has ${esc(card.median_tools)}.<br>${counts}</p>`,
    card.rarest ? `<p>Rarest: <code>${esc(short(card.rarest.tool))}</code>, in ${card.rarest.repos_now} of ${card.sample_repos} sampled setups.</p>` : '',
    card.rising.length ? `<p>Rising fast in the sample: ${card.rising.map((t) => `<code>${esc(short(t))}</code>`).join(', ')}.</p>` : '',
    rows ? `<table><thead><tr><th>Public tool</th><th>Kind</th><th>First seen here</th></tr></thead><tbody>${rows}</tbody></table>` : '',
  ].join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(heading)} · Favz</title>
<meta property="og:title" content="${esc(heading)}"><meta property="og:description" content="An AI agent setup, scored by Favz. Get yours with: ${esc(COMMAND)}">
<style>:root{--bg:#fdfdfb;--fg:#1b1b18;--muted:#66665f;--line:#e2e2da;--accent:#0b5d4b}
@media (prefers-color-scheme:dark){:root{--bg:#141412;--fg:#ecece6;--muted:#a0a097;--line:#30302b;--accent:#6fd3b8}}
body{background:var(--bg);color:var(--fg);font:17px/1.6 Georgia,serif;margin:0}main{max-width:640px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:2rem;line-height:1.2}a{color:var(--accent)}code{font-size:.88em}
table{border-collapse:collapse;width:100%;font:15px/1.4 system-ui,sans-serif}th,td{text-align:left;padding:6px 10px 6px 0;border-bottom:1px solid var(--line)}
.brand{font:600 15px system-ui,sans-serif;letter-spacing:.04em;color:var(--muted)}.small{font:14px system-ui,sans-serif;color:var(--muted)}
pre{border:1px solid var(--line);border-radius:6px;padding:12px;font-size:15px}</style></head><body><main>
<div class="brand"><a href="/" style="color:inherit;text-decoration:none">FAVZ</a></div>
<h1>${esc(heading)}</h1>
${lines}
<h2>Get yours</h2><pre>${esc(COMMAND)}</pre>
<p class="small">The level is a game, not a measurement. It comes from how many kinds of tool are set up, how many were
made by hand, how rare the public ones are, and how many are rising in <a href="/">our sample of ${card.sample_repos} public setups</a>.
This page holds public tool names and counts only. Updated ${esc(profile.updated)}.</p>
</main></body></html>`;
}

function send(res, status, body, type = 'application/json') {
  const text = type === 'application/json' ? JSON.stringify(body) : body;
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(text);
}

function handle(req, res) {
  const url = req.url.split('?')[0];
  if (req.method === 'GET' && url.startsWith('/p/')) {
    const profile = readProfile(url.slice(3));
    return profile ? send(res, 200, page(profile), 'text/html') : send(res, 404, 'Not found', 'text/plain');
  }
  if (req.method !== 'POST' || (url !== '/api/profile' && url !== '/api/profile/delete')) return send(res, 404, { error: 'not found' });
  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) { send(res, 413, { error: 'too large' }); req.destroy(); } else chunks.push(chunk);
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { body = null; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { error: 'bad request' });
    try {
      const [status, reply] = url === '/api/profile' ? save(body) : remove(body);
      send(res, status, reply);
    } catch (e) { send(res, 500, { error: 'server error' }); }
  });
}

if (require.main === module) {
  fs.mkdirSync(STORE, { recursive: true, mode: 0o700 });
  http.createServer(handle).listen(PORT, '127.0.0.1');
}

module.exports = { handle };

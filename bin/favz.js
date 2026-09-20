#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { scan } = require('../lib/scan');
const { summarize, score } = require('../lib/score');
const { cardText, summaryText, COMMAND } = require('../lib/card');

const BASE = (process.env.FAVZ_URL || 'https://favz.co').replace(/\/+$/, '');
const STATE = path.join(os.homedir(), '.config', 'favz', 'profile.json');
const HELP = `favz: see how your AI agent setup compares with public ones.

  ${COMMAND}             scan this machine and show your card. Nothing is sent.
  ${COMMAND} --publish   also make a profile page, after showing exactly what is sent
  ${COMMAND} --json      print the card as JSON
  ${COMMAND} --delete    delete your profile page
  ${COMMAND} --help

It reads your Claude Code, Cursor and VS Code agent config and keeps tool names only.
It never reads env values, headers or arguments, and it never installs anything.
`;

async function request(pathname, body) {
  const options = body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {};
  const response = await fetch(BASE + pathname, { ...options, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${pathname} answered ${response.status}`);
  return response.json();
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim().toLowerCase()); }));
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return null; }
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  if (flags.has('--help') || flags.has('-h')) return console.log(HELP);

  if (flags.has('--delete')) {
    const state = readState();
    if (!state) return console.log('No profile was published from this machine.');
    await request('/api/profile/delete', { id: state.id, token: state.token });
    fs.rmSync(STATE);
    return console.log('Profile deleted.');
  }

  const known = await request('/known.json');
  const found = scan();
  const summary = summarize(found.names, known);
  const card = score(summary, known);
  if (flags.has('--json')) return console.log(JSON.stringify({ card, summary }, null, 2));

  console.log(`\n  Read ${found.files.length} config files. Found ${found.names.length} tool names.`);
  console.log(cardText(card));

  const canAsk = process.stdin.isTTY && process.stdout.isTTY;
  if (!flags.has('--publish') && !canAsk) return;
  console.log('  A profile page would hold your card at a private link. This is all that would be sent:\n');
  console.log(summaryText(summary) + '\n');
  if (!flags.has('--yes')) {
    if (!canAsk) return console.log('  Not sent. Add --yes to publish without a prompt.');
    if ((await ask('  Send this and make a profile page? [y/N] ')) !== 'y') return console.log('  Nothing was sent.');
  }
  const state = readState() || {};
  const reply = await request('/api/profile', { summary, id: state.id, token: state.token });
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ id: reply.id, token: reply.token, url: reply.url }), { mode: 0o600 });
  console.log(`  Your profile: ${reply.url}\n  Delete it any time with: ${COMMAND} --delete`);
}

main().catch((error) => { console.error(`favz: ${error.message}`); process.exit(1); });

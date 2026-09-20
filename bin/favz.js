#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { scan } = require('../lib/scan');
const { summarize, view } = require('../lib/score');
const { viewText, ratingText, summaryText, COMMAND } = require('../lib/card');

const BASE = (process.env.FAVZ_URL || 'https://favz.co').replace(/\/+$/, '');
const STATE = path.join(os.homedir(), '.config', 'favz', 'profile.json');
const HELP = `favz: see how your AI agent setup compares with public ones, and get a class and a level.

  ${COMMAND}               look at the current folder and your own setup
  ${COMMAND} ~/Projects    look at a folder of projects (it and the folders directly inside it)
  ${COMMAND} --publish     send the summary without the question (add --yes to skip the prompt)
  ${COMMAND} --json        print what was found as JSON. Sends nothing.
  ${COMMAND} --delete      delete your profile and its history
  ${COMMAND} --help

Counts and suggestions are worked out on your machine and nothing is sent for them.
Your class and level live on your Favz profile. To get them you agree to send a summary: tool
names Favz already publishes, and counts of everything else. It is shown to you first.
Run it again later and the profile keeps a timeline of how your setup grows.

It reads Claude Code, Cursor and VS Code agent config and keeps tool names only. It never reads
env values, headers or arguments, and it never installs anything.
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

  const paths = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const known = await request('/known.json');
  const found = scan(paths.length ? { paths } : {});
  const summary = summarize(found.names, known, found.projects);
  const local = view(summary, known);
  if (flags.has('--json')) return console.log(JSON.stringify({ view: local, summary }, null, 2));

  console.log(`\n  Read ${found.files.length} config files in ${found.projects} project folders and your own setup. Found ${found.names.length} tool names.`);
  console.log(viewText(local));

  const canAsk = process.stdin.isTTY && process.stdout.isTTY;
  console.log('  Your class and level live on your Favz profile, at a private link. To get them, this is');
  console.log('  all that would be sent:\n');
  console.log(summaryText(summary) + '\n');
  if (!flags.has('--yes')) {
    if (!canAsk) return console.log(`  Nothing was sent. To send it without a prompt: ${COMMAND} --publish --yes`);
    if ((await ask('  Send this and get your class and level? [y/N] ')) !== 'y') return console.log('  Nothing was sent.');
  }
  const state = readState() || {};
  const reply = await request('/api/profile', { summary, id: state.id, token: state.token });
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ id: reply.id, token: reply.token, url: reply.url }), { mode: 0o600 });
  console.log(ratingText(reply.card, reply.before));
  console.log(`  Your profile and timeline: ${reply.url}\n  Run this again any time to add to the timeline. Delete it all with: ${COMMAND} --delete`);
}

main().catch((error) => { console.error(`favz: ${error.message}`); process.exit(1); });

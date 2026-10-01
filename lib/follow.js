'use strict';
// Follow big repos: what each one runs now, and what came or went since the last check. The list of
// followed repos and what was last seen stay in ~/.config/favz/follows.json, on this machine. Checking
// fetches each repo's public page data from favz.co, the same file anyone can open.

const { short } = require('./card');

const SITE = 'https://favz.co';

// "owner/name" from "owner/name" or a GitHub link; null for anything else.
function repoName(input) {
  const s = String(input || '').trim().replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '').replace(/(\.git)?\/*$/, '');
  return /^[\w.-]+\/[\w.-]+$/.test(s) && !s.split('/').some((p) => /^\.+$/.test(p)) ? s : null;
}

const jsonPath = (repo) => `/repos/${repo.toLowerCase()}.json`;
const pageUrl = (repo) => `${SITE}/repos/${repo.toLowerCase()}.html`;

// What to keep from a repo's page data: the tools it runs now and its newest change.
function snapshot(data, day) {
  return { repo: data.repo, checked: day, tools: data.tools_now.map((t) => t.tool).sort(),
    last: data.changes.length ? data.changes[0].day : null };
}

// Tools added and removed between two snapshots. null before the first check.
function diff(before, after) {
  if (!before || !before.tools) return null;
  const was = new Set(before.tools);
  const now = new Set(after.tools);
  return { since: before.checked, added: after.tools.filter((t) => !was.has(t)),
    removed: before.tools.filter((t) => !now.has(t)) };
}

function followText(snap, change) {
  const lines = [`  ${snap.repo}: ${snap.tools.length} ${snap.tools.length === 1 ? 'tool' : 'tools'} now${snap.last ? `, last change ${snap.last}` : ''}.`];
  if (!change) lines.push(`    Runs ${snap.tools.map(short).join(', ') || 'no tool Favz names'}.`);
  else if (!change.added.length && !change.removed.length) lines.push(`    No change since ${change.since}.`);
  else {
    if (change.added.length) lines.push(`    Added since ${change.since}: ${change.added.map(short).join(', ')}.`);
    if (change.removed.length) lines.push(`    Removed since ${change.since}: ${change.removed.map(short).join(', ')}.`);
  }
  lines.push(`    ${pageUrl(snap.repo)}`);
  return lines.join('\n');
}

module.exports = { repoName, jsonPath, pageUrl, snapshot, diff, followText };

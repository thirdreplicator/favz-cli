'use strict';
// Stats across a folder of projects, and for each one. Worked out and shown on this machine only.
// Folder names appear on screen and in --json, and never in the summary that can be sent.

const path = require('path');
const { KINDS } = require('./score');
const { short } = require('./card');

const kindOf = (name) => name.split(':')[0];
const SHOW = 25; // projects listed one per line; the rest are counted

function projectStats(found, known) {
  const stats = new Map(known.names.map((name, i) => [name, known.stats[i]]));
  const canonical = (name) => known.aliases[name] || name;
  const projects = found.perProject.map(({ dir, names }) => {
    const tools = [...new Set(names.map(canonical))].filter((t) => !t.endsWith(':redacted'));
    const count = {};
    for (const t of tools) if (KINDS.includes(kindOf(t))) count[kindOf(t)] = (count[kindOf(t)] || 0) + 1;
    const publicTools = tools.filter((t) => stats.has(t));
    const rarest = publicTools.slice().sort((a, b) => stats.get(a)[1] - stats.get(b)[1])[0] || null;
    return { name: path.basename(dir), tools, total: tools.length, count, own: tools.length - publicTools.length,
      rarest: rarest && { tool: rarest, repos_now: stats.get(rarest)[1] } };
  });

  const n = projects.length;
  const uses = new Map();
  for (const p of projects) for (const t of p.tools) uses.set(t, (uses.get(t) || 0) + 1);
  const all = [...uses].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  // Your common stack: tools in at least two projects and at least 40% of them.
  const common = all.filter(([, k]) => k >= 2 && k >= 0.4 * n).slice(0, 6).map(([tool, k]) => ({ tool, projects: k }));
  // Gaps: a tool in at least half your projects (and three or more) that a project lacks.
  const gaps = common.filter((c) => c.projects >= 3 && c.projects >= 0.5 * n && c.projects < n)
    .map((c) => ({ ...c, missing: projects.filter((p) => !p.tools.includes(c.tool)).map((p) => p.name) }));
  const sizes = projects.map((p) => p.total).filter(Boolean).sort((a, b) => a - b);
  const personal = new Set(found.personal.map(canonical));

  return {
    overall: {
      projects: n,
      with_tools: projects.filter((p) => p.total > 0).length,
      distinct: uses.size,
      one_project_only: all.filter(([, k]) => k === 1).length,
      own: new Set(projects.flatMap((p) => p.tools.filter((t) => !stats.has(t)))).size,
      median_tools: sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : 0,
      public_median: known.median_tools,
      personal: personal.size,
      kinds: Object.fromEntries(KINDS.map((k) => [k, projects.filter((p) => p.count[k]).length]).filter(([, v]) => v)),
      common,
      gaps,
    },
    projects: projects.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)).map(({ tools, ...p }) => p),
  };
}

const list = (names, max = 3) => names.slice(0, max).join(', ') + (names.length > max ? ` and ${names.length - max} more` : '');
const plural = (k, word) => `${k} ${word}${k === 1 ? '' : 's'}`;

function projectsText(s) {
  const o = s.overall;
  if (o.projects < 2) return '';
  const lines = ['', `  Across your ${o.projects} projects`];
  const shared = o.distinct - o.one_project_only;
  lines.push(`    ${plural(o.distinct, 'different tool')}. ${!o.distinct ? '' : !shared ? 'No tool is shared between projects.' : `${shared} ${shared === 1 ? 'is' : 'are'} in two or more projects.`}`);
  if (o.with_tools < o.projects) lines.push(`    ${o.projects - o.with_tools} of the ${o.projects} have agent config but no tools of their own.`);
  if (o.with_tools) lines.push(`    The typical project with tools has ${plural(o.median_tools, 'tool')}. The typical public setup has ${o.public_median}.`);
  if (o.own) lines.push(`    ${o.own} are your own or too rare to be public: they appear in fewer than 3 sampled repos.`);
  if (o.personal) lines.push(`    ${plural(o.personal, 'more tool')} in your own setup (in your home folder) reach every project.`);
  if (Object.keys(o.kinds).length) lines.push('    Projects using each kind: ' + Object.entries(o.kinds).map(([k, v]) => `${k} ${v}`).join(' · '));
  if (o.common.length) {
    lines.push('', '  Your common stack');
    for (const c of o.common) lines.push(`    ${short(c.tool).padEnd(34)} in ${c.projects} of ${o.projects}`);
  }
  if (o.gaps.length) {
    lines.push('', '  Gaps in your own pattern');
    for (const g of o.gaps) lines.push(`    ${short(g.tool)} is in ${g.projects} of ${o.projects} projects, but not in ${list(g.missing)}.`);
  }
  const width = Math.min(28, Math.max(...s.projects.map((p) => p.name.length), 7));
  lines.push('', `  ${'Project'.padEnd(width)}  tools  kinds`);
  for (const p of s.projects.slice(0, SHOW)) {
    const kinds = Object.entries(p.count).map(([k, v]) => `${v} ${k}`).join(' · ') || '-';
    const name = p.name.length > width ? p.name.slice(0, width - 1) + '…' : p.name;
    lines.push(`  ${name.padEnd(width)}  ${String(p.total).padStart(5)}  ${kinds}${p.rarest && p.rarest.repos_now <= 10 ? `  · rare: ${short(p.rarest.tool)}` : ''}`);
  }
  if (s.projects.length > SHOW) lines.push(`  and ${s.projects.length - SHOW} more. See them all with --json.`);
  lines.push('  Project names are shown here only. They are never sent.', '');
  return lines.join('\n');
}

module.exports = { projectStats, projectsText };

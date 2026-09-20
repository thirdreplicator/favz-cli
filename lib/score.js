'use strict';
// Class, level and suggestions. Everything here works from the summary alone (public tool
// names plus counts), so the server can work out the same card from what was sent.

const KINDS = ['mcp', 'skill', 'agent', 'command', 'hook', 'plugin'];
const SUGGESTABLE = ['mcp:npm:', 'mcp:pypi:', 'mcp:docker:', 'mcp:url:', 'plugin:'];
const TITLES = ['Novice', 'Journeyman', 'Expert', 'Master', 'Grandmaster']; // six levels each
const MAX_LEVEL = 30;
const MAX_MONTHS = 10; // levels that only time on Favz can give
const FRONT_END = /playwright|devtools|shadcn|frontend|ui-ux|taste|design|figma|browser|puppeteer|tailwind/i;
const KNOWLEDGE = /context7|memory|docs|learn|thinking|search|fetch|wiki|notion|obsidian/i;
const RISING = 0.4; // share of a tool's sample adoptions that came in the last three months
const MAX_TOOLS = 500;
const MAX_COUNT = 10000;

const kindOf = (name) => name.split(':')[0];
const isProduct = (name) => SUGGESTABLE.some((p) => name.startsWith(p)) || name.startsWith('skill:');

function lookup(known) {
  const stats = new Map(known.names.map((name, i) => [name, known.stats[i]]));
  return { stats, canonical: (name) => known.aliases[name] || name };
}

// What would be sent: names Favz already publishes, and a count per kind for everything else.
function summarize(names, known, projects = 0) {
  const { stats, canonical } = lookup(known);
  const tools = new Set();
  const other = {};
  for (const raw of names) {
    const name = canonical(raw);
    if (stats.has(name)) tools.add(name);
    else if (KINDS.includes(kindOf(name))) other[kindOf(name)] = (other[kindOf(name)] || 0) + 1;
  }
  return { tools: [...tools].sort(), other, projects };
}

function validSummary(summary, known) {
  if (!summary || !Array.isArray(summary.tools) || summary.tools.length > MAX_TOOLS) return false;
  const { stats } = lookup(known);
  if (!summary.tools.every((t) => typeof t === 'string' && stats.has(t))) return false;
  if (new Set(summary.tools).size !== summary.tools.length) return false;
  // Version 0.1 of the command sent no project count.
  if (summary.projects !== undefined && (!Number.isInteger(summary.projects) || summary.projects < 0 || summary.projects > 2000)) return false;
  const other = summary.other;
  if (!other || typeof other !== 'object' || Array.isArray(other)) return false;
  return Object.entries(other).every(([k, n]) => KINDS.includes(k) && Number.isInteger(n) && n >= 0 && n <= MAX_COUNT);
}

// What the command shows without sending anything: counts and suggestions, no class or level.
function view(summary, known) {
  const { level, title, class: klass, ...rest } = score(summary, known);
  return rest;
}

// monthsActive is how many different months the server has a snapshot for. Only the server knows it.
function score(summary, known, monthsActive = 0) {
  const { stats } = lookup(known);
  const other = summary.other;
  const count = {};
  for (const kind of KINDS) count[kind] = other[kind] || 0;
  for (const tool of summary.tools) count[kindOf(tool)] += 1;
  const total = KINDS.reduce((sum, k) => sum + count[k], 0);
  const custom = ['skill', 'agent', 'command', 'hook'].reduce((sum, k) => sum + (other[k] || 0), 0);

  const products = summary.tools.filter(isProduct);
  const bits = products.map((t) => Math.log2(known.sample_repos / Math.max(stats.get(t)[1], 1))).sort((a, b) => b - a);
  const top = bits.slice(0, 3);
  const rising = products.filter((t) => stats.get(t)[2] !== null && stats.get(t)[2] >= RISING);

  const parts = {
    breadth: KINDS.filter((k) => count[k] > 0).length,
    size: Math.min(4, Math.log2(1 + total)),
    craft: Math.min(4, Math.log2(1 + custom)),
    rarity: top.length ? Math.min(3, top.reduce((a, b) => a + b, 0) / top.length / 3) : 0,
    rising: Math.min(3, rising.length),
    months: Math.min(MAX_MONTHS, Math.max(0, monthsActive)),
  };
  const level = Math.max(1, Math.min(MAX_LEVEL, Math.round(Object.values(parts).reduce((a, b) => a + b, 0))));

  const points = [
    ['Illusionist', 2 * summary.tools.filter((t) => FRONT_END.test(t)).length],
    ['Sage', 2 * summary.tools.filter((t) => KNOWLEDGE.test(t)).length],
    ['Summoner', count.mcp],
    ['Artificer', count.hook + count.command],
    ['Enchanter', (other.skill || 0) + (other.agent || 0)],
  ];
  const best = points.reduce((a, b) => (b[1] > a[1] ? b : a));
  const klass = total < 3 || best[1] === 0 ? 'Rogue' : best[0];

  const rarest = products.slice().sort((a, b) => stats.get(a)[1] - stats.get(b)[1])[0] || null;
  return {
    level, title: TITLES[Math.ceil(level / 6) - 1], class: klass, total, count,
    median_tools: known.median_tools, sample_repos: known.sample_repos,
    rarest: rarest && { tool: rarest, repos_now: stats.get(rarest)[1] },
    rising: rising.slice(0, 5),
    suggestions: suggest(summary.tools, known),
  };
}

// Tools that setups like this one run and this one does not. Structured fields only.
function suggest(tools, known, limit = 3) {
  const mine = new Set(tools);
  const best = new Map();
  for (const [i, j, both] of known.pairs) {
    for (const [have, want] of [[known.names[i], known.names[j]], [known.names[j], known.names[i]]]) {
      if (!mine.has(have) || mine.has(want) || !SUGGESTABLE.some((p) => want.startsWith(p))) continue;
      const of = known.stats[known.names.indexOf(have)][1];
      const entry = best.get(want) || { tool: want, weight: 0, with: have, both, of };
      entry.weight += both / Math.max(of, 1);
      if (both / Math.max(of, 1) > entry.both / Math.max(entry.of, 1)) Object.assign(entry, { with: have, both, of });
      best.set(want, entry);
    }
  }
  return [...best.values()].sort((a, b) => b.weight - a.weight || a.tool.localeCompare(b.tool)).slice(0, limit)
    .map(({ tool, with: w, both, of }) => ({ tool, with: w, both, of }));
}

module.exports = { summarize, validSummary, view, score, suggest, KINDS, TITLES, MAX_LEVEL };

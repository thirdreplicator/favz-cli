'use strict';
// "People like you use X", from the census block of known.json. Worked out on this machine only:
// nothing here is sent. `seen` is what the last run showed, kept locally, so a later run can say
// what is new since then.

const SITE = 'https://favz.co';
const MIN_BOTH = 5; // a pairing needs this many repos with both before it counts
const GROWING = 0.05; // grew by at least this share of its repos in the census's last 30 days

function census(known) {
  const c = known.census;
  if (!c) return null;
  const at = new Map(c.names.map((name, i) => [name, i]));
  return { c, at };
}

// The tools that repos sharing your tools run most, beyond chance, and that you do not run.
function likeYou(names, known, limit = 5) {
  const k = census(known);
  if (!k) return [];
  const { c, at } = k;
  const canonical = (name) => known.aliases[name] || name;
  const mine = new Set(names.map(canonical).filter((n) => at.has(n)).map((n) => at.get(n)));
  const best = new Map();
  for (const [i, j, both] of c.pairs) {
    if (both < MIN_BOTH) continue;
    for (const [have, want] of [[i, j], [j, i]]) {
      if (!mine.has(have) || mine.has(want)) continue;
      const lift = (both * c.repos) / (c.now[have] * c.now[want]);
      const share = both / c.now[have];
      const entry = best.get(want) || { want, weight: 0, have, both, share: 0 };
      entry.weight += Math.log2(Math.max(lift, 1)) * share;
      if (share > entry.share) Object.assign(entry, { have, both, share });
      best.set(want, entry);
    }
  }
  return [...best.values()].filter((e) => e.weight > 0)
    .sort((a, b) => b.weight - a.weight || c.names[a.want].localeCompare(c.names[b.want])).slice(0, limit)
    .map((e) => ({
      tool: c.names[e.want], with: c.names[e.have], both: e.both, of: c.now[e.have],
      repos: c.now[e.want], grew: c.grew[e.want], growing: c.grew[e.want] >= GROWING * c.now[e.want],
      page: `${SITE}/${c.pages[e.want]}`,
    }));
}

// How many of your tools too few public repos run for Favz to list. Only the kinds the census lists
// are counted. Null for a known.json that does not say how many repos a listed tool needs.
function yoursAlone(names, known) {
  const k = census(known);
  if (!k || !k.c.min_repos) return null;
  const kinds = new Set(k.c.names.map((n) => n.split(':')[0]));
  const mine = [...new Set(names.map((n) => known.aliases[n] || n))].filter((n) => kinds.has(n.split(':')[0]));
  if (!mine.length) return null;
  return { of: mine.length, alone: mine.filter((n) => !k.at.has(n)).length, min: k.c.min_repos, repos: k.c.repos };
}

// A link to favz.co/map/ with your listed tools marked. They go after the #, which browsers do not
// send to any server. Tools the census does not list are only counted. Null without a census.
function mapLink(names, known) {
  const k = census(known);
  if (!k) return null;
  const mine = [...new Set(names.map((n) => known.aliases[n] || n))].filter((n) => k.at.has(n));
  const alone = yoursAlone(names, known);
  const parts = [`mine=${mine.map(encodeURIComponent).join(',')}`];
  if (alone) parts.push(`of=${alone.of}`, `alone=${alone.alone}`);
  return `${SITE}/map/#${parts.join('&')}`;
}

// What changed since the last run: tools that are new on the list, and how the old ones grew.
function sinceLast(picks, known, seen) {
  const k = census(known);
  if (!k || !seen || !seen.shown) return null;
  const fresh = picks.filter((p) => !(p.tool in seen.shown)).map((p) => p.tool);
  const moved = Object.entries(seen.shown)
    .filter(([tool]) => k.at.has(tool))
    .map(([tool, was]) => ({ tool, was, now: k.c.now[k.at.get(tool)] }))
    .filter((m) => m.now !== m.was)
    .sort((a, b) => Math.abs(b.now - b.was) - Math.abs(a.now - a.was));
  return { day: seen.day, census: seen.census, sameCensus: seen.census === k.c.date, fresh, moved: moved.slice(0, 3) };
}

// What to remember for next time: the census date and each shown tool's repo count.
function remember(picks, known, day) {
  const k = census(known);
  if (!k) return null;
  return { day, census: k.c.date, shown: Object.fromEntries(picks.map((p) => [p.tool, p.repos])) };
}

module.exports = { likeYou, yoursAlone, mapLink, sinceLast, remember, MIN_BOTH };

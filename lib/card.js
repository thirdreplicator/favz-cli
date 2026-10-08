'use strict';
// The card as plain text, and the exact summary a person is asked to approve.

// How people run this tool.
const COMMAND = 'npx favz-cli';

const short = (tool) => tool.split(':').slice(1).join(':').replace(/^(npm|pypi|docker|url):/, '');

// What is shown before anything is sent: counts and suggestions. No class or level.
function viewText(view) {
  const lines = [
    '',
    `  ${view.total} tools set up. The median public setup has ${view.median_tools}.`,
    '  ' + Object.entries(view.count).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(' · '),
  ];
  if (view.rarest) {
    lines.push(`  Rarest: ${short(view.rarest.tool)}, in ${view.rarest.repos_now} of ${view.sample_repos} sampled setups.`);
  }
  if (view.rising.length) lines.push(`  Rising fast in the sample: ${view.rising.map(short).join(', ')}.`);
  if (view.suggestions.length && !view.likeYou) {
    lines.push('', '  Setups like yours also run:');
    for (const s of view.suggestions) {
      lines.push(`    ${short(s.tool)}  (${s.both} of ${s.of} setups with ${short(s.with)})`);
    }
    lines.push('  These are counts, not advice. Favz never installs anything.');
  }
  lines.push('');
  return lines.join('\n');
}

// "People like you use X" from the census, and what changed since the last run on this machine.
function likeYouText(picks, since, repos, alone) {
  const lines = [];
  if (alone && alone.alone) {
    lines.push(`  ${alone.alone} of your ${alone.of} skills, MCP servers and plugins are yours alone:`,
      `  fewer than ${alone.min} of ${alone.repos.toLocaleString('en-US')} public repos run each.`, '');
  }
  if (since && since.sameCensus) {
    lines.push(`  No new census since your last run (${since.day}). It updates every day or two.`);
  } else if (since) {
    lines.push(`  Since your last run (${since.day}):`);
    for (const m of since.moved) {
      const d = m.now - m.was;
      lines.push(`    ${short(m.tool)}: ${m.was} → ${m.now} repos (${d > 0 ? '+' : ''}${d})`);
    }
    if (since.fresh.length) lines.push(`    ${since.fresh.length} new on your list, marked "new" below.`);
    if (!since.fresh.length && !since.moved.length) lines.push('    nothing moved on your list.');
  }
  if (!picks.length) {
    lines.push('', '  None of your tools is common enough in public repos to say what goes with it.',
      '  Browse what people run: https://favz.co/tools/', '');
    return lines.join('\n');
  }
  lines.push('', `  People like you use (from ${repos.toLocaleString('en-US')} public repos):`);
  for (const p of picks) {
    const up = p.growing ? `, +${p.grew} repos in 30 days` : '';
    const isNew = since && !since.sameCensus && since.fresh.includes(p.tool) ? ' (new)' : '';
    lines.push(`    ${short(p.tool)}${isNew}: ${p.both} of the ${p.of} repos with ${short(p.with)} run it${up}`);
    lines.push(`      ${p.page}`);
  }
  lines.push('  These are counts, not advice. Favz never installs anything.',
    '  Run it again in a few days to see what changed. Browse everything: https://favz.co/tools/', '');
  return lines.join('\n');
}

// The rating, as the server sent it back. `before` is the last snapshot from an earlier day, if any.
function ratingText(card, before) {
  const lines = ['', `  Level ${card.level} ${card.class} · ${card.title}`];
  if (before) lines.push(`  Last time (${before.day}): Level ${before.level} ${before.class}.`);
  lines.push('');
  return lines.join('\n');
}

function summaryText(summary) {
  const other = Object.entries(summary.other).map(([k, n]) => `${n} other ${k}`).join(', ') || 'none';
  return [
    '  Tool names Favz already publishes:',
    ...(summary.tools.length ? summary.tools.map((t) => `    ${t}`) : ['    (none)']),
    `  Counts only, no names: ${other}`,
    `  Number of project folders with agent config: ${summary.projects}`,
  ].join('\n');
}

module.exports = { viewText, likeYouText, ratingText, summaryText, short, COMMAND };

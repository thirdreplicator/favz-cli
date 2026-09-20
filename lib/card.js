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
  if (view.suggestions.length) {
    lines.push('', '  Setups like yours also run:');
    for (const s of view.suggestions) {
      lines.push(`    ${short(s.tool)}  (${s.both} of ${s.of} setups with ${short(s.with)})`);
    }
    lines.push('  These are counts, not advice. Favz never installs anything.');
  }
  lines.push('');
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

module.exports = { viewText, ratingText, summaryText, short, COMMAND };

'use strict';
// The card as plain text, and the exact summary a person is asked to approve.

// How people run this tool.
const COMMAND = 'npx favz-cli';

const short = (tool) => tool.split(':').slice(1).join(':').replace(/^(npm|pypi|docker|url):/, '');

function cardText(card) {
  const lines = [
    '',
    `  Level ${card.level} ${card.class} · ${card.title}`,
    '',
    `  ${card.total} tools set up. The median public setup has ${card.median_tools}.`,
    '  ' + Object.entries(card.count).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(' · '),
  ];
  if (card.rarest) {
    lines.push(`  Rarest: ${short(card.rarest.tool)}, in ${card.rarest.repos_now} of ${card.sample_repos} sampled setups.`);
  }
  if (card.rising.length) lines.push(`  Rising fast in the sample: ${card.rising.map(short).join(', ')}.`);
  if (card.suggestions.length) {
    lines.push('', '  Setups like yours also run:');
    for (const s of card.suggestions) {
      lines.push(`    ${short(s.tool)}  (${s.both} of ${s.of} setups with ${short(s.with)})`);
    }
    lines.push('  These are counts, not advice. Favz never installs anything.');
  }
  lines.push('');
  return lines.join('\n');
}

function summaryText(summary) {
  const other = Object.entries(summary.other).map(([k, n]) => `${n} other ${k}`).join(', ') || 'none';
  return [
    '  Tool names Favz already publishes:',
    ...(summary.tools.length ? summary.tools.map((t) => `    ${t}`) : ['    (none)']),
    `  Counts only, no names: ${other}`,
  ].join('\n');
}

module.exports = { cardText, summaryText, short, COMMAND };

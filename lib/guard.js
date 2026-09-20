'use strict';
// Last line of defence: does this derived name look like it carries a secret?
// A port of spike/secret_guard.py. test/vectors.json keeps the two in step.

const KNOWN_SHAPES = new RegExp(
  '(?<![A-Za-z0-9])(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|sk-[A-Za-z0-9_-]{20,}|xox[abpsr]-|AKIA[0-9A-Z]{12,}' +
  '|AIza[0-9A-Za-z_-]{20,}|eyJ[A-Za-z0-9_-]{15,}|glpat-|npm_[A-Za-z0-9]{20,})|[A-Fa-f0-9]{32,}');
const KEY_WORDS = /(?:secret|passw(?:or)?d|api[_-]?key|token)[=:]/i;
const RUN = /[A-Za-z0-9]{16,}/g;
const MIN_ENTROPY = 3.5; // bits per character; English words in a run sit near 3.0
// The only characters a name may hold. Anything else is shell text, a version range, or worse.
const ALLOWED = /^[A-Za-z0-9@/._+:-]{1,140}$/;

function entropy(text) {
  const counts = {};
  for (const c of text) counts[c] = (counts[c] || 0) + 1;
  return -Object.values(counts).reduce((sum, n) => sum + (n / text.length) * Math.log2(n / text.length), 0);
}

function randomLooking(run) {
  if (entropy(run) < MIN_ENTROPY) return false;
  const digits = (run.match(/[0-9]/g) || []).length;
  let flips = 0;
  for (let i = 0; i + 1 < run.length; i++) {
    const a = run[i], b = run[i + 1];
    if (/[A-Za-z]/.test(a) && /[A-Za-z]/.test(b) && (a === a.toLowerCase()) !== (b === b.toLowerCase())) flips++;
  }
  return (digits >= 3 && digits < run.length) || flips >= 0.4 * run.length;
}

function looksSecret(name) {
  if (KNOWN_SHAPES.test(name) || KEY_WORDS.test(name)) return true;
  return (name.match(RUN) || []).some(randomLooking);
}

// True only for a name that is safe to show or send.
function safeName(name) {
  return typeof name === 'string' && ALLOWED.test(name) && !looksSecret(name);
}

module.exports = { looksSecret, safeName, entropy };

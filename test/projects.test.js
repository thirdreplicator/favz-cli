'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scan } = require('../lib/scan');
const { summarize } = require('../lib/score');
const { projectStats, projectsText } = require('../lib/projects');

const KNOWN = {
  sample_repos: 1000, median_tools: 6,
  names: ['mcp:npm:@playwright/mcp', 'mcp:npm:ctx', 'mcp:npm:shadcn', 'skill:frontend-design'],
  stats: [[150, 100, 0.1], [140, 100, 0.5], [70, 5, null], [70, 60, null]],
  pairs: [[0, 1, 30]],
  aliases: { 'mcp:url:ctx.example.com': 'mcp:npm:ctx' },
};

function makeProjects(spec) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'favz-'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'favz-projects-'));
  for (const [name, servers, skills = []] of spec) {
    fs.mkdirSync(path.join(root, name, '.claude', 'skills'), { recursive: true });
    fs.writeFileSync(path.join(root, name, '.mcp.json'), JSON.stringify({ mcpServers: servers }));
    for (const s of skills) {
      fs.mkdirSync(path.join(root, name, '.claude', 'skills', s));
      fs.writeFileSync(path.join(root, name, '.claude', 'skills', s, 'SKILL.md'), 'body');
    }
  }
  return { home, root, done: () => { fs.rmSync(home, { recursive: true }); fs.rmSync(root, { recursive: true }); } };
}
const npx = (pkg) => ({ command: 'npx', args: ['-y', pkg] });

test('each project keeps its own tools, and the pooled list is unchanged', () => {
  const { home, root, done } = makeProjects([
    ['alpha', { a: npx('@playwright/mcp'), b: { url: 'https://ctx.example.com/mcp' } }, ['acme-secret-skill']],
    ['beta', { a: npx('@playwright/mcp') }],
  ]);
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ projects: { [path.join(root, 'beta')]: { mcpServers: { s: npx('shadcn') } } } }));
  const found = scan({ home, paths: [root] });
  assert.deepStrictEqual(found.perProject.map((p) => [path.basename(p.dir), p.names]), [
    ['alpha', ['mcp:npm:@playwright/mcp', 'mcp:url:ctx.example.com', 'skill:acme-secret-skill']],
    ['beta', ['mcp:npm:@playwright/mcp', 'mcp:npm:shadcn']],
  ]);
  assert.deepStrictEqual(found.names, ['mcp:npm:@playwright/mcp', 'mcp:npm:shadcn', 'mcp:url:ctx.example.com', 'skill:acme-secret-skill']);
  assert.deepStrictEqual(found.personal, []);
  done();
});

test('stats across projects: common stack, gaps, one-offs and the rarest tool', () => {
  const { home, root, done } = makeProjects([
    ['alpha', { a: npx('@playwright/mcp'), b: npx('ctx') }, ['mine']],
    ['beta', { a: npx('@playwright/mcp'), s: npx('shadcn') }],
    ['gamma', { a: npx('@playwright/mcp'), b: { url: 'https://ctx.example.com/x' } }],
    ['delta', { b: npx('ctx') }],
  ]);
  const s = projectStats(scan({ home, paths: [root] }), KNOWN);
  assert.deepStrictEqual(s.overall.common, [{ tool: 'mcp:npm:@playwright/mcp', projects: 3 }, { tool: 'mcp:npm:ctx', projects: 3 }]);
  assert.deepStrictEqual(s.overall.gaps.map((g) => [g.tool, g.missing]), [['mcp:npm:@playwright/mcp', ['delta']], ['mcp:npm:ctx', ['beta']]]);
  assert.strictEqual(s.overall.distinct, 4);
  assert.strictEqual(s.overall.one_project_only, 2);
  assert.strictEqual(s.overall.own, 1);
  assert.deepStrictEqual(s.projects[0], { name: 'alpha', total: 3, count: { mcp: 2, skill: 1 }, own: 1, rarest: { tool: 'mcp:npm:@playwright/mcp', repos_now: 100 } });
  assert.deepStrictEqual(s.projects.find((p) => p.name === 'beta').rarest, { tool: 'mcp:npm:shadcn', repos_now: 5 });
  const text = projectsText(s);
  assert.match(text, /Across your 4 projects/);
  assert.match(text, /@playwright\/mcp is in 3 of 4 projects, but not in delta\./);
  assert.match(text, /rare: shadcn/);
  done();
});

test('project names never reach the summary that can be sent', () => {
  const { home, root, done } = makeProjects([['secret-client-name', { a: npx('@playwright/mcp') }], ['other', {}]]);
  const found = scan({ home, paths: [root] });
  const summary = summarize(found.names, KNOWN, found.projects);
  assert.ok(!JSON.stringify(summary).includes('secret-client-name'));
  assert.ok(projectsText(projectStats(found, KNOWN)).includes('secret-client-name'));
  done();
});

test('one project shows no cross-project block', () => {
  const { home, root, done } = makeProjects([['solo', { a: npx('@playwright/mcp') }]]);
  assert.strictEqual(projectsText(projectStats(scan({ home, paths: [path.join(root, 'solo')] }), KNOWN)), '');
  done();
});

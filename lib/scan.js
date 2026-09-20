'use strict';
// Read the agent config on this machine and return tool names. Nothing else is kept:
// each file is parsed, names are taken, and the text is dropped.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadsLenient, serverNames, settingsNames, guarded, SAFE_NAME } = require('./names');

function readJson(file) {
  try { return loadsLenient(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

function listDir(dir) {
  try { return fs.readdirSync(dir); } catch (e) { return []; }
}

const named = (kind, name) => `${kind}:${SAFE_NAME.test(name) ? name : 'redacted'}`;

// Skills, agents and commands under one .claude folder. Same rule as the public dataset:
// a skill is a folder holding SKILL.md, an agent or command is a top-level .md file.
function claudeFolderNames(dir) {
  const names = [];
  for (const entry of listDir(path.join(dir, 'skills'))) {
    if (fs.existsSync(path.join(dir, 'skills', entry, 'SKILL.md'))) names.push(named('skill', entry));
  }
  for (const [folder, kind] of [['agents', 'agent'], ['commands', 'command']]) {
    for (const entry of listDir(path.join(dir, folder))) {
      if (entry.endsWith('.md')) names.push(named(kind, entry.slice(0, -3)));
    }
  }
  return names;
}

function scan({ home = os.homedir(), cwd = process.cwd() } = {}) {
  const names = [];
  const seen = [];
  const take = (file, fn) => {
    const data = readJson(file);
    if (data && typeof data === 'object') { seen.push(file); names.push(...fn(data)); }
  };

  // Your own setup
  take(path.join(home, '.claude.json'), (d) => {
    const local = d.projects && d.projects[cwd];
    return serverNames(d.mcpServers).concat(serverNames(local && local.mcpServers));
  });
  take(path.join(home, '.claude', 'settings.json'), settingsNames);
  take(path.join(home, '.cursor', 'mcp.json'), (d) => serverNames(d.mcpServers));
  names.push(...claudeFolderNames(path.join(home, '.claude')));

  // The project in the current folder
  if (path.resolve(cwd) !== path.resolve(home)) {
    take(path.join(cwd, '.mcp.json'), (d) => serverNames(d.mcpServers));
    take(path.join(cwd, '.cursor', 'mcp.json'), (d) => serverNames(d.mcpServers));
    take(path.join(cwd, '.vscode', 'mcp.json'), (d) => serverNames('servers' in d ? d.servers : d.mcpServers));
    take(path.join(cwd, '.claude', 'settings.json'), settingsNames);
    take(path.join(cwd, '.claude', 'settings.local.json'), settingsNames);
    names.push(...claudeFolderNames(path.join(cwd, '.claude')));
  }
  return { names: guarded(names), files: seen };
}

module.exports = { scan, claudeFolderNames };

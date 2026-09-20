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

const PROJECT_FILES = ['.mcp.json', path.join('.cursor', 'mcp.json'), path.join('.vscode', 'mcp.json'), '.claude'];
const MAX_PROJECTS = 2000;

// A path stands for itself and the folders directly inside it, so `favz ~/Projects` covers them all.
function projectFolders(paths) {
  const out = new Set();
  for (const given of paths) {
    const root = path.resolve(given);
    out.add(root);
    for (const entry of listDir(root)) {
      const dir = path.join(root, entry);
      if (entry.startsWith('.') || entry === 'node_modules' || out.size >= MAX_PROJECTS) continue;
      try { if (fs.statSync(dir).isDirectory()) out.add(dir); } catch (e) { /* unreadable: skip */ }
    }
  }
  return [...out].filter((dir) => PROJECT_FILES.some((f) => fs.existsSync(path.join(dir, f))));
}

function scan({ home = os.homedir(), paths = [process.cwd()] } = {}) {
  const names = [];
  const seen = [];
  const take = (file, fn) => {
    const data = readJson(file);
    if (data && typeof data === 'object') { seen.push(file); names.push(...fn(data)); }
  };
  const projects = projectFolders(paths).filter((dir) => dir !== path.resolve(home));

  // Your own setup
  take(path.join(home, '.claude.json'), (d) => {
    const local = [...new Set(paths.map((p) => path.resolve(p)).concat(projects))]
      .map((dir) => d.projects && d.projects[dir]).filter(Boolean);
    return serverNames(d.mcpServers).concat(...local.map((entry) => serverNames(entry.mcpServers)));
  });
  take(path.join(home, '.claude', 'settings.json'), settingsNames);
  take(path.join(home, '.cursor', 'mcp.json'), (d) => serverNames(d.mcpServers));
  names.push(...claudeFolderNames(path.join(home, '.claude')));

  for (const dir of projects) {
    take(path.join(dir, '.mcp.json'), (d) => serverNames(d.mcpServers));
    take(path.join(dir, '.cursor', 'mcp.json'), (d) => serverNames(d.mcpServers));
    take(path.join(dir, '.vscode', 'mcp.json'), (d) => serverNames('servers' in d ? d.servers : d.mcpServers));
    take(path.join(dir, '.claude', 'settings.json'), settingsNames);
    take(path.join(dir, '.claude', 'settings.local.json'), settingsNames);
    names.push(...claudeFolderNames(path.join(dir, '.claude')));
  }
  // Folder names and paths stay here. Only the number of projects goes any further.
  return { names: guarded(names), files: seen, projects: projects.length };
}

module.exports = { scan, claudeFolderNames, projectFolders };

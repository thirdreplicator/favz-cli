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
  const seen = [];
  const read = (file, fn) => {
    const data = readJson(file);
    if (!data || typeof data !== 'object') return [];
    seen.push(file);
    return fn(data);
  };
  const projects = projectFolders(paths).filter((dir) => dir !== path.resolve(home));

  // Your own setup. Servers that ~/.claude.json lists for a project folder belong to that project.
  const personal = [];
  const listed = {};
  personal.push(...read(path.join(home, '.claude.json'), (d) => {
    const byDir = (dir) => (d.projects && d.projects[dir] ? serverNames(d.projects[dir].mcpServers) : []);
    for (const dir of projects) listed[dir] = byDir(dir);
    const others = [...new Set(paths.map((p) => path.resolve(p)))].filter((dir) => !projects.includes(dir));
    return serverNames(d.mcpServers).concat(...others.map(byDir));
  }));
  personal.push(...read(path.join(home, '.claude', 'settings.json'), settingsNames));
  personal.push(...read(path.join(home, '.cursor', 'mcp.json'), (d) => serverNames(d.mcpServers)));
  personal.push(...claudeFolderNames(path.join(home, '.claude')));

  const perProject = projects.map((dir) => {
    const names = [...(listed[dir] || [])];
    names.push(...read(path.join(dir, '.mcp.json'), (d) => serverNames(d.mcpServers)));
    names.push(...read(path.join(dir, '.cursor', 'mcp.json'), (d) => serverNames(d.mcpServers)));
    names.push(...read(path.join(dir, '.vscode', 'mcp.json'), (d) => serverNames('servers' in d ? d.servers : d.mcpServers)));
    names.push(...read(path.join(dir, '.claude', 'settings.json'), settingsNames));
    names.push(...read(path.join(dir, '.claude', 'settings.local.json'), settingsNames));
    names.push(...claudeFolderNames(path.join(dir, '.claude')));
    return { dir, names: guarded(names) };
  });
  // Folder paths stay on this machine. Only the number of projects goes into the summary.
  return {
    names: guarded(personal.concat(...perProject.map((p) => p.names))),
    personal: guarded(personal),
    perProject,
    files: seen,
    projects: projects.length,
  };
}

module.exports = { scan, claudeFolderNames, projectFolders };

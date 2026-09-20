# favz

See how your AI agent setup compares with public ones.

    npx favz-cli

It reads your Claude Code, Cursor and VS Code agent config, and gives you a class and a level.
It also shows what setups like yours run that you don't, with the counts behind each line.
The data comes from [Favz](https://favz.co/), a random sample of 2,039 public GitHub repos.

## What it reads

- `~/.claude.json`, `~/.claude/settings.json`, `~/.cursor/mcp.json`
- `~/.claude/skills`, `~/.claude/agents`, `~/.claude/commands` (names only)
- In the current folder: `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.claude/`

From each file it keeps tool names, such as `mcp:npm:@playwright/mcp`. Env values, headers,
arguments and file contents are dropped as the file is read. Every name then passes a check for
secret-looking text.

## What it sends

By default, nothing. It downloads one public file, `https://favz.co/known.json`, and does the
comparison on your machine.

`npx favz-cli --publish` makes a profile page at a private link. It first shows exactly what would be
sent and asks. That is only tool names Favz already publishes, plus a count of everything else.
A skill you wrote yourself is sent as "1 other skill", never by name. The server works the level
out again itself. `npx favz-cli --delete` removes the page.

It never installs anything.

## The level

The level is a game, not a measurement. It adds up: how many kinds of tool you use, how many
tools, how many you made yourself, how rare your public tools are, and how many are rising in the
sample. The rules are in `lib/score.js`.

## Development

    npm test

No dependencies. `lib/names.js` and `lib/guard.js` are ports of the Python rules Favz uses to build
its public dataset. `test/vectors.json` holds cases written out by that Python code, and the tests
here must match them. `test/make_vectors.py` needs the private data pipeline and is kept for
reference. `server/profile_server.js` is the service behind the profile pages. `skill/SKILL.md` is
the agent skill served at https://favz.co/skill.md.

## Licence

MIT

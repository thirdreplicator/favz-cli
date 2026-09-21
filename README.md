# favz

See how your AI agent setup compares with public ones.

    npx favz-cli

It reads your Claude Code, Cursor and VS Code agent config. It shows how your setup compares, and
what setups like yours run that you don't, with the counts behind each line. If you agree to send
a short summary, you also get a class and a level, and a timeline of how your setup grows.
The data comes from [Favz](https://favz.co/), a random sample of 2,039 public GitHub repos.

    npx favz-cli               # the current folder, plus your own setup
    npx favz-cli ~/Projects    # a folder of projects: it and the folders directly inside it

## What it reads

- `~/.claude.json`, `~/.claude/settings.json`, `~/.cursor/mcp.json`
- `~/.claude/skills`, `~/.claude/agents`, `~/.claude/commands` (names only)
- In each project folder: `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.claude/`

From each file it keeps tool names, such as `mcp:npm:@playwright/mcp`. Env values, headers,
arguments and file contents are dropped as the file is read. Every name then passes a check for
secret-looking text.

## What it sends

For the comparison and the suggestions, nothing. It downloads one public file,
`https://favz.co/known.json`, and does that work on your machine.

Your class and level live on a Favz profile, at a private link. To get them you agree to send a
summary. The command shows it first and asks. It holds:

- tool names Favz already publishes, such as `mcp:npm:@playwright/mcp`
- a count per kind of everything else. A skill you wrote yourself is "1 other skill", never a name.
- the number of project folders that had agent config. No folder names, no paths.

The server refuses any name it does not already publish, and works the level out itself. It keeps
no IP addresses and no request log. `npx favz-cli --delete` removes the profile and its timeline.

It never installs anything.

## The level and the timeline

The level is a game, not a measurement. It runs from 1 to 30. Up to 20 comes from your setup: how
many kinds of tool you use, how many tools, how many you made yourself, how rare your public tools
are, and how many are rising in the sample. Up to 10 more comes from time: one for each month
after the first in which you ran the command. Only the server knows those dates, so they cannot
be faked. The rules are in `lib/score.js`.

Each run adds one line per day to your timeline: the day, level, class and counts. That is how a
level 1 Rogue becomes a level 30 Enchanter.

## Development

    npm test

No dependencies. `lib/names.js` and `lib/guard.js` are ports of the Python rules Favz uses to build
its public dataset. `test/vectors.json` holds cases written out by that Python code, and the tests
here must match them. `test/make_vectors.py` needs the private data pipeline and is kept for
reference. `server/profile_server.js` is the service behind the profile pages. `skill/SKILL.md` is
the agent skill served at https://favz.co/skill.md.

## Releases

Pushing a tag such as `v0.2.1` runs the tests and publishes to npm from GitHub Actions. It uses
npm trusted publishing, so no npm token is stored. The tag must match `package.json`.

## Licence

MIT

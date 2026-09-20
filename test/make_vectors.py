"""Write vectors.json from the Python rules, so the JavaScript port can be checked against them.

Run: cd spike && uv run python ../cli/test/make_vectors.py
Every value below is made up. None is a real secret.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "spike"))

from extract import _hook_names, name_mcp_server  # noqa: E402
from secret_guard import looks_secret  # noqa: E402

FAKE = "ghp_" + "a1B2c3D4e5" * 3
ENTRIES = [
    {"command": "npx", "args": ["-y", "@playwright/mcp@latest"]},
    {"command": "npx", "args": ["-y", "@upstash/context7-mcp", "--api-key", FAKE]},
    {"command": "npx -y chrome-devtools-mcp@1.2.3"},
    {"command": "API_KEY=abc123 npx some-server"},
    {"command": "cmd", "args": ["/c", "npx", "-y", "shadcn@latest", "mcp"]},
    {"command": "cmd", "args": ["/c"]},
    {"command": "npx", "args": ["mcp-remote", "https://mcp.example.com/sse?key=" + FAKE]},
    {"command": "npx", "args": ["mcp-remote"]},
    {"command": "npx", "args": ["tsx", "src/server.ts"]},
    {"command": "npx", "args": ["--package", "@scope/pkg@2", "run-it"]},
    {"command": "pnpm", "args": ["dlx", "some-mcp"]},
    {"command": "npm", "args": ["run", "mcp"]},
    {"command": "npx", "args": ["-y"]},
    {"command": "uvx", "args": ["mcp-server-fetch"]},
    {"command": "uvx", "args": ["--from", "git+https://github.com/a/b", "serve"]},
    {"command": "uvx", "args": ["thing[extra]==1.0"]},
    {"command": "uv", "args": ["run", "python", "server.py"]},
    {"command": "uv", "args": ["run", "./tools/server.py"]},
    {"command": "uv", "args": ["tool", "run", "pkg"]},
    {"command": "docker", "args": ["run", "-i", "--rm", "-e", "TOKEN=" + FAKE, "ghcr.io/github/github-mcp-server:latest"]},
    {"command": "docker", "args": ["run", "host:5000/image"]},
    {"command": "docker", "args": ["run", "-i"]},
    {"command": "python3", "args": ["-m", "my_module.server"]},
    {"command": "node", "args": ["/Users/someone/code/build/index.js"]},
    {"command": "C:\\Program Files\\nodejs\\node.exe", "args": ["C:\\code\\server.js"]},
    {"command": "/usr/local/bin/my-server", "args": ["--key", FAKE]},
    {"command": "node", "args": ["server.js; rm -rf /"]},
    {"command": "npx", "args": ["bad name$(x)"]},
    {"url": "https://WWW.Mcp.Supabase.com/mcp?token=" + FAKE},
    {"serverUrl": "https://api.githubcopilot.com/mcp/"},
    {"url": "not a url"},
    {"url": "http://localhost:3000/mcp"},
    {"command": ""},
    {"command": 5},
    {"type": "stdio"},
    "a string",
    None,
]
HOOKS = [
    {"PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "rtk hook --x"}]}]},
    {"Stop": [{"hooks": [{"command": "TOKEN=" + FAKE + " /opt/bin/notify.sh done"}]}]},
    {"Stop": [{"hooks": [{"command": "X=$(date) echo hi"}]}]},
    {"PostToolUse": [{"hooks": [{"command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/fmt.sh"}]}]},
    {"Bad Event!": [{"hooks": [{"command": "ls"}]}]},
    {"SessionStart": "nope", "Notification": [{"hooks": "nope"}, 7]},
]
NAMES = [
    "mcp:npm:@playwright/mcp", "hook:UserPromptSubmit:inline", "skill:design-taste-frontend",
    "mcp:npm:" + FAKE, "mcp:cmd:sk-" + "x9Y8z7W6v5U4t3S2r1Q0", "skill:a3f9c2e1b4d5a6f7c8e9d0b1a2c3e4f5",
    "mcp:local:token=abc", "mcp:pypi:k8Jq2LmZ9xPw4RtY7vNc", "agent:code-reviewer",
    "command:internationalization-helper", "mcp:url:learn.microsoft.com",
]

out = {
    "servers": [[entry, name_mcp_server(entry)] for entry in ENTRIES],
    "hooks": [[hooks, _hook_names(hooks)] for hooks in HOOKS],
    "secrets": [[name, looks_secret(name)] for name in NAMES],
}
Path(__file__).with_name("vectors.json").write_text(json.dumps(out, indent=1) + "\n")
print(len(ENTRIES), "servers,", len(HOOKS), "hook files,", len(NAMES), "names;",
      sum(flag for _, flag in out["secrets"]), "flagged as secret")

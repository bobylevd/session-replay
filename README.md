# Session Replay

Static site. It shows Claude Code and Codex session `.jsonl` files as a scrollable chat log with thinking, tool calls, and tool results.

## Run

1. Run `python3 -m http.server 8765` in this directory.
2. Open `http://localhost:8765`.
3. Drop session `.jsonl` files or a folder such as `~/.claude/projects/<project>/` or `~/.codex/sessions/`. Each session shows as a thread in the sidebar.

`sample.jsonl` is a small demo session.

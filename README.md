# Session Replay

Static site. It shows a Claude Code session `.jsonl` as a scrollable chat log with thinking, tool calls, and tool results.

## Run

1. Run `python3 -m http.server 8765` in this directory.
2. Open `http://localhost:8765`.
3. Drop session `.jsonl` files or a folder such as `~/.claude/projects/<project>/`. Each session shows as a thread in the sidebar.

`sample.jsonl` is a small demo session.

# Session Replay

Static site. It shows a Claude Code session `.jsonl` as a scrollable chat log with thinking, tool calls, and tool results.

## Run

1. Run `python3 -m http.server 8765` in this directory.
2. Open `http://localhost:8765`.
3. Drop a session file from `~/.claude/projects/<project>/<session>.jsonl`.

`sample.jsonl` is a small demo session.

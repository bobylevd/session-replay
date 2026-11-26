# Session Replay

Static site. It replays a Claude Code session `.jsonl` as a chat log with thinking, tool calls, and tool results.

## Run

1. Run `python3 -m http.server 8765` in this directory.
2. Open `http://localhost:8765`.
3. Drop a session file from `~/.claude/projects/<project>/<session>.jsonl`.

Use Play, Step, Show all, speed, and the slider to move through the session. `sample.jsonl` is a small demo session.

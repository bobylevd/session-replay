# Session Replay

Static site. It shows Claude Code, Codex and pi session `.jsonl` and `.jsonl.zst` files as a scrollable chat log with thinking, tool calls, and tool results.

## Run

1. Run `python3 -m http.server 8765` in this directory.
2. Open `http://localhost:8765`.
3. Drop session `.jsonl` files or a folder such as `~/.claude/projects/<project>/` `~/.codex/sessions/` or `~/.pi/agent/sessions/`. Each session shows as a thread in the sidebar.

`sample.jsonl` is a small demo session.

`vendor/fzstd.js` is [fzstd](https://github.com/101arrowz/fzstd) 0.1.1 (MIT). It decompresses `.jsonl.zst` files in the browser.

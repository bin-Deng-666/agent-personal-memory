# Personal Memory for Claude Code

The Claude Code package of [Agent Personal Memory](https://github.com/bin-Deng-666/agent-personal-memory). Includes its standalone runtime, hooks, same-window terminal panel and status-line integration, with no Pi agent SDK dependency.

Run in Claude Code:

```text
/plugin marketplace add bin-Deng-666/agent-personal-memory
/plugin install agent-personal-memory@agent-personal-memory
```

Restart Claude Code and run `/agent-personal-memory:setup`. Install tmux, exit Claude, then start `~/.claude/bin/personal-memory-claude` in the same terminal. `/personal-memory` opens the real panel as a popup over the conversation; closing it returns to Claude. Setup also adds memory status to the status line while preserving previous output. Claude's built-in `/memory` is unchanged.

[Claude Code installation and controls](https://github.com/bin-Deng-666/agent-personal-memory/blob/main/docs/claude-code.md) · [Shared library and privacy](https://github.com/bin-Deng-666/agent-personal-memory/blob/main/docs/privacy.md)

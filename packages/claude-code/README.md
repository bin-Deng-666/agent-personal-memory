# Personal Memory for Claude Code

The Claude Code package of [Agent Personal Memory](https://github.com/bin-Deng-666/agent-personal-memory). Includes its standalone runtime, hooks, native selection menus and status-line integration, with no Pi SDK or terminal-window dependency.

Run in Claude Code:

```text
/plugin marketplace add bin-Deng-666/agent-personal-memory
/plugin install agent-personal-memory@agent-personal-memory
```

Restart Claude Code and run `/agent-personal-memory:setup`, then restart normally. `/personal-memory` uses Claude's native selection interface, with backend-controlled options and validated changes. It needs no tmux, launcher or extra window. Setup also adds shared counts to the status line while preserving previous output. Claude's built-in `/memory` is unchanged. Native menu navigation uses model/tool turns; it cannot register the internal `/model` renderer.

[Claude Code installation and controls](https://github.com/bin-Deng-666/agent-personal-memory/blob/main/docs/claude-code.md) · [Shared library and privacy](https://github.com/bin-Deng-666/agent-personal-memory/blob/main/docs/privacy.md)

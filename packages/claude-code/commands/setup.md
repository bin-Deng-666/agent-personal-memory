---
description: Set up the Personal Memory command, status line and same-window launcher
allowed-tools: mcp__plugin_agent-personal-memory_memory__memory_manage
---

Call memory_manage(operation="install-shortcut", sessionId from the hook). Setup installs /personal-memory, appends Personal Memory status while preserving any existing status-line command, and creates a launcher under the Claude configuration directory's bin/personal-memory-claude.

Report the returned launcher path. Explain that the panel uses a tmux popup in the same terminal window: install tmux if absent, exit Claude and run that launcher once to start a compatible session. Ordinary Claude sessions still show the status line but cannot host the popup. The built-in /memory is preserved. Do not change memory records, model/provider configuration or permission policy.

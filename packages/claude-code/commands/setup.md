---
description: Set up the Personal Memory native command and status line
allowed-tools: mcp__plugin_agent-personal-memory_memory__memory_manage
---

Call memory_manage(operation="install-shortcut", sessionId from the hook). This refreshes the /personal-memory shortcut and adds shared counts to the status line while retaining existing status output. It removes an obsolete launcher only when that file carries this plugin's generated marker.

Tell the user to restart Claude normally, then use /personal-memory. Native selection dialogs appear in the same conversation window; no tmux or special launcher is required. The built-in /memory remains unchanged. Do not change model/provider configuration, permissions or personal records.

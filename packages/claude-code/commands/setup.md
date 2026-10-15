---
description: Configure the /personal-memory shortcut for this Claude Code profile
allowed-tools: mcp__plugin_agent-personal-memory_memory__memory_manage
---

The user requested installation of the `/personal-memory` shortcut. Call memory_manage with operation="install-shortcut" and the sessionId from the hook. This installs a user command containing the plugin's Memory flow and preserves an existing unrelated user command. Report the result and explain that a new Claude Code session loads the shortcut. Do not change memory records, the model/provider configuration, permissions or the user's built-in `/memory` command.

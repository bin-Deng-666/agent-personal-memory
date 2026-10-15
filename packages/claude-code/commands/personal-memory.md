---
description: Open Personal Memory directly without an agent round trip
allowed-tools: mcp__plugin_agent-personal-memory_memory__memory_search
---

The UserPromptSubmit hook owns this command. It opens the terminal panel before any model request. Closing the panel, or an opening error, blocks the prompt so there is no agent conversation or tool call for ordinary management.

If this command reaches the model, proceed only when the hook explicitly supplied a user-submitted Advice question. The panel has already closed: search relevant personal memories, then answer that question in the original conversation. Do not call open-panel, reopen a panel, imitate a menu, or announce automatic saves.

If no Advice question was supplied, report that the Personal Memory submit hook did not intercept the command. Tell the user to restart with the configured personal-memory-claude launcher and ensure the plugin is enabled. Do not pretend a panel opened.

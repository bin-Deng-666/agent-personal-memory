---
description: Open the Personal Memory terminal panel in this window
allowed-tools: mcp__plugin_agent-personal-memory_memory__memory_manage, mcp__plugin_agent-personal-memory_memory__memory_search
---

Call memory_manage(operation="open-panel", sessionId from the hook) immediately. This opens the real terminal panel over the current Claude window, using the same components as Pi. Do not emulate the panel with text, AskUserQuestion, a numbered menu or a browser. Library, Extraction, Advice and Personal Memory On/Off are handled directly inside the panel.

Wait for the panel to close. If the tool returns a question, retrieve relevant full memories with memory_search and answer the question here, preserving evidence, uncertainty and dates. If the user simply closes the panel, reply only "Personal Memory closed." If opening fails, state the actual error. A session outside tmux must be restarted with the personal-memory-claude launcher installed by setup; do not open a second window or claim a panel opened when it did not.

$ARGUMENTS

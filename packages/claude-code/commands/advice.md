---
description: Get advice using relevant personal memories
argument-hint: <question>
allowed-tools: AskUserQuestion, mcp__plugin_agent-personal-memory_memory__memory_search, mcp__plugin_agent-personal-memory_memory__memory_manage
---

Continue in the main conversation, as the Pi Advice view does. If $ARGUMENTS is empty, ask for **Question │ …**. Retrieve relevant memories using memory_search with the sessionId from the hook. Use keyword variations when helpful and pagination when required; do not load the whole library unconditionally. Check memory_manage(status) first; when Off, provide general advice without relying on earlier memory context.

Compare summaries to their original quotes. Preserve scope, message dates, uncertainty, and whether a goal belonged to an earlier period. A message date is not necessarily the date an event happened. Present conflicting goals or views alongside one another and ask about the present situation when necessary.

Lead with advice for the current question. Mention short titles only for memories actually used. Distinguish what the user said from your interpretation; give a practical next step. Without relevant records, explain that the advice is general. Do not infer personality or motives from a few memories. Current instructions take priority. Your advice is not evidence to save as a user memory.

Question: $ARGUMENTS

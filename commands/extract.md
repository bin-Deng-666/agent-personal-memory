---
description: Open background memory extraction from Pi and Claude Code conversations
allowed-tools: AskUserQuestion, mcp__plugin_agent-personal-memory_memory__memory_manage
---

Open **Extraction** using the same labels and flow as the Memory panel. Call status, conversations and tasks with the sessionId from the hook. Show the total number of conversations and one row per conversation: ○ Not extracted, ✓ Extracted, or ↻ Updated, then its original title and host. Use native AskUserQuestion selection; if unavailable, use the same numbered choices. Search and paginate so every conversation remains reachable.

Offer **Select conversations** with multi-select, individual conversation selection, and Back. Start selected paths through memory_manage(start). Each launches a separate background agent with extract and review stages. Keep the main conversation available. If a task already exists, open its progress/results instead of silently starting duplicates. Use task, tasks, cancel and retry for **Memories**, **Log**, **Cancel**, **Retry**, **Back**. Shared tasks from either host are visible. Cancel only the selected task. A completed scan with zero saved records is valid. Off prevents extraction.

Do not send transcripts to shell commands or expose internal paths and IDs in the user interface. The management tools validate the selected paths and share the same record store, checkpoints and cancellation files as Pi. Back returns to the conversation.

$ARGUMENTS

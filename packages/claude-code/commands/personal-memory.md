---
description: Open Personal Memory — Library, Extraction, Advice and shared On/Off
allowed-tools: AskUserQuestion, mcp__plugin_agent-personal-memory_memory__memory_manage, mcp__plugin_agent-personal-memory_memory__memory_search
---

Open the personal-memory panel. Follow the same navigation and labels as the Pi panel. Use Claude Code's native AskUserQuestion selection UI for menus; retain English control labels and the original language of memory content and session titles. Do not send the user shell commands to manage JSON files. Do not add a manual Add action. Do not show internal IDs, versions or evidence fingerprints in the UI.

First call memory_manage(operation="status", sessionId from the hook). Show its `label`, then offer **Library**, **Extraction**, **Advice**, **Personal Memory On/Off**. Use a single-choice native question, header "Personal". Show counts next to the relevant entry. If native question UI is unavailable, show the same numbered menu and wait for a choice.

Library:

1. memory_manage(operation="list", query, offset, limit=8). Show "Saved memories · N". Every selection label must include `[typeLabel] title`; the category must be visible for every row, not only the selected preview. Use the content for its description. Offer Search, next/previous page as available, and Back. Never truncate away records without a way to reach the next page. Ask for text when Search is chosen.
2. On a record selection, call detail. Display **Type: category** and certainty, then the content. Keep scope as internal context; do not add an "Applies to" field to the screen. Offer **Edit**, **Original words**, **Delete**, **Back**, in that order.
3. Edit contains only **Content**, **Type**. Include current values as previews: use the question option's markdown preview when supported, otherwise a description/current-value paragraph. Keep a blank row between text-rendered choices. For Content, display the original text before requesting replacement text; preserve all other fields. For Type, show the five categories and mark the current one. Map English labels to the stored Chinese type values. Submit update with the retrieved ID/version. Return to the updated detail. Scope and certainty are preserved internally.
4. Original words displays source quotes, source host and message dates, with Back. Never infer event dates from storage dates.
5. Delete executes the explicit menu choice with the retrieved ID/version and returns to Library. If another session changed the record, refresh and let the user choose against the current value.

Extraction:

- Call conversations and tasks; show a conversation count. One row per conversation: **○ Not extracted**, **✓ Extracted**, or **↻ Updated**, followed by the original title (host prefix retained). The three meanings match Pi. Use native selection highlighting; apply status color only when supported by the host. Show task progress alongside scan state.
- Offer **Select conversations** for a multi-select question, Search/pagination, and Back. Start the selected paths together; each launches an independent background agent. A fresh single selection starts extraction, an existing running/failed/cancelled task opens its detail, a completed unchanged conversation shows its saved records. Find saved records through task results; do not fabricate missing results.
- Task detail shows progress, counts and saved titles; offer **Memories**, **Log**, **Cancel**, **Retry**, **Back**. Cancel only the chosen task. Returning to the main conversation leaves extraction running. A zero-record completed scan is a valid outcome.

Advice:

- Ask for the question using **Question │ …**. Explain that `/agent-personal-memory:advice <question>` continues in the main conversation with relevant memories. Use that command for retrieval; do not preload the entire library into an ordinary chat.

Personal Memory On/Off:

- Toggle through memory_manage(operation="toggle", enabled=...). Refresh the status label. This is shared with Pi; Off blocks automatic writes, cancels extraction and prevents new memory retrieval. Return to the same menu.

Back returns one level. Exit returns to the conversation. Use concise screens, not a transcript of internal operations. Claude Code owns keyboard handling; do not claim Tab/Esc or a custom footer works inside its native questions. Never replace or overwrite the user's status line.

Arguments, if provided: $ARGUMENTS

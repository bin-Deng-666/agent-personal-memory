---
description: Open Personal Memory using Claude's native choices
allowed-tools: AskUserQuestion, mcp__plugin_agent-personal-memory_memory__memory_search
---

Open Personal Memory with AskUserQuestion, using the exact native question from UserPromptSubmit hook context. Do not render a numbered/text menu, open a terminal/browser, or call open-panel. Normal `claude` sessions are supported; tmux and a special launcher are unnecessary.

PreToolUse pins each AskUserQuestion to the backend-generated screen. PostToolUse applies the actual user selection and supplies the next question. Call AskUserQuestion again using that next input. Menu structure, record IDs, versions and mutations are handled by the hooks; do not independently call memory_manage to edit/delete/toggle or fabricate a user answer. Do not narrate routine navigation or internal identifiers.

When the hook reports closed, stop without reopening. When it provides an Advice question, retrieve relevant full records with memory_search and answer that question in the conversation, preserving original evidence and uncertainty. Ordinary capture remains quiet.

If AskUserQuestion is unavailable in a noninteractive invocation, say that this command needs interactive Claude Code. Do not claim a native chooser appeared. This native selection workflow uses model/tool turns and is not an extension of the internal /model renderer.

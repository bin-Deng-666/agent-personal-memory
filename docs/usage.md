# Shared behavior

Use the separate [Pi guide](pi.md) or [Claude Code guide](claude-code.md) for installation and host-specific controls.

## Shared library location

Both hosts resolve the library in this order:

1. `PERSONAL_MEMORY_DIR`: an explicit absolute path.
2. `PI_CODING_AGENT_DIR/memory` when a custom Pi profile is present in the environment.
3. An initialized legacy `~/.pi/agent/memory/` library.
4. `$XDG_DATA_HOME/agent-personal-memory/`, or `~/.local/share/agent-personal-memory/` by default.

Set the same `PERSONAL_MEMORY_DIR` in both launch environments when using different profiles, shells or GUI launchers. The variable selects a library; it does not move records. If neutral and legacy libraries are both initialized, select one explicitly rather than silently merging.

IDs, versions, categories, sources and suppression hashes remain compatible. Locked reads recover journaled publication; stale edits cannot overwrite another host's changes.

## Personal value and context

Capture considers all five categories and requires usefulness beyond the current task. Project requirements and debugging status do not become personal memory because the user says "remember". A project can contain meaningful personal experiences or ongoing conditions, but every claim needs user evidence; a situational request cannot establish a personality trait.

Live capture checks current-turn quotes, retrieved versions, explicit deletion requests and a three-write automatic limit. Shared conservative checks reject obvious project-only evidence, unsupported domains and personality claims. Historical extraction adds independent model review. Neither mechanism proves complete semantic fidelity; inspect important records through Original words.

Ordinary context preloads only collaboration habits from Preferences. Other categories are searched in Advice; ordinary lookup returns non-preference deduplication metadata. Claude refreshes source IDs through search if its submit hook preceded transcript append.

Status is shared: `Personal Memory On · N total · N habits loaded`, with `1 habit` for singular. The total is the library count; the habit number is the eligible context selection.

## Host interfaces

| Operation | Pi                                 | Claude Code                                 |
| --------- | ---------------------------------- | ------------------------------------------- |
| Open      | `/personal-memory`                 | `/personal-memory` after setup              |
| Interface | Full-screen terminal components    | Native selection dialogs in ordinary Claude |
| Views     | Library, Extraction, Advice        | Same, with Settings for On/Off and Close    |
| Details   | Edit, Original words, Delete, Back | Same                                        |
| Fields    | Content and Type                   | Same; native text row for content           |
| Category  | Type on rows/details               | Category in record options and detail       |
| Scope     | Internal, not separately displayed | Same                                        |
| Toggle    | Tab                                | Settings → Turn On / Turn Off               |
| Status    | Footer                             | Claude status line and native home question |
| Return    | Esc                                | Back / Close / native Esc                   |

Claude's supported selection tool is not the internal `/model` renderer. It requires model/tool turns and can incur usage. Hooks generate and pin screen data, bind the host's answer to its pending tool ID, validate changes and provide the next screen. There is no special launcher, tmux, browser or second window. Existing status output and built-in `/memory` are preserved. Noninteractive print mode cannot show a chooser.

## Library

All records remain reachable through pagination and Search. Category labels are visible. Content editing shows the original value and saves the user's replacement verbatim; Type pages expose all five categories. Original words shows exact user quotes and message dates, which are not necessarily event dates. Deletion removes the canonical record and suppresses automatic recovery from the same evidence.

Pi supports wide previews and an in-place editor. Claude uses native options and the **Type something** row for search/replacement text. Move to the text row and type before Enter; selecting an empty text row can cancel the question. A stale version is rejected and the current record is shown again.

## Extraction and Advice

Both histories are listed with host prefixes. ○ Not extracted means no completed checkpoint; ✓ Extracted means fingerprints match; ↻ Updated means messages changed. A checkpoint is not a claim that useful records were saved.

Select one source or a batch. Each source runs in an independent worker, with shared task discovery, progress, results, cancellation and retry. Returning to chat leaves extraction running. Retry uses the host's model/authentication. Exact validation and separate review share a common pipeline. Invalid output does not advance the checkpoint, while completed writes survive failure/cancellation and are skipped on retry. Zero new records is valid.

Advice retrieves relevant full records and evidence, preserves dates/uncertainty and distinguishes user statements from analysis. Pi dispatches a question to its conversation. Claude's native text row closes the menu and enables Advice retrieval in the same conversation.

## Off and removal

Off is global per library: automatic writes and new retrieval are blocked and extraction is canceled. Explicit Library management remains available. Pi removes memory context/tools on the next request. Claude updates instructions and tool results but cannot retract earlier context; use `/clear` or a new session when needed.

Uninstall preserves records. Library deletion does not erase original transcripts, logs or backups. See [privacy](privacy.md) before sharing artifacts or erasing data.

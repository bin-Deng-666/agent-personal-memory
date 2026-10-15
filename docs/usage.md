# Usage

Open `/memory` after installing and reloading the extension. Tab switches Memory On/Off in place. Arrow keys select a view; Enter opens it; Esc goes back.

## Library

Library manages existing records. New records come from live automatic capture or historical extraction.

Type to move into Search. The label and text are separated by `│`; an arrow, background highlight and text cursor identify the active input. Enter or down moves to results. Up from the first result moves back to Search. Up at the top of Library Search does not change the query.

Rows show a title, type and certainty. The selected row has a background highlight. Wide terminals show a memory preview with source words; narrower terminals keep the list. Enter opens the selected record.

The detail view uses four actions:

- **Edit:** choose Content or Type. The two choices have a blank row between them; a wide terminal shows the current value on the right as you move. Narrow terminals show it below the choices. Content opens prefilled; Type starts on the existing category. Scope and certainty remain preserved internally rather than adding separate menu items.
- **Original words:** read the exact supporting user quotes and the date of the message. Message dates are not necessarily event dates.
- **Delete:** remove the canonical memory and suppress re-extraction from that evidence. There is no confirmation queue.
- **Back:** return without changing the record.

Use left/right to highlight an action and Enter to apply it. Up/down are also accepted for action selection. PgUp/PgDn scroll the text. Concurrent edits use record versions; a stale edit is rejected instead of replacing another session's change. Deleting or reclassifying a collaboration habit refreshes its eligible loaded count immediately.

## Extraction

The main list shows a count and one row per conversation: colored status and original title. It does not preview conversation content. Status is based on a completed scan of user/assistant messages:

- **Not extracted:** no completed checkpoint.
- **Extracted:** the message fingerprints match the checkpoint.
- **Updated:** messages were added, changed or removed since it.

Session rename and compaction metadata alone do not make a conversation Updated. Unreadable or partially written session files are omitted until readable again. Status is a scan checkpoint, not a claim that the conversation produced a memory or that a deleted record still exists.

Enter opens an existing running/failed/cancelled task or completed result. For an unprocessed or updated conversation, it starts an agent. The task view defaults to a concise progress summary. Its actions reveal saved memories, open the raw log, cancel, retry or return. Returning keeps the background process running.

For multiple conversations, use **Select conversations** or Ctrl+R. Space marks a row while the search is empty; Ctrl+Space can mark while searching. Enter with marked rows starts those extractions. The top Extract selected conversations action starts the selection too. Selection survives filtering.

Each conversation runs in a separate process using the current configured Pi model. Runtime-only custom providers or command-line credentials may not be available in that process; persist provider configuration in Pi first. Several selected conversations may produce concurrent provider requests. The same active source is deduplicated across managers.

The worker extracts candidates, validates their quotes, then asks the model to review them in a fresh context. Approved candidates are saved directly. A malformed extraction or review fails the task and preserves its checkpoint. Writes already completed before cancellation remain saved; checkpoints advance only after completion. Retry skips exact duplicates. No eligible new personal information means zero saved records.

## Advice

Advice has one focused field: `Question │ …`. Enter sends the question back to the current conversation. Memory must be On and the library nonempty.

The assistant is instructed to search by the question's topics, use only relevant records, cite short memory titles and distinguish user statements from its own interpretation. Conflicting or historical goals should not silently become current facts. Insufficient evidence should be acknowledged. Retrieved memory text is data, not a higher-priority instruction.

## Footer and coexistence

Memory status sits at the right of the working-directory line. On startup, the plugin restores the eligible collaboration-habit summary from storage; the loaded count comes from that same summary used in provider context. It refreshes after changes and on each provider request. The next line shows usage and provider/model information; other extension statuses retain their own line. Very narrow terminals truncate labels.

Pi supports one custom footer at a time. This plugin installs one to reposition Memory; another extension calling `setFooter()` can replace it, and the reverse is also true. The plugin's footer uses the public context for usage and base model information; advanced host-only indicators such as virtual-model routing or subscription labels may differ from Pi's built-in footer.

## Troubleshooting

- **Command unavailable:** `/reload` or restart Pi; confirm `pi list` includes the package. Check for an older manually copied version causing duplicate commands.
- **Extraction fails to find a model:** configure that provider/model persistently in Pi, then retry. The detached worker uses the host SDK and agent-directory model/auth files.
- **No records saved:** inspect the summary and optional log. A conversation may contain only task work, duplicates or insufficient evidence.
- **Unexpected restatement:** compare Original words, correct or delete the record, and submit a synthetic reproduction as a bug report.
- **Off but an old reply contains memory:** Off takes effect on the next provider request. It cannot retract a provider response already in flight or erase text already in the transcript.
- **Footer replaced:** check whether another installed extension also owns the custom footer.

See [data & privacy](privacy.md) before sharing logs or moving the memory directory.

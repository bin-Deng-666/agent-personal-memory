# User guide

## Installation and startup

Install in a terminal:

```sh
pi install git:github.com/bin-Deng-666/agent-personal-memory
```

Reload/restart Pi and enter `/personal-memory`. Keep one installed copy; remove an older package registration or manually copied extension before adding another. Personal records are stored separately from extension code.

Pi loads `index.ts` and the TypeScript source directly. Dependencies are installed by Pi for managed Git/npm sources. Local-directory installations use that directory's existing dependencies. There is no build step.

## Library location

The default is `~/.pi/agent/memory/`. An explicit `PI_CODING_AGENT_DIR` uses its `memory/` subdirectory. `PERSONAL_MEMORY_DIR` takes precedence and must be an absolute path.

An initialized alternate library under `$XDG_DATA_HOME/agent-personal-memory/` (or `~/.local/share/agent-personal-memory/`) remains usable. If both default and alternate locations contain initialized libraries, explicitly select one with `PERSONAL_MEMORY_DIR`. Directory selection never silently merges, moves or overwrites records.

## Navigation and status

The home screen offers **Library**, **Extraction**, **Advice**. Arrow keys and Enter select; Esc goes back; Tab toggles Personal Memory On/Off. Active fields and rows are highlighted. The panel opens locally without a model request.

The footer places `Personal Memory On · N total · N habits loaded` at the right of the directory line. One eligible habit uses `1 habit`. The total counts all categories, while the habit count describes collaboration context. Startup restores the habit summary, edits refresh it, and every provider request rechecks the current library/setting.

Pi supports one custom-footer owner. Another extension can replace it. Public model/usage information and other extension statuses are retained; advanced host-only routing/subscription indicators may differ from Pi's default footer.

## Library

Type to search titles, content, tags and categories. Enter/down moves from Search into results; up from the first result returns to Search. Each row shows **Type: category**. Wide terminals show the selected content and source preview; narrow terminals keep a readable list.

Open a record for:

- **Edit:** choose **Content** or **Type**. The choices are separated by a blank row and preview current values. Content opens prefilled; Type starts on the saved category. Enter saves, Shift+Enter inserts a newline in the text editor, Esc cancels. Scope and certainty are retained; scope is not a separate Applies to field.
- **Original words:** exact user quotes with message dates. A message date is not necessarily an event date.
- **Delete:** remove the canonical record and suppress automatic recovery from the same evidence.
- **Back:** return without changing the record.

Left/right selects detail actions; Enter applies them. PgUp/PgDn scrolls. Updates and deletions use record versions: if another Pi session changed a record, refresh it before trying again. Library supports explicit management while automatic memory use is Off.

## Extraction

The list shows one row per Pi conversation, with its original title and a completed-scan state:

| State                         | Meaning                                            |
| ----------------------------- | -------------------------------------------------- |
| ○ Not extracted · accent/blue | No completed checkpoint                            |
| ✓ Extracted · green           | Relevant message fingerprints match the checkpoint |
| ↻ Updated · yellow            | Messages changed after the completed checkpoint    |

Session names and compaction metadata alone do not make a conversation Updated. Incomplete/unreadable files are omitted until readable. A checkpoint describes a scan, not whether useful new records were saved.

Enter starts an unprocessed/updated conversation or opens existing task/results. For a batch, choose **Select conversations** or press Ctrl+R. Space marks with an empty search field; Ctrl+Space marks while searching. Enter starts the marked selection. Each source runs in an independent background process; returning to chat keeps it running.

Task actions show saved memories, logs, cancellation, retry and Back. Only the selected task is canceled, except that turning memory Off requests cancellation of all active extraction tasks. Workers also poll the enabled setting.

Workers use Pi's configured model/authentication files and the parent Pi SDK. Runtime-only custom providers may need persistent configuration before they work in detached processes. Each segment gets extraction in a fresh model context, then separate review for eligible candidates. Invalid/incomplete output preserves its checkpoint. Partial writes survive cancellation/failure; retry skips duplicates. Zero saves is a valid result.

## Advice and context

Enter a question in **`Question │ …`** and press Enter. The panel closes and Pi answers in the main conversation using relevant retrieved records and original evidence. Advice requires memory On and a nonempty library.

Automatic capture considers all five categories; ordinary conversations preload only eligible collaboration habits. Other categories are retrieved in Advice. Instructions require relevance, faithful dates/conditions, uncertainty and a distinction between user statements and assistant interpretation. They do not turn earlier goals into current facts or infer personality from a few records.

## Personal value

A record should remain useful after the current task ends. Project requirements, implementation details, temporary troubleshooting observations and one-off requests should be skipped, even when phrased as "remember". User-described experiences and ongoing conditions can be valuable within a project conversation, but only supported personal meaning is retained.

Source validation, conservative project/fidelity checks and historical model review reduce mistakes; they do not prove semantic accuracy. Compare important records through Original words. User requests and present circumstances take priority over stored summaries.

## On/Off and removal

Off blocks automatic writes/new retrieval, removes the extension's context/tools on the next provider request and cancels extraction. It cannot retract requests already sent or erase memory text already used in a conversation.

Update or remove using `pi update` / `pi remove` with the installed source, then reload/restart. Removal preserves personal records. See [privacy](privacy.md) for retained transcripts, artifacts and backups.

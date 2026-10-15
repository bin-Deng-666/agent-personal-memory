# Changelog

## 0.3.0

- Use native Claude selection dialogs in ordinary sessions; remove the tmux launcher, prompt-blocking popup and terminal-window dependency.
- Generate menu screens, pagination, category choices and transitions in code; replace model input before rendering and bind real user answers to pending host tool IDs.
- Support native text input for search, exact content replacement and Advice; preserve stale-version checks, shared On/Off, deletion suppression and task operations.
- Preserve status-line composition and refresh existing shortcuts during setup, retiring only this plugin's generated legacy launcher.
- Exercise a real ordinary Claude process with native dialogs and a local fixture, including forged model options/answers, record editing, settings and conversation return.

## 0.2.3

- Intercept `/personal-memory` in UserPromptSubmit and open the panel before any model request; ordinary management/close blocks the prompt instead of starting an agent turn.
- Only a question submitted from Advice proceeds to the model; closing or an unavailable terminal host produces zero model requests.
- Verify the actual installed short-command path in a real Claude/tmux terminal, including close-only and Advice request counts.

## 0.2.2

- Replace Claude's model-generated menu with a real terminal popup in the current window, using shared Pi dashboard, list, preview, editor and Library components.
- Add a tmux-backed Claude launcher; closing the panel restores the same conversation, and Advice hands its question back to Claude.
- Configure Claude's status line with shared memory counts and singular/plural grammar, preserving an existing status command.
- Add real tmux/PTY navigation, edit/save, On/Off and Advice handoff verification; ordinary sessions without tmux report the required launcher instead of pretending to open a panel.

## 0.2.1

Separate host packages and stronger personal-value boundaries.

- Split Core, Pi and Claude Code into independent package directories and separately verified artifacts.
- Use `/personal-memory`, with a Claude shortcut setup command that preserves the host's built-in `/memory`.
- Share Personal Memory status labels and zero/one/many habit grammar.
- Show categories explicitly in Library rows, previews and details; retain scope internally without an Applies to field.
- Filter obvious project-only requirements, unsupported domain details, temporary network observations generalized into background and unsupported personality claims. Both capture and historical extraction use the same checks and cross-task usefulness instructions.
- Return trusted current-user references from Claude search when prompt hooks precede transcript persistence.
- Verify the installed Claude plugin with the configured model against synthetic cases for all five capture categories in a separate library.

## 0.2.0

Shared personal memory for Pi and Claude Code under the Agent Personal Memory name.

- Installable Claude Code plugin and marketplace, bundled MCP runtime, session/turn hooks, native Memory menus, Advice and Extraction commands.
- One common storage resolver with a host-neutral default, explicit `PERSONAL_MEMORY_DIR`, existing Pi-library reuse and ambiguity detection.
- Common live-capture policy for evidence, duplicates, current-turn authorization, retrieved versions and automatic-write limits.
- Cross-host Library changes, deletion suppression, On/Off, task progress, cancellation and retry.
- Pi and Claude history discovery with source labels; Claude branch parsing, source isolation and separate extract/review background requests.
- Pi extraction workers explicitly retain the shared memory path independently of model/auth configuration.
- Equivalent page/action names and current-value previews, with documented host-specific input, footer and tool-display behavior.
- Cross-host transport/process tests, standalone packed-runtime verification and an isolated real-Claude host check using a local provider fixture.
- Rewritten bilingual user documentation, installation/migration instructions and shared-data retention details.

## 0.1.0

Initial public release.

- Quiet, source-backed personal capture across five memory categories; live writes require current-run user evidence and are capped per run.
- A full-terminal `/memory` interface with Library, Extraction and Advice, visible focus, separate input labels and a global Tab switch.
- Library search, original-word inspection, editing and deletion; no manual Add action or approval queue.
- Single-line conversation lists with three colored scan states, batch selection, independent background agents, progress/results, cancellation and retry.
- Historical candidate extraction followed by a separate value/fidelity review in fresh model contexts; support for multiple evidence quotes and evidence-date correction checks.
- Ordinary context limited to collaboration habits; Advice retrieves relevant full records on demand.
- Restore the collaboration-habit summary at startup so loaded counts survive restart; simplify editing to spaced Content/Type choices with live current-value previews.
- Right-aligned memory counts beside the working directory, with immediate removal of deleted habits from the eligible loaded count.
- Category files, cross-process locking, optimistic versions, write-ahead recovery, suppression keys and legacy metadata migration.
- Separate navigation, Library and Extraction workflows, shared conversation catalog and strict dependency-layer/reachability checks.
- English/Chinese installation docs, data-retention documentation, contribution guidelines, formatting, tests and a runtime-only package smoke check.

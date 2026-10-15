# Changelog

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

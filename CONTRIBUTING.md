# Contributing

Improvements to personal-memory value, fidelity, Pi interaction, portability and maintainability are welcome. Use synthetic examples in issues and tests; never include private records, sessions, credentials or absolute personal paths.

## Setup

Use Node.js 22+:

```sh
npm ci --ignore-scripts
npm run verify
```

Try a local session with `pi -ne -e ./index.ts`. Use isolated `PI_CODING_AGENT_DIR` and `PERSONAL_MEMORY_DIR` values when testing real model requests. Avoid loading a checkout and an installed copy in the same session.

Pi loads source directly. There is no build step or generated runtime to update.

## Code boundaries

- `src/extension.ts` owns Pi lifecycle, tools and context integration.
- Application coordinates capture, navigation, Library and Extraction workflows.
- Domain contains types, prompts, ranking, presentation and personal-value checks.
- History interprets Pi sessions and validates extraction/review output.
- Storage owns locked persistence, journal recovery and directory selection.
- Agents own task files and detached execution; UI owns rendering/input.

Follow [architecture](docs/architecture.md). Keep every production module reachable from the entry and maintain the permitted dependency direction. Avoid wrappers and exports without a consumer. Preserve stored data formats and suppression keys where they affect existing records.

## Behavior expectations

Preserve exact evidence, current-turn authorization, transactional Off checks, stale-version rejection, deletion suppression and interrupted-publication recovery. Capture considers five personal categories; ordinary context contains only collaboration habits. Project requirements must not become personal preferences or inferred personality labels.

The `/personal-memory` panel should preserve visible category labels, current-value editing, focus, width bounds, IME cursor placement and normal conversation input after Esc. Check narrow/wide layouts and both Pi terminal modes. Keep automatic capture quiet and preserve unrelated context/tool declarations.

## Checks and releases

`npm run verify` runs formatting, strict types, source reachability/layer checks, synthetic tests and the packed install/worker smoke check. `npm run format` applies formatting. Add regressions for changed authorization, storage, extraction or input behavior; avoid tests that only repeat implementation details.

The packed check installs runtime dependencies only, uses the host's SDK and runs extraction/review against a local fixture. Normal verification does not use personal records, real provider credentials or paid model access.

Explain concrete resulting behavior, validation and limitations in pull requests. Use a clear Conventional Commit title. Release changes update package version/changelog and pass verification; users install Git refs or local packages. npm publication is not automated.

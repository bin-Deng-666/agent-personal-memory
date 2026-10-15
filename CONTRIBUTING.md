# Contributing

Small fixes to memory fidelity, input behavior, portability and maintainability are welcome. For a substantial behavior change, open an issue describing a concrete use case first.

## Setup

Use Node.js 22+ and the development Pi version pinned in `package.json`.

```sh
npm ci --ignore-scripts
npm run verify
```

For a local Pi session:

```sh
pi -ne -e ./index.ts
```

Use an isolated `PI_CODING_AGENT_DIR` with a model configured for that directory if you test real extraction. Avoid loading both this checkout and an already installed copy. No build output belongs in the repository.

## Keep the boundaries clear

- `src/extension.ts` integrates Pi tools, lifecycle and provider context.
- `src/application/` coordinates navigation, Library and Extraction workflows.
- `src/domain/` contains shared types, rules and pure memory logic.
- `src/history/` owns session/catalog interpretation and model-output validation.
- `src/storage/` owns locks, versions, journal recovery and migration.
- `src/agents/` owns detached execution; `src/ui/` owns rendering and input.

Follow [architecture.md](docs/architecture.md). The structure check follows ordinary imports and the runner's URL/jiti loading chain. Do not add unnecessary wrappers, catch-all utility folders or re-export barrels. Keep related code together; split when responsibilities or independent test seams warrant it.

## Behavior expectations

Preserve exact-source validation, current-run authorization, global Off checks inside transactions, stale-version rejection, deletion suppression and recovery of interrupted publication. Ordinary prompts must not silently start loading experiences/background/goals/ideas. Keep automatic capture quiet and do not restore manual Add or confirmation queues without an agreed product change.

UI changes should preserve visible focus, original-language content, bounded rendering, native IME cursor placement and normal conversation input after Esc. Inspect narrow and wide terminals and both Pi regular/fullscreen renderers.

## Checks and tests

`npm run verify` runs formatting, strict types, structure checks, behavior tests and the package smoke check. `npm run format` applies the formatter.

Tests use temporary directories, synthetic text and local HTTP model fixtures. Never add real session content, personal paths, credentials or snapshots of private records. Add regression coverage for a changed authorization, storage, extraction or focus behavior; avoid tests that merely duplicate implementation details.

The package smoke check verifies the artifact allowlist, installs only runtime dependencies in a temporary directory, discovers the extension through Pi and launches the packed worker against a local model. It does not modify your Pi configuration.

## Pull requests

Explain the problem, resulting behavior and validation. Keep changes focused, document material limits, and use a clear Conventional Commit title such as `fix(ui): preserve search focus at the first row`. No release credentials or private model key are needed to contribute.

## Releases

The maintainer updates the changelog/version, runs verification and creates a Git tag. Users install the Git source or a pinned tag. npm publication is a separate step and is not automated by this repository.

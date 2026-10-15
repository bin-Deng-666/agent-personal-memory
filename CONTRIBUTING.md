# Contributing

Changes to personal-memory fidelity, cross-host consistency, input behavior and portability are welcome. Use synthetic examples in issues and tests; never include real personal records, credentials or transcripts.

## Setup

Use Node.js 22+:

```sh
npm ci --ignore-scripts
npm run verify
```

Source lives in `packages/core/src`, `packages/pi/src` and `packages/claude-code/src`. Run `npm run build` after source changes, then `npm run verify`. Generated host runtimes and third-party notices are committed for install-without-build support. Edit source rather than generated files.

Try Pi with `pi -ne -e ./packages/pi/index.ts`, or Claude with `claude --plugin-dir ./packages/claude-code`. Set isolated `PERSONAL_MEMORY_DIR`, `PI_CODING_AGENT_DIR` and `CLAUDE_CONFIG_DIR` for tests. Do not load both a checkout and installed copy in the same host.

## Boundaries and product behavior

Core must not depend on a host. Pi and Claude adapters depend on Core, never each other. See [architecture](docs/architecture.md).

Preserve source evidence, current-turn checks, transactional Off enforcement, duplicate suppression, version conflicts and journal recovery. All five personal categories remain eligible for capture; ordinary context contains collaboration habits only. Project/task instructions must not become personal preferences or inferred personality labels. Keep scope/uncertainty even when they are not separately displayed.

Keep `/personal-memory`, shared status grammar, visible Library categories and matching actions. Both hosts use `packages/terminal/src`; Pi embeds it, and Claude opens it in a same-window tmux popup. Test focus, width bounds, editing and restoring the parent pane. Preserve Claude's built-in `/memory` and compose with existing status-line output. Run `python3 scripts/check-terminal.py` with tmux installed, or add `--claude` to exercise the actual Claude/MCP path with a local model fixture.

## Checks

`verify` checks formatting, types, dependency boundaries, bundle freshness, behavioral tests and separate package installs. Tests use temporary directories, synthetic data and local model fixtures. No paid provider is required.

With Claude installed, `node scripts/check-claude-host.mjs` runs a real host against a local provider fixture. `node scripts/check-configured-claude.mjs /tmp/personal-memory-report.json` is an optional check using the installed plugin and configured model; it can incur usage and creates synthetic transcripts but uses an isolated memory library.

## Pull requests and releases

Describe the concrete problem, final behavior, validation and limits. Keep dependent changes coherent. The root package is a private workspace; `packages/pi` and `packages/claude-code` are independent artifacts, with Core bundled into each. Update both host versions, marketplace metadata, changelog and generated runtime files together. npm publication is not automated; documented installs use Git/marketplace or local packages.

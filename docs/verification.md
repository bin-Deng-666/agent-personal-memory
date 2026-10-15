# Verification notes

The 0.2.1 work was checked against Pi 1.2.0, Claude Code 2.1.295 and Node 22. The configured-model checks below use synthetic statements in an isolated `PERSONAL_MEMORY_DIR`, not the user's personal library. They demonstrate the exercised paths, not a guarantee of model behavior on every conversation.

| Check                                 | Observed result                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Configured Claude: background         | Searched first, saved the quoted ongoing work constraint as Background                                                   |
| Configured Claude: experience         | Searched first, saved the important event as Experiences                                                                 |
| Configured Claude: goal               | Searched first, saved the tentative direction as Goals & direction                                                       |
| Configured Claude: idea               | Searched first, saved the exploring principle as Ideas & insights                                                        |
| Configured Claude: preference         | Searched first, saved the explicit communication habit as Preferences                                                    |
| Installed `/personal-memory` shortcut | Called status/list; reported five records covering five categories and one loaded habit                                  |
| Configured Advice                     | Retrieved relevant non-preference records and returned advice without adding records                                     |
| Project-only acceptance criteria      | Did not call memory-write; test library stayed at five records                                                           |
| Real host with local model fixture    | Plugin discovery, session/turn hooks, habit injection, MCP search and command-authorized Library lookup passed           |
| Separate packed installs              | Pi-only artifact discovery/worker and Claude-only runtime worked without development dependencies or copies of host SDKs |

Automated tests additionally cover concurrent storage, stale versions, cancellation, extraction/review, evidence parsing, category rendering, singular/plural status, shortcut conflicts and project/personality exclusion. The normal verification suite uses synthetic/local fixtures and does not require paid provider access.

To reproduce:

```sh
npm ci --ignore-scripts
npm run verify
node scripts/check-claude-host.mjs
```

For an optional configured-provider run after installing the Claude plugin:

```sh
node scripts/check-configured-claude.mjs /tmp/personal-memory-report.json
```

The 0.2.2 interface additionally passed `python3 scripts/check-terminal.py --claude`: a real Claude process invoked the plugin's MCP open-panel operation; its tmux popup displayed the shared dashboard, edited and saved a fixture, toggled On/Off, returned an Advice question and resumed in the same parent pane. The model endpoint was a local fixture, not a paid provider. Status-line tests cover existing-command preservation and repeated setup.

That configured-model command incurs model usage and can leave synthetic transcripts in Claude's history. It writes test records only in a temporary library. Interface and tool tests do not establish semantic correctness of every generated summary.

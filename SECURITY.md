# Security policy

Version 0.1.x is the current development line. Report suspected vulnerabilities in the current version or main branch; older versions should be upgraded before reproducing a problem.

For credential exposure, unauthorized memory writes, private-data disclosure or unsafe task execution, use [GitHub private vulnerability reporting](https://github.com/bin-Deng-666/agent-personal-memory/security/advisories/new). If unavailable, contact the maintainer through the contact information on their GitHub profile without posting exploit details or private data in a public issue.

Include a minimal synthetic reproduction, affected version, environment and impact. Do not send real credentials, memory files or session dumps. No response-time SLA is offered.

The plugin runs with the permissions of the Pi process. It stores plaintext and sends necessary model context to the configured provider; see [data & privacy](docs/privacy.md). Model quality errors should normally be reported as bugs with synthetic examples, unless they expose a broader security boundary issue.

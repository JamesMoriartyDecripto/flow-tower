Charter: security of {{repo}} across the trust boundaries in config/charters.md. Read-only.

Start from the semgrep and npm audit reports, then read src/server, bin/flow-tower.js and every place
that renders text coming from YAML, prompts or events. Ask, for each boundary: can a web page the user
visits, another local process or a hostile tower file read something it should not, write anything,
or crash the server?

For each candidate: `file:line — the attacker, the request or file, the consequence`. A pattern match
without a path is not a finding (false-positives.md rule 1).

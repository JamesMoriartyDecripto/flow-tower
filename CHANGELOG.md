# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Changed
- The 3D figures of `flow-tower export --pdf` and `flow-tower report` use the GPU when there is one (#209): one launcher (`src/cli/browser.ts`) starts Chromium with GPU flags, reads the WebGL renderer, and falls back to software WebGL (SwiftShader) when the renderer is software, the probe times out, or the GPU launch fails; it prints which one it used. `FLOW_TOWER_GL=gpu|software` forces the choice. On a laptop with an Intel Iris Xe the dev-squad level-3 export went from 72 s to 16 s.
- e2e: `FLOW_TOWER_E2E_GPU=1` runs the Playwright project with the GPU flags, for machines that have a GPU; CI stays in software (#209).

### Fixed
- `flow-tower export` kills its server and removes its temporary user folder even when the browser launch throws (#209).
- `flow-tower service` on a real systemd desktop (#194, found in #181): a `systemctl --user stop` no longer leaves the unit `failed` (the server's 130/143 exits are declared as success); `service uninstall` also clears a failed state, so no `not-found failed` unit stays listed; `service status` on a failed unit points to `journalctl --user -u flow-tower`; `service install` says when the library is empty (the service cannot start) and names entries gone from disk.
- The unit's `ExecStart` names the `node` on PATH that is the running binary (`/usr/bin/node`), not the versioned file it resolves to (`/usr/bin/node-24`), so a Node major upgrade does not break the service; only absolute PATH directories that group and others cannot write are trusted. The `loginctl enable-linger` hint is shown only outside a graphical session (#194).
- The 3D figures of the tower document never drew in Google Chrome (the browser, `flow-tower export --pdf` without Playwright's headless shell, and the e2e suite): Chrome stops animation frames in an off-screen or hidden iframe, so every snapshot timed out and the document never got ready. The snapshot iframe now stays on screen, inert and out of the tab order, under an opaque veil; both are hidden in print (#181).
- e2e: the referenced-files check skips an optional file per node, so one node's optional entry no longer hides a file another node requires (#181).
- Library: long project names on the cards are no longer cut to one line with an ellipsis (#211): they wrap, up to 3 lines, and the chips stay on the first line. At 1440 px four example names were cut ("Sales Pipeline: prospect to invoice", "A2A Purchasing Concierge", …); now none is, at any width from 390 to 1920 px.
- Hub budget alerts below one cent show their amounts with 4 decimals instead of "$0.00 of $0.00" (#211).
- The hub's test alert is sent with rule `test` instead of `silent`, so a webhook receiver can tell it from a real alert (#211).
- `flow-tower share` names a new share after the tower's `name:` (as a slug) when the folder holds one tower file, so towers kept in folders called `tower` no longer all share as `tower`; `--name` still wins and existing shares keep their name (#211).
- `flow-tower token add` and the Admin tab say "replace 127.0.0.1" only when no `url` is configured: a hub that sets a loopback `url` on purpose (one host) no longer gets the tailnet hint (#211).
- `flow-tower connect` suggests `hooks install` only when no harness is wired on this machine; otherwise it names the wired ones and points to `hooks status` (#211).
- `flow-tower guide` (and the skill's procedure.md) names the real checkout command instead of a literal `node <path>/bin/flow-tower.js` (#211).
- The server no longer prints Node 22's `ExperimentalWarning` about SQLite when it opens the history DB; every other warning still shows (#211).
- docs/getting-started.md writes the `copy` and `library` commands as `node $FT/bin/flow-tower.js …` like the rest of the page, so they work without `npm link` (#211).
- Hub › Machines shows one row for a sender id that was revoked and added again, instead of two rows with the same data (#211).

## [0.10.0] - 2026-10-13

### Added
- Hub › Admin (#93), on the hub machine only: add a sender (token and connect line shown once), pause, resume, revoke by typing its id; viewers; cadence per sender; budgets; alert switches; retention days and delete-before with a preview count. Every change writes a line to `admin-audit.jsonl` (0600, never a token); remote requests get 404. The privacy profile wizard waits for #85.
- Hub alerts (#94): an always-on machine gone silent, monthly spend at 80% / 100% of a budget (USD, per project or global), an error spike (over 3× the 7-day hourly median, at least 5), a token used from a new host. A `⚠ n` pill in the top bar and the library header opens Hub › Alerts; ack and snooze (1 h / 1 d) from the hub machine only. Rules switch off per name in `config.json` `alerts`; `budgets` are documented as USD, the history's currency.
- Schema: a `files` entry can be `{ path, optional: true, description }` for a file a run writes: while it is missing, `validate` and the PDF checks stay quiet and the Inspector shows it as "not generated yet". The report-studio example uses it for the tower-documentation PDF (#137).
- The satellite relay recovers by itself (#188): `connect`, a new token or a role change apply to a running library within 5 s (no restart); a refused or paused token keeps the queue, asks again every 30 s and delivers the queue on the first accepted answer; Send test asks at once. The hub tells a paused machine apart (`401` with `state: "paused"`, shown as `held` / "paused by the hub") from a refused token, without telling a wrong secret whether an id exists. The library prints one line per relay state change.
- `flow-tower hooks install` (#189): one command wires Claude Code, Codex, Pi and Hermes on this machine (or a project with `--project`), on the port of the running library; it keeps the user's own hooks, backs up each changed file, and replaces older hand-made Flow Tower entries instead of duplicating them. `hooks status` shows where they are wired and flags a stale port or Node path; `hooks uninstall` removes only Flow Tower's entries. `connect` ends with the hint. Replaces the 11 hand edits the satellite setup needed.
- Shared towers are validated (#190): a tower with an error is not sent and the hub keeps the last valid version (it also refuses a structurally broken upload with 422). The teammate sees `1 tower not sent` on the SAT chip and each shared tower's state in Settings › Sharing, including a warning when a sync removed nodes that events may still name. The hub card says `updated <time> ago`; files a share does not carry (missing, or outside the share folder) are info on the hub, not errors. `share --files` carries the agent folders a tower references (`.github/`, `.claude/agents|skills|commands/`, `.agents/`, `.codex/prompts/`); `share` no longer adds a folder already covered in the library.
- Hub alerts reach the lead outside the tab (#191): the hub checks the rules every minute and sends each new alert, and its clearing, to an optional webhook (`notify`: ntfy, Slack, Telegram or JSON; set and tested from Hub › Admin › Notifications, url masked, never logged); Hub › Alerts can show browser notifications. A new `errors` rule fires when a machine sends 3 errors in 15 minutes (`alertThresholds.errors`), so a new team sees its first failures without a week of history.
- Harness parity (#196, #5): `tests/harness-parity.test.ts` replays one session through every adapter (Claude Code, Agent SDK, Codex, Pi, Hermes, emit), checks the normalised events and that one `match:` rule lands each harness's shell call on the same node; what a harness cannot send is declared with its reason (table in docs/realtime.md). Pi was checked with a real run (extension and `--mode json`): JSON mode now keeps the session id on every line, drops streaming chunks, shows tool results as text and usage with the model and token detail. The Agent SDK integration also sends SessionStart, SessionEnd and Notification.
- Hub › Now answers who, where and what (#192): one row per machine and session with the tower and node it works on, its state, and the last error (node or tool and age, never event text); a click opens that tower on that node. The library header shows `● n working`. Consistent signals: the tower file's validation chips read `YAML n ERR/WARN`, a red `LIVE n ERR` counts live errors, a failed tool shows ✕ in the feed, `HUB n/m` counts active senders only, `token add` refuses an id in use, CLI token changes are written to the admin audit log (`via: cli`), and the Live feed sits beside the Hub panel instead of under it.
- A team without Tailscale has one documented route (#193): `integrations/hub/Caddyfile.hub` puts Caddy in front of a full hub (events, heartbeats, OTLP and shared towers; the owner views over SSH), with steps in the kit README. The CLI's hints print `node <checkout>/bin/flow-tower.js` when `flow-tower` is not on PATH; `token add` prints the connect line for the other machine; the hub warns about the kit's `example` placeholders left in config.json; `copy --list` marks the examples that point at this repo; the library footer says how to add towers in a library or on a hub.
- `flow-tower service install|status|uninstall` (#194) keeps the local library running at login (systemd user unit on Linux, launchd agent on macOS), so a teammate's events are not lost when they forget to start it; `connect` suggests it when no library runs. On a satellite, `emit` posts to the running library, falls back to the hub when the library refuses the connection, and posts straight to the hub when no library is recorded: never to a default port (a test event on the test server reached another server that way before the fix).
- Second newcomer dry run fixes (#206): Hub › Admin PAUSE and RESUME work (they got 415); on a hub a teammate's events light only that teammate's shared towers and the hub's own, never another teammate's; the main agent is `main` in every harness, so one `agent:main` rule fits all; Hub › Now follows the session (`idle` after the agent stops, `ended` after the session, then dropped); `H` opens the Hub panel on the first load (the library filter no longer takes the focus; `/` does); `service install` refuses a port a library already uses and `service status` tells an installed unit that is not running; the hub card says `newer version not sent` when a teammate's latest save was refused; the kit lists the full-hub Caddy route in step 4 and says to create a token before a hub without viewers starts.

### Changed
- Example towers follow the team-UX work (#187-#196): `team-hub` gains the local port file and stream ids, `hooks install`, `service install`, the relay supervisor, the share sync and the hub's shared-towers guard, the alert webhook and the Now view (36 nodes, audit clean); `command-center` shows the four teammate steps for any harness, Caddy for a team without Tailscale (`deploy/Caddyfile.hub`), the alert webhook and the token approval; `dev-squad`'s coder never rewrites an existing test file, an empty grader answer is never a pass, and the verifier holds a user-facing change no test exercises end to end.
- Docs: `docs/architecture.md` is split into four maps that each load whole: core, documents and reports (`architecture.md`), server and hub, CLI, app. docs-qa Q24 (which file owns the per-sender tokens) passes again, 3/3; the docs-qa report is refreshed: 28/31 (#143).

### Fixed
- Hub alerts could not see hook errors (#187): history dropped every `tool.end` as a replay of its `tool.start` (same call id), and `kind: error` events were stored without an error status, so the error spike never fired. Both now count.
- Hub › Admin showed `always-on` for a sender with no cadence, while the alerts treat it as `on-demand`; it now shows what applies, and a new sender starts as `on-demand` (#187).
- `emit` and `npm run simulate` post to the server the user folder runs, on whatever port, instead of 5317 when no `--url` is given: a satellite's SessionStart hook could reach another server on 5317 (#187). The `copy` hint no longer prints a 5317 URL.
- Two e2e tests were wrong: the `/api/file` check asked for `optional` files not generated yet (#137), and the voice hub-phrase test faked a hub without answering the alert pill route added by #94.

## [0.9.0] - 2026-10-13

### Added
- Tower optimizer (#173): `flow-tower audit <tower> [--json]` prints an inventory, deterministic best-practice findings AUD01-AUD11 tied to nodes (loops without limits, orchestrators without a cap, irreversible actions without approval, decisions without a fallback, outputs without evals, overloaded agents, dead ends, deep nesting, unpinned models, no system budget, code without a sandbox) and the role of each model node with the OpenRouter categories to shortlist from. `docs/best-practices.md` explains each rule with sources. The `examples/tower-optimizer` tower draws the six-phase method, with a review rubric, a role table, scripts for a before/after snapshot and compare, and real reports on dev-squad. New skill `flow-tower-optimize`, installed with the others.
- Report studio (#174): `flow-tower report <type> <input> [--source f]... [--drafts d.json] [--html f] [--out f.pdf] [--list]` makes a professional PDF from the user's sources. Types are plug-ins in `src/report/types`: `security-assessment` (severity from CVSS v4.0 bands), `project-status` (RAG), `postmortem` (SRE-book structure, computed times), `cost-review` (FinOps reporting, variance flags) and `tower-documentation` (runs `flow-tower export`). Facts come from code; drafted prose is optional, marked, cited and digit-free; blocking checks run before any file is written. `examples/report-studio` (tower, samples, PDFs, page-review checklist), `docs/reports.md` with sources, and a `flow-tower-report` skill.
- Squad: each step's `Files:` line is checked against its changes (`tools/squad/files-check.mjs`): a listed path the step did not touch makes it RED, even with green tests. Coders end their report with `Known gaps:`, printed under each step. The coder prompt warns that `page.evaluate` code is plain JavaScript (#176).
- Squad: a pace setting (#169). `run.mjs --oneshot` and `--batch` answer a reviewer or security task in one request with no tools; `--batch` goes through the OpenRouter Batch API (about half price, always deleted once read) and falls back to a oneshot when the model has no batch endpoint. `SQUAD_PACE` picks the review mode: `now` (tool loop, default), `relaxed` (oneshot), `overnight` (batch); the coder always runs the tool loop. `tools/squad/pack.mjs` builds such a task with the brief, the diff and the files embedded. Ledger lines record the `mode`.
- Library: each card names its source (THIS HUB, or the device that shared it with `flow-tower share`), and a FROM row filters by device, with an online dot and the choice kept in the URL (`?source=`); voice `library_filter` takes a `source` (#165).
- Hub: one-step connect on a tailnet. `flow-tower connect https://<hub>.ts.net` without `--token` asks the hub (`POST /api/hub/enroll`), which mints the machine's token for a tailnet login listed in `viewers` (a `*.ts.net` Host behind `tailscale serve`; never a tagged device, a missing login or a non-tailnet hub). The machine name defaults to the hostname; the same login reconnecting rotates its token, another login gets a 409 (#164).
- Hub: tower sharing. `flow-tower share <folder> [--files]` uploads a tower to the hub, which writes it to `towers/<machine>/<name>/` in its library and reloads; YAML only by default, `--files` adds the referenced files inside the folder (text types only, never secret-looking names or symlinks out of the folder). `unshare` removes it, `share --list` shows the shares, and the local library re-sends a shared tower within ~15 s of a change (`/api/sharing` reports `towers`) (#164).
- Skills: `flow-tower-satellite` is rewritten as a guided, one-question-at-a-time walk-through of connect and share, with one fix per known error (#164).
- Community: `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), YAML issue forms for bug, feature and example with Discussions and private advisories as contact links, and `SUPPORT.md` (#122).
- CLI: `flow-tower --version` prints the installed version (#122).
- CI: a job checks the DCO sign-off on every commit of a PR, and a step runs `check-example` on the example folders a PR adds (#122).
- Squad: `tools/squad/cost.mjs <issue>` prints an issue's total cost from the local ledger, and step commits carry a `Squad-Cost:` trailer (#156).
- Voice: "cosa sta succedendo?" / "what is happening?" calls the new `live_status` tool: errors, running and busiest nodes of the last 10 minutes (on a hub, machines running or silent), metadata only; it selects the node in trouble (#160).
- Hub: live chips name the machine a node runs on (`Triage · Bash @decripto`), and library cards list the machines that sent events for a project in the last 15 minutes (#95).
- Tower documentation as PDF (#65): the PDF button (or `D`) and `flow-tower export <tower> --pdf --level 1|2|3` print a project as an audit-style report. The PDF opens with a cover, a document control page with a sha256 fingerprint and no date, so the same tower always gives the same file, and an executive summary of counts. It covers every tower and sub-tower of the project, each with a 3D snapshot and its infographics: a layer-to-layer matrix, layer composition, edges by kind, most connected nodes, governance coverage, runtimes and models by layer, and a sub-tower tree. Each layer gets its diagram, a node table with refs (`N-L01.03`) and its connections. Level 3 adds node cards, validation findings (`V-01`) and an appendix with the full text of every referenced file. Every word comes from the tower: the content is built by deterministic code, with no generated text. The CLI writes the file only when its blocking checks pass: every tower, layer, node and file present, counts matching, no dead link, no raw JSON, the page fully rendered. Chrome prints it with a Flow Tower letterhead in the page margins, bookmarks and a tagged PDF.
- PDF level 4 (#65): one document for several projects, a library cover with the project count and totals, a contents list, then each project at overview level. `?doc=library&level=4[&projects=a,b]` in the app, a fourth entry in the PDF menu when the workspace has more than one project, and `flow-tower export <dir> --pdf --level 4`, which runs the checks per project. Anchors are project-prefixed, so ids stay unique.

### Changed
- Squad: `tools/squad/steps.sh` runs on bash (no zsh needed) and takes the Node binary from `NODE` (#176).
- Hub: a hub with `viewers` may start without any token, since enrolment mints them (#164).
- Command-center kit: the systemd unit and docker compose let the hub write `towers/`; README step 5 is connect and share, `token add` stays for CI and non-tailnet senders (#164).
- `CONTRIBUTING.md` covers issue first, fork workflow, Conventional Commits, DCO sign-off, review, inbound = outbound licence, AI-assisted contributions and SemVer (#122).
- `SECURITY.md` lists supported versions, what to include in a report and the response time (#122).
- The PR template is the only checklist and gains AI assistance and Example tower blocks (#122).
- The `flow-tower-contribute` skill starts from an issue, adds a CHANGELOG step and sign-off, and runs four more anonymisation checks (#122).

### Fixed
- Squad: `run.mjs --write tools/squad` kept the folder as `toolssquad` (the `/` was dropped), so the coder could not write there; write dirs keep `/`, and absolute or `..` dirs are refused (#176).
- Hub: a remote viewer's page no longer fills the console with 403s: `GET /api/sharing` answers a remote viewer a quiet `{ state: 'off' }` (writes stay refused) (#166).
- Hub: the dev server warms the app at start (Vite `server.warmup`), so the first page over a tailnet skips a cold cache (about 45 s before) (#166).
- Library: a card footer with ERR, WARN, age and usage stays on one line; the usage is cut with an ellipsis (#166).
- Command-center kit: the systemd unit runs Node 22 from `/opt/node22` (Ubuntu 24.04's `/usr/bin/node` is Node 20) and can write `node_modules/.vite-temp`, without which it failed at start; the README installs the official tarball with a SHA256 check, and covers the one-time Tailscale Serve admin step and testing from another tailnet device (#166).
- `check-example` accepts every reserved example domain (RFC 2606, RFC 6761) (#122).
- The server no longer grows until out of memory in long sessions: it loads its Vite config once, so edits to its own source no longer restart it in-process, which leaked the previous server each time (upstream Rolldown #10887) (#99).

## [0.8.0] - 2026-10-12

### Added
- Model benchmark (#149): `--warm` repeats each run on the same session to price a warm cache, and `--batch` runs single-step public tasks through the OpenRouter Batch API at about half price; the cost modes are in `examples/model-benchmark/README.md`.
- Voice (#145): "scorri giù" / "scroll down" (and "scorri su", "vai in fondo", "vai all'inizio") pages the open file viewer; "apri l'hub" / "open the hub" ("mostra le macchine", "chiudi l'hub") opens the Hub panel on its Now or Machines tab; "mostra solo gli agenti" / "show only agents" keeps one node type on screen and "mostra tutto" / "show everything" shows them all again; all are fixed phrases the parser handles locally. The voice agent gains five tools (`scroll_file`, `hub_panel`, `filter_nodes`, `library_filter`, `compare_nodes`), and the action execution lives in `src/app/voice/actions.ts`.
- Command-center and satellite skills (#148): `skills/flow-tower-command-center` walks an agent through the hub side and `skills/flow-tower-satellite` the sender side; both are routed from `CLAUDE.md`, [docs/command-center.md](docs/command-center.md) and the README.
- Model benchmark (#105): `bench.mjs` and `judge.mjs` light the model-benchmark tower live with `--url` (metadata only); the first full run (2026-10-11: 8 models, 5 categories, 240 runs, $0.19) with blind scores from two verifier families is in `examples/model-benchmark/results/`, and its picks per category are in the cost skill reference.

### Changed
- Anthropic models get `cache_control` breakpoints on the squad, the voice agent and the model benchmark (#149), so their prompt prefix is cached.
- `bin/flow-tower.js` is closer to the 400-line rule (519 → 426 lines): the TypeScript subcommand dispatch moved to `bin/commands.js` and the `init` starter to `bin/starter.js`, with no behaviour change (#126).
- The dev squad codes with `anthropic/claude-haiku-5.5` (was DeepSeek 4.1 Flash): in a field trial on #126 it took 11 steps and $0.016 against 36 steps and $0.048, with the cleanest result. GLM 5.3 FlashX stays the reviewer (3 steps on the same PR; Gemini Flash Lite missed the finding), DeepSeek 4.1 Flash audits security. `CODER_MODEL` overrides; the dev-squad example follows (#105).

## [0.7.0] - 2026-10-11

### Added
- Voice: "chiudi il file" / "close the file" closes only the file viewer and keeps the node selected (agent tool `close_file`), #128.
- Voice (#130): "apri il suo file" / "open its file" (and "apri il file 2", "open the second file") opens a numbered file of the selected node, and "il prossimo" / "next" (or "il precedente" / "previous", "file successivo" / "next file") steps through the file viewer, the last list shown or the nodes of the layer in flow order; all are fixed phrases the parser handles locally even with the agent on.
- Hub panel (#92): press `H` on a hub for the Now tab (who runs what right now) and the Machines tab (every sender the hub trusts); a `HUB n/m` top-bar pill (senders seen in the last 5 min / active tokens) and a `READ-ONLY` pill for a remote viewer, fed by `GET /api/hub/machines` and `GET /api/hub/me`.
- Your own library (#121): `flow-tower library add|list|remove` keeps your towers (a `*.tower.yaml` or a folder) as a list of paths in the user folder's `config.json`; `flow-tower library [--with-examples]` serves them and badges each card MINE or EXAMPLE. A path inside the flow-tower checkout is refused under `examples/` and warned elsewhere, so your towers stay in your own projects; the `flow-tower-my-library` skill walks an agent through it.
- Updates (#141): the top bar shows a small `↑ vX.Y.Z` chip when a newer release exists, and Settings › Updates shows the installed version, the last check, a `Check for updates` button (a forced check, one real GitHub call a minute at most) and the copyable local update command; the update steps live in [docs/getting-started.md § Updating](docs/getting-started.md#updating).

### Changed
- Docs and skills say "examples gallery" for the public `examples/` set, and keep "library" for the user's own set (the Library view, `flow-tower library`), so the contribute skill no longer triggers on "add my tower to the library" (#136).

### Fixed
- The live feed's **Tower** scope now keeps events that land in the tower on screen **or in any of its sub-towers**, like the usage header and the scene; when it is empty but the library is not, it says how many events are elsewhere instead of showing nothing (#136).
- A busy port fails fast with `port <port> is in use: another server runs there (maybe another flow-tower). Use --port <port+1>, or stop it.` and exit 1 instead of silently binding the next port (which shared the requested port's Vite cache dir and left the user on someone else's tower); the banner now names the URL, and the port is strict (#136).
- `examples/docs-qa` resolves the OpenRouter key the way the squad runner does (environment, user folder key file, git-ignored `.env` of the checkout, then the main checkout's for a worktree) and fails fast with one line and exit 2 before the first question when there is none (#123).
- The squad runner (`tools/squad`) works from a worktree: the key lookup also finds the git-ignored key file of the main checkout (a worktree has none), and `steps.sh`'s `<write-dirs>` argument may be comma-separated (same as `run.mjs --write`); the CLI tests ignore an exported `FLOW_TOWER_*` environment (#75).
- `validate` (and the loader) reports a node `files` entry that is a folder like a missing file (`files entry "<path>" is a folder; list the files inside it instead`), instead of accepting it and letting `/api/file` answer 404 in the app (#118).
- Markdown tables in the file viewer are readable again: cells wrap at word boundaries instead of `overflow-wrap: anywhere`, which dropped a cell's min-content width to one character and squeezed every column to that; headers stay on one line, and a wide table scrolls sideways (#133).
- `docs/voice.md` documents crackling spoken replies on Linux with PipeWire under load (rising xruns in `pw-top`) and the `pw-metadata ... clock.force-quantum` workaround (#136).
- Events dropped as invalid or outside the ±24 h window now leave a warning in the server log (one line per reason at most every 10 s, with the count and the field path, never the value), so a sender learns why its events vanished; the response stays an empty 204 (#136).
- Timing tests wait for the condition (`vi.waitFor`) instead of a fixed delay, so a busy machine no longer turns them red (#131).

### Security
- KaTeX 0.16.47 → 0.18.7 (Dependabot alert, low), pinned with an override so rehype-katex and remark-math use the same copy (#119).

## [0.6.0] - 2026-10-11

### Added
- Two skills (#116): `flow-tower-use-example` (copy an example with its folder and adapt it) and `flow-tower-contribute` (anonymise, pre-flight and propose a tower for the library), backed by `flow-tower copy` and `flow-tower check-example`; `install-skill` installs all four skills.
- OTLP receiver accepts `Content-Encoding: gzip`; sample per-host OTel Collector in `integrations/otel-collector/` (host/user tags, prompt fields stripped, disk queue while offline) (#81).
- Identity on every event (#82): `user`, `host`, `runtime`, `project` and `session`, filled from the source's own attributes, else (for a local Flow Tower only) from the machine; fields clipped to 200 characters. `flow-tower emit --user --machine --runtime --session --project-name` set them explicitly.
- Hub mode (#83): `flow-tower serve --hub` lets remote machines ingest with a token and listed tailnet viewers watch read-only; per-sender tokens (`ft_<id>_<secret>`, only the hash stored) managed with `flow-tower token add|list|revoke|pause|resume`; `--allowed-host <name>` for the name a proxy or tailnet uses; `--ingest-only` serves nothing but the ingest routes. Per-sender rate limit, event-id dedupe that keeps a tool's start and end, ±24 h timestamp window.
- History in SQLite (#84, Node >= 22.13): content-free rows in the user folder; raw events kept 14 days (`FLOW_TOWER_RETENTION_DAYS`, clamped 1–21), hourly rollups 90 days, daily rollups 13 months; `GET /api/history` and `/api/history/info`; `flow-tower history export|delete|info`.
- One config file (#90): `~/.config/flow-tower/config.json` (or a git-ignored `flow-tower.local.json` in the checkout) for hub and emit settings, with flags > environment > config; `flow-tower config path|show`; `config.example.json`. A file that holds a token must be owner-only (0600): `config show` warns otherwise.
- Satellites (#91): `flow-tower connect <hub-url> --token <t>` writes `role: "satellite"` into the user folder's `config.json` and sends one heartbeat; a local library then relays content-free events to the hub (bounded queue of 5000, oldest dropped, a revoked token stops it), with `GET /api/sharing` on the satellite and `GET /api/hub/satellites` on the hub. `paused: true` in `config.json` (or Settings › Sharing › Pause) stops the relay and empties the queue; a SAT chip in the top bar shows the relay state.
- `examples/team-hub` (#98): a dogfood tower of the hub architecture (senders, guard and tokens, ingest limits, identity, history, config; planned views dashed).
- Onboarding and just-in-time docs (#101): `docs/getting-started.md`, `docs/command-center.md`, `docs/voice.md` and `docs/hub-reference.md`; README quick start in three paths; every doc opens with what it covers and where to go instead; each fact lives in one place; CLAUDE.md routes the new task areas.
- `examples/command-center` (#104): a self-contained hub deployment kit as a tower (machines, transport, hub service, library, viewers) with ready deploy files (systemd, compose, Caddy, hub and satellite configs).
- `model-benchmark` example (#108): the method #105 uses to pick models per role, as a tower (8 layers: categories, task sets, candidates, runner, measurements, judges, analysis, outputs) with runnable scripts. `bench.mjs` (OpenRouter tool loop, session per run, `require_parameters`, `data_collection: deny`, timeout + one retry; `--dry-run` needs no key), `judge.mjs` (deterministic checks, model code under the Node permission model, a blind rubric sheet), `report.mjs` (median and spread, cost per correct answer, warm starts). Two real tasks each for coder, reviewer, security, intent and doc-writer.
- `examples/docs-qa` (#110): a dogfood docs Q&A bot over this repo with just-in-time routing (no embeddings), a citation guard and a 24-question eval whose failures are doc gaps; `answer.mjs` and `eval.mjs` (OpenRouter, `--dry-run` offline). CLAUDE.md routes "how the hub works inside" to `examples/team-hub`.
- The dev-squad runner is kept in the repo (`tools/squad/`, #113): `run.mjs` drives a coder, reviewer or security pass through OpenRouter (tool loop, cost and cache reporting, low effort, `require_parameters` and data collection denied), `steps.sh` runs a chain of small task files with one commit per green step, `ev.sh` posts the run to a live tower. No absolute paths and no secrets: the repo comes from `--repo` (default the git root), the key from the environment or the user folder's key file, the session trailer from `SQUAD_TRAILERS`. README with the roles, how to write a task, and the #75 field findings.

### Changed
- Node >= 22.13 (`engines`), for `node:sqlite` (#84).

### Fixed
- Telemetry docs (#81): Claude Code's telemetry variables and Codex's `[otel]` block must be set at user level (`~/.claude/settings.json`, `~/.codex/config.toml`), managed settings or the shell; project settings are ignored.
- Hub dedupe keeps a tool's start and end (#83): `tool.start` and `tool.end` share a call id, so every end was dropped; the key now includes the kind.
- The config's `token` is a sender credential (what `emit` and a satellite send), never the server's own secret (#90).

### Security
- Hub (#83): a presented token is always checked; local hooks need none; remote requests may only ingest or view (`/api/file`, `/api/voice` and writes refused); WebSocket gated; OTLP receivers rate-limited; Tailscale identity trusted only through the local proxy.
- History (#84) and the relay (#91) copy an allow-list of content-free fields: no prompt, response, path, command or message ever reaches the DB or the hub. Tokens are never printed or reported in state.

## [0.5.0] - 2026-10-10

### Added
- `flow-tower-costs` Agent Skill (`skills/flow-tower-costs/`): optimize model cost and latency of a mapped agent system: inventory from the tower, current OpenRouter prices (`models.mjs`, no key), benchmark on real cases, levers (caching, effort, escalation), field results from #70.
- Faster first audio (#70): when an agent turn has said nothing 600 ms after the end of speech, a short cached acknowledgement ("Un attimo.", "One moment."; es, fr, de, pt too) plays through the reply player, rotated and once per turn. Phrases are synthesized once when the mic starts; language from the transcription, else Settings, else the browser. Time to first audio: 1.9–2.9 s → 0.60–0.65 s. The journal adds `firstAnswerMs` (first real sentence); `firstAudioMs` counts the ack.
- `dev-squad` example, from a field run on #68: personal data counts as a sensitive area (a full route in a sensitive area gets risk high, so its plan needs a human sign-off), and the maintainer can approve a plan with changes (`/squad approve <notes>`); parts moved out of scope become follow-up issues through the new `file_followup` tool.
- Voice journal and self-improvement (#68). Opt-in, text only, never audio: each turn records what was heard, what happened and how it went. Outcomes are corrected from what you do next ("no, …" = corrected, "back" right after = undone, stopping a reply with Esc or by voice = interrupted). After 20 new turns a review runs when the microphone turns off (about a cent with the default model): an LLM proposes aliases for misheard names (only real names on screen), rules for the agent and reply style. Nothing applies until accepted. Accepted aliases rewrite the transcript before the parser and the agent; accepted notes join the agent's prompt. The caption shows how many suggestions wait.
- Settings → Voice → Learning: the journal toggle, last-7-days stats (turns, not understood, corrected, interrupted, answer time, cost), suggestions to accept or reject, what was learned (removable one by one), **Review now** and **Forget everything**.
- E2E of the voice path (`e2e/voice.spec.ts`): transcripts go in through `__flowTower.hear()`, OpenRouter is answered by route interception (no cost), and the journal goes to a temporary `FLOW_TOWER_HOME`.

### Changed
- The voice agent now runs on `google/gemini-3.5-flash-lite` (was `google/gemini-3.1-flash-lite`): in a benchmark of six models on the real tool loop it gave the first real sentence in 1.8 s instead of 2.4 s, every answer right in two steps, for about $0.0006 more per turn (`examples/voice-commands/options/llm-intent.md`). `FLOW_TOWER_AGENT_MODEL` still overrides it.

### Fixed
- Update check: a cached "latest release" older than the running version is ignored, so `/api/version` no longer reports an older release for up to 24 h after an update, and a newer release is noticed at once (#71, reported by @CryptoLordHodlerSqvad).
- A `node_modules` symlink committed by mistake in the previous fix is gone, and `.gitignore` now ignores `node_modules` as a file too (a checkout replaced the local dependency folder with it).
- Voice no longer answers itself through laptop speakers (#72). Half-duplex by default: a clip recorded while a reply plays, or within 700 ms after, is dropped before transcription (no cost, no loop). **Settings → Voice → Interrupt by voice** (off by default, for headphones) brings barge-in back. The echo filter judges a clip by when it was recorded, not when its transcript returns. Esc stops a reply first and keeps the mic on; V and ✕ stop it too.
- A laptop fan no longer opens clips by itself (#73). Speech is detected on the 300–3400 Hz spectrum, divided bin by bin by a noise floor measured 200–700 ms after the mic opens: a voice is louder than the floor and peaky, a fan is flat. **Settings → Voice → Microphone sensitivity** (Low for noisy laptops, Normal, High for quiet rooms). Transcripts that are only Whisper's noise text ("Grazie.", "Thank you.", subtitle credits) are dropped.
- Voice robustness (#74): spoken replies are synthesized one or two sentences ahead, not all at once, and a 429 is retried once, so long replies no longer lose sentences; a chat stream that fails after its headers ends cleanly; a review reads the oldest 200 new entries first, so none are skipped; aliases on short or common words ("il", "the", "open") are refused; the suggestions chip shows right after a review at mic off; the 7-day stats show % undone.
- Voice review round (#68): Esc while a reply is still being written silences the whole turn and journals it *interrupted*; one "speaking" state (from the first sentence until the last one plays) drives the caption, Esc and the half-duplex gate; a command spoken in the 700 ms after a reply shows once "Wait a moment after the reply, or press Esc to interrupt it."; calibration keeps the per-bin minimum, so speech in the first 0.7 s is no longer learned as noise; aliases that are part of a real name are refused and never rewrite inside a name; commands starting with "non …" ("non mostrare…") are no longer taken as corrections; a failed audio sentence cannot leave the mic deaf.
- Voice review round 2 (#68): Esc while a reply is still being written also stops the turn's tool calls, so nothing moves the view after it, and the caption says "Stopped"; a sentence whose speech takes over 8 s is skipped, and a reply the browser refuses to play (autoplay blocked) ends at once, so the mic is never left deaf; with Interrupt by voice on, only clips over audio actually coming out of the speakers go through the barge-in rule, so a command spoken while the first sentence is still being synthesized is handled normally; one automatic review runs at a time, and a failed one waits for 20 more turns (it may have been paid); calibration keeps a ×1.5 margin over the measured minimum, so a fan wobbling just above it does not open clips; corrections that Whisper opens with quotes or punctuation («No, quello») are recognized.
- Voice journal, verifier pass (#68): the automatic review counts unreviewed turns on the server, so reloading the page no longer resets it; each turn also records transcription time and cost, the focused layer, the selected node and the language, and the stats show transcription time and cost per turn (cost now includes transcription; speech synthesis reports no cost).
- Opening a folder whose symlinks loop back (`a -> ..`) no longer hangs the tower scan: folders are walked without following symlinked folders.

### Security
- `voice-journal.jsonl` and `voice-memory.json` are git-ignored anywhere and denied by the dev server, a second line of defence if `FLOW_TOWER_HOME` points inside the repo; user-folder checks resolve paths with the native realpath, so case variants on macOS are caught.
- The user's own data lives outside the repo, in `~/.config/flow-tower` (or `FLOW_TOWER_HOME`): the key file, the voice journal and the voice memory, created readable by the owner only. `OPENROUTER_API_KEY` is read from the environment, then the user folder, then the git-ignored `.env` in the flow-tower folder (a fallback). Nothing personal is written in the repo.
- `/api/file` never serves the user folder, even when a tower root contains it.
- GETs under `/api/voice` refuse cross-site requests: the journal stats and the voice memory are personal.
- The tower loader no longer reads secret files (key and credential files, `.ssh`, `.git`…) or the user folder: a prompt `file:`, agent `from:` or nested tower pointing at one gets the error "is a secret file or in the user folder (~/.config/flow-tower): not read". One guard, `src/core/secrets.ts`, shared with `/api/file`.
- Symlinks cannot leak the user folder through the loader: a tower file is checked by its real path before it is read (a repository could ship `x.tower.yaml` linked to the voice journal, and YAML errors quote the lines they fail on), folder scans skip links that leave the scanned folder or enter the user folder, a referenced file that is secret or in the user folder is refused without checking whether it exists, and the startup warning about `FLOW_TOWER_HOME` inside the flow-tower folder follows symlinks.
- Accepted voice notes are capped at 20 and 2000 characters (409 past the cap) and reach the agent as preferences that never override its instructions, the tool results or the screen. The default user folder is 0700 (a `FLOW_TOWER_HOME` folder that already exists keeps its permissions; the files are 0600 either way), whole-file writes are atomic and leave no temp file behind, journal times are clamped, and the server warns at startup when `FLOW_TOWER_HOME` is inside the flow-tower folder.

## [0.4.0] - 2026-10-10

### Added
- Voice agent (#63): ask about the tower on screen ("cosa c'è nel secondo livello?", "what is the triage connected to?", "open the first file") and it answers out loud in your language, focusing, selecting, highlighting and opening what it talks about. An LLM (default `google/gemini-3.1-flash-lite`) with twelve tools that read and act on the tower in the page; replies spoken by OpenRouter text-to-speech (default `elevenlabs/eleven-flash-v2.5`, one multilingual voice); barge-in; echo filter. Plain commands stay instant with the local parser. Settings → Voice → Spoken replies.
- Voice language in Settings (Auto, Italiano, English), sent to transcription as a hint; command words forgive one misheard letter and more Italian verbs are understood (aprimi, portami, vediamo, andiamo…).
- Node list: with a layer focused and no node selected, a panel on the right lists the layer's nodes in flow order (type tag, name, sub-tower, live state). The names stay readable however small or far the cards are; a click selects the node and the inspector takes its place.
- Voice commands (#62): press V or the MIC button (top bar, library header) and speak, in Italian or English, to open a project, focus a layer by number or name, select a node or agent, switch to map or tower view, go to the overview, go back, open the library or turn the microphone off. Clips end after ~0.6 s of silence and are transcribed by OpenRouter (`openai/whisper-large-v3-turbo`, override with `FLOW_TOWER_VOICE_MODEL`); commands are matched locally against the names on screen, tolerate misheard words, and offer a numbered choice when a name is ambiguous. A caption under the top bar shows what was heard and done. Listening stops after 2 minutes without a command. Needs `OPENROUTER_API_KEY`; not available in the static demo.
- `voice-commands` example: the tower of the voice widget itself, with the speech engines it weighed (Web Speech on-device and cloud, Whisper in the browser, OpenRouter) and a planned LLM intent step.
- `db-api-playbook` example: how to build and run an HTTP API over a database (approach, contract, data access, security, shipping, operations), with a request-pipeline sub-tower and notes pages citing current standards (OWASP API Top 10 2023, OpenAPI 3.2, RFC 9457, RFC 9700, RFC 9745), checked on 2026-10-10.
- `validate` warns about node labels the card cuts (over 18 characters, 13 on a node with a nested tower) (#56).
- Deep links: `?tower=…&layer=…&node=…` opens a tower (nested ones too), focuses a layer or selects a node (#7).
- `--browser <app>` opens the page in another browser; `$BROWSER` works too (#56).
- `approval.description`, like the other operation fields; shown in the node panel.
- Skill and docs: a "Verify against the code" step after validate (prove each edge, list every exit, trace a run per entry point, fresh-context reviewers for big systems); read rule docs, agent bodies and hook code in full; classify hooks from their code; record source conflicts; towers in the mapped system's language; a "Services without agents" guide for HTTP APIs and workers; guidance from two evaluation runs (dev-squad without its tower, langchain-ai/open_deep_research): LangGraph `Command` routing and subgraphs, attempts vs retries, orchestrator hubs, pipeline failures, hook wiring, a reviewer prompt (#56, #7).

### Changed
- `validate` errors point at the fix: a value that fits no form of a field names the missing part (`fanout.max: required field missing`, not `Invalid input`), and YAML errors from an unquoted `: ` or comma say to quote the value (#56). Schema errors name layers and nodes by id (`review.gate.approval`), not by index (`layers.6.nodes.3.approval`).
- Examples: 78 node labels that the card cut are shorter; exact identifiers moved to the description.

### Fixed
- Two flow-tower servers started from the same checkout (a second `--port`, or the e2e server next to a dev server) no longer break each other: each port has its own Vite dependency cache. Before, an open page could fail with "error loading dynamically imported module".
- `dev-squad` example: the sample code now does what its tower shows, and the tower shows what the code does (found by the #7 evaluation run). The lead can request plan approval and the pipeline polls and resumes it; `open_pr`, `run_tests` and `request_approval` run in the issue worktree, not the process directory; any throw or the $15 issue budget comments on the issue and logs the run (new "Run stopped" output); a red suite or an unmet criterion holds the verifier; a review round passes on blocking findings only; the `squad:skip` opt-out wins over the policy upgrade; the reviewer's bash guard and the area rules reach `runAgent` sessions; headless runs deny `ask` permissions explicitly; quick fixes get a CHANGELOG entry and PR body; bad webhook JSON gets a 400; the unused Redis queue and the serverless receiver are gone (the receiver runs in the container); sample logs match the code.

### Security
- Voice commands (#62): `OPENROUTER_API_KEY` stays on the local server (read from the environment or from the `.env` file in the flow-tower folder, which is git-ignored) and never reaches the page; `GET /api/voice` only says whether a key is set. Transcription requests ask OpenRouter for zero data retention (`provider.zdr`; `FLOW_TOWER_VOICE_ZDR=0` turns it off). `/api/voice` only answers this app's page: an exact `application/json` content type, no cross-site `Origin` / `Sec-Fetch-Site`, and the page's own `x-flow-tower-voice` header; the body is capped at 2 MB and at most 2 transcriptions run at once.
- `/api/events` and the OTLP endpoints check the content type by its exact essence and refuse cross-site browser requests. Before, `text/plain;x=application/json` passed the substring check while browsers send it without a CORS preflight (found by the dev-squad security review of #62).
- `/api/file`, `/api/workspace` and the events buffer refuse cross-site browser reads. Vite's default CORS lets pages on other localhost ports read them.
- `/api/file` never serves secret files (`.env*`, `.envrc`, `.git-credentials`, private keys, `.npmrc`, `.netrc`, `*.tfvars`; anything under `.git`, `.ssh`, `.aws`, `.gnupg`, `.docker`, `.kube`), even inside a tower root. Dogfood towers with `root: ../..` have the flow-tower folder as their root, where the local key file lives.

## [0.3.0] - 2026-10-10

### Added
- Study-notes examples: `physics-notes` (mechanics) and `history-notes` (the French Revolution), small towers that are not agent systems.
- Math in Markdown files: `$$…$$` is rendered by KaTeX in the file viewer (single dollars stay text, for prices).
- Live events: `?tower=` on `/api/events` (and `emit --tower` with `--source` too) restricts matching to one tower, for two versions of the same project in one library (#52).
- Docs: a second server with `--port`, and where live events go (#52).

### Fixed
- Edge labels no longer sit under the nodes before and after them: the layout reserves room for each label and places it next to its edge, in the 3D scene and in the SVG / PNG export (where long labels are no longer cut).

### Security
- KaTeX stays on 0.16: `npm audit` reports a low-severity advisory (GHSA-238p-pmpm-9mq7) that needs an existing prototype pollution and the `trust` option, which the viewer does not set. The fix is the 0.19 major.

## [0.2.0] - 2026-10-10

### Security
- The repository is public with `main` protected by a ruleset: pull requests only (no direct or force pushes, no deletion), passing CI, maintainer review through CODEOWNERS. Secret scanning with push protection and Dependabot alerts are on; workflows get a read-only token, and PRs from forks need approval before their workflows run.
- Commit history rewritten to the GitHub noreply address before going public.

### Added
- Zoom to selection: selecting a node (click, arrows, lists, search) centers it in the free area and moves the camera in close enough to read it and its neighbours, following as you move between nodes, in tower and map view. A closer zoom of your own is kept.
- Docs: **[what goes where](docs/what-goes-where.md)**, what belongs in a layer, a node, an edge (and a cross-layer link) and a nested tower, with do / don't rules and a validated example; a compact version in the skill's `reference.md`, linked from the procedure, the schema reference and the README.
- File viewer: **Wrap** (W) wraps long lines with a hanging indent under the code; Markdown files open **formatted** (V switches to source) with GitHub tables, YAML frontmatter as a small metadata table, links to the node's other files opening in the viewer and external links in a new tab. Rendering is inert: raw HTML is dropped, unsafe URLs removed and remote images never loaded. Both choices are remembered.
- Schema (#31), the gaps the presets hit, all optional and backward compatible:
  - run-wide `budget` / `limits` at the top level (shown in the Layers panel);
  - `budget` as a list, with `amount` + `currency`, `per` (run, item, month...), `for` (model, media...) and unit `rate`;
  - quotas in `limits.rate` (`100/24h`, `300/5m`) and `limits.description`;
  - `trigger.timezone` and `hours`;
  - `approval.when` (conditions such as `refund > 500 EUR`), `per` (per-item), `rounds`, `escalate_to`, `relayed_by`, `via` as a list, and the `dismiss` and `takeover` actions;
  - `fanout.by` as several dimensions, plus `from` and `pick` for supervisor queues;
  - `data`: `biometric` sensitivity, `retention: none`, `retention_after`, `lawful_basis` (GDPR), `disclosure` (C2PA, AI labels);
  - evals with `unit` and `illustrative`;
  - `rollout`: `staged` with `steps`, `metric`, `guard`, `arms`, `sample`;
  - `sla` relative to an event, before one, by a date, in business days, or as an external wait;
  - `async` (poll / callback), `exactly_once`, and typed `decision` outputs (binary / choice / score / ranking, threshold, confidence, pinned model, fail open / closed);
  - agent `skills` and `disabled_tools`;
  - edges with `async`, `group` (alternatives), `version`, the A2A `card`, and the `email` / `manual` protocols;
  - durations in years (`10y`).

  The node panel, markers (`BIO`, `1×`, `POLL`, currency budgets) and edge labels show them; JSON Schema, docs and the skill reference are updated, and the presets use them instead of the old workarounds.
- Tokens and cost per node (#9): Flow Tower accepts OpenTelemetry logs (OTLP/HTTP JSON on `/v1/logs`; `/v1/metrics` and `/v1/traces` are acknowledged). Claude Code's `claude_code.api_request` and Codex's `codex.sse_event` / `codex.turn_cost` become `usage` events on the matching agent node; totals show in the node panel, the live feed header (tower and sub-towers) and the library cards, counted once per project. Ready-made `integrations/claude-code/telemetry.json` and a Codex `[otel]` block; the simulator and the online demo send sample telemetry.
- Export (#15): **P** (or the PNG button) and **X** (or SVG) download a ZIP with every layer of the project as its own image, plus the map of all its layers (laid out like the map view), for the project tower and each sub-tower in nested folders. SVGs are plain and editable, in the active theme's colors (nodes with type, model and runtime tags; edges with kinds, arrows and labels). PNGs are the same drawings at Full HD (fit to 1920×1080, UI fonts embedded); the PNG pack also holds the 3D view as on screen, post-processing included. The buttons show progress. Works in the online demo too.
- Update notice (#35): once a day the local server asks GitHub for the latest release (cached 24 h, 1.5 s timeout, silent on failure). A newer version prints the update command in the terminal and shows a `↑ vX.Y.Z` link to the release notes in the top bar (`/api/version`). Off with `--no-update-check`, `FLOW_TOWER_NO_UPDATE_CHECK=1`, in CI, in the E2E suite and in the static demo; documented in the README (*Privacy and updates*).
- Live demo on GitHub Pages (https://jamesmoriartydecripto.github.io/flow-tower/): `npm run build:demo` freezes the example library and every referenced file into a static site (same sandbox rules as `/api/file`, no local paths), and an in-browser simulator plays live events on the tower on screen (DEMO chip to pause). Deployed by `.github/workflows/pages.yml` with pinned actions.
- Pull request template.

### Fixed
- Node panel connections: long names or labels no longer collapse into a one-letter-wide column (text that looked vertical); they wrap by words next to the kind, and the protocol and layer tags stay whole.
- Claude Code live events (#44, verified with a real `claude -p` session with background and foreground subagents):
  - turns Claude Code injects (subagent reports, task notifications, system reminders, cross-session messages) are logs, not user prompts;
  - background subagents stay lit until `SubagentStop` instead of ending when they are launched;
  - every subagent event carries the `role` (the `description` of the `Agent` call), so several subagents of the same type map to different nodes;
  - `SendMessage` to a finished subagent starts it again;
  - the main session is always `agent: main`, and an empty `agent_type` no longer produces `agent: ""`;
  - a foreground subagent ends once and reports its tokens and duration as a `usage` event.
- `match:` rules support negation: `!field:pattern`.
- Live feed: when the initial load of recent events finished after a newer pushed event, older events were added again (duplicate rows, React key warnings); the initial load now only fills in ids not applied yet, and keeps the feed in order.
- Half-screen windows: the export buttons made the bottom bar run over the legend; below 760 px the layer-spacing slider moves out of the bar (it is still in Settings).

## [0.1.0] - 2026-10-09

First release.

### Added
- Release Auditor preset (`examples/release-auditor`): the pre-release bug sweep of this repository as a tower, with charters, threat model, severity and false-positive rules, finder and verifier prompts, `gates.sh` (tsc, vitest, examples, semgrep, npm audit, gitleaks over the whole history) reporting live to the tower, and an E2E Sweep sub-tower. The v0.1.0 audit report is in `reports/v0.1.0.md`.
- Playwright E2E suite (`npm run e2e`, `e2e/`): one test per example tower driven from the keyboard (layers, node panel, connections, map view, every sub-tower in and out), referenced files served, path traversal refused, live feed, malformed and oversized event bodies, panels at seven screen and interface sizes, axe (WCAG 2 A/AA) on library, HUD and Settings. Fails on any console or page error.
- Every YAML and JSON file under `examples/` must parse (`tests/examples.test.ts`).
- Sales Pipeline (prospect → closed deal → invoice) and Invoicing with Fatture in Cloud (SDI e-invoicing, collections, passive cycle) presets, researched online with sources.
- README demo GIF (and full MP4) plus new screenshots: tower, map, node panel, library.
- Social Media Studio preset (per-platform API quotas, approval gates, comment/DM triage, publisher sub-tower).
- AI Video Studio, Ebook Studio, Mobile App Studio and Marketing Studio presets, each researched online with sources in its README.
- Docs for context engineering: `docs/architecture.md` (which file owns what, read on demand), `examples/README.md` (examples indexed by pattern), load-on-demand maps in CLAUDE.md and AGENTS.md; the skill and the generation guide cover operational fields.
- Ten researched presets for different professions and shapes: SRE incident responder, fraud review desk, deep research team, AI co-scientist, airline customer service, ambient chief of staff, legacy-portal browser worker, A2A purchasing concierge, legal due diligence, website & web design studio (frontend and backend sub-towers), plus a Jev decision-layer harness. Each has real files, sources in its README and uses the operational fields.
- Schema: operational fields on agents and nodes (inherited by nodes): `trigger`, `approval`, `budget`, `limits`, `fanout`, `data`, `evals`, `version`, `rollout`, `sla`, `credentials`, `sandbox`; edge `protocol` (mcp, a2a, http, grpc, webhook, queue, event, stdio); `recording` resource kind. Shown as node markers (×N, PII, WEBHOOK, ≤15m, $2), ghost outlines for fan-out, protocol on edge labels, and Operations / Data / Evals sections in the node panel. Search matches triggers, sensitivity, region and version.
- Settings → Text: interface size (80–160%, scales panels and text together, capped automatically so panels still fit the window), text font (HUD / system) and title font (Orbitron / same as text).
- Starter examples (1–3 layers, short YAML): single agent, RAG bot, PR review bot, personal voice assistant.
- Node panel: connections split into "Across layers" (with the target layer) and "In this layer"; click or Enter jumps there and moves the camera, hover highlights the target, "Back to …" (B) undoes a jump, C / Shift+C cycle connected nodes.
- Keyboard inside panels: Enter / I enters the node panel, ↑ ↓ Home End walk sections and buttons, ← → switch tabs (or move along a row), Esc returns to the scene; the file viewer takes and gives back the focus.
- Sub-towers by keyboard: S / Shift+S select the next / previous sub-tower node, Enter dives in, Backspace returns onto the node you entered from, Shift+Backspace to the project root.
- Full keyboard control: arrows move spatially between nodes and across layers, PgUp/PgDn layers, Shift/Alt+arrows and +/− for the camera, [ ] inspector tabs, F live feed, O auto-orbit, ? shortcuts overlay, visible focus ring, Settings focused on open.
- Library: sort by recent / name / size / live, keyboard navigation (arrows, Enter), Tower / Map buttons per card, tags, runtime mix, last-modified time, live project count, "open" badge on the current project.
- Settings → Animations: style (dots, comets, pulses), size, speed and density for flows between nodes and between layers; Visible by default: edge labels, node subtitles, links, grid, frame, base, scanner, sparkles.
- Sub-towers are easy to find: bigger stacked-plates badge, `⇣ SUB` in node subtitles, a Sub-towers list in the Layers panel (select / enter), a SUB-TOWER chip in the inspector and a legend key.
- Layer transparency slider in Settings (the focused layer always stays nearly opaque).
- A description on every button, shown in a HUD-styled tooltip.
- Settings page (⚙ or `,`): themes (Mark, Arc reactor, Stealth, Ember, Verdant, each with a matching live palette), quality, ambient animations, particles, glow strength, default view (auto = map above 10 layers), layer spacing, auto-orbit, spotlight, follow, live chips, controls hint; saved per browser.
- Map view: layers laid out side by side and seen from above (Tower / Map switch, `M`, `?view=map`).
- `flow-tower emit` streams JSONL from stdin live (batches every 250 ms), so `codex exec --json` and `pi --mode json` show up in real time.
- Harness-neutral tower generation: `docs/generate-a-tower.md` procedure, root `AGENTS.md`, `flow-tower guide`, and `install-skill --target claude|codex|pi|hermes|cursor|agents [--project]` (Agent Skills folders, ships `procedure.md`).
- Live events from OpenAI Codex: `codex` adapter for hooks, `codex exec --json` streams and the legacy `notify` payload; `integrations/codex/`.
- On-demand rendering with an FPS budget: `eco` (20 fps cap, no post-processing, 0 renders when idle), `balanced` (30 fps), `high` (60 fps); 10 fps and no decorative motion while the window is unfocused.
- Live palette (cyan running, green done, red error), live chips above active nodes, per-layer live badges, library live dots, sub-tower activity on parent nodes.
- Live feed: Starts/Errors filters, Tower/Library scope, Spotlight, Follow (camera follows activity), Pause, jump to nodes in any tower.
- Pan with Shift + left drag and with Shift + two-finger trackpad scroll (pinch still zooms).
- Claude Code skill (`skills/flow-tower`) that inventories an agentic codebase and writes a validated tower; `flow-tower install-skill [--project]`.
- `flow-tower validate <files|dirs> [--json]` (exit 1 on errors), usable in CI.
- Realtime: `POST /api/events` ingest with adapters for Claude Code hooks, Claude Agent SDK, Pi and Hermes Agent; node matching by agent/tool names or `match:` rules; live node beams/halos, error flashes, Live feed panel, per-node live info in the inspector.
- `flow-tower emit` command (stdin payloads from hooks, or flags for scripts) and `integrations/` configs.
- `npm run simulate` replays a plausible multi-walker run against any tower.
- Layer lens: hovering a layer (or its entry in the Layers panel) magnifies it and its neighbours, spreads the stack around it and dims the rest; clicking an empty plate focuses the layer. Cross-layer links follow the animation.
- 3D tower renderer (three.js / react-three-fiber): stacked glass layers, left-to-right flowcharts laid out with ELK, animated flow particles, bloom, scanner and arc-reactor base.
- YAML tower format (`*.tower.yaml`) validated with zod, plus generated JSON Schema for editor autocomplete.
- Registries for `prompts` and `agents`; `from:` import of Claude Code agent files (`.claude/agents/*.md`).
- Nested towers (`tower:`) with drill-down navigation and breadcrumb.
- Typed edges (`flow`, `call`, `spawn`, `handoff`, `return`, `data`) with shorthand syntax `a -> b [kind]: label`; cross-layer `links`.
- Inspector (overview, harness, connections, system prompt with `{{vars}}`, tools, files) and syntax-highlighted file viewer.
- Search, node-type filters, upstream/downstream path highlighting, layer focus, explode control, keyboard shortcuts.
- Validation panel (errors, warnings, info) and live reload on any referenced file change.
- `flow-tower` CLI with `init` starter template; read-only file API sandboxed to the tower root.
- `examples/dev-squad`: multi-agent software delivery system on the Claude Agent SDK with two nested towers.
- `examples/game-studio`: AI game development studio (14 layers, 141 nodes, 8 nested towers, depth 2).
- `runtimes` registry, per-node `runtime`, `resources` (logs, scripts, dashboards, endpoints) and `status` (planned / experimental / deprecated).
- Library mode: CLI accepts directories and multiple entries; project gallery with tags, stats and health.
- Batched renderer (instancing, batched lines, troika BatchedText), distance-based text LOD, quality presets.
- Large log files are previewed by their tail.
- `scripts/gen-stress.ts` synthetic tower generator for performance testing.
- `examples/course-studio`: course creation studio (12 layers, 109 nodes, 5 nested towers) with researched references.
- Search results ranked by relevance (label > id > model/tools/runtime > description).

### Security
- Release audit (see `examples/release-auditor/reports/v0.1.0.md`): semgrep (javascript, typescript, react, nodejs, secrets) clean after one false positive, npm audit 0 vulnerabilities, gitleaks over the whole git history: no leaks.
- semgrep (javascript, typescript, react, nodejs, python, secrets rulesets): no findings; two loopback `http://127.0.0.1` fetches in `integrations/` annotated as intentional.
- Tower files can only read inside their project (the git repository that contains them, or the opened folder): prompt `file:`, agent `from:`, nested `tower:`, `files`, resources and symlinks pointing outside are refused with an error, and `root:` cannot leave the project. Before, a tower from a cloned repository could pull any local file (e.g. `~/.ssh`) into the workspace and the node panel, and `root: /` widened the `/api/file` sandbox to the whole disk.
- The Claude Code SessionStart hook runs `flow-tower emit` instead of `npx flow-tower emit`: the package name is not published, so npx would have fetched whatever package claims it. Docs and example READMEs no longer suggest `npx flow-tower`.
- `POST /api/events` refuses batches over 1000 events (413): each event is matched against every node, and a huge batch stalled the dev server.

### Changed
- Library cards are plain containers with one primary button (the title), so the Tower / Map buttons are no longer nested inside a button; descriptions are focusable and scroll with ↑ ↓.
- Dialogs (Settings, Shortcuts, file viewer) are modal for the keyboard: focus moves in on open, Tab stays inside, and focus returns to where it was on close. Shortcuts scrolls with ↑ ↓ PageDown on short screens.
- Legend entries are focusable. Tooltips also appear on keyboard focus; the stripped `title` stays available to screen readers. Settings sliders and switches are named after their row. Layers panel entries preview their layer on focus as on hover. Live feed messages show their full text on hover.
- File viewer: ← → switch files and ↑ ↓ PageUp PageDown Home End scroll the code from anywhere in the viewer.
- `prefers-reduced-motion` turns off HUD animations; the smallest labels never render below ~7 px at the 0.7× interface floor.
- README trimmed: examples summarized with a link to the full index; NEXT.md and CONTRIBUTING.md refreshed.
- Glow only where it matters: static structure stays below the bloom threshold; selection, hover, focused layer and live activity glow. Cheaper bloom.
- Focused layer gets a near-opaque plate and the other layers dim further, so the focused flow reads cleanly.

### Fixed
- Found by the release audit (each with a regression test in `tests/` or `e2e/`):
  - Two towers that reference each other no longer vanish from the library (the app showed "no tower files found").
  - A number in agent frontmatter (`name: 2025`) no longer breaks every live event POST and the search.
  - Backspace out of a sub-tower shared by several nodes lands on the node you entered from, not the first one.
  - The runtime spotlight of a sub-tower no longer dims the whole parent tower after going back up.
  - A live reload that removes the selected node or the focused layer clears the selection instead of dimming everything.
  - Clicking the current tower in the breadcrumb keeps the selection.
  - Arrows still move when the selected node's type is hidden in the legend.
  - Shift+C without a previous jump goes to the last connection, not the second to last.
  - The B / "Back to …" trail is per tower (node keys repeat across towers).
  - Esc with the pointer on a connection row no longer leaves its hover highlight stuck.
  - `/` no longer focuses the top-bar search behind Settings, Shortcuts, the file viewer or the library.
  - Live events land on towers whose path contains `#`.
  - Live feed and inspector no longer overlap in half-screen windows; the Issues panel stays above the live feed.
  - Focus rings of full-width rows (feed, files, connections) are no longer clipped.
  - Six example data files were invalid YAML (unquoted `[slug]`, `: ` inside plain scalars, flow sequences as keys); two missing figures of the ebook sample were added; Markdown tables and links fixed across the docs.
- Performance, found by the release audit:
  - Hovering or selecting a node no longer rebuilds every line batch and relinks the line shader (game-studio, 11 hovers: shader links 48 → 4, buffer uploads 6,488 → ~320).
  - Live events are matched with compiled patterns (41 ms → 1.4 ms per event on the 1,769-node examples library).
  - Events that land on no node no longer keep the visible tower rendering for 1.7 s each.
  - The file watcher no longer adds a listener per path on every reload.
  - Layer grid geometries are disposed on tower switch and theme change (GPU memory grew with each switch).
  - The library re-renders only the card whose live state changed.
  - Idle costs nothing: live polling, the closed live feed and the tooltip watchdog no longer wake up while nothing is live or shown.
  - A live reload keeps unchanged towers as they are, so the tower on screen is not laid out again when another file changes.
- Creating a file that a tower references (and was missing) now reloads the library, so its warning disappears without touching the YAML.
- Library tag bar shows the 12 most used tags with counts and a toggle for the rest (100+ tags filled the screen).
- HUD corner brackets no longer scroll with the content of scrolling panels (legend, layers, issues, shortcuts).
- Camera framing respects the HUD (#30): the projection is centered on the free area between panels (setViewOffset), framings fit that area, opening the inspector or the live feed slides the scene instead of covering it, and a node selected under a panel is brought into view with the smallest camera move. When panels open or close, the camera zooms out only as much as needed for the visible nodes to fit, and returns to the previous distance when they fit again.
- vitest only runs `tests/`: sample `*.spec.ts` files inside examples are content, not project tests.
- Library: project descriptions are no longer cut; up to 4 lines, longer ones scroll inside the card.
- Schema docs: labeled edge shorthand (`a -> b: label`) must be quoted in YAML.
- Node titles and subtitles no longer spill out of the node: width-aware truncation (whole subtitle parts) plus a clip at the node border.
- Crash when returning to a parent tower with a layer focused (stale scene used the new focus index).
- Library arrows now work wherever the focus is (and wrap left/right); T / M open the focused card as tower / map.
- Choosing Tower or Map now sticks: sub-towers and other projects open in the same view (saved as the default view).
- HUD audit (1440×900 and 1280×720): controls hint no longer overlaps the legend, legend tabs no longer wrap, narrower feed/inspector on small screens, tooltips no longer linger after their panel closes, canvas redraws after a window resize.
- Plates now occlude the layers below in proportion to their opacity (stack-aware draw order).
- Esc did nothing in the library (focus in the filter) and with a slider focused; pressing L typed an "l" into the library filter.
- Live mode update loop (useSyncExternalStore tearing on an in-place-mutated store) and a dashed line that recompiled its shader on every render.
- Inspector and HUD text overlaps: chips under the close button, long table keys, validation panel over the inspector, layer list over the legend.

[Unreleased]: https://github.com/JamesMoriartyDecripto/flow-tower/compare/v0.10.0...HEAD
[0.10.0]: https://github.com/JamesMoriartyDecripto/flow-tower/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/JamesMoriartyDecripto/flow-tower/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/JamesMoriartyDecripto/flow-tower/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/JamesMoriartyDecripto/flow-tower/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/JamesMoriartyDecripto/flow-tower/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/JamesMoriartyDecripto/flow-tower/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/JamesMoriartyDecripto/flow-tower/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/JamesMoriartyDecripto/flow-tower/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/JamesMoriartyDecripto/flow-tower/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/JamesMoriartyDecripto/flow-tower/releases/tag/v0.1.0

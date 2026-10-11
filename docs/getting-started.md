# Getting started

From a fresh clone to your own towers: the **one home of the local install steps**, `npm link`, copying a
starter tower (copied only the YAML and `validate` warns about missing files: `root:`), validating (in CI: `--json`)
and how to try a tower live without wiring an agent (`npm run simulate`). Instead: a shared server for several
machines in [command-center.md](command-center.md); a tower from code in [generate-a-tower.md](generate-a-tower.md).

Requirements: **Node 22.13 or newer** (`node -v`), git, a browser. Nothing is published on npm: you run
Flow Tower from your clone.

```bash
git clone https://github.com/JamesMoriartyDecripto/flow-tower.git
cd flow-tower && npm install
npm run dev            # the examples library on http://127.0.0.1:5317
```

## 1. Copy one tower and use it

The quickest path: take one example, put it in your own project, open it.

```bash
FT=~/flow-tower                                   # where you cloned it
cp -R $FT/examples/starters/single-agent ~/my-project/tower   # copy the whole folder, not only the YAML
node $FT/bin/flow-tower.js validate ~/my-project/tower        # 0 errors, 0 warnings
node $FT/bin/flow-tower.js ~/my-project/tower                 # opens it in the browser
```

Optional: `npm link` inside the clone puts `flow-tower` on your `PATH` (it is the package's `bin`), so
`flow-tower ~/my-project/tower` works from anywhere. Claude Code's SessionStart hook needs it.

**Best ones to copy:** the [starters](../examples/starters) (one short file each: `single-agent`,
`rag-bot`, `pr-reviewer`, `voice-assistant`), or the preset in [examples/README.md](../examples/README.md)
closest to your pattern.

**File references.** Paths in a tower are relative to its `root:` (default: the tower file's folder),
and every referenced file must stay inside the *project*: the git repository holding the tower, or the
folder you opened. Copy the whole example folder and its prompts and scripts come along. Copy only the
YAML and `validate` tells you what is missing, for example with `starters/rag-bot`:

```
warning  ingest.chunk    file not found: ingest.py
warning  answer.retrieve file not found: answer.py
error    answer.writer   prompt file not found: prompts/answer.md
```

Fix each one by pointing it at your own file, or by dropping what you do not need:

```yaml
- { id: chunk, type: process, label: Chunk by heading, files: [src/ingest.py] }  # your file
prompt: { text: "Answer from the retrieved chunks only." }                        # inline, no file
```

If the tower lives in a subfolder but references the whole repo, set `root: ..` (it may not leave the
project). Then adapt names, layers and nodes to your system.

**Try it live without wiring anything.** With the tower open, run the simulator against it:

```bash
cd $FT && npm run simulate -- single-agent     # substring of the tower's name or file; Ctrl-C to stop
# a tower on another port: npm run simulate -- single-agent --url http://127.0.0.1:5318
```

## 2. Write one from scratch

`node bin/flow-tower.js init my-agent.tower.yaml` writes a starter. Or start from this one (it validates
with 0 errors and 0 warnings):

```yaml
version: 1
name: Support Bot
agents:
  bot: { model: claude-sonnet-5-5, tools: [search_docs] }
layers:
  - id: loop
    title: Agent Loop
    nodes:
      - { id: ask, type: entry, label: Customer question }
      - { id: bot, agent: bot, label: Support agent }
      - { id: ok, type: decision, label: Answered? }
      - { id: reply, type: output, label: Reply }
      - { id: human, type: human, label: Hand to a human }
    edges:
      - ask -> bot
      - bot -> ok
      - "ok -> reply: yes"
      - "ok -> human: no"
  - id: tools
    title: Tools
    nodes:
      - { id: search_docs, type: tool, label: Search help docs }
links:
  - loop.bot -> tools.search_docs [call]
```

Labels show 18 characters on a card: put details in `description`. Which layers, nodes and edges to
use: [what-goes-where.md](what-goes-where.md). Every field: [schema.md](schema.md). Quote edge shorthand
that has a label (`"a -> b: label"`).

Validate after every edit (also good in CI):

```bash
node bin/flow-tower.js validate path/to/my-agent.tower.yaml --json
```

The open tower reloads when you save the YAML or any file it references.

## 3. Generate one from a codebase

Let your coding agent read the code and write the tower: `node bin/flow-tower.js install-skill`
(Claude Code by default; `--target codex|pi|hermes|cursor|agents`), then ask it to "map this project as a
flow tower". The procedure is in [generate-a-tower.md](generate-a-tower.md).

## 4. Make it live

Point your agent's hooks at the local server and the nodes light up as it works:

- Claude Code, Agent SDK, Codex, Pi, Hermes: [realtime.md § Sources](realtime.md#sources)
- your own scripts and loops: [realtime.md § Any other agent](realtime.md#any-other-agent)
- tokens and cost per node: [realtime.md § Tokens and cost](realtime.md#tokens-and-cost-opentelemetry)
- events map to nodes by agent and tool names: [realtime.md § Matching](realtime.md#matching-events-to-nodes)

## Where your data lives

Your settings, keys, tokens and history live in your user folder, `~/.config/flow-tower` (or
`FLOW_TOWER_HOME`), never in the repo or in your towers. See the README,
[Where your data lives](voice.md#where-your-data-lives).

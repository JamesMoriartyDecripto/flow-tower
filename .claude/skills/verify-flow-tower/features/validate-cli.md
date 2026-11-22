# Validate a tower from the CLI

`flow-tower validate` reads tower files and reports errors and warnings without starting the viewer. Authors and CI use it before a tower is shared.

## Sub-features

- `validate-ok` reports a clean folder.
- `validate-errors` reports a broken tower and exits with a failure code.

## How to get to it (user POV)

- Run `node bin/flow-tower.js validate <file.tower.yaml | dir> --json` in a terminal.

## Driving it with the CLI

Preconditions:

- Node 22.13 or newer. No instance and no run folder are needed.

- **A clean folder.** Run `$N bin/flow-tower.js validate examples/starters --json > <out>/validate-ok.json; echo $? > <out>/validate-ok.exit`. The exit code is 0 and the JSON has `"ok": true` with four projects.
- **A broken tower.** Write a small tower outside the repository with one edge to a node that does not exist, and validate it the same way. The exit code is 1, `"ok"` is `false`, and the one issue, at `layers.loop.edges.1`, reads `edge endpoint "loop.ghost" does not exist`.
- **A control.** Validate the same tower without the bad edge. It exits 0. The failure then comes from that edge and nothing else.
- **Proof.** For each run, the output and the exit code the shell reported, saved together, and the towers you wrote.

A minimal broken tower. A layer needs a `title` and a node a `label`: without them the tower fails for that reason and proves nothing about the edge.

```yaml
version: 1
name: Broken
layers:
  - id: loop
    title: Loop
    nodes:
      - { id: question, type: entry, label: Question }
      - { id: answer, type: output, label: Answer }
    edges:
      - question -> answer
      - question -> ghost
```

## Gotchas

- An exit code of 1 on the broken tower is the proof, not a problem with the check.
- Capture the exit code with the shell at the time of the run. A number typed into a file afterwards proves nothing.
- Keep scratch towers out of `examples/`. The examples test fails on any file there that git ignores or that does not validate.

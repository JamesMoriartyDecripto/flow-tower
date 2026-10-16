# Tower optimizer: before/after

## voice-commands.tower.yaml — Voice Commands

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | capture.detect | warning | decision with 1 outgoing edge(s): add one edge per answer |
| AUD04 | capture.detect | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | conversation.step | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | learning.due | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | understanding.ambiguous | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | understanding.bargein | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | understanding.pick | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | understanding.route | warning | decision with no fail: set decision.fail to open or closed |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD03 | server.secrets | warning | sensitive or exactly-once step with no approval: add approval (or a human node before it) |
| AUD04 | transcription.engine | warning | decision with no fail: set decision.fail to open or closed |
| AUD06 | conversation.agent | info | 19 tools: split the job across agents |
| AUD06 | conversation.tools | info | 19 tools: split the job across agents |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 7 | 7 | 0 |
| nodes | 56 | 56 | 0 |
| edges | 131 | 132 | +1 |
| agents | 1 | 1 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 9 | 9 | 0 |
| withOps.approval | 1 | 1 | 0 |
| withOps.evals | 3 | 3 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_


## What the fixes declare

The seven `fail: closed` decisions take no action, or take the restricted path, when the answer is unclear. Each matches `src/app/voice/`:

| decision | what happens on doubt or error |
| --- | --- |
| capture.detect | Below the thresholds a tick is noise, and no clip is cut. |
| understanding.route | The restricted path wins: unless the phrase looks like a question or a reference to the screen, the local parser goes first, and it runs only known commands. The agent gets the phrase only if the parser does not understand it, and a failed agent turn shows "No answer: …" and runs nothing (`voice.ts`). |
| understanding.pick | Not a pick, so the phrase goes to the parser. |
| understanding.bargein | Under 3 words, the reply goes on. |
| understanding.ambiguous | No candidate scores ≥ 0.5, so no command runs: "Not understood", passed on to the agent when there is one. |
| conversation.step | An HTTP error throws and ends the turn. Step 4 cannot call tools. |
| learning.due | A failed review waits for 20 more turns. |

A new data edge `detect -> floor` records that the speech/noise answer sets how fast the noise floor follows the
room (`mic.ts`: 5% per tick while quiet, 0.2% while speaking). That was the second way out the audit asked for.

## Open findings and why

| rule | node | why it stays open |
| --- | --- | --- |
| AUD03 | server.secrets | It is the guard that keeps the key out of reach: no tower can read secret files, and `/api/file` answers 403. An approval in front of the guard would gate nothing. |
| AUD04 | transcription.engine | A design choice made once in code, not a run-time decision. A failed transcription already goes to the caption (`transcription.send`). |
| AUD06 | conversation.agent, conversation.tools | 19 tools on one latency-bound voice agent, with at most 4 steps a turn. A router plus specialists would add a model hop to every spoken request. Revisit if tool picks start to fail. |

## Pattern review

Nothing found beyond the audit. The flow is routing plus one capped tool loop, already the simplest pattern for it. The
agent's model was chosen by a six-model benchmark on this tool loop (2026-10-10).

## Models to benchmark

None: `conversation.model` was picked by its own benchmark.

## Review

The squad reviewer (GLM 5.3 FlashX, $0.0025) found two points, both fixed in the table above:
- the route row now says what happens on doubt: the parser first, then the agent;
- the ambiguous row now names the agent fallback.

It confirmed the other five decisions and the new edge against the code.

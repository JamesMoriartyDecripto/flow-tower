# Tower optimizer: before/after

## dev-squad.tower.yaml — Dev Squad

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | intake.route | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | quality.verdict | warning | decision with no fail: set decision.fail to open or closed |
| AUD04 | specialists.green | warning | decision with no fail: set decision.fail to open or closed |
| AUD11 | quality.reviewer | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | quality.verifier | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | specialists.coder | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |
| AUD11 | specialists.tester | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD04 | memory.promote | warning | decision with 1 outgoing edge(s): add one edge per answer |
| AUD05 | intake.triage | info | feeds output with no evals: add evals to measure the answer |
| AUD05 | orchestration.lead | info | feeds output with no evals: add evals to measure the answer |
| AUD11 | tools.builtin | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 8 | 8 | 0 |
| nodes | 62 | 62 | 0 |
| edges | 99 | 99 | 0 |
| agents | 10 | 10 | 0 |
| withOps.budget | 5 | 5 | 0 |
| withOps.limits | 2 | 2 | 0 |
| withOps.approval | 2 | 2 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 4 | +4 |

### Model changes

_none_

## towers/coder.tower.yaml — Coder internals

### Findings fixed

_none_

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD11 | edit.plan_edit | warning | shell or code tool with no sandbox: add sandbox (network, filesystem) |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 3 | 3 | 0 |
| nodes | 16 | 16 | 0 |
| edges | 18 | 18 | 0 |
| agents | 1 | 1 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 0 | 0 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_

## towers/researcher.tower.yaml — Researcher internals

### Findings fixed

_none_

### Findings new

_none_

### Findings still open

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | fanout.split | warning | fan-out with no limits: add limits.concurrency or limits.timeout |

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 3 | 3 | 0 |
| nodes | 14 | 14 | 0 |
| edges | 18 | 18 | 0 |
| agents | 1 | 1 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 0 | 0 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_


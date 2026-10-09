"""Host-side gate loop: every agent.custom_tool_use pauses the session (requires_action);
data tools go to HANDLERS, escalate goes to the human resolver. On end_turn the terminal
check enforces exactly one record_decision per transaction id."""
import json
from collections import Counter

from tools import HUMAN, TERMINAL


def run_gate_loop(stream, send, handlers: dict, resolver, batch_ids: list[str], nudge) -> Counter:
    pending, terminal_calls = {}, Counter()
    for ev in stream:
        if ev.type == "agent.custom_tool_use":
            pending[ev.id] = ev
        elif ev.type == "session.status_terminated":
            break
        elif ev.type == "session.status_idle" and ev.stop_reason:
            if ev.stop_reason.type != "requires_action":
                missing = [t for t in batch_ids if terminal_calls[t] == 0]
                if not missing:
                    break
                nudge(f"No record_decision yet for: {', '.join(missing)}. Finish each with exactly one call.")
                continue
            for event_id in ev.stop_reason.event_ids:
                call = pending.pop(event_id)
                txn = call.input.get("transaction_id")
                if call.name in TERMINAL and terminal_calls[txn] >= 1:
                    result = {"error": "already_decided", "detail": "record_decision is allowed once per transaction"}
                elif call.name in HUMAN:
                    result = {"human_decision": resolver(call.input)}
                else:
                    result = handlers[call.name](**call.input)
                    if call.name in TERMINAL:
                        terminal_calls[txn] += 1
                send(event_id, json.dumps(result, default=str))  # user.custom_tool_result
    return terminal_calls

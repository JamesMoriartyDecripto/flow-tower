"""Production extension (not in the upstream demo): human gates.

1. Compensation above a threshold pauses the run for a duty manager (needs_approval).
2. Customers who ask for a person, or who trip the same guardrail twice, are queued
   for a live agent with the full transcript and the public context.
"""
from agents import Runner, RunState

APPROVAL_THRESHOLD_USD = 500
VOUCHER_USD = {"hotel": 180, "meal": 60, "ground": 40}  # mirrors demo_data vouchers


async def compensation_needs_approval(ctx, params: dict, call_id: str) -> bool:
    """Called by the SDK before issue_compensation runs. True = interrupt the run."""
    scenario = ctx.context.state.scenario or "on_time"
    total = sum(VOUCHER_USD.values()) if scenario == "disrupted" else 0
    cash = "refund" in params.get("reason", "").lower()  # cash refunds always need a human
    return cash or total > APPROVAL_THRESHOLD_USD


async def resume_after_review(agent, result, decisions: dict[str, bool], note: str = ""):
    """decisions maps tool name -> approved. Rejections tell the model why."""
    state: RunState = result.to_state()
    for item in result.interruptions:
        if decisions.get(item.name, False):
            state.approve(item)
        else:
            state.reject(item, rejection_message=note or "A supervisor declined this payout.")
    return await Runner.run(agent, state)


def wants_human(text: str, tripped_twice: bool) -> bool:
    asks = any(p in text.lower() for p in ("speak to a human", "real person", "agent please"))
    return asks or tripped_twice


def escalation_ticket(thread_id: str, public_ctx: dict, transcript: list[dict]) -> dict:
    """Payload for the contact-center queue. Only the filtered public context is sent."""
    return {
        "thread_id": thread_id,
        "priority": "high" if public_ctx.get("special_service_note") else "normal",
        "context": public_ctx,
        "transcript": transcript[-20:],
    }

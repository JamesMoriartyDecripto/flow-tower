# Analyst case packet

Write the case packet a fraud analyst reads before deciding {{transaction_id}}.
Inputs: the escalate call {{escalation}}, the transaction {{transaction}}, the
precedents {{precedents}} and the ring summary {{ring}}.

Format (max 200 words):

1. **Why it is here**: the escalation trigger(s), verbatim threshold names.
2. **Agent recommendation**: approve or reject, confidence, one-line reason.
3. **Evidence for / against**: up to 3 bullets each, each with a source id.
4. **Ring**: network size, circular flow, layering count. Say "none" when clean.
5. **What would change the call**: the one fact an analyst should check first.

Do not recommend a decision beyond the agent's. Never include full account numbers:
show the last 4 digits only.

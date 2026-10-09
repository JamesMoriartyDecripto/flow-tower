"""AgentCore Runtime entrypoint: one invocation = one work item from SQS."""
import logging
from pathlib import Path

from bedrock_agentcore import BedrockAgentCoreApp

import computer_loop
import login
import session
import verify

app = BedrockAgentCoreApp()
log = logging.getLogger("portal.handler")
WORKER_PROMPT = Path(__file__).parent.parent.joinpath("prompts/worker.md").read_text()
MAX_ATTEMPTS = 3  # SQS redrive: the third failure lands in the DLQ


@app.entrypoint
def invoke(payload: dict) -> dict:
    item, route = payload["work_item"], payload["route"]  # route comes from the classifier
    client = session.start(item["work_item_id"], batch=route["mode"] == "batch")
    handed_over = False
    try:
        try:
            login.login(client)
        except login.MfaRequired:
            session.hand_to_human(client, "MFA")
            handed_over = True
            return {"status": "awaiting_operator", "live_view": session.live_view_url(client)}

        task = (f"Request type: {route['type']}\nPolicy: {item['policy_number']}\n"
                f"Payload: {item['payload']}\nDocuments: {item.get('documents', [])}")
        outcome = computer_loop.run(client.session_id, WORKER_PROMPT, task)
        log.info("worker outcome=%s steps=%s", outcome["tool"], outcome["steps"])

        if outcome["tool"] == "request_takeover":
            session.hand_to_human(client, outcome["input"].get("reason", ""))
            handed_over = True
            return {"status": "awaiting_operator", "live_view": session.live_view_url(client)}
        if outcome["tool"] == "report":
            # exception / mismatch -> human review queue; stuck -> retry via SQS visibility timeout
            status = outcome["input"]["status"]
            if status == "stuck" and payload.get("attempt", 1) < MAX_ATTEMPTS:
                raise RuntimeError("worker stuck, retry")
            return {"status": "needs_review", "reason": outcome["input"]}
        return verify.verify_and_submit(client, item, route["type"], outcome["input"]["entered"])
    finally:
        # A takeover keeps the session alive for the operator; the TTL still caps it.
        if not handed_over:
            session.stop(client)


if __name__ == "__main__":
    app.run()

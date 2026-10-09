"""SQS-triggered Lambda: dedupe, classify with Haiku, invoke the AgentCore Runtime worker."""
import json
from pathlib import Path

import boto3
from anthropic import AnthropicBedrock

REGION = "eu-central-1"
RUNTIME_ARN = "arn:aws:bedrock-agentcore:eu-central-1:111122223333:runtime/portal_worker-Q1w2E3r4T5"
CLASSIFIER = "eu.anthropic.claude-haiku-5-5"
PROMPT = Path(__file__).parent.parent.joinpath("prompts/classifier.md").read_text()

ddb = boto3.client("dynamodb", region_name=REGION)
agentcore = boto3.client("bedrock-agentcore", region_name=REGION)
llm = AnthropicBedrock(aws_region=REGION)


def first_time(key: str) -> bool:
    """Idempotency: a redelivered SQS message must not file the same endorsement twice."""
    try:
        ddb.put_item(TableName="portal-work-items", Item={"pk": {"S": key}},
                     ConditionExpression="attribute_not_exists(pk)")
        return True
    except ddb.exceptions.ConditionalCheckFailedException:
        return False


def classify(item: dict) -> dict:
    msg = llm.messages.create(
        model=CLASSIFIER, max_tokens=200,
        messages=[{"role": "user", "content": PROMPT.replace("{{work_item}}", json.dumps(item))}],
    )
    text = msg.content[0].text
    return json.loads(text[text.index("{"): text.rindex("}") + 1])


def handler(event, _context):
    failures = []
    for record in event["Records"]:
        item = json.loads(record["body"])
        attempt = int(record["attributes"]["ApproximateReceiveCount"])
        if attempt == 1 and not first_time(item["idempotency_key"]):
            continue
        route = classify(item)
        if route["type"] == "unsupported" or route["missing"]:
            boto3.client("sqs").send_message(
                QueueUrl="https://sqs.eu-central-1.amazonaws.com/111122223333/portal-human-review",
                MessageBody=json.dumps({"work_item": item, "route": route}))
            continue
        try:
            agentcore.invoke_agent_runtime(
                agentRuntimeArn=RUNTIME_ARN,
                runtimeSessionId=f"{item['work_item_id']}-attempt-{attempt:02d}-portal-worker",
                payload=json.dumps({"work_item": item, "route": route, "attempt": attempt}))
        except Exception:
            # Partial batch response: only this message returns to the queue (max 3, then DLQ).
            failures.append({"itemIdentifier": record["messageId"]})
    return {"batchItemFailures": failures}

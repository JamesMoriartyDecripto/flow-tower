"""Claude PR review step: diff + lint report in, JSON review out, posted with gh."""
import json
import os
import subprocess

import anthropic

PROMPT = open("prompts/reviewer.md").read()
base = os.environ.get("GITHUB_BASE_REF", "main")
diff = subprocess.run(["git", "diff", f"origin/{base}...HEAD"], capture_output=True, text=True).stdout
lint = subprocess.run(["ruff", "check", "--output-format=concise", "."], capture_output=True, text=True).stdout

reply = anthropic.Anthropic().messages.create(
    model="claude-sonnet-5-5",
    max_tokens=4000,
    system=PROMPT,
    messages=[{"role": "user", "content": f"Lint report:\n{lint}\n\nDiff:\n{diff[:150_000]}"}],
)
review = json.loads(reply.content[0].text)
flag = "--request-changes" if review["blocking"] else "--approve"
body = "\n".join(f"- `{c['path']}:{c['line']}` {c['body']}" for c in review["comments"]) or "No blocking issues."
subprocess.run(["gh", "pr", "review", os.environ["PR_NUMBER"], flag, "--body", body], check=True)

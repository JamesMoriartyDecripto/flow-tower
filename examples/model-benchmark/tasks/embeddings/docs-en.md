---
id: docs-en
category: embeddings
endpoint: embeddings
check: json
steps: 1
---
# Find the right doc paragraph for a user question

From real work: the docs-qa example retrieves Flow Tower doc paragraphs for user questions; the queries share few words with the right paragraph, so only meaning finds it.

## Prompt

Embed the corpus and the queries (the runner ranks by cosine similarity).

## Request

```json
{
 "corpus": {
  "hooks": "Claude Code HTTP hooks post every tool call to the server's events endpoint, which must answer 204 with an empty body.",
  "satellite": "A satellite machine forwards its events to the team hub over the tailnet with a sender token.",
  "share": "The share command gives a tower folder to the hub so teammates can open it from the library.",
  "export": "The export command prints the tower document as a PDF from headless Chromium, with 3D figures.",
  "audit": "The audit command checks a tower against rules AUD01 to AUD11 and lists the model fit per node.",
  "voice": "Voice commands are parsed in the browser; spoken replies come from a text-to-speech model.",
  "budget": "A budget on a node or tower caps spend per run or per month and says what happens over the cap.",
  "fanout": "A fan-out runs parallel copies of a node, up to a maximum, with optional concurrency limits.",
  "retention": "Data fields on a node declare sensitivity, region and how long records are kept.",
  "squad": "The dev squad runs a coder, a reviewer and a security checker through OpenRouter on task files."
 },
 "queries": {
  "q1": "How do I make teammates see my tower?",
  "q2": "Which reply must the endpoint give so Claude does not read it as a decision?",
  "q3": "How can I limit how much money the agents spend?",
  "q4": "Where do I say that personal data is stored in the EU and deleted after ten years?",
  "q5": "How do I print the tower to a file I can send?",
  "q6": "How do I run many copies of the same agent at once?"
 }
}
```

## Expected

```json
{"q1": "share", "q2": "hooks", "q3": "budget", "q4": "retention", "q5": "export", "q6": "fanout"}
```

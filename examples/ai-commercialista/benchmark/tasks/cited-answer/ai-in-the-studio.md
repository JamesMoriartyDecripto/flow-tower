---
id: ai-in-the-studio
category: cited-answer
check: command
command: ai-in-the-studio.check.mjs
tools: read_file
files: fixtures/l212-2000-art10bis.txt, fixtures/l132-2025-art13.txt
steps: 6
---
# Answer an AI-in-the-studio question from the cited law

From real work: `analysis.researcher` in `ai-commercialista.tower.yaml`, with the disclosure rule of `policies/ai-disclosure-it.md`. The fine is not in the two files, so the right answer says so.

## Prompt

Answer only from the two files (read them with the read_file tool). Reply with one JSON object and nothing else: `{"answer": "…", "citations": [{"file": "fixtures/….txt", "quote": "…"}]}`. Each quote must be copied character for character from the file, at least 20 characters. If the files do not answer part of the question, say so in `answer`; never fill a gap from memory.

Question: Can our studio let an AI system draft and send memos to clients with no professional involved? What must we tell clients about the AI we use? And what is the fine if we do not tell them?

## Expected

`ai-in-the-studio.check.mjs` (with `verify-quotes.mjs`) checks that the answer is one JSON object, that every citation is a verbatim quote from one of the two fixtures, that a quote from art. 13 comma 1 ("attività strumentali e di supporto") and one from comma 2 ("comunicate al soggetto destinatario") are present, and that the answer says the files state no fine. An invented fine fails.

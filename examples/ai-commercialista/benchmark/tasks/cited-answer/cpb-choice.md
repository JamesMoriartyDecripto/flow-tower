---
id: cpb-choice
category: cited-answer
check: command
command: cpb-choice.check.mjs
tools: read_file
files: fixtures/l212-2000-art10bis.txt, fixtures/l132-2025-art13.txt
steps: 6
---
# Answer a CPB abuse question from the cited law

From real work: `analysis.researcher` in `ai-commercialista.tower.yaml`, which answers only from retrieved text ("no source, no claim"), here on the art. 10-bis choice between optional regimes.

## Prompt

Answer only from the two files (read them with the read_file tool). Reply with one JSON object and nothing else: `{"answer": "…", "citations": [{"file": "fixtures/….txt", "quote": "…"}]}`. Each quote must be copied character for character from the file, at least 20 characters. If the files do not answer part of the question, say so in `answer`; never fill a gap from memory.

Question: A client company wants to adhere to an optional regime offered by the law because it lowers its tax. Can the tax authority treat that choice as abuse of law? Name the comma.

## Expected

`cpb-choice.check.mjs` (with `verify-quotes.mjs`) checks that the answer is one JSON object, that every citation is a verbatim quote from one of the two fixtures, and that a quote from comma 4 ("libertà di scelta del contribuente tra regimi opzionali") is present and the answer names comma 4.

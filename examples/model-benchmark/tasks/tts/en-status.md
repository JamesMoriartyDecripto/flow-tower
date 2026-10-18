---
id: en-status
category: tts
endpoint: speech
check: wer-roundtrip
max_wer: 0.1
steps: 1
---
# Speak a status update with a name

From real work: the voice-commands example speaks short replies about towers; names and short sentences are where speech goes wrong. No digits: a transcript writes numbers as digits, which would count as errors.

## Prompt

The release audit finished this morning. Every test passed, none failed, and the report is ready for Maria Rossi to sign before lunch.

## Expected

The spoken audio is transcribed by the speech-to-text judge and compared with the prompt: word error rate at most 0.1.

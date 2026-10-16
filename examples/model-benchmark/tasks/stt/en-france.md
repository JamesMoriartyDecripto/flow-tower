---
id: en-france
category: stt
endpoint: transcriptions
check: wer
audio: fixtures/stt-en-france.wav
language: en
max_wer: 0.1
steps: 1
---
# Transcribe a paragraph read by a person

From real work: the voice-commands example transcribes speech before acting on it. The clip is a human reading from LibriVox (public domain): Anatole France, *Penguin Island*, Book I chapter 1, read by Michael Sirois (https://archive.org/details/penguin_island_ms_librivox, file 01, 33.8 s to 59.5 s).

## Prompt

Transcribe the audio.

## Expected

The reference is the book's text (Project Gutenberg #1930, *Penguin Island*, A. W. Evans translation), word error rate at most 0.1.

```text
Maël, a scion of a royal family of Cambria, was sent in his ninth year to the Abbey of Yvern so that he might there study both sacred and profane learning. At the age of fourteen he renounced his patrimony and took a vow to serve the Lord. His time was divided, according to the rule, between the singing of hymns, the study of grammar, and the meditation of eternal truths.
```

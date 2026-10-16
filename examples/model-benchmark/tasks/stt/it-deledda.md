---
id: it-deledda
category: stt
endpoint: transcriptions
check: wer
audio: fixtures/stt-it-deledda.wav
language: it
max_wer: 0.12
steps: 1
---
# Transcribe Italian speech with names and a web address

From real work: the commercialista and voice examples hear Italian clients. The clip is a human reading from LibriVox (public domain): Grazia Deledda, *Canne al vento*, chapter 1 introduction (https://archive.org/details/canne_al_vento_1609_librivox, file 01, 12.25 s to 32.9 s).

## Prompt

Transcribe the audio.

## Expected

The reference is the consensus of three transcription models of three families (openai/gpt-transcribe, mistralai/voxtral-small-24b-2507-stt, google/gemini-3.5-transcribe), which agreed word for word on 2026-10-16. Those three models are kept out of this task's ranking. Word error rate at most 0.12.

```text
Per maggiori informazioni o per diventare volontari, visitate il sito librivox.org. Registrazione di Enrica Giampieretti, Pesaro. Canne al vento. Capitolo primo.
```

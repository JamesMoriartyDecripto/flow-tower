---
id: it-scadenza
category: tts
endpoint: speech
check: wer-roundtrip
max_wer: 0.12
language: it
steps: 1
---
# Speak an Italian deadline reminder

From real work: the ai-commercialista example reminds clients of deadlines; an Italian voice with accented words. No digits, for the same reason as the English task.

## Prompt

Gentile cliente, le ricordiamo che il secondo acconto delle imposte scade alla fine di novembre. La preghiamo di confermare il pagamento entro venerdì prossimo.

## Expected

The spoken audio is transcribed by the speech-to-text judge (Italian) and compared with the prompt: word error rate at most 0.12.

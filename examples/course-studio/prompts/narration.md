Prepare the narration for segment {{segment_id}} for text-to-speech.
Voice: {{voice_name}}, locale {{locale}}, target pace {{wpm}} words per minute.

<script>
{{script}}
</script>

## Do
- Expand abbreviations the voice would misread ("e.g." -> "for example", "PM" -> "P M" only
  if the lexicon has no entry). Apply every entry in the lexicon:
  {{lexicon}}
- Spell out symbols and numbers as spoken ("3-5" -> "three to five", "JSON" via the lexicon).
- Insert `<break time="600ms"/>` at every cue change and `<break time="1s"/>` between sections.
- Mark at most one `<emphasis>` per sentence, only on the word the slide highlights.
- Split sentences longer than 25 words at a natural pause.

## Do not
- Add, remove or reorder content. Change meaning. Add greetings or sign-offs.
- Read code aloud character by character; describe it ("the prompt on screen starts with a role").

Return SSML only, one `<p>` per cue, and nothing else.

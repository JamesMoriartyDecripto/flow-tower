"""Captions from the final voice-over: one whisper-1 call with word and segment timestamps.

Writes  <out>.srt        caption track for YouTube uploads (not burned in on long-form)
        <out>.words.json word timings for the Remotion animated captions (9:16 / 1:1)

whisper-1 is the OpenAI model that returns word timestamps; files must be <= 25 MB, so we send
the VO stem (mono 64 kbps mp3), never the full mix. Brand terms go in the prompt (224 tokens max).

Usage: python pipeline/captions.py renders/KTC-2026-041/vo.mp3 renders/KTC-2026-041/captions
"""
import json
import sys
from pathlib import Path

from openai import OpenAI  # reads OPENAI_API_KEY from the environment

BRAND_TERMS = "Kestrel, Ridgeline 12L, Mara Lindqvist, ultra, 50K, gels, carbs, switchback"
MAX_CHARS = 32  # per caption line, from config/brand-kit.json


def srt_time(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def to_srt(words: list[dict]) -> str:
    """Groups words into cues of at most two lines of MAX_CHARS, breaking on pauses > 0.4 s."""
    cues, current = [], []
    for w in words:
        text = " ".join(x["word"] for x in current + [w])
        gap = current and w["start"] - current[-1]["end"] > 0.4
        if current and (len(text) > 2 * MAX_CHARS or gap):
            cues.append(current)
            current = []
        current.append(w)
    if current:
        cues.append(current)
    out = []
    for i, cue in enumerate(cues, 1):
        text = " ".join(x["word"] for x in cue)
        out.append(f"{i}\n{srt_time(cue[0]['start'])} --> {srt_time(cue[-1]['end'])}\n{text}\n")
    return "\n".join(out)


def main(audio: str, out: str) -> None:
    if Path(audio).stat().st_size > 25 * 1024 * 1024:
        sys.exit("VO stem over 25 MB: export mono 64 kbps first")
    client = OpenAI()
    with open(audio, "rb") as f:
        tr = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="verbose_json",
            timestamp_granularities=["word", "segment"],
            prompt=BRAND_TERMS,
        )
    words = [{"word": w.word, "start": w.start, "end": w.end} for w in tr.words]
    Path(f"{out}.srt").write_text(to_srt(words), encoding="utf-8")
    remotion = [{"text": w["word"], "startMs": int(w["start"] * 1000), "endMs": int(w["end"] * 1000)} for w in words]
    Path(f"{out}.words.json").write_text(json.dumps(remotion, indent=1), encoding="utf-8")
    print(json.dumps({"step": "captions", "words": len(words), "duration_s": round(words[-1]["end"], 2)}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

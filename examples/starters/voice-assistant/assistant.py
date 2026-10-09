"""Pocket Voice Assistant: wake word -> faster-whisper -> Claude (local tools) -> Piper."""
import datetime
import subprocess
import threading

import anthropic
import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel
import openwakeword
from openwakeword.model import Model

RATE, FRAME = 16_000, 1280  # openWakeWord expects 80 ms frames of 16 kHz int16 audio
openwakeword.utils.download_models()  # one-time download of the pre-trained wake words
wake = Model(wakeword_models=["hey_jarvis"])
stt = WhisperModel("small", device="cpu", compute_type="int8")
claude = anthropic.Anthropic()
SYSTEM = open("prompts/system.md").read()

TOOLS = [
    {"name": "get_time", "description": "Current local date and time.", "input_schema": {"type": "object", "properties": {}}},
    {"name": "set_timer", "description": "Start a countdown and announce it when done.",
     "input_schema": {"type": "object", "properties": {"minutes": {"type": "number"}, "label": {"type": "string"}}, "required": ["minutes"]}},
    {"name": "add_note", "description": "Append a short note to the notes file.",
     "input_schema": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}},
]


def say(text: str):
    # Piper writes raw 22.05 kHz audio; aplay plays it on the Pi's speaker.
    piper = subprocess.Popen(["piper", "--model", "en_US-lessac-medium.onnx", "--output_raw"],
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    subprocess.run(["aplay", "-q", "-r", "22050", "-f", "S16_LE", "-t", "raw", "-"], stdin=piper.stdout)
    piper.communicate(text.encode())


def run_tool(name: str, args: dict) -> str:
    now = datetime.datetime.now()
    if name == "get_time":
        return now.strftime("%A %d %B %Y, %H:%M")
    if name == "set_timer":
        threading.Timer(args["minutes"] * 60, say, [f"Timer done: {args.get('label', 'your timer')}"]).start()
        return "timer started"
    with open("memory/notes.md", "a") as f:
        f.write(f"- {now:%Y-%m-%d %H:%M} — {args['text']}\n")
    return "saved"


def think(text: str) -> str:
    messages = [{"role": "user", "content": text}]
    while True:
        reply = claude.messages.create(model="claude-haiku-5-5", max_tokens=300, system=SYSTEM, tools=TOOLS, messages=messages)
        if reply.stop_reason != "tool_use":
            return "".join(b.text for b in reply.content if b.type == "text")
        messages.append({"role": "assistant", "content": reply.content})
        messages.append({"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": b.id, "content": run_tool(b.name, b.input)}
            for b in reply.content if b.type == "tool_use"
        ]})


def record(stream, seconds: float = 6.0, silence: float = 400) -> np.ndarray:
    """Records after the wake word until ~0.8 s of silence (or the time limit)."""
    chunks, quiet = [], 0
    for _ in range(int(seconds * RATE / FRAME)):
        frame, _ = stream.read(FRAME)
        chunks.append(frame[:, 0])
        quiet = quiet + 1 if np.abs(frame).mean() < silence else 0
        if quiet >= 10 and len(chunks) > 10:
            break
    return np.concatenate(chunks).astype(np.float32) / 32768


def main():
    with sd.InputStream(samplerate=RATE, channels=1, dtype="int16", blocksize=FRAME) as stream:
        while True:
            frame, _ = stream.read(FRAME)
            # Scores are keyed by model file name (e.g. "hey_jarvis_v0.1"): one model, so take the max.
            if max(wake.predict(frame[:, 0]).values()) < 0.5:
                continue
            segments, _ = stt.transcribe(record(stream), language="en")
            text = " ".join(s.text for s in segments).strip()
            if text:
                say(think(text))
            wake.reset()


if __name__ == "__main__":
    main()

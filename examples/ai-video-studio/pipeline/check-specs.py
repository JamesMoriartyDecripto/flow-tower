"""Technical gate: ffprobe each file and compare with config/platform-specs.yaml.

Used twice: per take in the shot sub-tower (duration, fps, resolution, audio present) and per
platform cut in QA (size, codec, duration limits). Exit code 1 if any check fails, so the gate
can loop back to the editor or the shot pipeline.

Usage: python pipeline/check-specs.py <file.mp4> <platform | take:WxH:seconds>
"""
import json
import subprocess
import sys

import yaml

SPECS = yaml.safe_load(open("config/platform-specs.yaml", encoding="utf-8"))


def probe(path: str) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path],
        check=True, capture_output=True, text=True,
    ).stdout
    data = json.loads(out)
    video = next(s for s in data["streams"] if s["codec_type"] == "video")
    audio = [s for s in data["streams"] if s["codec_type"] == "audio"]
    num, den = video["r_frame_rate"].split("/")
    return {
        "codec": video["codec_name"],
        "size": f"{video['width']}x{video['height']}",
        "fps": round(int(num) / int(den), 3),
        "duration": float(data["format"]["duration"]),
        "audio": bool(audio),
        "audio_rate": int(audio[0]["sample_rate"]) if audio else None,
    }


def check(path: str, target: str) -> list[str]:
    p = probe(path)
    fails = []
    if target.startswith("take:"):  # generated take: compare with the shot row
        _, size, seconds = target.split(":")
        if p["size"] != size:
            fails.append(f"size {p['size']} != {size}")
        if abs(p["duration"] - float(seconds)) > 0.2:
            fails.append(f"duration {p['duration']:.2f}s != {seconds}s")
        if p["fps"] != SPECS["defaults"]["fps"]:
            fails.append(f"fps {p['fps']}")
        return fails
    spec = SPECS["platforms"][target]
    if p["size"] != spec["size"]:
        fails.append(f"size {p['size']} != {spec['size']}")
    if p["codec"] != SPECS["defaults"]["codec"]:
        fails.append(f"codec {p['codec']}")
    limit = spec.get("studio_max_duration_s") or spec.get("max_duration_s")
    if limit and p["duration"] > limit:
        fails.append(f"duration {p['duration']:.1f}s > {limit}s")
    if not p["audio"] or p["audio_rate"] != SPECS["defaults"]["audio"]["sample_rate"]:
        fails.append("audio missing or not 48 kHz")
    return fails


if __name__ == "__main__":
    file, target = sys.argv[1], sys.argv[2]
    problems = check(file, target)
    print(json.dumps({"step": "specs", "file": file, "target": target, "ok": not problems, "fails": problems}))
    sys.exit(1 if problems else 0)

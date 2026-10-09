#!/usr/bin/env bash
# Final audio mix on the Remotion render: VO + music ducked under VO (sidechain) + SFX,
# loudness-normalised to -14 LUFS integrated / -1 dBTP (studio default for social platforms).
# The picture is copied untouched; only audio is re-encoded.
#
# Usage: pipeline/assemble.sh <picture.mp4> <vo.wav> <music.wav> <sfx.wav> <out.mp4>
set -euo pipefail

picture=$1 vo=$2 music=$3 sfx=$4 out=$5
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# 1) Duck the music under the voice: the VO drives a sidechain compressor on the music bed.
#    asplit keeps one copy of the VO for the final mix and one as the sidechain key.
ffmpeg -hide_banner -y -i "$vo" -i "$music" -i "$sfx" -filter_complex "
  [0:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[vo][key];
  [1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.6[bed];
  [bed][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[ducked];
  [2:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.8[fx];
  [vo][ducked][fx]amix=inputs=3:duration=first:normalize=0[mix]
" -map "[mix]" -c:a pcm_s24le "$tmp/mix.wav"

# 2) Two-pass loudnorm: measure, then apply with the measured values (linear, no pumping).
stats=$(ffmpeg -hide_banner -i "$tmp/mix.wav" -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2>&1 \
  | sed -n '/^{/,/^}/p')
get() { echo "$stats" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }

ffmpeg -hide_banner -y -i "$tmp/mix.wav" -af "loudnorm=I=-14:TP=-1:LRA=11:\
measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):\
measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true" \
  -ar 48000 -c:a pcm_s24le "$tmp/norm.wav"

# 3) Mux: copy the H.264 picture, encode AAC 192k, move the index to the front for streaming.
ffmpeg -hide_banner -y -i "$picture" -i "$tmp/norm.wav" -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$out"

echo "{\"step\":\"mix\",\"out\":\"$out\",\"lufs_in\":$(get input_i)}"

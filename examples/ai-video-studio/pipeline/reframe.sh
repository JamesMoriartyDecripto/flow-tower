#!/usr/bin/env bash
# Reframes the mixed master into each platform's aspect ratio. Hero shots were generated
# natively in 9:16 and 16:9 (see the shot list), so this only crops centre-safe shots and the
# graphics; captions are burned for vertical/square cuts and shipped as SRT for long-form.
#
# Usage: pipeline/reframe.sh <master_16x9.mp4> <captions.srt> <out_dir> [x_offset 0..1]
set -euo pipefail

master=$1 srt=$2 outdir=$3 xoff=${4:-0.5}   # horizontal focus from the storyboard, 0.5 = centre
mkdir -p "$outdir"

style="FontName=Inter SemiBold,FontSize=13,PrimaryColour=&H00EAEFF2,BackColour=&H66403A2F,BorderStyle=4,MarginV=110"

# 9:16 1080x1920: crop a 9:16 window from the 16:9 frame at the focus point, then scale.
ffmpeg -hide_banner -y -i "$master" -vf "\
crop=w=ih*9/16:h=ih:x=(iw-ih*9/16)*$xoff:y=0,scale=1080:1920:flags=lanczos,setsar=1,\
subtitles=$srt:force_style='$style'" \
  -c:v libx264 -preset slow -crf 18 -profile:v high -pix_fmt yuv420p -r 24 \
  -c:a copy -movflags +faststart "$outdir/short-916.mp4"

# 1:1 1080x1080 paid cut: square crop, captions higher up (feed UI covers less).
ffmpeg -hide_banner -y -i "$master" -t 30 -vf "\
crop=w=ih:h=ih:x=(iw-ih)*$xoff:y=0,scale=1080:1080:flags=lanczos,setsar=1,\
subtitles=$srt:force_style='${style/MarginV=110/MarginV=70}'" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 24 \
  -c:a copy -movflags +faststart "$outdir/paid-11.mp4"

# 16:9 1920x1080 long-form: no burned captions (uploaded as a caption track).
ffmpeg -hide_banner -y -i "$master" -vf "scale=1920:1080:flags=lanczos,setsar=1" \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -r 24 \
  -c:a copy -movflags +faststart "$outdir/long-169.mp4"
cp "$srt" "$outdir/long-169.srt"

for f in "$outdir"/*.mp4; do
  echo "{\"step\":\"reframe\",\"file\":\"$f\",\"bytes\":$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f")}"
done

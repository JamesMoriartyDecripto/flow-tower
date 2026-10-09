#!/usr/bin/env bash
# Signs C2PA Content Credentials into every exported cut and checks the result. Platforms read
# C2PA to auto-label AI content (YouTube, TikTok); EU AI Act Art. 50(2) asks providers for
# machine-readable marking, and the Commission's Code of Practice recommends layering metadata
# with watermarks (Veo, Lyria and Gemini images already carry SynthID).
#
# Usage: pipeline/sign-c2pa.sh <dir with *.mp4> <manifest.json> <master.mp4>
set -euo pipefail

dir=$1 manifest=$2 master=$3
signed="$dir/signed"
mkdir -p "$signed"

for f in "$dir"/*.mp4; do
  name=$(basename "$f")
  # -p records the unreframed master as the parent ingredient; -f overwrites a previous signing.
  c2patool "$f" -m "$manifest" -p "$master" -f -o "$signed/$name"
  # --info prints manifest count and the validation result; fail the step if it is not valid.
  info=$(c2patool "$signed/$name" --info)
  echo "$info" | grep -qi "validated" || { echo "C2PA validation failed for $name" >&2; echo "$info" >&2; exit 1; }
  echo "{\"step\":\"c2pa\",\"file\":\"$signed/$name\",\"source_type\":\"compositeWithTrainedAlgorithmicMedia\"}"
done

# Disclosure flags for the publish step, set here so packaging cannot drop them.
cat > "$signed/disclosure.json" <<JSON
{
  "youtube": { "status.containsSyntheticMedia": true },
  "tiktok": { "post_info.is_aigc": true },
  "instagram": { "ai_info_label": "required: photorealistic video and realistic voice" },
  "end_card_line": true
}
JSON

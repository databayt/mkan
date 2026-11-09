#!/usr/bin/env bash
# LaMa (Apache-2.0, advimman/lama) as a Core ML model for the v2 TikTok render's fill step
# (scripts/crm/video/Lama.swift): what no other frame of the video shows behind a broker's caption
# is painted in by LaMa, on this Mac, capped to small areas (Abdout, 2026-11-09). One download,
# checked against the published SHA-256, compiled once to .mlmodelc; nothing is committed.
#
#   bash scripts/crm/install-lama.sh        # → scripts/crm/.data/models/LaMa.mlmodelc
set -euo pipefail
cd "$(dirname "$0")"
MODELS=.data/models
PKG=$MODELS/LaMa.mlpackage
OUT=$MODELS/LaMa.mlmodelc
BASE=https://huggingface.co/mlboydaisuke/LaMa-CoreML/resolve/main/LaMa.mlpackage
WEIGHT_SHA=d0541f6044a94cd4982bfdac074fc1ccfe11d8f1f590c299d6b5071b501fc184

if [ -d "$OUT" ] && [ -f "$OUT/.verified" ]; then echo "✓ $OUT already installed"; exit 0; fi
mkdir -p "$PKG/Data/com.apple.CoreML/weights"
for f in Manifest.json Data/com.apple.CoreML/model.mlmodel Data/com.apple.CoreML/weights/weight.bin; do
  if [ ! -s "$PKG/$f" ]; then
    curl -fsSL --retry 3 -o "$PKG/$f.part" "$BASE/$f"
    mv "$PKG/$f.part" "$PKG/$f"
  fi
done
got=$(shasum -a 256 "$PKG/Data/com.apple.CoreML/weights/weight.bin" | cut -d' ' -f1)
if [ "$got" != "$WEIGHT_SHA" ]; then
  echo "❌ LaMa weights checksum mismatch ($got) — removed, nothing installed" >&2
  rm -rf "$PKG"
  exit 1
fi
rm -rf "$OUT"
xcrun coremlcompiler compile "$PKG" "$MODELS" >/dev/null
touch "$OUT/.verified"
rm -rf "$PKG"
echo "✓ LaMa compiled → $OUT ($(du -sh "$OUT" | cut -f1))"

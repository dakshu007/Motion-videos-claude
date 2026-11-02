#!/usr/bin/env bash
# Render scripts one after another into out/final/, skipping finished ones.
# Safe to re-run after an interruption: renders resume from saved frames.
#   tools/queue.sh --blender claude-roasts-sleep claude-roasts-coffee ...
cd "$(dirname "$0")/.."
opts=()
while [[ "$1" == --* ]]; do opts+=("$1"); shift; done
mkdir -p out/final
for f in "$@"; do
  if [ -s "out/final/$f.mp4" ]; then echo "DONE $f (already)"; continue; fi
  if node render.mjs "scripts/$f.json" "out/final/$f.mp4" "${opts[@]}" >> "out/render-$f.log" 2>&1; then echo "DONE $f"; else echo "FAIL $f"; fi
done

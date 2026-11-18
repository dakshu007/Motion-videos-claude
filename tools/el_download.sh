#!/bin/bash
# Download ElevenLabs takes. usage: tools/el_download.sh <script-name> < list
# list lines: NN_speaker session generation signature expires
d=audio/$1/raw; mkdir -p $d
B="https://elevenlabsusercontent.com/database/workspace/d90118a0c3a6407b9562fbede9d4eb32/content_generation"
while read n s g sig ex; do [ -z "$n" ] && continue
  curl -sSf -o $d/$n.mp3 "$B/$s/$g/content.mp3?Expires=$ex&KeyName=assets-cdn-key-1&Signature=$sig" || echo "FAIL $n"
done; ls $d | wc -l

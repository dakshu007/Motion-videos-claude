"""Record ElevenLabs session ids per voice line: el_sessions.py <script-name> LINE:SESSION_A:SESSION_B ..."""
import json, sys
name = sys.argv[1]; p = f'audio/{name}/sessions.json'; s = json.load(open(p))
for arg in sys.argv[2:]:
    line, a, b = arg.split(':'); s['lines'][line] = [a, b]
json.dump(s, open(p, 'w'), indent=1); print(name, sorted(s['lines'], key=int))

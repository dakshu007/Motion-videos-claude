"""Turn 'session generation signature' rows (stdin, in line order) into el_download.sh input: el_list.py <script-name> <expires>"""
import json, sys
sp = [b['speaker'] for b in json.load(open(f'scripts/{sys.argv[1]}.json'))['beats']]
rows = [r for r in sys.stdin.read().split('\n') if r.strip()]
assert len(rows) == len(sp), (len(rows), len(sp))
for i, (r, s) in enumerate(zip(rows, sp)): print(f'{i+1:02d}_{s}', r, sys.argv[2])

# Motion Videos: notes for Claude

This repo renders 3D animated vertical skits from JSON scripts (see README.md).

When asked to make a new video or skit about something:
1. Write `scripts/<kebab-title>.json`. Use only names from `src/vocab.js` (sets, character types,
   hair/outfits/accessories, expressions, actions, shots, moves, times, screen modes). Look at the
   existing scripts in `scripts/` for tone and structure: short punchy lines, a setup, an escalation,
   a twist, a button joke, about 10–14 beats for 30 s. Vary shots and give listeners reactions.
2. Check it with `node render.mjs scripts/<name>.json --storyboard --draft` (validates, then writes
   `out/<name>_storyboard.png`, one frame per beat). Look at the storyboard and fix anything off.
3. Render with `node render.mjs scripts/<name>.json` (about 1.3 s per frame on CPU; add `--draft` for
   a quick half-res version).

The validator (`src/validate.js`) runs before every render and lists any unknown values.
Rendered output goes to `out/` (git-ignored).

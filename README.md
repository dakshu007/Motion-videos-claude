# Motion Videos

Script-driven 3D animated skits in the style of the vertical "person + AI buddy" shorts.
You write the dialogue as JSON (or ask Claude to write it from a one-line idea). The renderer
turns it into a 9:16 MP4 with clay-style characters, a lit 3D set, camera cuts, whip pans,
depth of field, lip-synced mouths and pill captions.

Every video can be a different concept. You pick:

- **a set:** office, café, kitchen, gamer bedroom, park, podcast studio
- **a cast:** 1–2 humans (hair style, colors, outfit, accessories) and 0–2 mascots (cube, cat, robot, blob, mug)
- **a story:** beats with expressions, actions, shots, time-of-day jumps, and what's on the screen

```
idea ──(tools/idea.mjs + Claude)──► script.json ──► voices (babble / ElevenLabs / your files)
                                          └──► headless Chromium + Three.js renders every frame ──► ffmpeg ──► out/*.mp4
```

## Quick start

Requires Node 18+ and `ffmpeg` on your PATH.

```bash
npm install
npx playwright install chromium        # once, if you don't already have it

npm run preview                        # opens a scrubbable preview (pass a script path to preview another)
node render.mjs scripts/cafe-latte-art.json --storyboard   # one frame per beat → out/cafe-latte-art_storyboard.png
node render.mjs scripts/cafe-latte-art.json                # full video → out/cafe-latte-art.mp4
node render.mjs scripts/cafe-latte-art.json --draft        # half-res, ~4x faster
node render.mjs scripts/cafe-latte-art.json --gpu          # use your GPU (much faster on a desktop)
node render.mjs scripts/cafe-latte-art.json out/clip.mp4 --from 4 --to 9
```

On a CPU-only server (SwiftShader), a full-quality frame takes about 1.3 s, so a 30 s video takes about
20 min. `--draft` takes about 5 min, and `--storyboard` takes about 1 min. With `--gpu` on a desktop
it's a few minutes.

## Example concepts (in `scripts/`)

| Script | Set | Cast | Premise |
|---|---|---|---|
| `office-launch.json` | office | human + cube | The cube makes the launch video overnight |
| `cafe-latte-art.json` | cafe | barista + cat | A cat critic judges latte art |
| `kitchen-robot-chef.json` | kitchen | chef + robot | The robot "optimizes" breakfast into a sad egg |
| `bedroom-one-more-game.json` | bedroom | gamer + blob | "One more game" until sunrise |
| `park-touch-grass.json` | park | 2 humans + cube | A friend forces a dev to touch grass |
| `studio-podcast.json` | studio | 2 hosts + robot | The robot producer wrote the whole podcast |

## New concepts from a one-line idea

```bash
ANTHROPIC_API_KEY=... node tools/idea.mjs "a gym bro whose protein-shake mug is his life coach"
node tools/idea.mjs "a plant mom and her dramatic cat" --set cafe --seconds 25
node tools/idea.mjs "..." --prompt-only     # print the prompt to paste into claude.ai instead
```

`tools/idea.mjs` sends Claude the full vocabulary (every set, character, expression, action,
shot and screen mode) plus an example script, then checks the reply with the same validator
the renderer uses. Any problems go back to Claude to fix, up to two rounds. The result is
written to `scripts/<title>.json`; check it with `--storyboard`, then render it.

You can also just ask Claude Code in this repo: *"write a skit about X"*.

## Script format

```jsonc
{
  "title": "Latte art critic",
  "set": "cafe",                         // office | cafe | kitchen | bedroom | park | studio
  "time": "day",                         // dawn | day | sunset | dusk | night
  "setOptions": { "sign": "coffee" },    // neon sign text (optional)
  "cast": {
    "jess":  { "type": "human", "hair": "bun", "hairColor": "#3b2a20", "outfit": "apron", "top": "#f3ebdd",
               "voice": { "type": "babble", "pitch": 290 } },
    "mochi": { "type": "cat", "voice": { "type": "babble", "pitch": 380 } }
  },
  "beats": [
    { "speaker": "jess", "text": "Behold. A heart.", "expr": "happy", "action": "drink", "shot": "tight" },
    { "speaker": "mochi", "text": "That's a potato.", "expr": "annoyed", "move": "crash",
      "jess": { "expr": "shocked" } },                       // a listener's reaction
    { "text": "", "duration": 2.4, "shot": "wide", "transition": "whip", "time": "sunset", "title": "2 hours later" }
  ]
}
```

**Cast.** Each character is placed in a slot of the set. Humans take `main` (behind the desk or
counter) and then `side`. Mascots sit on the surface in `desk` and then `desk2`. Set `"slot"` to override.

| type | options |
|---|---|
| `human` | `hair` (long, bob, short, bun, ponytail), `hairColor`, `skin`, `top`, `outfit` (sweater, hoodie, tee, apron, blazer), `apron`, `pants`, `eyeColor`, `lashes`, `accessories` (glasses, headphones, chefHat, cap, bow), `accent` |
| `cube`, `cat`, `robot`, `blob`, `mug` | `color`, `accent`, `size` |

**Beats.** Each beat is one line or shot:

| field | meaning |
|---|---|
| `speaker`, `text` | who talks (mouth animates) and the caption |
| `expr` / `action` / `look` | the speaker's expression, action and gaze; `"<castId>": {expr, action, look}` sets anyone else's. States carry over to later beats |
| `shot` | `close` (default), `tight`, `medium`, `pov`, `two`, `wide`, `wide2`, `screen`, `overShoulder`. Subject is the speaker, or `"on": "<id>"` / `"close:<id>"`; `"with": "<id>"` for the two-shot partner |
| `move` | `push` (default), `pull`, `drift`, `crash`, `orbit`, `static` |
| `transition` | `whip` = motion-blurred whip pan into this beat (default is a hard cut) |
| `time` | change time of day (add `timeFade: 2` to fade instead of cut) |
| `screen` | laptop/monitor/tablet content: `code`, `terminal`, `render`, `done`, `stat`, `chat`, `recipe`, `live`, `game`, `blank` (see `src/vocab.js` for fields) |
| `title` | big overlay text such as "3 hours later" |
| `duration` / `pad` | override the length (otherwise taken from the voice audio or word count) |
| `audio` | voice file for this line |

- **Expressions:** neutral happy joy worried sad smug skeptical annoyed angry shocked sleepy determined love crying
- **Human actions:** idle typing phone cheeks shrug point celebrate facepalm think wave sleep lookDown lean armsCrossed gesture cook drink dance handsHips
- **Mascot actions:** idle hop bounce wiggle lean nod shake spin proud sleep type dance tilt
- **Look targets:** camera, screen, surface, phone, down, or any cast id

`render.mjs` validates the script before rendering and names every unknown value. The full
vocabulary lives in `src/vocab.js`.

The camera picks its angle for character shots by casting rays. It avoids angles where props,
arms or other characters would block the face, so the same script works across all the sets.

## Voices

- **babble**: offline gibberish speech generated from the text (Animal-Crossing style). It's free, and the mouths sync to it.
- **ElevenLabs**: give each character `"voice": { "elevenlabs": "<voice_id>" }`, then
  `ELEVENLABS_API_KEY=... npm run tts -- scripts/x.json` writes `scripts/x.voiced.json` to render.
- **Your own recordings**: set `"audio": "audio/line3.mp3"` on any beat.

Optional background music: `"music": "audio/lofi.mp3", "musicVolume": 0.2`.

## Project layout

```
render.mjs                CLI: validate → audio → headless capture → ffmpeg (also --storyboard, --stills)
server.mjs                static server for preview + capture
src/engine.js             timeline, cast, camera shots (occlusion-aware), transitions, post FX, captions
src/vocab.js              everything a script can name (shared by engine, validator, idea tool)
src/validate.js           script normalization + validation
src/characters/human.js   clay human: hair styles, outfits, accessories, IK arms, sit/stand
src/characters/mascot.js  cube, cat, robot, blob, mug
src/characters/faces.js   expressions + face painters
src/sets/common.js        sky, time-of-day presets, screens, room/prop/light helpers
src/sets/*.js             office, cafe, kitchen, bedroom, park, studio
tools/idea.mjs            idea → script with Claude
tools/babble.mjs          gibberish voice synth
tools/tts-elevenlabs.mjs  real voices
```

## Extending

- **New set:** copy `src/sets/cafe.js`, build the room with the `BaseSet` helpers, define `slots`
  and `wides`, then register it in `src/sets/index.js` and `src/vocab.js`.
- **New mascot:** add a `build_<kind>()` method in `src/characters/mascot.js`, plus a face style in `faces.js`.
- **New hair style, outfit or accessory:** add it in `src/characters/human.js` and list it in `src/vocab.js`.
- **New expression or action:** `EXPRESSIONS` in `faces.js`; `Human.pose()` or `Mascot.actionOffsets()`.

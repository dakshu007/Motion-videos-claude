# Motion Videos

Script-driven 3D animated skits in the style of those vertical "girl + AI buddy at her desk" shorts.
You write the dialogue as JSON. The renderer turns it into a 9:16 MP4 with two characters,
a cozy desk set with a window, dusk/night/sunset lighting, camera cuts and whip pans,
depth of field, lip-synced mouths and pill captions.

Everything is code (Three.js), so the same script always renders the same video. You can
generate scripts with Claude, edit a line, and re-render.

```
script.json ──► voices (babble / ElevenLabs / your own files)
            └─► headless Chromium + Three.js renders every frame ──► ffmpeg ──► out/*.mp4
```

## Quick start

Requires Node 18+ and `ffmpeg` on your PATH.

```bash
npm install
npx playwright install chromium   # once, if you don't already have it

npm run preview                   # open the printed URL to scrub/play the example in a browser
npm run render -- scripts/example.json            # -> out/example.mp4
npm run draft  -- scripts/example.json            # half-res, ~4x faster for iterating
node render.mjs scripts/example.json --stills 1,5.5,12   # just a few PNG frames
node render.mjs scripts/example.json out/clip.mp4 --from 4 --to 9
node render.mjs scripts/example.json --gpu        # use your GPU (much faster on a desktop)
```

On a CPU-only server (SwiftShader), a full-quality frame takes about 1.3 s, so a 30 s video takes
about 20 min. `--draft` takes about 5 min. On a desktop GPU with `--gpu` it's a few minutes.

## Writing a script

```jsonc
{
  "title": "My skit",
  "fps": 30, "width": 720, "height": 1280,
  "time": "dusk",                          // starting time of day
  "characters": {
    "girl": { "voice": { "type": "babble", "pitch": 300 } },
    "cube": { "voice": { "type": "babble", "pitch": 170, "wave": "square" } }
  },
  "music": "audio/lofi.mp3",               // optional background track
  "musicVolume": 0.2,
  "beats": [
    { "speaker": "girl", "text": "Build me a website.", "expr": "neutral", "action": "typing" },
    { "speaker": "cube", "text": "Done. No bugs.", "expr": "smug", "action": "proud" },
    { "text": "", "duration": 2.5, "shot": "wide", "time": "night", "transition": "whip",
      "girl": { "action": "sleep" }, "cube": { "action": "type" }, "title": "3 hours later" }
  ]
}
```

Each **beat** is one shot or line. Its fields:

| field | meaning |
|---|---|
| `speaker` | `"girl"` or `"cube"`; their mouth animates and the caption shows `text` |
| `text` | the line (also the caption). Empty for a silent beat |
| `expr` / `action` / `look` | the speaker's expression, body action and gaze |
| `girl` / `cube` | `{ expr, action, look }` for either character (use it for the listener's reaction) |
| `shot` | camera: `girl`, `girlClose`, `girlMedium`, `cube`, `cubeClose`, `two`, `screen`, `overShoulder`, `wide`, `wideFront` |
| `move` | `push` (default), `pull`, `drift`, `crash` (snap zoom), `static` |
| `transition` | `whip` = motion-blurred whip pan into this beat (default is a hard cut) |
| `time` | `dusk`, `night`, `sunset`, `day` (add `timeFade: 2` to fade instead of cut) |
| `screen` | laptop screen: `{mode:"code"}`, `{mode:"terminal", lines:[...]}`, `{mode:"render"}`, `{mode:"done", title}`, `{mode:"stat", label, value}`, `{mode:"blank"}` |
| `title` | big overlay text such as "3 hours later" |
| `duration` / `pad` | override the length (otherwise taken from the voice audio or word count) |
| `audio` | path to a voice file for this line (overrides babble) |

Expressions, actions and gaze carry over to later beats until you change them.

- **Expressions:** `neutral happy joy worried sad smug skeptical annoyed shocked sleepy determined`
- **Girl actions:** `idle typing phone cheeks shrug point celebrate facepalm think wave sleep lookDown lean`
- **Cube actions:** `idle hop bounce wiggle lean nod shake spin proud sleep type`
- **Look targets:** `camera cube girl screen keyboard phone down`

Tip: ask Claude to *"write a 30-second skit script for this repo's format about X"*, paste in
the table above, and render the result.

## Voices

- **babble** (default in the example): Animal-Crossing-style gibberish generated offline
  from the text. It's free, and the lip-sync follows it.
- **ElevenLabs**: give each character `"voice": { "elevenlabs": "<voice_id>" }`, then:
  ```bash
  ELEVENLABS_API_KEY=... npm run tts -- scripts/example.json   # writes scripts/example.voiced.json
  npm run render -- scripts/example.voiced.json
  ```
- **Your own recordings**: set `"audio": "audio/line3.mp3"` on any beat.

The mouth movement comes from each audio file's loudness envelope, and the beat timing
stretches to fit the audio.

## Project layout

```
render.mjs            CLI: audio prep -> headless capture -> ffmpeg encode + mix
server.mjs            static server (preview + capture)
src/engine.js         timeline, camera shots, transitions, post FX, captions
src/characters.js     the girl (IK arms, hair locks, painted face) and the cube buddy
src/set.js            room, desk, laptop screen, skyline, time-of-day lighting
src/util.js           noise, IK, textures, clay material
tools/babble.mjs      gibberish voice synth
tools/tts-elevenlabs.mjs
scripts/example.json  a full 30 s example skit
```

## Making it your own

- Colors: `characters.girl.hair`, `characters.girl.sweater` and `characters.cube.color` in the script.
- New expressions: add an entry to `EXPRESSIONS` in `src/characters.js`.
- New actions: add a `case` in `Girl.pose()` or `Cube.actionOffsets()`.
- New shots: add a `case` in `Engine.shot()`.
- New lighting moods: add a preset to `TIMES` in `src/set.js`.

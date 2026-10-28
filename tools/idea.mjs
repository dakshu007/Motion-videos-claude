#!/usr/bin/env node
// Turn a one-line idea into a ready-to-render skit script using Claude.
//
//   ANTHROPIC_API_KEY=... node tools/idea.mjs "a barista whose cat judges her latte art"
//   node tools/idea.mjs "gym bro and a protein-shake mug" --set kitchen --seconds 25
//   node tools/idea.mjs "..." --prompt-only      (print the prompt to paste into claude.ai)
//
// The reply is checked with the same validator the renderer uses; if anything
// is off, the errors go back to Claude for a fix (up to two rounds).
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import * as vocab from '../src/vocab.js';
import { validateScript } from '../src/validate.js';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const VALUE_FLAGS = ['--set', '--seconds', '--out', '--example'];
const idea = args.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(args[i - 1])).join(' ').trim();
if (!idea) {
  console.error('usage: node tools/idea.mjs "<your idea>" [--set cafe] [--seconds 30] [--out scripts/name.json] [--prompt-only]');
  process.exit(1);
}
const seconds = Number(flag('seconds') || 30);
const exampleFile = flag('example') || 'scripts/cafe-latte-art.json';

const list = (o) => (Array.isArray(o) ? o.join(', ') : Object.entries(o).map(([k, v]) => `- ${k}: ${v}`).join('\n'));
const system = `You write scripts for short vertical (9:16) 3D-animated comedy skits, rendered by a code engine.
The style: a cozy stylized scene, two or three characters, punchy dialogue with a setup, an escalation, a twist and a final button joke. Lines are short (under ~10 words) and sound like real speech. Every beat is one shot.

Output ONLY a JSON object (no prose, no code fences) with this shape:
{
  "title": string,
  "set": one of the sets,
  "time": starting time of day,
  "setOptions": { "sign": "short neon sign text" }   // optional
  "cast": { "<id>": { "type": ..., "name": "Display name", ...appearance, "voice": { "type": "kokoro", "voice": "af_heart" } } },
  "beats": [ { "speaker": "<id>", "text": "...", "expr": ..., "action": ..., "shot": ..., ...optional fields } ]
}

SETS:
${list(vocab.SETS)}

CAST: 1-2 humans and 0-2 mascots. Cast ids are short lowercase names. Slots are assigned automatically (humans: main then side; mascots: desk then desk2) or set "slot".
Character types:
${list(vocab.CHARACTER_TYPES)}
Human options: hair (${vocab.HAIR.join(', ')}), hairColor, skin (any skin tone hex), top (hex), outfit (${vocab.OUTFITS.join(', ')}), apron (hex), pants (hex), eyeColor, lashes (true/false), accessories (${vocab.ACCESSORIES.join(', ')}), accent (hex for headphones/cap).
Mascot options: color (hex), accent (hex), size (0.8-1.3).
Voice (free neural TTS): { "type": "kokoro", "voice": one of ${vocab.KOKORO_VOICES.join(', ')}, "speed": 0.9-1.15, "shift": pitch multiplier }.
Voice ids: a=American, b=British, f=female, m=male; best: af_heart, af_bella, af_nicole, bf_emma, am_michael, am_fenrir, am_puck, bm_george, bm_fable.
Give every character a different voice. Mascots sound great with a higher "shift" (1.15-1.35); robots can use am_echo or am_onyx with shift 1.1.

BEAT FIELDS:
- speaker: cast id (their mouth moves, the caption shows "text"). Omit speaker and text for a silent establishing beat (then give "duration" seconds).
- expr / action / look: for the speaker. Use "<castId>": { "expr", "action", "look" } inside a beat to set a listener's reaction. States carry over to later beats until changed.
- expressions: ${vocab.EXPRESSION_NAMES.join(', ')}
- human actions:
${list(vocab.HUMAN_ACTIONS)}
- mascot actions:
${list(vocab.MASCOT_ACTIONS)}
- look: ${vocab.LOOK_TARGETS.join(', ')}
- shot (default "close" on the speaker; "close:<id>" or "on": "<id>" picks the subject; "with": "<id>" picks the partner in a two-shot):
${list(vocab.SHOTS)}
- move: ${vocab.MOVES.join(', ')} (crash = comedic snap zoom; use sparingly)
- transition: "whip" (whip-pan into this beat; great for time jumps)
- time: ${vocab.TIME_NAMES.join(', ')} (change it with a whip transition for "hours later" jumps)
- title: big overlay text like "3 hours later"
- screen: the laptop/monitor/tablet content. Modes:
${list(vocab.SCREEN_MODES)}
- pad: extra seconds after the line (use ~0.9 on the last beat)

Guidelines: ${Math.max(8, Math.round(seconds / 2.3))}-${Math.round(seconds / 1.7)} beats for ~${seconds} seconds. Vary shots (close, tight, two, wide, screen). Give listeners reactions. Match actions to the set (cook in the kitchen, typing at a desk, drink in a cafe). Keep it wholesome and funny.`;

const example = fs.existsSync(exampleFile) ? fs.readFileSync(exampleFile, 'utf8') : null;
const user = `${example ? `Here is an example script in the right format:\n${example}\n\n` : ''}Write a new ~${seconds}-second skit.${flag('set') ? ` Use the "${flag('set')}" set.` : ' Pick the set that fits best.'}\nIdea: ${idea}`;

if (args.includes('--prompt-only')) {
  console.log(`=== SYSTEM ===\n${system}\n\n=== USER ===\n${user}`);
  process.exit(0);
}

function parseJson(text) {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  return JSON.parse(t.slice(start, end + 1));
}

const client = new Anthropic();
const messages = [{ role: 'user', content: user }];
let script = null;
for (let round = 0; round < 3; round++) {
  let response;
  try {
    response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system,
      messages,
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) console.error('Authentication failed: set ANTHROPIC_API_KEY (or run `ant auth login`).');
    else if (error instanceof Anthropic.RateLimitError) console.error('Rate limited; try again in a moment.');
    else if (error instanceof Anthropic.APIError) console.error(`API error ${error.status}: ${error.message}`);
    else console.error(error.message);
    process.exit(1);
  }
  if (response.stop_reason === 'refusal') {
    console.error(`Claude declined this idea${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : ''}.`);
    process.exit(1);
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  messages.push({ role: 'assistant', content: response.content });
  let problems;
  try {
    script = parseJson(text);
    problems = validateScript(script).errors;
  } catch (e) {
    problems = [`The reply was not valid JSON (${e.message}).`];
  }
  if (!problems.length) break;
  console.warn(`Round ${round + 1}: fixing ${problems.length} problem(s)...`);
  messages.push({ role: 'user', content: `That script has problems:\n- ${problems.join('\n- ')}\nReply with the corrected full JSON only.` });
  script = null;
}
if (!script) { console.error('Could not get a valid script. Try rephrasing the idea.'); process.exit(1); }

const slug = (script.title || idea).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'skit';
const out = flag('out') || path.join('scripts', `${slug}.json`);
fs.writeFileSync(out, JSON.stringify(script, null, 2) + '\n');
console.log(`Wrote ${out}  (${script.beats.length} beats, set: ${script.set})
Preview:    node render.mjs ${out} --storyboard
Render:     node render.mjs ${out}`);

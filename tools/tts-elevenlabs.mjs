#!/usr/bin/env node
// Generate real voice lines with ElevenLabs and write a "voiced" copy of the
// script whose beats point at the audio files. Lip-sync then follows the
// actual speech.
//
//   ELEVENLABS_API_KEY=... node tools/tts-elevenlabs.mjs scripts/example.json
//   node render.mjs scripts/example.voiced.json
//
// Set a voice per character in the script:
//   "characters": { "girl": { "voice": { "elevenlabs": "<voice_id>" } }, ... }
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const scriptPath = process.argv[2];
if (!scriptPath) { console.error('usage: node tools/tts-elevenlabs.mjs <script.json>'); process.exit(1); }
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('Set ELEVENLABS_API_KEY'); process.exit(1); }

const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
const name = path.basename(scriptPath, '.json');
const dir = path.join('audio', name);
fs.mkdirSync(dir, { recursive: true });
const model = script.ttsModel || 'eleven_multilingual_v2';

for (const [i, b] of script.beats.entries()) {
  if (!b.text || !b.speaker) continue;
  const voice = (script.cast || script.characters)?.[b.speaker]?.voice || {};
  const voiceId = voice.elevenlabs;
  if (!voiceId) { console.warn(`beat ${i}: no voice.elevenlabs for "${b.speaker}", skipping`); continue; }
  const text = b.tts || b.text; // optional "tts" field for pronunciation tweaks
  const hash = crypto.createHash('sha1').update(voiceId + model + text + JSON.stringify(voice.settings || {})).digest('hex').slice(0, 8);
  const file = path.join(dir, `${String(i).padStart(2, '0')}_${b.speaker}_${hash}.mp3`);
  if (!fs.existsSync(file)) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text, model_id: model,
        voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35, ...(voice.settings || {}) },
      }),
    });
    if (!res.ok) { console.error(`beat ${i}: ${res.status} ${await res.text()}`); process.exit(1); }
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log('wrote', file);
  }
  b.audio = file;
}

const out = scriptPath.replace(/\.json$/, '.voiced.json');
fs.writeFileSync(out, JSON.stringify(script, null, 2));
console.log(`\nVoiced script -> ${out}\nRender it with: node render.mjs ${out}`);

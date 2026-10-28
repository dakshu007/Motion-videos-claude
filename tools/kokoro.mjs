// Free, offline-capable neural voices with Kokoro-82M (Apache-2.0) via
// kokoro-js. The model (~90 MB) downloads from Hugging Face on first use and
// is cached; after that it runs fully locally. No API key, no cost.
//
//   node tools/kokoro.mjs --list
//   node tools/kokoro.mjs "Hello there!" --voice af_heart     (writes out/voice-samples/af_heart.wav)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeWav } from './babble.mjs';

export const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let ttsPromise = null;

async function load() {
  const { KokoroTTS } = await import('kokoro-js');
  return KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'cpu' });
}

// Returns { samples: Float32Array, sampleRate } for one line of dialogue.
export async function kokoroSpeak(text, { voice = 'af_heart', speed = 1 } = {}) {
  ttsPromise ??= load();
  const tts = await ttsPromise;
  const audio = await tts.generate(text, { voice, speed });
  return { samples: audio.audio, sampleRate: audio.sampling_rate };
}

export async function kokoroToWav(file, text, opts) {
  const { samples, sampleRate } = await kokoroSpeak(text, opts);
  writeWav(file, samples, sampleRate);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
  if (args.includes('--list')) {
    const { KokoroTTS } = await import('kokoro-js');
    console.table(KokoroTTS.prototype.voices ?? Object.getOwnPropertyDescriptor(KokoroTTS.prototype, 'voices').get.call({}));
    process.exit(0);
  }
  const text = args.filter((a, i) => !a.startsWith('--') && !['--voice', '--speed'].includes(args[i - 1])).join(' ') || 'Hi! This is a free Kokoro voice.';
  const voice = flag('voice') || 'af_heart';
  fs.mkdirSync('out/voice-samples', { recursive: true });
  const file = path.join('out/voice-samples', `${voice}.wav`);
  await kokoroToWav(file, text, { voice, speed: Number(flag('speed') || 1) });
  console.log('wrote', file);
}

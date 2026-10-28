// "Babble" voices: Animal-Crossing-style gibberish speech synthesized from
// the caption text. Free, offline, and gives the lip-sync something real to
// follow. Swap in real voices with tools/tts-elevenlabs.mjs.
import fs from 'node:fs';

const SR = 22050;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Rough vowel formant weights for harmonics 1..8
const VOWELS = [
  [1, 0.9, 0.5, 0.25, 0.15, 0.1, 0.06, 0.04], // "ah"
  [1, 0.4, 0.2, 0.35, 0.3, 0.12, 0.05, 0.03], // "eh"
  [1, 0.25, 0.1, 0.05, 0.2, 0.25, 0.15, 0.05], // "ee"
  [1, 0.7, 0.2, 0.08, 0.04, 0.02, 0.01, 0.01], // "oo"
];

export function babble(text, { pitch = 260, speed = 1, seed = 1, wave = 'soft' } = {}) {
  const rand = rng(seed * 9301 + text.length * 49297);
  const samples = [];
  const push = (n, f) => { for (let i = 0; i < n; i++) samples.push(f(i, n)); };
  const words = text.split(/\s+/).filter(Boolean);
  const question = /\?\s*$/.test(text);
  words.forEach((word, wi) => {
    const letters = word.replace(/[^a-zA-Z0-9']/g, '');
    const syl = Math.max(1, Math.round(letters.length / 2.6));
    for (let s = 0; s < syl; s++) {
      const dur = (0.075 + rand() * 0.05) / speed;
      const n = Math.floor(dur * SR);
      const last = wi === words.length - 1 && s === syl - 1;
      let f0 = pitch * (0.88 + rand() * 0.28);
      const glide = question && last ? 1.35 : last ? 0.85 : 1 + (rand() - 0.5) * 0.1;
      const v = VOWELS[Math.floor(rand() * VOWELS.length)];
      let phase = 0;
      push(n, (i) => {
        const k = i / n;
        const f = f0 * (1 + (glide - 1) * k);
        phase += (2 * Math.PI * f) / SR;
        let y = 0;
        for (let h = 0; h < v.length; h++) {
          const w = wave === 'square' ? (h % 2 === 0 ? v[h] : v[h] * 0.3) : v[h];
          y += Math.sin(phase * (h + 1)) * w;
        }
        const env = Math.min(1, i / (0.008 * SR)) * Math.min(1, (n - i) / (0.025 * SR));
        return y * env * 0.32;
      });
      push(Math.floor((0.012 + rand() * 0.015) * SR), () => 0);
    }
    const pause = /[.,!?;:…]$/.test(word) ? 0.16 : 0.035;
    push(Math.floor((pause / speed) * SR), () => 0);
  });
  let peak = 0;
  for (const x of samples) peak = Math.max(peak, Math.abs(x));
  const g = peak > 0 ? 0.7 / peak : 1;
  return Float32Array.from(samples, (x) => x * g);
}

export function writeWav(file, data, sr = SR) {
  const buf = Buffer.alloc(44 + data.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + data.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(data.length * 2, 40);
  for (let i = 0; i < data.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(data[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, buf);
}

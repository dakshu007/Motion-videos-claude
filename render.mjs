#!/usr/bin/env node
// Render a skit script to MP4.
//
//   node render.mjs scripts/example.json out/example.mp4
//   node render.mjs scripts/example.json --stills 1,5.5,12      (PNG frames for a quick look)
//   node render.mjs scripts/example.json out/test.mp4 --from 4 --to 9
//   node render.mjs scripts/example.json --draft      (half-res, no MSAA: ~4x faster)
//   node render.mjs scripts/example.json --gpu        (use the machine's GPU)
//
// Pipeline: script JSON -> per-line voice audio (your files, or generated
// babble) -> headless Chromium renders each frame with Three.js -> ffmpeg
// encodes H.264 and mixes the dialogue (+ optional music) on the timeline.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { startServer } from './server.mjs';
import { babble, writeWav } from './tools/babble.mjs';

const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const VALUE_FLAGS = ['--stills', '--from', '--to'];
const positional = args.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(args[i - 1]));
const scriptPath = positional[0] || 'scripts/example.json';
const outPath = positional[1] || path.join('out', path.basename(scriptPath, '.json') + (args.includes('--draft') ? '.draft.mp4' : '.mp4'));
const stills = flag('stills');
const from = Number(flag('from', 0));
const to = flag('to') ? Number(flag('to')) : null;

const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
const fps = script.fps || 30;
const cacheDir = path.join('out', '.cache', path.basename(scriptPath, '.json'));
fs.mkdirSync(cacheDir, { recursive: true });

// ---- audio prep ------------------------------------------------------------
function probeDuration(file) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
}
function envelope(file) {
  const sr = 16000;
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const hop = Math.round(sr / fps);
  const env = [];
  for (let i = 0; i < pcm.length; i += hop) {
    let s = 0;
    const n = Math.min(hop, pcm.length - i);
    for (let j = 0; j < n; j++) s += pcm[i + j] * pcm[i + j];
    env.push(Math.sqrt(s / Math.max(1, n)));
  }
  const peak = Math.max(1e-6, ...env);
  return env.map((v) => Math.pow(v / peak, 0.7));
}

const audioInfo = {};
const audioFiles = {};
script.beats.forEach((b, i) => {
  if (!b.text || !b.speaker) return;
  let file = b.audio;
  if (!file) {
    const voice = script.characters?.[b.speaker]?.voice;
    if (!voice || voice.type !== 'babble') return;
    file = path.join(cacheDir, `babble_${i}.wav`);
    writeWav(file, babble(b.text, { pitch: voice.pitch, speed: voice.speed, wave: voice.wave, seed: i + 1 }));
  }
  if (!fs.existsSync(file)) { console.warn(`! missing audio for beat ${i}: ${file}`); return; }
  audioFiles[i] = file;
  audioInfo[i] = { duration: probeDuration(file), env: envelope(file) };
});

// ---- headless render -------------------------------------------------------
const server = await startServer(0);
const port = server.address().port;
// --gpu uses the machine's GPU (much faster); default is SwiftShader (CPU),
// which works everywhere including headless servers and CI.
const browser = await chromium.launch({
  args: args.includes('--gpu')
    ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=default']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
});
// --draft renders at half resolution without MSAA for quick iteration.
if (args.includes('--draft')) {
  script.width = Math.round((script.width || 720) / 2);
  script.height = Math.round((script.height || 1280) / 2);
  script.msaa = 0;
}
const W = script.width || 720, H = script.height || 1280;
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', (e) => { console.error('[page error]', e.message); process.exit(1); });
await page.goto(`http://127.0.0.1:${port}/src/index.html?capture=1`);
await page.waitForFunction(() => window.__ready === true);
const info = await page.evaluate(([s, a]) => window.__engine.load(s, a), [script, audioInfo]);
console.log(`Script: ${script.title || scriptPath} — ${info.duration.toFixed(2)}s, ${info.beats.length} beats`);

const grab = (t, type = 'image/jpeg') => page.evaluate(([t, type]) => {
  window.__engine.frame(t);
  return document.getElementById('out').toDataURL(type, 0.94);
}, [t, type]);

if (stills) {
  const dir = path.join('out', 'stills');
  fs.mkdirSync(dir, { recursive: true });
  for (const s of stills.split(',').map(Number)) {
    const url = await grab(s, 'image/png');
    const f = path.join(dir, `${path.basename(scriptPath, '.json')}_${s.toFixed(2)}.png`);
    fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', f);
  }
  await browser.close(); server.close();
  process.exit(0);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
const t0 = from, t1 = Math.min(to ?? info.duration, info.duration);
const nFrames = Math.round((t1 - t0) * fps);
const silent = path.join(cacheDir, 'video.mp4');
const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent],
{ stdio: ['pipe', 'inherit', 'inherit'] });
const started = Date.now();
for (let f = 0; f < nFrames; f++) {
  const url = await grab(t0 + f / fps);
  const ok = ff.stdin.write(Buffer.from(url.split(',')[1], 'base64'));
  if (!ok) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % fps === 0 || f === nFrames - 1) {
    const el = (Date.now() - started) / 1000;
    process.stdout.write(`\rframe ${f + 1}/${nFrames}  ${(el / (f + 1) * 1000).toFixed(0)} ms/frame  eta ${((nFrames - f - 1) * el / (f + 1)).toFixed(0)}s   `);
  }
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close(); server.close();
console.log();

// ---- audio mix + mux -------------------------------------------------------
const inputs = [], filters = [], labels = [];
let n = 0;
for (const [i, file] of Object.entries(audioFiles)) {
  const start = info.beats[i].start - t0;
  if (start + audioInfo[i].duration < 0 || start > t1 - t0) continue;
  inputs.push('-i', file);
  n++;
  const ms = Math.max(0, Math.round(start * 1000));
  const trim = start < 0 ? `atrim=start=${-start},asetpts=PTS-STARTPTS,` : '';
  filters.push(`[${n}:a]${trim}aformat=sample_rates=48000:channel_layouts=stereo,adelay=${ms}|${ms},volume=${script.voiceVolume ?? 1}[v${n}]`);
  labels.push(`[v${n}]`);
}
if (script.music && fs.existsSync(script.music)) {
  inputs.push('-i', script.music);
  n++;
  filters.push(`[${n}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=start=${t0},asetpts=PTS-STARTPTS,volume=${script.musicVolume ?? 0.25}[m]`);
  labels.push('[m]');
}
if (labels.length) {
  filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest,apad,atrim=0:${(t1 - t0).toFixed(3)}[aout]`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', silent, ...inputs, '-filter_complex', filters.join(';'),
    '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', outPath]);
} else {
  fs.copyFileSync(silent, outPath);
}
console.log(`Done -> ${outPath}  (${((Date.now() - started) / 1000).toFixed(0)}s)`);

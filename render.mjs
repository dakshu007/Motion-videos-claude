#!/usr/bin/env node
// Render a skit script to MP4.
//
//   node render.mjs scripts/office-launch.json out/office-launch.mp4
//   node render.mjs scripts/office-launch.json --stills 1,5.5,12      (PNG frames for a quick look)
//   node render.mjs scripts/office-launch.json --storyboard           (one frame per beat, tiled)
//   node render.mjs scripts/office-launch.json out/test.mp4 --from 4 --to 9
//   node render.mjs scripts/office-launch.json --draft      (half-res, no MSAA: ~4x faster)
//   node render.mjs scripts/office-launch.json --gpu        (use the machine's GPU)
//
//   node render.mjs scripts/office-launch.json --babble     (skip Kokoro voices, use babble)
//
// Pipeline: script JSON -> per-line voice audio (free Kokoro neural voices,
// your own files, or babble) -> headless Chromium renders each frame with Three.js -> ffmpeg
// encodes H.264 and mixes the dialogue (+ optional music) on the timeline.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { startServer } from './server.mjs';
import crypto from 'node:crypto';
import { babble, writeWav } from './tools/babble.mjs';
import { kokoroToWav } from './tools/kokoro.mjs';
import { validateScript } from './src/validate.js';

const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const VALUE_FLAGS = ['--stills', '--from', '--to'];
const positional = args.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(args[i - 1]));
const scriptPath = positional[0] || 'scripts/office-launch.json';
const outPath = positional[1] || path.join('out', path.basename(scriptPath, '.json') + (args.includes('--draft') ? '.draft.mp4' : '.mp4'));
const stills = flag('stills');
const from = Number(flag('from', 0));
const to = flag('to') ? Number(flag('to')) : null;

const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
const { errors, warnings, script: normalized } = validateScript(script);
for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  if (!args.includes('--force')) { console.error('Fix the script (or pass --force to render anyway).'); process.exit(1); }
}
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
const hash = (o) => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 10);
let kokoroDown = args.includes('--babble') ? 'skipped (--babble)' : null;
for (const [i, b] of script.beats.entries()) {
  if (!b.text || !b.speaker) continue;
  let file = b.audio;
  const voice = normalized.cast[b.speaker]?.voice;
  if (!file && voice?.type === 'kokoro' && !kokoroDown) {
    // Free neural voice (Kokoro). Cached per line, so re-renders are instant.
    file = path.join(cacheDir, `kokoro_${hash([voice, b.tts || b.text])}.wav`);
    if (!fs.existsSync(file)) {
      try {
        const raw = file.replace(/\.wav$/, '.raw.wav');
        await kokoroToWav(raw, b.tts || b.text, { voice: voice.voice || 'af_heart', speed: voice.speed || 1 });
        const k = voice.shift || 1; // pitch multiplier (e.g. 1.3 for a squeaky mascot), duration kept
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-af',
          `asetrate=24000*${k},aresample=24000,atempo=${(1 / k).toFixed(4)},silenceremove=start_periods=1:start_threshold=-50dB`, file]);
        fs.rmSync(raw);
        process.stdout.write(`voice ${i + 1}/${script.beats.length} (${voice.voice})\r`);
      } catch (e) {
        kokoroDown = e.cause?.code || e.message.split('\n')[0];
        file = null;
      }
    }
  }
  if (!file && voice && (voice.type === 'babble' || voice.type === 'kokoro')) {
    // Babble: offline gibberish; also the fallback when Kokoro can't load.
    const female = /^[ab]f_/.test(voice.voice || '');
    const pitch = voice.pitch || (voice.type === 'kokoro' ? (female ? 290 : 190) * (voice.shift || 1) : 260);
    file = path.join(cacheDir, `babble_${i}.wav`);
    writeWav(file, babble(b.text, { pitch, speed: voice.speed, wave: voice.wave, seed: i + 1 }));
  }
  if (!file) continue;
  if (!fs.existsSync(file)) { console.warn(`! missing audio for beat ${i}: ${file}`); continue; }
  audioFiles[i] = file;
  audioInfo[i] = { duration: probeDuration(file), env: envelope(file) };
}
if (kokoroDown && !args.includes('--babble')) {
  console.warn(`! Kokoro voices unavailable (${kokoroDown}); used babble instead.\n  Kokoro downloads its model from huggingface.co on first use, so that host must be reachable once.`);
}

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

// --storyboard: one frame from the middle of every beat, tiled into a single PNG.
if (args.includes('--storyboard')) {
  const dir = path.join(cacheDir, 'storyboard');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const [i, b] of info.beats.entries()) {
    const url = await grab(b.start + b.duration * 0.55, 'image/png');
    fs.writeFileSync(path.join(dir, `beat_${String(i).padStart(3, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
  await browser.close(); server.close();
  const cols = Math.min(6, info.beats.length), rows = Math.ceil(info.beats.length / cols);
  const sheet = path.join('out', `${path.basename(scriptPath, '.json')}_storyboard.png`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', path.join(dir, 'beat_%03d.png'),
    '-vf', `scale=270:-1,tile=${cols}x${rows}:padding=4:color=black`, '-frames:v', '1', sheet]);
  console.log('wrote', sheet);
  process.exit(0);
}

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

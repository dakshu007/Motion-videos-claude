#!/usr/bin/env node
// List every spoken line of one or more scripts, with the file name to save
// its recording as. Record or generate each line (any TTS tool), save it as
// audio/<script>/<file>, and render.mjs picks it up automatically.
//
//   node tools/lines.mjs                       (all scripts → voice-lines.md)
//   node tools/lines.mjs scripts/cafe-latte-art.json
import fs from 'node:fs';
import path from 'node:path';
import { normalizeScript } from '../src/validate.js';

export function lineFile(i, speaker) {
  return `${String(i + 1).padStart(2, '0')}_${speaker}`;
}

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync('scripts').filter((f) => f.endsWith('.json') && !f.includes('.voiced')).map((f) => path.join('scripts', f));

let md = '# Voice lines\n\nSave each line as `audio/<script>/<file>.wav` (or .mp3). The renderer uses these files automatically.\n';
for (const f of files) {
  const script = normalizeScript(JSON.parse(fs.readFileSync(f, 'utf8')));
  const name = path.basename(f, '.json');
  md += `\n## ${script.title || name}  (folder: audio/${name}/)\n\n`;
  const voices = Object.entries(script.cast).map(([id, c]) => `${id}${c.name ? ` (${c.name})` : ''}: ${c.type}${c.voice?.voice ? `, suggested voice ${c.voice.voice}` : ''}`);
  md += `Cast: ${voices.join('; ')}\n\n| file | character | line | mood |\n|---|---|---|---|\n`;
  script.beats.forEach((b, i) => {
    if (!b.text || !b.speaker) return;
    md += `| ${lineFile(i, b.speaker)} | ${b.speaker} | ${b.tts || b.text} | ${b.expr || ''} |\n`;
  });
}
fs.writeFileSync('voice-lines.md', md);
console.log(`wrote voice-lines.md (${files.length} script${files.length > 1 ? 's' : ''})`);

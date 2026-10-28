// Script normalization + validation. Runs in the browser (engine) and in
// Node (render.mjs, tools/idea.mjs), so it only depends on vocab.js.
import {
  SETS, SLOTS, CHARACTER_TYPES, HAIR, OUTFITS, ACCESSORIES, EXPRESSION_NAMES, HUMAN_ACTIONS,
  MASCOT_ACTIONS, SHOTS, SHOT_ALIASES, MOVES, TIME_NAMES, TRANSITIONS, SCREEN_MODES, BEAT_FIELDS,
} from './vocab.js';

const HUMAN_SLOTS = ['main', 'side'];
const MASCOT_SLOTS = ['desk', 'desk2'];

// Fill defaults: legacy `characters: {girl, cube}` -> `cast`, slots assigned.
export function normalizeScript(src) {
  const script = { ...src };
  script.set = SETS[script.set] ? script.set : 'office';
  let cast = script.cast;
  if (!cast) {
    const ch = script.characters || {};
    cast = { girl: { type: 'human', ...ch.girl }, cube: { type: 'cube', ...ch.cube } };
  }
  const out = {};
  const used = new Set(Object.values(cast).map((c) => c.slot).filter(Boolean));
  for (const [id, spec] of Object.entries(cast)) {
    const s = { type: 'human', ...spec };
    if (!s.slot) {
      const prefer = s.type === 'human' ? HUMAN_SLOTS : MASCOT_SLOTS;
      const other = s.type === 'human' ? MASCOT_SLOTS : HUMAN_SLOTS;
      s.slot = [...prefer, ...other].find((x) => !used.has(x)) || prefer[0];
      used.add(s.slot);
    }
    out[id] = s;
  }
  script.cast = out;
  return script;
}

export function validateScript(src) {
  const errors = [], warnings = [];
  const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
  if (!src || typeof src !== 'object') return { errors: ['script must be a JSON object'], warnings };
  if (src.set && !SETS[src.set]) err(`set "${src.set}" is unknown (use one of: ${Object.keys(SETS).join(', ')})`);
  if (src.time && !TIME_NAMES.includes(src.time)) err(`time "${src.time}" is unknown (${TIME_NAMES.join(', ')})`);
  const script = normalizeScript(src);
  const ids = Object.keys(script.cast);
  if (!ids.length) err('cast is empty');
  const slots = {};
  for (const [id, c] of Object.entries(script.cast)) {
    if (BEAT_FIELDS.includes(id)) err(`cast id "${id}" is reserved; pick another name`);
    if (!/^[A-Za-z][\w-]*$/.test(id)) err(`cast id "${id}" must be a simple name`);
    if (!CHARACTER_TYPES[c.type]) err(`cast.${id}.type "${c.type}" is unknown (${Object.keys(CHARACTER_TYPES).join(', ')})`);
    if (!SLOTS[c.slot]) err(`cast.${id}.slot "${c.slot}" is unknown (${Object.keys(SLOTS).join(', ')})`);
    if (slots[c.slot]) err(`cast.${id} and cast.${slots[c.slot]} are both in slot "${c.slot}"`);
    slots[c.slot] = id;
    if (c.type === 'human') {
      if (c.hair && !HAIR.includes(c.hair)) err(`cast.${id}.hair "${c.hair}" is unknown (${HAIR.join(', ')})`);
      if (c.outfit && !OUTFITS.includes(c.outfit)) err(`cast.${id}.outfit "${c.outfit}" is unknown (${OUTFITS.join(', ')})`);
      for (const a of c.accessories || []) if (!ACCESSORIES.includes(a)) err(`cast.${id}.accessories: "${a}" is unknown (${ACCESSORIES.join(', ')})`);
    }
  }
  const actionOk = (id, a) => (script.cast[id]?.type === 'human' ? HUMAN_ACTIONS : MASCOT_ACTIONS)[a];
  const lookOk = (l) => ['camera', 'screen', 'surface', 'keyboard', 'phone', 'down'].includes(l) || script.cast[l];
  const checkState = (where, id, st) => {
    if (st.expr && !EXPRESSION_NAMES.includes(st.expr)) err(`${where}: expr "${st.expr}" is unknown`);
    if (st.action && !actionOk(id, st.action)) err(`${where}: action "${st.action}" is not valid for a ${script.cast[id].type} (${Object.keys(script.cast[id].type === 'human' ? HUMAN_ACTIONS : MASCOT_ACTIONS).join(', ')})`);
    if (st.look && !lookOk(st.look)) err(`${where}: look "${st.look}" is unknown`);
  };
  if (!Array.isArray(script.beats) || !script.beats.length) err('beats must be a non-empty array');
  (script.beats || []).forEach((b, i) => {
    const at = `beats[${i}]`;
    for (const k of Object.keys(b)) if (!BEAT_FIELDS.includes(k) && !script.cast[k]) warn(`${at}: unknown field "${k}" (ignored)`);
    if (b.speaker && !script.cast[b.speaker]) err(`${at}: speaker "${b.speaker}" is not in the cast`);
    if (b.text && !b.speaker) warn(`${at}: has text but no speaker (caption only, no lip-sync)`);
    if (!b.text && !b.duration) warn(`${at}: no text and no duration; defaults to 1.2 s`);
    if (b.speaker && script.cast[b.speaker]) checkState(at, b.speaker, b);
    for (const id of ids) if (b[id]) checkState(`${at}.${id}`, id, b[id]);
    if (b.shot) {
      const [name, subject] = b.shot.split(':');
      if (!SHOTS[name] && !SHOT_ALIASES[name]) err(`${at}: shot "${b.shot}" is unknown (${Object.keys(SHOTS).join(', ')}, optionally "close:<castId>")`);
      if (subject && !script.cast[subject]) err(`${at}: shot subject "${subject}" is not in the cast`);
    }
    if (b.on && !script.cast[b.on]) err(`${at}: on "${b.on}" is not in the cast`);
    if (b.move && !MOVES.includes(b.move)) err(`${at}: move "${b.move}" is unknown (${MOVES.join(', ')})`);
    if (b.transition && !TRANSITIONS.includes(b.transition)) err(`${at}: transition "${b.transition}" is unknown`);
    if (b.time && !TIME_NAMES.includes(b.time)) err(`${at}: time "${b.time}" is unknown (${TIME_NAMES.join(', ')})`);
    if (b.screen && !SCREEN_MODES[b.screen.mode]) err(`${at}: screen.mode "${b.screen.mode}" is unknown (${Object.keys(SCREEN_MODES).join(', ')})`);
    if (b.text && b.text.length > 90) warn(`${at}: line is long (${b.text.length} chars); short punchy lines read better`);
  });
  return { errors, warnings, script };
}

// Everything a script can name. Shared by the engine, the validator, the
// idea generator (tools/idea.mjs) and the docs, so they never drift apart.

export const SETS = {
  office: 'Home office desk with a laptop, big window onto a city skyline, bookshelf, neon sign, sofa behind the camera.',
  cafe: 'Coffee shop counter with an espresso machine, pastry case, POS tablet, chalkboard menu, pendant lamps. Main character stands behind the counter (barista).',
  kitchen: 'Home kitchen island with a stovetop, pan, cutting board and a recipe tablet; cabinets, fridge, window to a garden. Main character stands (cook).',
  bedroom: 'Gamer bedroom: desk with a big monitor and RGB keyboard, LED strips, gaming chair, bed, posters. Looks best at night.',
  park: 'Outdoors: picnic table with a laptop and basket in a park with trees, grass and hills. Looks best in day/sunset.',
  studio: 'Podcast studio: round table with two boom mics and a laptop, acoustic foam wall, ON AIR sign. Made for two hosts.',
};

export const SLOTS = {
  main: 'the lead human: sits/stands behind the desk/counter facing the camera',
  side: 'a second human next to the main one',
  desk: 'a mascot sitting on the desk/counter, left of the main character',
  desk2: 'a mascot on the desk/counter, right of the main character',
};

export const CHARACTER_TYPES = {
  human: 'clay-doll person. Options: hair, hairColor, skin, top, outfit, pants, eyeColor, lashes, accessories',
  cube: 'boxy terracotta buddy with pixel eyes (the classic AI sidekick)',
  cat: 'a cat sitting on the desk, slit-pupil eyes, swishing tail',
  robot: 'small robot with a glowing screen face and antenna',
  blob: 'squishy jelly slime blob',
  mug: 'a talking coffee mug',
};

export const HAIR = ['long', 'bob', 'short', 'bun', 'ponytail'];

// Free Kokoro neural voices (a = American, b = British; f = female, m = male).
// The best-rated ones: af_heart, af_bella, af_nicole, bf_emma, am_michael, am_fenrir, am_puck, bm_george, bm_fable.
export const KOKORO_VOICES = [
  'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
  'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa',
  'bf_emma', 'bf_isabella', 'bf_alice', 'bf_lily', 'bm_george', 'bm_lewis', 'bm_daniel', 'bm_fable',
];
export const VOICE_TYPES = ['kokoro', 'babble', 'elevenlabs'];
export const OUTFITS = ['sweater', 'hoodie', 'tee', 'apron', 'blazer'];
export const ACCESSORIES = ['glasses', 'headphones', 'chefHat', 'cap', 'bow'];

export const EXPRESSION_NAMES = [
  'neutral', 'happy', 'joy', 'worried', 'sad', 'smug', 'skeptical', 'annoyed',
  'angry', 'shocked', 'sleepy', 'determined', 'love', 'crying',
];

export const HUMAN_ACTIONS = {
  idle: 'hands resting', typing: 'typing on the keyboard', phone: 'looking at a phone',
  cheeks: 'hands on cheeks (amazed)', shrug: 'shrug', point: 'points to her left',
  celebrate: 'both arms up', facepalm: 'facepalm', think: 'hand on chin',
  wave: 'waves', sleep: 'asleep on the desk', lookDown: 'looks down', lean: 'leans in',
  armsCrossed: 'arms crossed', gesture: 'talks with her hands', cook: 'stirs a pan with a spatula',
  drink: 'sips from a mug', dance: 'dances', handsHips: 'hands on hips',
};

export const MASCOT_ACTIONS = {
  idle: 'breathing', hop: 'excited hops', bounce: 'small bounces', wiggle: 'side-to-side wiggle',
  lean: 'leans forward', nod: 'nods', shake: 'shakes head no', spin: 'spins around',
  proud: 'leans back proudly', sleep: 'sleeping', type: 'typing / working', dance: 'dances',
  tilt: 'tilts head (curious)',
};

export const SHOTS = {
  close: 'close-up of the subject (default: the speaker)',
  tight: 'extreme close-up of the subject',
  medium: 'waist-up shot of a human / wider shot of a mascot',
  pov: 'over-the-desk point of view onto the subject',
  two: 'two-shot framing the subject and the other character',
  wide: 'establishing shot of the whole set',
  wide2: 'alternate wide angle',
  screen: "the laptop/monitor/tablet screen from the main character's seat",
  overShoulder: "over the main character's shoulder onto the screen",
};
// Old names from v1 scripts
export const SHOT_ALIASES = { girl: 'close', girlClose: 'tight', girlMedium: 'medium', cube: 'close', cubeClose: 'tight', wideFront: 'wide2' };

export const MOVES = ['push', 'pull', 'drift', 'crash', 'orbit', 'static'];
export const TIME_NAMES = ['dawn', 'day', 'sunset', 'dusk', 'night'];
export const TRANSITIONS = ['cut', 'whip'];
export const SCREEN_MODES = {
  code: '{mode:"code", title?, lines?}', terminal: '{mode:"terminal", lines:[...]} (typed out)',
  render: '{mode:"render", title?, speed?} progress bar', done: '{mode:"done", title?} finished video',
  stat: '{mode:"stat", label, value} big counting number', blank: '{mode:"blank", title?}',
  chat: '{mode:"chat", messages:[{from:"me"|"them", text}]}', recipe: '{mode:"recipe", title, lines}',
  live: '{mode:"live", title?, value?} livestream / recording UI', game: '{mode:"game", title?} retro game',
};
export const LOOK_TARGETS = ['camera', 'screen', 'surface', 'phone', 'down', '<any cast id>'];

// Beat fields that are not cast ids.
export const BEAT_FIELDS = ['speaker', 'text', 'expr', 'action', 'look', 'shot', 'on', 'with', 'move', 'transition',
  'time', 'timeFade', 'screen', 'title', 'duration', 'pad', 'audio', 'tts', 'fov', 'aperture', 'handheld'];

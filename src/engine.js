// Engine: turns a JSON script into a deterministic, frame-addressable video.
// window.__engine.frame(t) renders the frame at time t (seconds) into the
// output canvas; render.mjs drives it headlessly, the preview UI drives it
// in real time.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { createSet, TIMES, lerpTime } from './sets/index.js';
import { createCharacter, EXPRESSIONS, blendExpr } from './characters/index.js';
import { SHOT_ALIASES } from './vocab.js';
import { normalizeScript } from './validate.js';
import { clamp, lerp, smooth, easeInOut, easeOutBack, noise } from './util.js';

// Final grade: whip-pan motion blur, vignette and film grain (in sRGB space).
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, seed: { value: 0 }, blur: { value: 0 }, blurDir: { value: 1 },
    vignette: { value: 0.32 }, grain: { value: 0.022 }, aspect: { value: 9 / 16 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float seed, blur, blurDir, vignette, grain, aspect;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + seed * 0.618) * 43758.5453); }
    void main(){
      vec3 c = vec3(0.0);
      if (blur > 0.001) {
        float tot = 0.0;
        for (int i = -12; i <= 12; i++) {
          float f = float(i) / 12.0;
          float w = 1.0 - abs(f) * 0.5;
          c += texture2D(tDiffuse, vUv + vec2(f * blur * blurDir, 0.0)).rgb * w;
          tot += w;
        }
        c /= tot;
      } else {
        // subtle lens fringing toward the edges
        vec2 off = (vUv - 0.5) * 0.0025;
        c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      }
      // cinematic grade: a bit more colour and contrast, warm highlights, cool shadows
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 1.12);
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
      c += vec3(0.018, 0.006, -0.012) * smoothstep(0.45, 1.0, l) + vec3(-0.008, 0.0, 0.016) * (1.0 - smoothstep(0.0, 0.4, l));
      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0) * 1.6;
      c *= 1.0 - vignette * smoothstep(0.35, 1.05, dot(d, d));
      c += (h(vUv * 1000.0) - 0.5) * grain;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

const WHIP = 0.22; // seconds on each side of a whip-pan cut

// Spread a line's words over its spoken duration (weighted by length, with
// pauses after punctuation). Used for karaoke captions, lip shapes and
// emphasis beats. Good enough without a forced aligner.
function wordTimeline(text, dur) {
  const toks = text.trim().split(/\s+/).filter(Boolean);
  const parts = toks.map((tok) => {
    const letters = tok.replace(/[^A-Za-z0-9]/g, '');
    return { tok, letters, w: Math.max(2, letters.length), pause: /[.!?…]$/.test(tok) ? 4 : /[,;:]$/.test(tok) ? 2.5 : 0.6 };
  });
  const total = parts.reduce((a, p) => a + p.w + p.pause, 0) - (parts.at(-1)?.pause || 0);
  const k = (dur * 0.97) / Math.max(1, total);
  let acc = 0;
  return parts.map((p) => {
    const t0 = acc * k; acc += p.w; const t1 = acc * k; acc += p.pause;
    const emphatic = p.letters.length >= 6 || /[!?]$/.test(p.tok) || (p.letters.length > 1 && p.letters === p.letters.toUpperCase() && /[A-Z]/.test(p.letters));
    return { text: p.tok, letters: p.letters.toLowerCase(), t0, t1, stress: emphatic ? 1 : 0.45, ends: /[.!?…]$/.test(p.tok) };
  });
}

// Mouth shape per letter: open (jaw), wide (ee), round (oo), closed (m/b/p).
function viseme(ch) {
  if (!ch) return { open: 0.4, wide: 0.2, round: 0, closed: 0 };
  if ('a'.includes(ch)) return { open: 1, wide: 0.3, round: 0, closed: 0 };
  if ('eiy'.includes(ch)) return { open: 0.55, wide: 1, round: 0, closed: 0 };
  if ('ouwq'.includes(ch)) return { open: 0.7, wide: 0, round: 1, closed: 0 };
  if ('mbp'.includes(ch)) return { open: 0, wide: 0.2, round: 0, closed: 1 };
  if ('fv'.includes(ch)) return { open: 0.2, wide: 0.7, round: 0, closed: 0 };
  return { open: 0.45, wide: 0.35, round: 0.1, closed: 0 };
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Engine {
  constructor(canvas) {
    this.out = canvas;
    this.ctx2d = canvas.getContext('2d');
  }

  async load(rawScript, audio = {}) {
    const script = normalizeScript(rawScript);
    this.script = script;
    const W = script.width || 720, H = script.height || 1280;
    this.W = W; this.H = H; this.fps = script.fps || 30;
    this.out.width = W; this.out.height = H;

    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, W / H, 0.01, 150);
    this.set = createSet(script.set, this.scene, script.setOptions || {});

    // Cast: place each character in its slot. Mascots face the main human.
    this.chars = {};
    this.ids = Object.keys(script.cast);
    for (const id of this.ids) {
      const spec = script.cast[id];
      const slot = { ...(this.set.slots[spec.slot] || this.set.slots.main) };
      this.chars[id] = createCharacter(id, spec, slot);
      this.scene.add(this.chars[id].root);
    }
    this.mainId = this.ids.find((id) => this.chars[id].kind === 'human') || null;
    for (const id of this.ids) {
      const c = this.chars[id];
      if (c.kind === 'human' || this.set.slots[script.cast[id].slot]?.yaw !== undefined) continue;
      if (this.mainId) {
        // Cheat toward the camera: face a point in front of the main human,
        // so the mascot reads in close-ups and still turns to talk to them.
        const main = this.chars[this.mainId];
        const m = main.root.position.clone().addScaledVector(main.facing, 0.9), p = c.root.position;
        c.baseYaw = Math.atan2(m.x - p.x, m.z - p.z);
      } else c.baseYaw = 0;
      c.root.rotation.y = c.baseYaw;
    }

    // Edge smoothing: SMAA by default (much cheaper than MSAA on CPU renders).
    const msaa = script.msaa ?? 0;
    const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: msaa });
    const composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (script.ao !== false) {
      // Ambient occlusion: soft contact shadows where things meet.
      const ao = new GTAOPass(this.scene, this.camera, W, H);
      ao.updateGtaoMaterial({ radius: 0.22, distanceExponent: 1.5, thickness: 1, scale: 1.1, samples: W < 700 ? 8 : 10 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      ao.blendIntensity = 0.85;
      composer.addPass(ao);
    }
    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 1, aperture: 0.012, maxblur: 0.01 });
    composer.addPass(this.bokeh);
    // Clamp extreme HDR highlights (glossy glass catching a lamp) so bloom
    // gives a soft glow instead of washing out the whole frame.
    composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float m = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c.rgb * min(1.0, 2.5 / max(m, 1e-4)), c.a); }',
    }));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.35, 0.6, 0.9));
    composer.addPass(new OutputPass());
    if (!msaa) composer.addPass(new SMAAPass());
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.aspect.value = W / H;
    if (script.vignette !== undefined) this.grade.uniforms.vignette.value = script.vignette;
    if (script.grain !== undefined) this.grade.uniforms.grain.value = script.grain;
    composer.addPass(this.grade);
    this.composer = composer;
    this.raycaster = new THREE.Raycaster();
    this.shotAngles = new Map();

    if (document.fonts) await Promise.all(['600', '700', '800'].map((w) => document.fonts.load(`${w} 32px Inter`)));
    this.buildTimeline(script, audio);
    return {
      duration: this.duration, fps: this.fps, width: W, height: H,
      beats: this.beats.map((b) => ({
        start: b.start, duration: b.duration, speaker: b.speaker || null, transition: b.transition || null,
        title: !!b.title, move: this.beatMove(b), expr: b.speaker ? b.state[b.speaker]?.expr : null,
      })),
    };
  }

  // Resolve each beat's start/duration and the carried-over state of every
  // character (expression, action, look), screen and time of day.
  buildTimeline(script, audio) {
    let t = script.lead ?? 0.25;
    const carry = { time: script.time || this.set.defaultTime, screen: { mode: 'code' } };
    for (const id of this.ids) carry[id] = { expr: 'neutral', action: 'idle' };
    this.beats = script.beats.map((src, i) => {
      const b = { ...src, index: i };
      const words = (b.text || '').trim().split(/\s+/).filter(Boolean).length;
      const a = audio[i];
      b.speechDur = a ? a.duration : words ? 0.35 + words * 0.3 : 0;
      b.duration = b.duration ?? Math.max(1.2, b.speechDur + (b.pad ?? 0.45));
      b.start = t;
      t += b.duration;
      b.env = a?.env || null;
      b.words = b.text ? wordTimeline(b.text, b.speechDur) : null;
      b.state = {};
      for (const id of this.ids) {
        const st = { ...carry[id], look: null };
        if (src[id]) Object.assign(st, src[id]);
        if (b.speaker === id) {
          if (b.expr) st.expr = b.expr;
          if (b.action) st.action = b.action;
          if (b.look) st.look = b.look;
        }
        carry[id] = { expr: st.expr, action: st.action };
        b.state[id] = st;
      }
      if (b.time) carry.time = b.time;
      b.timeName = carry.time;
      if (b.screen) carry.screen = b.screen;
      b.screenState = carry.screen;
      return b;
    });
    this.duration = t + (script.tail ?? 0.4);
  }

  beatAt(t) {
    let i = 0;
    while (i < this.beats.length - 1 && t >= this.beats[i + 1].start) i++;
    return i;
  }

  // Mouth opening 0..1: from the voice audio envelope when we have one,
  // otherwise a procedural syllable rhythm while the line is "spoken".
  talkAmount(b, t) {
    const lt = t - b.start;
    if (!b.text || lt < 0 || lt > b.speechDur) return 0;
    if (b.env) return clamp((b.env[Math.min(b.env.length - 1, Math.floor(lt * this.fps))] || 0) * 1.4);
    const syl = Math.max(0, Math.sin(lt * Math.PI * 2 * 4.2 + noise(lt * 3, b.index) * 1.5));
    return syl * smooth(lt / 0.08) * smooth((b.speechDur - lt) / 0.1) * (0.6 + 0.4 * noise(lt * 5, b.index + 3));
  }

  // Lip shape + emphasis for the speaker at time t, and a nod cue for listeners.
  speech(b, t) {
    const lt = t - b.start;
    const none = { talk: 0, open: 0, wide: 0, round: 0, closed: 0, emph: 0, nod: 0, word: -1 };
    if (!b.words || lt < 0 || lt > b.speechDur + 0.6) return none;
    const amp = b.env ? this.talkAmount(b, t) : (lt <= b.speechDur ? 0.85 : 0);
    let out = { ...none };
    for (const [i, w] of b.words.entries()) {
      // emphasis: a quick impulse at each word onset, bigger on stressed words
      if (lt >= w.t0) out.emph = Math.max(out.emph, w.stress * Math.exp(-(lt - w.t0) / 0.16) * (lt - w.t0 < 0.5 ? 1 : 0));
      // listeners nod at sentence ends
      if (w.ends && lt >= w.t1 && lt < w.t1 + 0.55) out.nod = Math.max(out.nod, Math.sin(((lt - w.t1) / 0.55) * Math.PI));
      if (lt >= w.t0 && lt < w.t1) {
        out.word = i;
        const letters = w.letters || 'a';
        const f = ((lt - w.t0) / (w.t1 - w.t0)) * letters.length;
        const j = Math.min(letters.length - 1, Math.floor(f));
        const a = viseme(letters[j]), c = viseme(letters[Math.min(letters.length - 1, j + 1)]);
        const m = smooth(f - j);
        for (const key of ['open', 'wide', 'round', 'closed']) out[key] = lerp(a[key], c[key], m);
      }
    }
    if (out.word >= 0) out.talk = clamp(Math.max(0.25, amp) * (0.25 + 0.75 * out.open) * (1 - out.closed * 0.9));
    else if (b.env && lt <= b.speechDur) out.talk = this.talkAmount(b, t) * 0.4;
    return out;
  }

  beatMove(b) {
    if (b.move) return b.move;
    const ex = b.speaker ? b.state[b.speaker]?.expr : null;
    return ex === 'shocked' || ex === 'angry' ? 'punch' : 'push';
  }

  resolveLook(name, who) {
    if (!name) return null;
    if (this.chars[name] && name !== who) return this.chars[name].focusPoint;
    const c = this.chars[who];
    switch (name) {
      case 'camera': return this.camera.position.clone();
      case 'screen': return this.set.anchors.screen ? this.set.anchors.screen.clone() : null;
      case 'surface': case 'keyboard': {
        const s = c.surface;
        return s ? c.root.localToWorld(V(0, s.y, s.z)) : c.focusPoint.add(V(0, -0.4, 0.3));
      }
      case 'phone': return c.phonePoint ? c.phonePoint : null;
      case 'down': return c.focusPoint.add(c.facing.multiplyScalar(0.6)).add(V(0, -1, 0));
      default: return null;
    }
  }

  defaultLook(b, id) {
    const c = this.chars[id], st = b.state[id];
    if (st.look) return st.look;
    if (b.speaker && b.speaker !== id && this.chars[b.speaker]) return b.speaker;
    if (c.kind === 'human') {
      if (st.action === 'typing') return 'screen';
      if (st.action === 'phone') return 'phone';
      if (st.action === 'cook') return 'surface';
      return 'camera';
    }
    return this.mainId && this.mainId !== id ? this.mainId : 'camera';
  }

  // ---- camera shots ------------------------------------------------------
  parseShot(b) {
    let name = b.shot || 'close', subject = b.on;
    if (name.includes(':')) [name, subject] = name.split(':');
    const legacy = name;
    name = SHOT_ALIASES[name] || name;
    if (!subject && (legacy === 'girl' || legacy === 'girlClose' || legacy === 'girlMedium')) subject = this.ids.find((id) => this.chars[id].kind === 'human');
    if (!subject && (legacy === 'cube' || legacy === 'cubeClose')) subject = this.ids.find((id) => this.chars[id].kind !== 'human');
    if (!b.shot && !b.speaker) name = 'wide';
    if (!this.chars[subject]) subject = (b.speaker && this.chars[b.speaker]) ? b.speaker : this.mainId || this.ids[0];
    return { name, subject };
  }

  // Framing for a character shot, orbiting the subject by `a` radians.
  charShot(c, name, a, baseYaw = Math.atan2(c.facing.x, c.facing.z)) {
    const f = c.focusPoint;
    const yaw = baseYaw + a;
    const dir = V(Math.sin(yaw), 0, Math.cos(yaw)), right = V(dir.z, 0, -dir.x);
    const at = (dist, up, side = 0) => f.clone().addScaledVector(dir, dist).addScaledVector(right, side).add(V(0, up, 0));
    if (c.kind === 'human') {
      if (name === 'tight') return { pos: at(0.55, -0.02), target: f.clone().add(V(0, -0.05, 0)), fov: 46, aperture: 0.014 };
      if (name === 'medium') return { pos: at(2.0, -0.12), target: f.clone().add(V(0, -0.28, 0)), fov: 32, aperture: 0.009 };
      if (name === 'pov') return { pos: at(1.2, 0.05, 0.5), target: f.clone().add(V(0, -0.08, 0)), fov: 32, aperture: 0.014 };
      return { pos: at(1.38, -0.1, 0.03), target: f.clone().add(V(0, -0.075, 0)), fov: 31, aperture: 0.014 };
    }
    const k = Math.max(1, c.size / 0.2);
    if (name === 'tight') return { pos: at(0.68 * k, 0.14 * k), target: f.clone(), fov: 30, aperture: 0.026 };
    if (name === 'medium') return { pos: at(1.5 * k, 0.45 * k), target: f.clone().add(V(0, -0.05, 0)), fov: 32, aperture: 0.012 };
    return { pos: at(1.0 * k, 0.3 * k), target: f.clone().add(V(0, -0.03 * k, 0)), fov: 30, aperture: 0.022 };
  }

  firstHit(origin, dir, far, c) {
    this.raycaster.set(origin, dir);
    this.raycaster.near = 0.02; this.raycaster.far = far;
    for (const hit of this.raycaster.intersectObjects(this.scene.children, true)) {
      const o = hit.object;
      if (!o.visible) continue;
      // See-through props (glass cases, jars) still count: a camera inside
      // one renders as a white wash. Only near-invisible decals are skipped.
      const m = o.material;
      if (m && (m.isShadowMaterial || (m.transparent && m.opacity < 0.12))) continue;
      let own = false;
      for (let p = o; p; p = p.parent) if (p === c.root) { own = true; break; }
      if (!own) return hit;
    }
    return null;
  }

  // How blocked is this framing? Casts rays from the camera through the upper
  // and middle of the frame (the bottom may hold foreground props like a
  // laptop lid), plus one ray from the face back to the camera to catch
  // cameras inside objects. 0 = clear; higher = worse.
  occlusion(c, shot) {
    const f = c.focusPoint;
    const dist = shot.pos.distanceTo(f);
    const cam = this.probeCam || (this.probeCam = new THREE.PerspectiveCamera());
    cam.fov = shot.fov; cam.aspect = this.W / this.H; cam.near = 0.01; cam.far = 50;
    cam.position.copy(shot.pos); cam.lookAt(shot.target); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    let score = 0;
    for (const [x, y] of [[-0.45, 0.4], [0, 0.4], [0.45, 0.4], [-0.45, 0.1], [0, 0.1], [0.45, 0.1], [0, -0.12]]) {
      this.raycaster.setFromCamera(new THREE.Vector2(x, y), cam);
      if (this.firstHit(this.raycaster.ray.origin.clone(), this.raycaster.ray.direction.clone(), dist - 0.1, c)) score += x === 0 && y < 0.3 ? 5 : 1;
    }
    if (this.firstHit(f, shot.pos.clone().sub(f).normalize(), dist, c)) score += 10;
    // Cameras behind or right beside another person get arms and hair in the
    // frame as soon as they move, so steer away from those spots.
    for (const id of this.ids) {
      const h = this.chars[id];
      if (h === c || h.kind !== 'human') continue;
      const rel = shot.pos.clone().sub(h.root.position).setY(0);
      const fwd = h.facing;
      const lateral = Math.abs(rel.x * fwd.z - rel.z * fwd.x);
      if (rel.length() < 0.5) score += 4;
      else if (rel.dot(fwd) < 0.1 && lateral < 0.75) score += 3;
    }
    return score;
  }

  // Pick the first orbit angle with a clear view of the subject's face.
  chooseAngle(b) {
    const { name, subject } = this.parseShot(b);
    if (['wide', 'wide2', 'screen', 'overShoulder', 'two'].includes(name)) return { a: 0 };
    const c = this.chars[subject];
    const f = c.focusPoint;
    let cands, yaw;
    if (c.kind === 'human') cands = [0, 0.3, -0.3, 0.55, -0.55, 0.8, -0.8];
    else {
      // Frame the mascot from where it is actually facing at the start of the
      // beat (it turns toward whoever it talks to), starting on the outer side.
      yaw = b.state[subject].action === 'spin' ? c.baseYaw : c.root.rotation.y;
      const s = Math.sin(yaw + 0.3) * Math.sign(f.x || 1) > Math.sin(yaw - 0.3) * Math.sign(f.x || 1) ? 1 : -1;
      cands = [0.3, -0.3, 0.6, -0.6, 0.0, 0.9, -0.9, 1.3, -1.3, 1.8, -1.8].map((a) => a * s);
    }
    this.scene.updateMatrixWorld(true);
    let best = cands[0], bestScore = Infinity;
    for (const a of cands) {
      const score = this.occlusion(c, this.charShot(c, name, a, yaw));
      if (score === 0) return { a, yaw };
      if (score < bestScore) { best = a; bestScore = score; }
    }
    return { a: best, yaw };
  }

  shot(b, lt) {
    const { name, subject } = this.parseShot(b);
    const c = this.chars[subject];
    const f = c.focusPoint;
    const prog = clamp(lt / Math.max(0.5, b.duration));
    let pos, target, fov = 31, focusOn = f, aperture = 0.014;
    const set = this.set;
    switch (name) {
      case 'wide': case 'wide2': {
        const w = set.wides[name];
        pos = V(...w.pos); target = V(...w.target); fov = w.fov; aperture = 0.004;
        break;
      }
      case 'screen':
        if (set.screenCam) { pos = set.screenCam.pos.clone(); target = set.screenCam.target.clone(); fov = set.screenCam.fov; focusOn = target; aperture = 0.01; break; }
      // falls through
      case 'overShoulder': {
        const m = this.chars[this.mainId || subject];
        const head = m.focusPoint, mf = m.facing, mr = V(mf.z, 0, -mf.x);
        pos = head.clone().addScaledVector(mf, -0.5).addScaledVector(mr, 0.3).add(V(0, 0.1, 0));
        target = set.anchors.screen ? set.anchors.screen.clone() : head.clone().addScaledVector(mf, 0.6).add(V(0, -0.35, 0));
        fov = 40; focusOn = target;
        break;
      }
      case 'two': {
        const otherId = b.with || (b.speaker && b.speaker !== subject ? b.speaker : this.ids.find((id) => id !== subject && this.chars[id].kind === 'human') || this.ids.find((id) => id !== subject));
        const o = otherId ? this.chars[otherId].focusPoint : f.clone();
        // Look along the line between them from the subject's far side so they
        // stack in depth (side-by-side pairs don't fit a vertical frame).
        const toOther = o.clone().sub(f).setY(0);
        const fy = Math.atan2(c.facing.x, c.facing.z);
        const side = toOther.dot(V(Math.cos(fy), 0, -Math.sin(fy))) > 0 ? 1 : -1;
        const yaw = fy + side * 0.6;
        pos = f.clone().add(V(Math.sin(yaw) * 1.6, 0.06, Math.cos(yaw) * 1.6));
        target = f.clone().lerp(o, 0.35).add(V(0, -0.1, 0)); fov = 36; focusOn = f.clone().lerp(o, 0.3); aperture = 0.007;
        break;
      }
      default:
        const pick = this.shotAngles.get(b.index) || { a: 0 };
        ({ pos, target, fov, aperture } = this.charShot(c, name, pick.a, pick.yaw));
    }
    // Camera moves
    const move = this.beatMove(b);
    const dir = new THREE.Vector3().subVectors(target, pos);
    if (move === 'push') pos.addScaledVector(dir, 0.06 * easeInOut(prog));
    if (move === 'pull') pos.addScaledVector(dir, -0.08 * easeInOut(prog));
    if (move === 'drift') pos.add(V(lerp(-0.04, 0.04, easeInOut(prog)), 0, 0));
    if (move === 'crash') pos.addScaledVector(dir, 0.28 * easeOutBack(clamp(lt / 0.3)));
    if (move === 'punch') pos.addScaledVector(dir, 0.14 * easeOutBack(clamp(lt / 0.25)));
    if (move === 'orbit') {
      const a = lerp(-0.18, 0.18, easeInOut(prog));
      const rel = pos.clone().sub(target).applyAxisAngle(V(0, 1, 0), a);
      pos = target.clone().add(rel);
    }
    const hs = b.handheld ?? 1, T = this.tGlobal;
    target.add(V(noise(T * 0.7, 31) * 0.006 * hs, noise(T * 0.6, 32) * 0.005 * hs, 0));
    pos.add(V(noise(T * 0.4, 33) * 0.006 * hs, noise(T * 0.5, 34) * 0.004 * hs, 0));
    return { pos, target, fov: b.fov || fov, focus: pos.distanceTo(focusOn), aperture: b.aperture ?? aperture };
  }

  placeCamera(cam, yawOff) {
    this.camera.position.copy(cam.pos);
    this.camera.fov = cam.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(cam.target);
    if (yawOff) this.camera.rotateY(yawOff);
  }

  frame(t) {
    this.tGlobal = t;
    const i = this.beatAt(t);
    const b = this.beats[i];
    const prev = this.beats[i - 1] || b;
    const next = this.beats[i + 1];
    const lt = t - b.start;

    const tp = TIMES[b.timeName] || TIMES.dusk;
    let tod = tp;
    if (b.timeFade && prev.timeName !== b.timeName) tod = lerpTime(TIMES[prev.timeName] || tp, tp, smooth(lt / b.timeFade));
    this.set.applyTime(tod);
    this.renderer.toneMappingExposure = tod.exposure;
    this.set.screen?.update(b.screenState, clamp(lt / b.duration), t);

    // Camera is solved twice: once so characters can look at it, then again
    // after they've moved so framing and focus use this frame's poses.
    let whip = 0, yawOff = 0;
    if (b.transition === 'whip' && lt < WHIP && i > 0) {
      yawOff = -(1 - easeInOut(0.5 + (lt / WHIP) * 0.5)) * 1.2;
      whip = 1 - lt / WHIP;
    } else if (next && next.transition === 'whip' && next.start - t < WHIP) {
      const k = 1 - (next.start - t) / WHIP;
      yawOff = easeInOut(k * 0.5) * 1.2;
      whip = k;
    }
    this.placeCamera(this.shot(b, lt), yawOff);

    if (!this.shotAngles.has(i)) {
      // Pose everyone as they'll be early in this beat, then pick a camera angle.
      this.updateChars(b, prev, i, b.start + Math.min(0.4, b.duration * 0.5));
      this.shotAngles.set(i, this.chooseAngle(b));
      this.placeCamera(this.shot(b, lt), yawOff);
    }
    this.updateChars(b, prev, i, t);

    const cam = this.shot(b, lt);
    this.placeCamera(cam, yawOff);
    this.bokeh.uniforms.focus.value = cam.focus;
    this.bokeh.uniforms.aperture.value = cam.aperture;
    this.bokeh.uniforms.maxblur.value = 0.01;
    this.grade.uniforms.blur.value = whip * 0.06;
    this.grade.uniforms.seed.value = Math.floor(t * this.fps);
    this.composer.render();

    const ctx = this.ctx2d;
    ctx.drawImage(this.renderer.domElement, 0, 0, this.W, this.H);
    if (b.text && this.script.captions !== false) this.drawCaption(b, lt);
    if (b.title) this.drawTitle(b.title, lt, b.duration);
    return i;
  }

  updateChars(b, prev, i, t) {
    for (const id of this.ids) {
      const st = b.state[id], pst = prev.state[id];
      const lt = t - b.start;
      const ea = EXPRESSIONS[pst.expr] || EXPRESSIONS.neutral;
      const eb = EXPRESSIONS[st.expr] || EXPRESSIONS.neutral;
      const changed = pst.action !== st.action;
      this.chars[id].update(t, {
        expr: i === 0 ? eb : blendExpr(ea, eb, clamp(lt / 0.2)),
        action: st.action,
        prevAction: i === 0 ? st.action : pst.action,
        actionBlend: i === 0 || !changed ? 1 : clamp(lt / 0.35),
        ...(() => {
          const sp = this.speech(b, t);
          if (b.speaker === id) return { talk: sp.talk, shape: { wide: sp.wide, round: sp.round, closed: sp.closed }, emph: sp.emph };
          return { talk: 0, shape: null, emph: sp.nod * 0.5 };
        })(),
        enter: changed || (pst.expr !== st.expr) ? clamp(1 - lt / 0.35) : 0,
        look: this.resolveLook(this.defaultLook(b, id), id),
      });
    }
  }

  drawCaption(b, lt) {
    if ((this.script.captionStyle || 'karaoke') === 'pill' || !b.words) return this.drawPill(b, lt);
    // Viral-style captions: 1-3 words at a time, the spoken word highlighted.
    const ctx = this.ctx2d, W = this.W, H = this.H, s = W / 720;
    const fs = Math.round(44 * s);
    ctx.font = `800 ${fs}px Inter, sans-serif`;
    if (!b.chunks) {
      b.chunks = [];
      let cur = [];
      for (const [i, w] of b.words.entries()) {
        cur.push(i);
        const width = ctx.measureText(cur.map((k) => b.words[k].text).join(' ')).width;
        if (cur.length >= 3 || w.ends || /[,;:]$/.test(w.text) || width > W * 0.62) { b.chunks.push(cur); cur = []; }
      }
      if (cur.length) b.chunks.push(cur);
    }
    let wi = 0;
    for (const [i, w] of b.words.entries()) if (lt >= w.t0 - 0.02) wi = i;
    const chunk = b.chunks.find((c) => c.includes(wi)) || b.chunks[0];
    const chunkStart = b.words[chunk[0]].t0;
    const pop = easeOutBack(clamp((lt - chunkStart + 0.04) / 0.14));
    const words = chunk.map((k) => b.words[k].text);
    const space = ctx.measureText(' ').width * 1.7;
    const widths = words.map((w) => ctx.measureText(w).width);
    const total = widths.reduce((a, x) => a + x, 0) + space * (words.length - 1);
    const cy = H * (this.script.captionY ?? 0.7);
    ctx.save();
    ctx.globalAlpha = clamp(lt / 0.06) * clamp((b.duration - lt) / 0.1);
    ctx.translate(W / 2, cy);
    ctx.scale(0.86 + 0.14 * pop, 0.86 + 0.14 * pop);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
    let x = -total / 2;
    chunk.forEach((k, j) => {
      const w = b.words[k];
      const active = k === wi && lt <= w.t1 + 0.25;
      const wp = active ? easeOutBack(clamp((lt - w.t0) / 0.12)) : 0;
      const sc = 1 + 0.07 * wp;
      ctx.save();
      ctx.translate(x + widths[j] / 2, -6 * s * wp);
      ctx.scale(sc, sc);
      ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 14 * s; ctx.shadowOffsetY = 3 * s;
      ctx.lineWidth = 9 * s; ctx.strokeStyle = '#111';
      ctx.strokeText(w.text, -widths[j] / 2, 0);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = active ? (this.script.captionColor || '#FFD84D') : '#ffffff';
      ctx.fillText(w.text, -widths[j] / 2, 0);
      ctx.restore();
      x += widths[j] + space;
    });
    ctx.restore();
  }

  drawPill(b, lt) {
    const ctx = this.ctx2d, W = this.W, H = this.H;
    const s = W / 720;
    const fs = Math.round(25 * s);
    ctx.font = `700 ${fs}px Inter, sans-serif`;
    const maxW = W * 0.62;
    const lines = [];
    let line = '';
    for (const w of b.text.split(/\s+/)) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    const lh = fs * 1.25;
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const padX = 14 * s, padY = 9 * s;
    const bw = tw + padX * 2, bh = lines.length * lh + padY * 2;
    const cy = H * (this.script.captionY ?? 0.765);
    const k = easeOutBack(clamp(lt / 0.16));
    ctx.save();
    ctx.globalAlpha = clamp(lt / 0.08) * clamp((b.duration - lt) / 0.08);
    ctx.translate(W / 2, cy);
    ctx.scale(0.9 + 0.1 * k, 0.9 + 0.1 * k);
    ctx.fillStyle = 'rgba(28,26,30,0.82)';
    ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 9 * s); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, j) => ctx.fillText(l, 0, -bh / 2 + padY + lh * (j + 0.5) + 1));
    ctx.restore();
  }

  // Title badge ("1. Give context"): pops in with a little tilt.
  drawTitle(text, lt, dur) {
    const ctx = this.ctx2d, W = this.W, H = this.H, s = W / 720;
    const a = clamp(lt / 0.12) * clamp((dur - lt) / 0.25);
    const k = easeOutBack(clamp(lt / 0.35));
    const m = text.match(/^(\d+)[.)]\s*(.*)$/);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(W / 2, H * 0.16);
    ctx.rotate((-3 + 3 * (1 - k)) * Math.PI / 180);
    ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
    ctx.font = `800 ${Math.round(40 * s)}px Inter, sans-serif`;
    ctx.textBaseline = 'middle';
    const label = m ? m[2] : text;
    const tw = ctx.measureText(label).width;
    const badge = m ? 58 * s : 0;
    const pad = 22 * s, h = 76 * s, w = tw + pad * 2 + (m ? badge + 12 * s : 0);
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 24 * s; ctx.shadowOffsetY = 8 * s;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, h / 2); ctx.fill();
    ctx.shadowColor = 'transparent';
    let x = -w / 2 + pad;
    if (m) {
      ctx.fillStyle = this.script.accent || '#d97757';
      ctx.beginPath(); ctx.arc(x + badge / 2 - 6 * s, 0, badge / 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(m[1], x + badge / 2 - 6 * s, 2 * s);
      x += badge + 12 * s;
    }
    ctx.fillStyle = '#1b1b1f'; ctx.textAlign = 'left';
    ctx.fillText(label, x, 2 * s);
    ctx.restore();
  }

}

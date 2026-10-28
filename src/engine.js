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
        c = texture2D(tDiffuse, vUv).rgb;
      }
      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0) * 1.6;
      c *= 1.0 - vignette * smoothstep(0.35, 1.05, dot(d, d));
      c += (h(vUv * 1000.0) - 0.5) * grain;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

const WHIP = 0.22; // seconds on each side of a whip-pan cut
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

    const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: script.msaa ?? 4 });
    const composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 1, aperture: 0.012, maxblur: 0.01 });
    composer.addPass(this.bokeh);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.35, 0.6, 0.9));
    composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.aspect.value = W / H;
    composer.addPass(this.grade);
    this.composer = composer;
    this.raycaster = new THREE.Raycaster();
    this.shotAngles = new Map();

    if (document.fonts) await Promise.all(['600', '700', '800'].map((w) => document.fonts.load(`${w} 32px Inter`)));
    this.buildTimeline(script, audio);
    return {
      duration: this.duration, fps: this.fps, width: W, height: H,
      beats: this.beats.map((b) => ({ start: b.start, duration: b.duration, speaker: b.speaker || null })),
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
      const m = o.material;
      if (m && m.transparent && (m.opacity < 0.6 || m.map)) continue;
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
    const move = b.move || 'push';
    const dir = new THREE.Vector3().subVectors(target, pos);
    if (move === 'push') pos.addScaledVector(dir, 0.06 * easeInOut(prog));
    if (move === 'pull') pos.addScaledVector(dir, -0.08 * easeInOut(prog));
    if (move === 'drift') pos.add(V(lerp(-0.04, 0.04, easeInOut(prog)), 0, 0));
    if (move === 'crash') pos.addScaledVector(dir, 0.28 * easeOutBack(clamp(lt / 0.3)));
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
        talk: b.speaker === id ? this.talkAmount(b, t) : 0,
        look: this.resolveLook(this.defaultLook(b, id), id),
      });
    }
  }

  drawCaption(b, lt) {
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

  drawTitle(text, lt, dur) {
    const ctx = this.ctx2d, W = this.W, H = this.H, s = W / 720;
    const a = clamp(lt / 0.3) * clamp((dur - lt) / 0.3);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `800 ${Math.round(46 * s)}px Inter, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 18 * s;
    ctx.fillStyle = '#fff';
    ctx.fillText(text, W / 2, H * 0.2 - (1 - a) * 10);
    ctx.restore();
  }
}

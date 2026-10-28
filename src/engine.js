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
import { OfficeSet, TIMES, lerpTime } from './set.js';
import { Girl, Cube, EXPRESSIONS, blendExpr } from './characters.js';
import { clamp, lerp, smooth, easeInOut, easeOutBack, noise } from './util.js';

// Final grade: whip-pan motion blur, vignette and film grain (in sRGB space).
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, seed: { value: 0 }, blur: { value: 0 }, blurDir: { value: 1 },
    vignette: { value: 0.32 }, grain: { value: 0.035 }, aspect: { value: 9 / 16 },
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

export class Engine {
  constructor(canvas) {
    this.out = canvas;
    this.ctx2d = canvas.getContext('2d');
  }

  async load(script, audio = {}) {
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
    renderer.toneMappingExposure = 1.0;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, W / H, 0.01, 120);
    this.set = new OfficeSet(this.scene);
    const chars = script.characters || {};
    this.girl = new Girl(chars.girl || {});
    this.cube = new Cube(chars.cube || {});
    this.scene.add(this.girl.root, this.cube.root);

    const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: script.msaa ?? 4 });
    const composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 1, aperture: 0.012, maxblur: 0.01 });
    composer.addPass(this.bokeh);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.35, 0.6, 0.9);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.aspect.value = W / H;
    composer.addPass(this.grade);
    this.composer = composer;

    if (document.fonts) {
      await Promise.all(['600', '700', '800'].map((w) => document.fonts.load(`${w} 32px Inter`)));
    }
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
    const carry = {
      girl: { expr: 'neutral', action: 'idle' },
      cube: { expr: 'neutral', action: 'idle' },
      time: script.time || 'dusk', screen: { mode: 'code' },
    };
    this.beats = script.beats.map((src, i) => {
      const b = { ...src, index: i };
      const words = (b.text || '').trim().split(/\s+/).filter(Boolean).length;
      const a = audio[i];
      b.speechDur = a ? a.duration : words ? 0.35 + words * 0.3 : 0;
      b.duration = b.duration ?? Math.max(1.2, b.speechDur + (b.pad ?? 0.45));
      b.start = t;
      t += b.duration;
      b.env = a?.env || null;
      for (const who of ['girl', 'cube']) {
        const st = { ...carry[who], look: null };
        if (src[who]) Object.assign(st, src[who]);
        if (b.speaker === who) {
          if (b.expr) st.expr = b.expr;
          if (b.action) st.action = b.action;
          if (b.look) st.look = b.look;
        }
        carry[who] = { expr: st.expr, action: st.action };
        b[who] = st;
      }
      if (b.time) carry.time = b.time;
      b.timeName = carry.time;
      if (b.screen) carry.screen = b.screen;
      b.screenState = carry.screen;
      b.shot = b.shot || (b.speaker === 'cube' ? 'cube' : b.speaker === 'girl' ? 'girl' : 'wide');
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
    if (b.env) {
      const f = Math.floor(lt * this.fps);
      return clamp((b.env[Math.min(b.env.length - 1, f)] || 0) * 1.4);
    }
    const syl = Math.max(0, Math.sin(lt * Math.PI * 2 * 4.2 + noise(lt * 3, b.index) * 1.5));
    const env = smooth(lt / 0.08) * smooth((b.speechDur - lt) / 0.1);
    return syl * env * (0.6 + 0.4 * noise(lt * 5, b.index + 3));
  }

  resolveLook(name, who) {
    switch (name) {
      case 'camera': return this.camera.position.clone();
      case 'cube': return this.cube.focusPoint;
      case 'girl': return this.girl.focusPoint;
      case 'screen': return this.set.anchors.screen.clone();
      case 'keyboard': return this.set.anchors.keyboard.clone();
      case 'phone': return this.girl.phone.getWorldPosition(new THREE.Vector3());
      case 'down': return (who === 'girl' ? this.girl.focusPoint : this.cube.focusPoint).add(new THREE.Vector3(0, -1, 0.6));
      default: return null;
    }
  }

  // ---- camera shots ------------------------------------------------------
  shot(name, b, lt) {
    const g = this.girl.focusPoint, c = this.cube.focusPoint;
    const prog = clamp(lt / Math.max(0.5, b.duration));
    let pos, target, fov, focusOn, aperture = 0.014;
    const around = (yaw, dist, up) => c.clone()
      .addScaledVector(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), dist)
      .add(new THREE.Vector3(0, up, 0));
    switch (name) {
      case 'girl':
      default:
        pos = new THREE.Vector3(0.03, 1.13, 0.72); target = g.clone().add(new THREE.Vector3(0, -0.075, 0)); fov = 31; focusOn = g;
        break;
      case 'girlClose':
        pos = new THREE.Vector3(0.0, 1.21, -0.14); target = g.clone().add(new THREE.Vector3(0, -0.05, 0)); fov = 50; focusOn = g;
        break;
      case 'girlMedium':
        pos = new THREE.Vector3(0.05, 1.32, 1.15); target = new THREE.Vector3(0, 1.08, -0.6); fov = 32; focusOn = g; aperture = 0.009;
        break;
      case 'cube':
        // From beside the girl's right shoulder: a POV across the desk.
        pos = around(this.cube.baseYaw - 0.42, 1.0, 0.3);
        target = c.clone().add(new THREE.Vector3(0, -0.03, 0)); fov = 30; focusOn = c; aperture = 0.022;
        break;
      case 'cubeClose':
        pos = around(this.cube.baseYaw - 0.3, 0.68, 0.14);
        target = c.clone(); fov = 30; focusOn = c; aperture = 0.026;
        break;
      case 'screen':
        pos = new THREE.Vector3(-0.03, 0.93, -0.47); target = this.set.anchors.screen.clone().add(new THREE.Vector3(0, -0.02, 0)); fov = 42;
        focusOn = this.set.anchors.screen; aperture = 0.01;
        break;
      case 'overShoulder':
        pos = new THREE.Vector3(0.24, 1.2, -0.95); target = this.set.anchors.screen.clone(); fov = 34; focusOn = this.set.anchors.screen;
        break;
      case 'wide':
        pos = new THREE.Vector3(1.55, 1.95, 2.35); target = new THREE.Vector3(0.05, 0.98, -0.45); fov = 38; focusOn = g; aperture = 0.004;
        break;
      case 'wideFront':
        pos = new THREE.Vector3(0.0, 1.45, 2.4); target = new THREE.Vector3(0.0, 1.15, -0.5); fov = 40; focusOn = g; aperture = 0.004;
        break;
      case 'two':
        pos = new THREE.Vector3(0.55, 1.3, 0.95); target = new THREE.Vector3(0.22, 1.0, -0.4); fov = 36; focusOn = g.clone().lerp(c, 0.5); aperture = 0.008;
        break;
    }
    // Camera moves
    const move = b.move || 'push';
    const dir = new THREE.Vector3().subVectors(target, pos);
    if (move === 'push') pos.addScaledVector(dir, 0.06 * easeInOut(prog));
    if (move === 'pull') pos.addScaledVector(dir, -0.08 * easeInOut(prog));
    if (move === 'drift') pos.add(new THREE.Vector3(lerp(-0.04, 0.04, easeInOut(prog)), 0, 0));
    if (move === 'crash') pos.addScaledVector(dir, 0.28 * easeOutBack(clamp(lt / 0.3))); // snap zoom in
    // Handheld wobble
    const hs = b.handheld ?? 1;
    const T = this.tGlobal;
    target.add(new THREE.Vector3(noise(T * 0.7, 31) * 0.006 * hs, noise(T * 0.6, 32) * 0.005 * hs, 0));
    pos.add(new THREE.Vector3(noise(T * 0.4, 33) * 0.006 * hs, noise(T * 0.5, 34) * 0.004 * hs, 0));
    return { pos, target, fov: b.fov || fov, focus: pos.distanceTo(focusOn), aperture: b.aperture ?? aperture };
  }

  frame(t) {
    this.tGlobal = t;
    const i = this.beatAt(t);
    const b = this.beats[i];
    const prev = this.beats[i - 1] || b;
    const next = this.beats[i + 1];
    const lt = t - b.start;

    // Time of day (optional cross-fade over b.timeFade seconds)
    const tp = TIMES[b.timeName] || TIMES.dusk;
    let tod = tp;
    if (b.timeFade && prev.timeName !== b.timeName) tod = lerpTime(TIMES[prev.timeName] || tp, tp, smooth(lt / b.timeFade));
    this.set.applyTime(tod);
    this.renderer.toneMappingExposure = tod.exposure;

    this.set.screen.update(b.screenState, clamp(lt / b.duration), t);

    // Camera is solved twice: once so characters can look at it, then again
    // after they've moved so framing/focus use this frame's poses.
    let cam = this.shot(b.shot, b, lt);
    let whip = 0, yawOff = 0;
    if (b.transition === 'whip' && lt < WHIP && i > 0) {
      const k = lt / WHIP;
      yawOff = -(1 - easeInOut(0.5 + k * 0.5)) * 1.2;
      whip = 1 - k;
    } else if (next && next.transition === 'whip' && next.start - t < WHIP) {
      const k = 1 - (next.start - t) / WHIP;
      yawOff = easeInOut(k * 0.5) * 1.2;
      whip = k;
    }
    this.camera.position.copy(cam.pos);
    this.camera.fov = cam.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(cam.target);
    if (yawOff) this.camera.rotateY(yawOff);

    // Characters
    for (const who of ['girl', 'cube']) {
      const st = b[who], pst = prev[who];
      const ea = EXPRESSIONS[pst.expr] || EXPRESSIONS.neutral;
      const eb = EXPRESSIONS[st.expr] || EXPRESSIONS.neutral;
      let lookName = st.look;
      if (!lookName) {
        if (who === 'girl') lookName = b.speaker === 'cube' ? 'cube' : st.action === 'typing' ? 'screen' : st.action === 'phone' ? 'phone' : 'camera';
        else lookName = b.speaker ? 'girl' : 'camera';
      }
      const changed = pst.action !== st.action;
      const state = {
        expr: i === 0 ? eb : blendExpr(ea, eb, clamp(lt / 0.2)),
        action: st.action,
        prevAction: i === 0 ? st.action : pst.action,
        actionBlend: i === 0 || !changed ? 1 : clamp(lt / 0.35),
        talk: b.speaker === who ? this.talkAmount(b, t) : 0,
        look: this.resolveLook(lookName, who),
      };
      (who === 'girl' ? this.girl : this.cube).update(t, state);
    }
    cam = this.shot(b.shot, b, lt);
    this.camera.position.copy(cam.pos);
    this.camera.lookAt(cam.target);
    if (yawOff) this.camera.rotateY(yawOff);

    this.bokeh.uniforms.focus.value = cam.focus;
    this.bokeh.uniforms.aperture.value = cam.aperture;
    this.bokeh.uniforms.maxblur.value = 0.01;
    this.grade.uniforms.blur.value = whip * 0.06;
    this.grade.uniforms.seed.value = Math.floor(t * this.fps);
    this.composer.render();

    // Composite + captions
    const ctx = this.ctx2d;
    ctx.drawImage(this.renderer.domElement, 0, 0, this.W, this.H);
    if (b.text && this.script.captions !== false) this.drawCaption(b, lt);
    if (b.title) this.drawTitle(b.title, lt, b.duration);
    return i;
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

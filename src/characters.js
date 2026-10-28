// Characters: a stylized "clay doll" girl and a boxy terracotta buddy.
// Both are built from primitives and drive their faces with live canvas
// textures, so expressions, blinks and lip-sync are just 2D drawing.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, lerp, smooth, noise, rand, solveElbow, placeSegment, stripeTexture, clay, canvasTexture } from './util.js';

// ---------------------------------------------------------------------------
// Expressions: small parameter sets that the face painters understand.
// ---------------------------------------------------------------------------
export const EXPRESSIONS = {
  neutral:  { brow: 0,    browY: 0,    browAsym: 0, open: 1,    happyEyes: 0, smile: 0.25, mouthW: 1,   o: 0,    blush: 0.55, pupil: 1 },
  happy:    { brow: 0.15, browY: 0.15, browAsym: 0, open: 0.92, happyEyes: 0, smile: 1,    mouthW: 1.2, o: 0,    blush: 0.8,  pupil: 1 },
  joy:      { brow: 0.2,  browY: 0.25, browAsym: 0, open: 1,    happyEyes: 1, smile: 1,    mouthW: 1.3, o: 0.35, blush: 0.95, pupil: 1 },
  worried:  { brow: 1,    browY: 0.1,  browAsym: 0, open: 0.95, happyEyes: 0, smile: -0.6, mouthW: 0.9, o: 0,    blush: 0.4,  pupil: 0.95 },
  sad:      { brow: 1,    browY: -0.1, browAsym: 0, open: 0.7,  happyEyes: 0, smile: -0.9, mouthW: 0.8, o: 0,    blush: 0.3,  pupil: 1 },
  smug:     { brow: -0.2, browY: 0,    browAsym: 1, open: 0.62, happyEyes: 0, smile: 0.75, mouthW: 1,   o: 0,    blush: 0.6,  pupil: 1 },
  skeptical:{ brow: -0.3, browY: 0,    browAsym: 1, open: 0.72, happyEyes: 0, smile: -0.2, mouthW: 0.8, o: 0,    blush: 0.45, pupil: 1 },
  annoyed:  { brow: -0.9, browY: -0.1, browAsym: 0, open: 0.55, happyEyes: 0, smile: -0.4, mouthW: 0.9, o: 0,    blush: 0.5,  pupil: 1 },
  shocked:  { brow: 0.5,  browY: 0.6,  browAsym: 0, open: 1.15, happyEyes: 0, smile: 0,    mouthW: 0.8, o: 0.75, blush: 0.7,  pupil: 0.7 },
  sleepy:   { brow: 0.2,  browY: -0.1, browAsym: 0, open: 0,    happyEyes: 0, smile: 0.1,  mouthW: 0.8, o: 0.1,  blush: 0.5,  pupil: 1 },
  determined:{ brow: -0.6,browY: 0,    browAsym: 0, open: 0.85, happyEyes: 0, smile: 0.4,  mouthW: 1.1, o: 0,    blush: 0.6,  pupil: 1 },
};

export function blendExpr(a, b, k) {
  const out = {};
  for (const key of Object.keys(a)) out[key] = lerp(a[key], b[key], k);
  return out;
}

// Deterministic blinking: one blink every ~2.5-5 s.
export function blinkAmount(t, seed) {
  let start = 0.6 + rand(0, seed) * 2;
  for (let i = 1; start < t + 1; i++) {
    const d = t - start;
    if (d >= 0 && d < 0.16) return Math.sin((d / 0.16) * Math.PI);
    start += 2.5 + rand(i, seed) * 2.5;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Face painting for the girl (equirectangular texture wrapped on the head).
// ---------------------------------------------------------------------------
const FACE_W = 2048, FACE_H = 1024, PX = FACE_W / 360; // px per degree
const SKIN = '#f3c6aa';

function drawGirlFace(ctx, e) {
  ctx.fillStyle = SKIN;
  ctx.fillRect(0, 0, FACE_W, FACE_H);
  const at = (lon, lat, fn) => {
    ctx.save();
    ctx.translate(FACE_W * 0.25 + lon * PX, FACE_H * 0.5 - lat * PX);
    ctx.scale(1 / Math.cos((lat * Math.PI) / 180), 1);
    fn();
    ctx.restore();
  };

  // Blush
  for (const s of [-1, 1]) {
    at(s * 34, -20, () => {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 52);
      g.addColorStop(0, `rgba(240,120,120,${0.55 * e.blush})`);
      g.addColorStop(1, 'rgba(240,120,120,0)');
      ctx.fillStyle = g;
      ctx.scale(1.35, 1);
      ctx.beginPath(); ctx.arc(0, 0, 52, 0, Math.PI * 2); ctx.fill();
    });
  }

  // Eyes
  const ew = 17 * PX, eh = 19 * PX;
  for (const s of [-1, 1]) {
    at(s * 19.5, -7, () => {
      const open = clamp(e.open * (1 - e.blink), 0, 1.2) * (1 - e.happyEyes);
      ctx.lineCap = 'round';
      if (e.happyEyes > 0.5) {
        ctx.strokeStyle = '#3b2216'; ctx.lineWidth = 9;
        ctx.beginPath(); ctx.arc(0, eh * 0.18, ew * 0.42, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        return;
      }
      const h = eh * open;
      if (h < 10) {
        ctx.strokeStyle = '#3b2216'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(0, -eh * 0.25, ew * 0.48, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
        // lashes
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(s * ew * 0.42, eh * 0.05); ctx.lineTo(s * ew * 0.58, eh * 0.12); ctx.stroke();
        return;
      }
      const top = -h * 0.5 + eh * 0.08, bottom = eh * 0.5;
      // eye shape: flat-ish top, round bottom
      const shape = () => {
        ctx.beginPath();
        ctx.moveTo(-ew * 0.5, eh * 0.05);
        ctx.bezierCurveTo(-ew * 0.45, top, ew * 0.45, top, ew * 0.5, eh * 0.05);
        ctx.bezierCurveTo(ew * 0.5, bottom, -ew * 0.5, bottom, -ew * 0.5, eh * 0.05);
        ctx.closePath();
      };
      ctx.save();
      shape(); ctx.fillStyle = '#fdf8f4'; ctx.fill(); ctx.clip();
      const ix = e.lookX * ew * 0.2, iy = eh * 0.08 - e.lookY * eh * 0.12;
      const ir = ew * 0.37;
      const g = ctx.createLinearGradient(0, iy - ir, 0, iy + ir);
      g.addColorStop(0, '#3a1f12'); g.addColorStop(0.55, '#7a4220'); g.addColorStop(1, '#d08a45');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(ix, iy, ir, ir * 1.12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1d0e08';
      ctx.beginPath(); ctx.ellipse(ix, iy, ir * 0.45 * e.pupil, ir * 0.52 * e.pupil, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.arc(ix - ir * 0.35, iy - ir * 0.4, ir * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ix + ir * 0.35, iy + ir * 0.45, ir * 0.13, 0, Math.PI * 2); ctx.fill();
      // eyelid shadow
      const sh = ctx.createLinearGradient(0, top, 0, top + eh * 0.3);
      sh.addColorStop(0, 'rgba(120,60,40,0.45)'); sh.addColorStop(1, 'rgba(120,60,40,0)');
      ctx.fillStyle = sh; ctx.fillRect(-ew, top, ew * 2, eh * 0.3);
      ctx.restore();
      // upper lash line with an outer flick
      ctx.strokeStyle = '#2b170e'; ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(-ew * 0.52, eh * 0.08);
      ctx.bezierCurveTo(-ew * 0.45, top - 2, ew * 0.45, top - 2, ew * 0.52, eh * 0.08);
      ctx.stroke();
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(s * ew * 0.48, eh * 0.0); ctx.lineTo(s * ew * 0.66, -eh * 0.08); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * ew * 0.42, -h * 0.25); ctx.lineTo(s * ew * 0.58, -h * 0.38); ctx.stroke();
      // lower lash hint
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(80,40,25,0.6)';
      ctx.beginPath(); ctx.arc(0, eh * 0.02, ew * 0.48, Math.PI * 0.25, Math.PI * 0.75); ctx.stroke();
    });
  }

  // Brows
  for (const s of [-1, 1]) {
    const asym = e.browAsym * (s > 0 ? 1 : -0.3);
    at(s * 20, 10.5 + e.browY * 3 + asym * 2.5, () => {
      ctx.strokeStyle = '#5a3020'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      const inner = -s * 50, outer = s * 50;
      const tilt = e.brow * 14;
      ctx.beginPath();
      ctx.moveTo(inner, -tilt);
      ctx.quadraticCurveTo(0, -12 - Math.abs(tilt) * 0.2, outer, tilt * 0.4 + 6);
      ctx.stroke();
    });
  }

  // Mouth
  at(0, -30, () => {
    const w = 30 * e.mouthW, o = clamp(e.o + e.talk * 0.85, 0, 1), sm = e.smile;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (o < 0.08) {
      ctx.strokeStyle = '#a2463e'; ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-w, -sm * 8);
      ctx.quadraticCurveTo(0, sm * 16, w, -sm * 8);
      ctx.stroke();
      return;
    }
    const h = 8 + o * 38;
    const ww = w * (1.05 - o * 0.35);
    ctx.fillStyle = '#7a2b2b';
    ctx.beginPath();
    ctx.moveTo(-ww, -sm * 6);
    ctx.quadraticCurveTo(0, -h * 0.25 + sm * 4, ww, -sm * 6);
    ctx.quadraticCurveTo(ww * 0.9, h, 0, h);
    ctx.quadraticCurveTo(-ww * 0.9, h, -ww, -sm * 6);
    ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#e07c7c';
    ctx.beginPath(); ctx.ellipse(0, h * 0.95, ww * 0.6, h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(-ww, -h * 0.25 - 4, ww * 2, 7 + o * 3);
    ctx.restore();
  });
}

// ---------------------------------------------------------------------------
// Hair locks: flattened tubes swept along a curve, lying on the head.
// ---------------------------------------------------------------------------
function sph(lon, lat, rf, R) {
  const a = (lon * Math.PI) / 180, b = (lat * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(b) * Math.sin(a), Math.sin(b), Math.cos(b) * Math.cos(a)).multiplyScalar(R * rf);
}

function lockGeometry(points, { width = 0.05, thick = 0.016, taper = 0.85, rootTaper = 0.15, segs = 48, ring = 14 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const pos = [], uv = [], idx = [];
  const frames = [];
  for (let i = 0; i <= segs; i++) {
    const s = i / segs;
    const c = curve.getPoint(s);
    const T = curve.getTangent(s).normalize();
    let n = c.clone();
    if (n.lengthSq() < 1e-8) n.set(0, 0, 1);
    n.normalize();
    n.sub(T.clone().multiplyScalar(n.dot(T))).normalize();
    const B = new THREE.Vector3().crossVectors(T, n).normalize();
    // width profile: swell from root, taper to a point at the tip
    const wp = (s < rootTaper ? lerp(0.55, 1, smooth(s / rootTaper)) : 1) * (s > taper ? Math.max(0.05, 1 - smooth((s - taper) / (1 - taper))) : 1);
    frames.push({ c, n, B, w: width * wp, th: thick * Math.max(0.3, wp) });
  }
  for (let i = 0; i <= segs; i++) {
    const f = frames[i];
    for (let j = 0; j <= ring; j++) {
      const a = (j / ring) * Math.PI * 2;
      const p = f.c.clone()
        .addScaledVector(f.B, Math.cos(a) * f.w)
        .addScaledVector(f.n, Math.sin(a) * f.th);
      pos.push(p.x, p.y, p.z);
      uv.push(i / segs, j / ring);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < ring; j++) {
    const a = i * (ring + 1) + j, b = a + ring + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
export class Girl {
  constructor(opts = {}) {
    this.name = 'girl';
    this.root = new THREE.Group();
    this.opts = {
      skin: SKIN, hair: opts.hair || '#7a4528', sweater: opts.sweater || '#9cb6e2',
      shirt: '#f3ebdd', pants: '#3b4256', ...opts,
    };
    this.R = 0.14; // head radius
    this.build();
    this.root.position.set(0, 0, -0.66);
  }

  build() {
    const o = this.opts;
    const skin = clay(o.skin, { sheen: 0.08, sheenColor: '#ffd9cc', roughness: 0.7 });
    const ribs = stripeTexture(32, true);
    ribs.repeat.set(3, 1);
    const sweater = clay(o.sweater, { sheen: 0.6, sheenColor: '#dfe9ff', extra: { bumpMap: ribs, bumpScale: 0.8 } });
    const sweaterRibs = ribs.clone(); sweaterRibs.repeat.set(2, 6); sweaterRibs.rotation = Math.PI / 2;
    const sleeve = clay(o.sweater, { sheen: 0.6, sheenColor: '#dfe9ff', extra: { bumpMap: sweaterRibs, bumpScale: 0.8 } });
    this.mats = { skin, sweater, sleeve };

    // Torso pivots at the hips so it can lean (e.g. falling asleep on the desk)
    this.torso = new THREE.Group();
    this.torso.position.set(0, 0.5, 0);
    this.root.add(this.torso);

    const profile = [
      [0.0, 0.0], [0.11, 0.0], [0.125, 0.06], [0.128, 0.16], [0.135, 0.28], [0.14, 0.36],
      [0.13, 0.43], [0.1, 0.48], [0.055, 0.515], [0.0, 0.525],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const torsoTex = canvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = o.sweater; ctx.fillRect(0, 0, w, h);
      // V-neck: front is u = 0.5; top of torso is canvas top
      ctx.fillStyle = '#6f8fc4';
      ctx.beginPath(); ctx.moveTo(w * 0.385, 0); ctx.lineTo(w * 0.5, h * 0.42); ctx.lineTo(w * 0.615, 0); ctx.fill();
      ctx.fillStyle = o.shirt;
      ctx.beginPath(); ctx.moveTo(w * 0.4, 0); ctx.lineTo(w * 0.5, h * 0.37); ctx.lineTo(w * 0.6, 0); ctx.fill();
      ctx.fillStyle = '#e8d9c4'; ctx.fillRect(w * 0.497, h * 0.08, 4, 14);
      // waistband
      ctx.fillStyle = '#88a6d6'; ctx.fillRect(0, h * 0.9, w, h * 0.1);
    });
    const torsoMat = clay('#ffffff', { sheen: 0.6, sheenColor: '#dfe9ff', extra: { map: torsoTex, bumpMap: ribs, bumpScale: 0.7 } });
    const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 48, Math.PI), torsoMat);
    torso.scale.set(1.22, 1, 0.8);
    torso.position.y = 0.04;
    torso.castShadow = true; torso.receiveShadow = true;
    this.torso.add(torso);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.12, 20), skin);
    neck.position.y = 0.56; this.torso.add(neck);
    const pendant = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), clay('#e7c27a', { roughness: 0.3 }));
    pendant.position.set(0, 0.445, 0.092); this.torso.add(pendant);

    // Head
    this.head = new THREE.Group();
    this.head.position.set(0, 0.73, 0.0);
    this.torso.add(this.head);
    this.headScale = new THREE.Group();
    this.headScale.scale.set(1.0, 1.04, 0.96);
    this.head.add(this.headScale);
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = FACE_W; this.faceCanvas.height = FACE_H;
    this.faceCtx = this.faceCanvas.getContext('2d');
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.faceTex.anisotropy = 8;
    const faceMat = clay('#ffffff', { sheen: 0.08, sheenColor: '#ffd9cc', roughness: 0.7, extra: { map: this.faceTex } });
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(this.R, 96, 64), faceMat);
    headMesh.castShadow = true;
    this.headScale.add(headMesh);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 12), skin);
    nose.position.copy(sph(0, -17, 0.99, this.R)); nose.scale.set(1, 0.8, 0.7);
    this.headScale.add(nose);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), skin);
      ear.position.copy(sph(s * 88, -8, 0.97, this.R)); ear.scale.set(0.5, 1, 0.8);
      this.headScale.add(ear);
    }
    this.buildHair();

    // Arms (IK-driven, live in root space)
    const seg = (r, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, 1, 24, 1), mat); m.castShadow = true; this.root.add(m); return m; };
    const ball = (r, mat) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat); m.castShadow = true; this.root.add(m); return m; };
    this.arms = [-1, 1].map((side) => ({
      side,
      shoulder: ball(0.058, sweater),
      upper: seg(0.044, sleeve),
      elbow: ball(0.044, sleeve),
      fore: seg(0.038, sleeve),
      cuff: (() => { const m = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 12, 28), clay('#7d9bd0')); m.castShadow = true; this.root.add(m); return m; })(),
      wrist: ball(0.016, skin),
      hand: ball(0.03, skin),
      thumb: ball(0.012, skin),
    }));

    // Legs (seated)
    const pants = clay(o.pants, { sheen: 0.3 });
    for (const s of [-1, 1]) {
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.3, 6, 16), pants);
      thigh.rotation.x = Math.PI / 2; thigh.position.set(s * 0.08, 0.52, 0.17); thigh.castShadow = true;
      this.root.add(thigh);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.38, 6, 16), pants);
      shin.position.set(s * 0.08, 0.28, 0.36); shin.castShadow = true;
      this.root.add(shin);
      const shoe = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.06, 0.16, 3, 0.025), clay('#efe9e0'));
      shoe.position.set(s * 0.08, 0.03, 0.4); shoe.castShadow = true;
      this.root.add(shoe);
    }

    // Phone prop (shown for the "phone" action)
    this.phone = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.15, 0.009, 3, 0.004), clay('#1d1e22', { roughness: 0.25 }));
    this.phone.castShadow = true;
    this.root.add(this.phone);
  }

  buildHair() {
    const R = this.R;
    const tex = stripeTexture(36, false);
    tex.repeat.set(1, 1);
    const hairColor = new THREE.Color(this.opts.hair);
    const mat = clay(hairColor, { roughness: 0.55, sheen: 0.8, sheenColor: '#d79a6a', extra: { bumpMap: tex, bumpScale: 0.9 } });
    this.hairMat = mat;
    const hair = new THREE.Group();
    this.headScale.add(hair);
    const add = (g) => { const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; hair.add(m); };

    // Scalp: top cap + back half
    const capTex = stripeTexture(60, true);
    const capMat = mat.clone(); capMat.bumpMap = capTex;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.045, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.33), capMat);
    cap.castShadow = true; hair.add(cap);
    const back = new THREE.Mesh(new THREE.SphereGeometry(R * 1.04, 64, 48, Math.PI - 0.45, Math.PI + 0.9, 0, Math.PI * 0.78), capMat);
    back.castShadow = true; hair.add(back);

    const P = (lon, lat, rf) => sph(lon, lat, rf, R);
    const V = (x, y, z) => new THREE.Vector3(x * R, y * R, z * R);

    // Big side-swept fringe (her right -> our left)
    add(lockGeometry([P(12, 86, 1.06), P(-4, 70, 1.12), P(-22, 50, 1.15), P(-40, 30, 1.15), P(-55, 8, 1.12), P(-62, -18, 1.1), P(-63, -40, 1.08)], { width: R * 0.42, thick: R * 0.16, taper: 0.7 }));
    add(lockGeometry([P(12, 86, 1.06), P(8, 66, 1.12), P(-8, 46, 1.14), P(-26, 30, 1.13), P(-40, 18, 1.1)], { width: R * 0.3, thick: R * 0.12, taper: 0.55 }));
    add(lockGeometry([P(14, 86, 1.06), P(20, 64, 1.12), P(26, 44, 1.13), P(30, 30, 1.11)], { width: R * 0.24, thick: R * 0.1, taper: 0.5 }));
    add(lockGeometry([P(16, 86, 1.06), P(32, 66, 1.11), P(48, 44, 1.13), P(60, 18, 1.12), P(66, -12, 1.1), P(66, -40, 1.08)], { width: R * 0.36, thick: R * 0.14, taper: 0.7 }));
    // Volume on top
    add(lockGeometry([P(12, 86, 1.06), P(-30, 76, 1.12), P(-70, 55, 1.12), P(-86, 30, 1.1)], { width: R * 0.5, thick: R * 0.16, taper: 0.8 }));
    add(lockGeometry([P(16, 86, 1.06), P(60, 74, 1.12), P(82, 50, 1.1), P(90, 25, 1.08)], { width: R * 0.5, thick: R * 0.16, taper: 0.8 }));

    // Long side curtains falling in front of the shoulders
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const zf = 0.38 + k * 0.17, xo = 0.9 + k * 0.06;
        add(lockGeometry([
          P(s * (72 - k * 6), 30, 1.08), P(s * (80 - k * 4), 0, 1.13),
          V(s * xo, -0.75, zf + 0.05), V(s * (xo + 0.05), -1.5, zf + 0.12),
          V(s * (xo + 0.02), -2.3, zf + 0.3), V(s * (xo - 0.05), -3.0, zf + 0.32), V(s * (xo - 0.12), -3.35, zf + 0.25),
        ], { width: R * (0.26 - k * 0.03), thick: R * 0.1, taper: 0.82, rootTaper: 0.1 }));
      }
      // behind the shoulders
      for (let k = 0; k < 3; k++) {
        add(lockGeometry([
          P(s * (100 + k * 18), 35, 1.06), P(s * (105 + k * 20), 0, 1.1),
          V(s * (1.0 - k * 0.15), -1.2, -0.45 - k * 0.15), V(s * (1.05 - k * 0.2), -2.4, -0.6 - k * 0.15), V(s * (0.95 - k * 0.2), -3.3, -0.55 - k * 0.15),
        ], { width: R * 0.34, thick: R * 0.12, taper: 0.85 }));
      }
    }
    // Back mass
    for (let k = -2; k <= 2; k++) {
      add(lockGeometry([
        P(180 + k * 18, 50, 1.06), P(180 + k * 20, 0, 1.12),
        V(k * 0.35, -1.2, -1.15), V(k * 0.4, -2.4, -1.1), V(k * 0.35, -3.3, -0.95),
      ], { width: R * 0.36, thick: R * 0.14, taper: 0.85 }));
    }
  }

  shoulderLocal(side) {
    const p = new THREE.Vector3(side * 0.17, 0.43, -0.005);
    this.torso.updateMatrixWorld(true);
    return this.root.worldToLocal(this.torso.localToWorld(p));
  }

  // Hand targets & body offsets for each action, in the girl's local space.
  pose(action, t, talk) {
    const tap = (ph) => Math.max(0, Math.sin(t * 22 + ph)) * 0.012;
    const P = (x, y, z) => new THREE.Vector3(x, y, z);
    const p = { lean: 0, twist: 0, yaw: 0, pitch: 0, roll: 0, shrug: 0, L: P(-0.13, 0.765, 0.3), R: P(0.13, 0.765, 0.3), phone: false, lookOverride: null };
    switch (action) {
      case 'typing':
        p.L = P(-0.075 + noise(t * 3, 1) * 0.02, 0.775 + tap(0), 0.42 + noise(t * 2, 2) * 0.015);
        p.R = P(0.055 + noise(t * 3, 3) * 0.02, 0.775 + tap(1.7), 0.42 + noise(t * 2, 4) * 0.015);
        p.pitch = 0.12; p.lean = 0.05;
        break;
      case 'phone':
        p.L = P(-0.04, 0.86, 0.22); p.R = P(0.04, 0.86, 0.22); p.phone = true; p.pitch = 0.18; p.lean = 0.05;
        break;
      case 'cheeks':
        p.L = P(-0.088, 1.17, 0.135); p.R = P(0.088, 1.17, 0.135); p.pitch = -0.04; p.roll = Math.sin(t * 3) * 0.05;
        break;
      case 'shrug': {
        const k = 0.5 + 0.5 * Math.sin(t * 2.2);
        p.L = P(-0.3, 0.9 + k * 0.04, 0.2); p.R = P(0.3, 0.9 + k * 0.04, 0.2); p.shrug = 0.025 + 0.015 * k; p.roll = 0.1;
        break;
      }
      case 'point':
        p.R = P(0.3, 0.98, 0.42); p.twist = -0.15; p.yaw = 0.0;
        break;
      case 'celebrate':
        p.L = P(-0.27, 1.5 + Math.sin(t * 9) * 0.04, 0.06); p.R = P(0.27, 1.5 + Math.sin(t * 9 + 1) * 0.04, 0.06);
        p.lean = -0.05; p.roll = Math.sin(t * 4.5) * 0.08;
        break;
      case 'facepalm':
        p.R = P(0.02, 1.33, 0.13); p.pitch = 0.25; p.lean = 0.08;
        break;
      case 'think':
        p.R = P(0.03, 1.12, 0.12); p.roll = -0.12; p.pitch = -0.1; p.yaw = 0.15;
        break;
      case 'wave':
        p.R = P(0.26 + Math.sin(t * 9) * 0.05, 1.32, 0.12);
        break;
      case 'sleep':
        p.lean = 0.78; p.pitch = 0.35; p.roll = 0.35; p.yaw = 0.2;
        p.L = P(-0.16, 0.775, 0.36); p.R = P(0.1, 0.775, 0.38);
        break;
      case 'lookDown':
        p.pitch = 0.35;
        break;
      case 'lean':
        p.lean = 0.14; p.L = P(-0.12, 0.765, 0.36); p.R = P(0.12, 0.765, 0.36);
        break;
    }
    return p;
  }

  update(t, s, camera) {
    const pa = this.pose(s.prevAction || 'idle', t, s.talk);
    const pb = this.pose(s.action || 'idle', t, s.talk);
    const k = smooth(s.actionBlend ?? 1);
    const mix = (a, b) => lerp(a, b, k);
    const pose = {
      lean: mix(pa.lean, pb.lean), twist: mix(pa.twist, pb.twist), yaw: mix(pa.yaw, pb.yaw),
      pitch: mix(pa.pitch, pb.pitch), roll: mix(pa.roll, pb.roll), shrug: mix(pa.shrug, pb.shrug),
      L: pa.L.clone().lerp(pb.L, k), R: pa.R.clone().lerp(pb.R, k),
      phone: k > 0.5 ? pb.phone : pa.phone,
    };
    const asleep = (s.action === 'sleep' ? k : 0) + (s.prevAction === 'sleep' ? 1 - k : 0);

    // Breathing + idle sway
    const breath = Math.sin(t * 1.6) * (asleep > 0.5 ? 0.012 : 0.006);
    this.torso.rotation.set(pose.lean + breath + noise(t * 0.5, 7) * 0.015, pose.twist + noise(t * 0.4, 8) * 0.02, noise(t * 0.45, 9) * 0.015);
    this.torso.scale.setScalar(1 + breath * 0.3);

    // Head: look at target (world) with limits, then add pose offsets.
    this.root.updateMatrixWorld(true);
    let yaw = 0, pitch = 0;
    if (s.look && asleep < 0.5) {
      const headW = this.head.getWorldPosition(new THREE.Vector3());
      const target = s.look.clone();
      const local = this.root.worldToLocal(target).sub(this.root.worldToLocal(headW.clone()));
      yaw = clamp(Math.atan2(local.x, local.z), -0.7, 0.7);
      pitch = clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.4, 0.45);
    }
    const nod = s.talk * 0.05 * Math.sin(t * 7);
    this.head.rotation.set(
      lerp(pitch * 0.85, 0, asleep) + pose.pitch + nod + noise(t * 0.7, 1) * 0.03 - pose.lean * 0.6,
      lerp(yaw * 0.75, 0, asleep) + pose.yaw + noise(t * 0.5, 2) * 0.04,
      pose.roll + noise(t * 0.6, 3) * 0.03,
      'YXZ',
    );
    const shrugY = pose.shrug;

    // Eyes follow the remaining angle
    const eyeX = clamp((yaw - yaw * 0.75) * 4 + noise(t * 0.9, 11) * 0.12, -1, 1);
    const eyeY = clamp(-(pitch - pitch * 0.85) * 6 - (pitch > 0.2 ? 0.3 : 0), -1, 1);

    // Arms
    for (const arm of this.arms) {
      const S = this.shoulderLocal(arm.side); S.y += shrugY;
      const target = arm.side < 0 ? pose.L : pose.R;
      const pole = S.clone().add(new THREE.Vector3(arm.side * 0.45, -0.35, -0.25));
      const E = solveElbow(S, target, 0.27, 0.27, pole);
      const dirF = new THREE.Vector3().subVectors(target, E).normalize();
      const W = target.clone().addScaledVector(dirF, -0.035);
      arm.shoulder.position.copy(S);
      placeSegment(arm.upper, S, E);
      arm.elbow.position.copy(E);
      placeSegment(arm.fore, E, W);
      arm.cuff.position.copy(W);
      arm.cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dirF);
      arm.wrist.position.copy(W);
      arm.hand.position.copy(target);
      arm.hand.scale.set(1, 0.85, 1.1);
      arm.thumb.position.copy(target).add(new THREE.Vector3(-arm.side * 0.022, 0.012, -0.005));
    }

    // Phone prop
    this.phone.visible = pose.phone;
    if (pose.phone) {
      this.phone.position.copy(pose.L).lerp(pose.R, 0.5).add(new THREE.Vector3(0, 0.045, 0.015));
      this.phone.rotation.set(-0.75, Math.PI, 0);
    }

    // Face
    const e = { ...s.expr, blink: Math.max(blinkAmount(t, 1), asleep > 0.5 ? 1 : 0), talk: s.talk, lookX: eyeX, lookY: eyeY };
    const key = Object.values(e).map((v) => (typeof v === 'number' ? v.toFixed(2) : v)).join(',');
    if (key !== this.faceKey) {
      this.faceKey = key;
      drawGirlFace(this.faceCtx, e);
      this.faceTex.needsUpdate = true;
    }
  }

  get focusPoint() {
    const p = this.head.getWorldPosition(new THREE.Vector3());
    return p.add(new THREE.Vector3(0, -0.02, 0.1));
  }
}

// ---------------------------------------------------------------------------
// The cube buddy
// ---------------------------------------------------------------------------
function drawCubeFace(ctx, e) {
  const W = 512, H = 512;
  ctx.clearRect(0, 0, W, H);
  const open = clamp(e.open * (1 - e.blink), 0, 1.2);
  for (const s of [-1, 1]) {
    const cx = W / 2 + s * W * 0.22 + e.lookX * 14, cy = H * 0.4 - e.lookY * 10;
    ctx.fillStyle = '#16120f';
    ctx.strokeStyle = '#16120f'; ctx.lineCap = 'round';
    if (e.happyEyes > 0.5) {
      ctx.lineWidth = 22;
      ctx.beginPath(); ctx.moveTo(cx - 26, cy + 14); ctx.lineTo(cx, cy - 14); ctx.lineTo(cx + 26, cy + 14); ctx.stroke();
      continue;
    }
    const h = 120 * open, w = 64 * (e.shocked ? 1.15 : 1);
    if (h < 12) {
      ctx.lineWidth = 16;
      ctx.beginPath(); ctx.moveTo(cx - 24, cy + 8); ctx.lineTo(cx + 24, cy + 8); ctx.stroke();
    } else {
      // Brows/lids cut the top of the eye for annoyed/worried looks
      ctx.save();
      ctx.beginPath();
      const lid = e.brow * 26 * -s;
      ctx.moveTo(cx - 60, cy - h / 2 - 20 + (e.brow < 0 ? -lid : 0) + (e.brow > 0 ? lid : 0));
      ctx.lineTo(cx + 60, cy - h / 2 - 20 - (e.brow < 0 ? -lid : 0) - (e.brow > 0 ? lid : 0));
      ctx.lineTo(cx + 60, cy + 200); ctx.lineTo(cx - 60, cy + 200); ctx.closePath();
      if (Math.abs(e.brow) > 0.3) {
        ctx.translate(0, Math.abs(e.brow) * 22);
      }
      ctx.clip();
      ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 12); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - w / 2 + 12, cy - h / 2 + 13 + (Math.abs(e.brow) > 0.3 ? Math.abs(e.brow) * 22 : 0), 20, 20);
    }
  }
  // Mouth
  const o = clamp(e.o + e.talk * 0.9, 0, 1);
  const mx = W / 2 + e.lookX * 8, my = H * 0.66;
  ctx.fillStyle = '#16120f'; ctx.strokeStyle = '#16120f'; ctx.lineCap = 'round';
  if (o > 0.08) {
    ctx.beginPath(); ctx.ellipse(mx, my, 20 + o * 12, 12 + o * 32, 0, 0, Math.PI * 2); ctx.fill();
  } else if (Math.abs(e.smile) > 0.3) {
    ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(mx - 28, my - e.smile * 8); ctx.quadraticCurveTo(mx, my + e.smile * 24, mx + 28, my - e.smile * 8); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(mx, my, 17, 0, Math.PI * 2); ctx.fill();
  }
  if (e.blush > 0.7) {
    ctx.fillStyle = `rgba(255,140,140,${(e.blush - 0.7) * 1.5})`;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(W / 2 + s * 150, my - 30, 34, 18, 0, 0, Math.PI * 2); ctx.fill(); }
  }
}

export class Cube {
  constructor(opts = {}) {
    this.name = 'cube';
    this.color = opts.color || '#e27d5e';
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const mat = clay(this.color, { sheen: 0.5, sheenColor: '#ffc9b0', roughness: 0.6 });
    const S = 0.15;
    this.size = S;
    const box = new THREE.Mesh(new RoundedBoxGeometry(S, S * 0.88, S * 0.86, 5, 0.018), mat);
    box.position.y = S * 0.44 + 0.022; box.castShadow = true; box.receiveShadow = true;
    this.body.add(box);
    this.box = box;
    for (const s of [-1, 1]) {
      const nub = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.036, 0.05, 3, 0.01), mat);
      nub.position.set(s * (S / 2 + 0.008), S * 0.34, 0.0); nub.castShadow = true;
      this.body.add(nub);
    }
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new RoundedBoxGeometry(0.022, 0.03, 0.022, 2, 0.005), mat);
      leg.position.set(x * S * 0.32, 0.013, z * S * 0.3); leg.castShadow = true;
      this.root.add(leg);
    }
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 512; this.faceCanvas.height = 512;
    this.faceCtx = this.faceCanvas.getContext('2d');
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(S * 0.9, S * 0.8), new THREE.MeshStandardMaterial({ map: this.faceTex, transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
    face.position.set(0, S * 0.44 + 0.022, S * 0.43 + 0.0008);
    this.body.add(face);
    this.root.position.set(0.36, 0.74, -0.03);
    this.baseYaw = -2.75;
    this.root.rotation.y = this.baseYaw;
  }

  actionOffsets(action, t) {
    const o = { y: 0, squash: 0, roll: 0, pitch: 0, yaw: 0 };
    switch (action) {
      case 'hop': {
        const ph = (t * 2.2) % 1;
        o.y = Math.sin(ph * Math.PI) * 0.05; o.squash = ph < 0.12 ? (0.12 - ph) * 1.4 : -Math.sin(ph * Math.PI) * 0.06;
        break;
      }
      case 'bounce': o.y = Math.abs(Math.sin(t * 6)) * 0.012; o.squash = -Math.abs(Math.sin(t * 6)) * 0.03; break;
      case 'wiggle': o.roll = Math.sin(t * 14) * 0.12; break;
      case 'lean': o.pitch = 0.18; o.y = 0.0; break;
      case 'nod': o.pitch = Math.max(0, Math.sin(t * 7)) * 0.2; break;
      case 'shake': o.yaw = Math.sin(t * 16) * 0.22; break;
      case 'spin': o.yaw = (t * 5) % (Math.PI * 2); break;
      case 'proud': o.pitch = -0.15; o.y = 0.01; break;
      case 'sleep': o.squash = Math.sin(t * 1.5) * 0.03; o.pitch = 0.1; break;
      case 'type': o.y = Math.abs(Math.sin(t * 16)) * 0.008; o.pitch = 0.12; break;
    }
    return o;
  }

  update(t, s) {
    const a = this.actionOffsets(s.prevAction || 'idle', t);
    const b = this.actionOffsets(s.action || 'idle', t);
    const k = smooth(s.actionBlend ?? 1);
    const m = (key) => lerp(a[key], b[key], k);
    const breath = Math.sin(t * 2.1) * 0.012;
    const talkBob = s.talk * 0.012;
    const squash = m('squash') + breath - talkBob * 0.5;
    this.body.position.y = m('y') + talkBob * 0.3;
    this.body.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
    let lookYaw = 0;
    if (s.look) {
      const local = s.look.clone().sub(this.root.position);
      let d = Math.atan2(local.x, local.z) - this.baseYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      lookYaw = clamp(d, -0.7, 0.7) * 0.6;
    }
    this.root.rotation.y = this.baseYaw + lookYaw + m('yaw') + noise(t * 0.5, 21) * 0.03;
    this.body.rotation.set(m('pitch') + noise(t * 0.6, 22) * 0.02, 0, m('roll') + noise(t * 0.7, 23) * 0.02);

    const asleep = s.action === 'sleep';
    const e = { ...s.expr, blink: asleep ? 1 : blinkAmount(t, 5), talk: s.talk, lookX: noise(t * 0.8, 24) * 0.4, lookY: 0, shocked: (s.expr.o || 0) > 0.5 };
    const key = Object.values(e).map((v) => (typeof v === 'number' ? v.toFixed(2) : v)).join(',');
    if (key !== this.faceKey) {
      this.faceKey = key;
      drawCubeFace(this.faceCtx, e);
      this.faceTex.needsUpdate = true;
    }
  }

  get focusPoint() {
    return this.box.getWorldPosition(new THREE.Vector3());
  }
}

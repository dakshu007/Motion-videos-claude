// A clay-doll human: lathe torso, IK arms, hair built from swept "locks",
// and a painted face. Hair style, outfit, colors and accessories are options.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, lerp, smooth, noise, solveElbow, placeSegment, stripeTexture, clay, canvasTexture, shade } from '../util.js';
import { drawHumanFace, blinkAmount, faceKey, FACE_W, FACE_H } from './faces.js';

function sph(lon, lat, rf, R) {
  const a = (lon * Math.PI) / 180, b = (lat * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(b) * Math.sin(a), Math.sin(b), Math.cos(b) * Math.cos(a)).multiplyScalar(R * rf);
}

// A flattened tube swept along a curve, lying on the head: one hair "lock".
function lockGeometry(points, { width = 0.05, thick = 0.016, taper = 0.85, rootTaper = 0.15, segs = 40, ring = 12 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const pos = [], uv = [], idx = [];
  const frames = [];
  for (let i = 0; i <= segs; i++) {
    const s = i / segs;
    const c = curve.getPoint(s);
    const T = curve.getTangent(s).normalize();
    const n = c.lengthSq() < 1e-8 ? new THREE.Vector3(0, 0, 1) : c.clone().normalize();
    n.sub(T.clone().multiplyScalar(n.dot(T))).normalize();
    const B = new THREE.Vector3().crossVectors(T, n).normalize();
    const wp = (s < rootTaper ? lerp(0.55, 1, smooth(s / rootTaper)) : 1) * (s > taper ? Math.max(0.05, 1 - smooth((s - taper) / (1 - taper))) : 1);
    frames.push({ c, n, B, w: width * wp, th: thick * Math.max(0.3, wp) });
  }
  for (let i = 0; i <= segs; i++) {
    const f = frames[i];
    for (let j = 0; j <= ring; j++) {
      const a = (j / ring) * Math.PI * 2;
      const p = f.c.clone().addScaledVector(f.B, Math.cos(a) * f.w).addScaledVector(f.n, Math.sin(a) * f.th);
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

function torsoTexture(o) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    // Front of the torso is u = 0.5; the top of the torso is the canvas top.
    ctx.fillStyle = o.top; ctx.fillRect(0, 0, w, h);
    const trim = shade(o.top, 0.78);
    if (o.outfit === 'sweater') {
      ctx.fillStyle = trim;
      ctx.beginPath(); ctx.moveTo(w * 0.385, 0); ctx.lineTo(w * 0.5, h * 0.42); ctx.lineTo(w * 0.615, 0); ctx.fill();
      ctx.fillStyle = o.shirt;
      ctx.beginPath(); ctx.moveTo(w * 0.4, 0); ctx.lineTo(w * 0.5, h * 0.37); ctx.lineTo(w * 0.6, 0); ctx.fill();
      ctx.fillStyle = trim; ctx.fillRect(0, h * 0.9, w, h * 0.1);
    } else if (o.outfit === 'hoodie') {
      ctx.fillStyle = trim; ctx.fillRect(0, h * 0.9, w, h * 0.1);
      ctx.beginPath(); ctx.roundRect(w * 0.4, h * 0.6, w * 0.2, h * 0.22, 14); ctx.fill();
      ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 5;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(w * (0.5 + s * 0.03), h * 0.04); ctx.lineTo(w * (0.5 + s * 0.035), h * 0.3); ctx.stroke(); }
    } else if (o.outfit === 'tee' || o.outfit === 'apron') {
      ctx.fillStyle = trim; ctx.fillRect(0, 0, w, h * 0.035);
      if (o.outfit === 'apron') {
        ctx.fillStyle = o.apron;
        ctx.beginPath(); ctx.roundRect(w * 0.37, h * 0.18, w * 0.26, h * 0.82, 10); ctx.fill();
        ctx.fillRect(w * 0.385, 0, w * 0.02, h * 0.2); ctx.fillRect(w * 0.595, 0, w * 0.02, h * 0.2);
        ctx.fillStyle = shade(o.apron, 0.85); ctx.fillRect(w * 0.42, h * 0.62, w * 0.16, h * 0.12);
        ctx.fillRect(0, h * 0.62, w, h * 0.025);
      }
    } else if (o.outfit === 'blazer') {
      ctx.fillStyle = o.shirt;
      ctx.beginPath(); ctx.moveTo(w * 0.36, 0); ctx.lineTo(w * 0.5, h * 0.62); ctx.lineTo(w * 0.64, 0); ctx.fill();
      ctx.fillStyle = trim;
      ctx.beginPath(); ctx.moveTo(w * 0.36, 0); ctx.lineTo(w * 0.47, h * 0.5); ctx.lineTo(w * 0.42, h * 0.2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(w * 0.64, 0); ctx.lineTo(w * 0.53, h * 0.5); ctx.lineTo(w * 0.58, h * 0.2); ctx.fill();
      ctx.fillStyle = '#222'; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(w * 0.5, h * (0.7 + i * 0.1), 6, 0, 7); ctx.fill(); }
    }
  });
}

export class Human {
  constructor(id, spec = {}, slot = {}) {
    this.id = id;
    this.kind = 'human';
    const hair = spec.hair || 'long';
    this.o = {
      skin: '#f3c6aa', hair, hairColor: '#7a4528', top: '#9cb6e2', outfit: 'sweater', pants: '#3b4256',
      shirt: '#f3ebdd', apron: '#3d5a4a', eyeColor: '#7a4220', lashes: hair !== 'short', accessories: [],
      accent: '#2a2b30', ...spec,
    };
    this.stance = slot.pose || 'sit';
    this.hy = this.stance === 'stand' ? 0.92 : 0.5;
    this.surface = slot.surface || null;
    this.root = new THREE.Group();
    this.R = 0.14;
    this.build();
    this.root.position.set(...(slot.pos || [0, 0, -0.66]));
    this.root.rotation.y = slot.yaw || 0;
    this.faceLook = {
      skin: this.o.skin, lashes: this.o.lashes, lashColor: '#2b170e',
      browColor: shade(this.o.hairColor, 0.75), browWidth: this.o.lashes ? 7 : 10,
      iris: this.o.eyeColor, irisDark: shade(this.o.eyeColor, 0.45), irisLight: shade(this.o.eyeColor, 1.7),
      lip: '#a2463e',
    };
  }

  build() {
    const o = this.o;
    const skin = clay(o.skin, { sheen: 0.08, sheenColor: '#ffd9cc', roughness: 0.7 });
    const ribs = stripeTexture(32, true); ribs.repeat.set(3, 1);
    const knit = o.outfit === 'sweater' || o.outfit === 'hoodie';
    const sleeveRibs = ribs.clone(); sleeveRibs.repeat.set(2, 6); sleeveRibs.rotation = Math.PI / 2;
    const cloth = (c, bump) => clay(c, { sheen: 0.6, sheenColor: '#ffffff', extra: knit && bump ? { bumpMap: bump, bumpScale: 0.8 } : {} });
    const sleeveColor = o.top;
    const sleeve = cloth(sleeveColor, sleeveRibs);
    const bare = o.outfit === 'tee' || o.outfit === 'apron';
    const fore = bare ? skin : sleeve;
    this.mats = { skin, sleeve };

    this.torso = new THREE.Group();
    this.torso.position.set(0, this.hy, 0);
    this.root.add(this.torso);
    const profile = [
      [0.0, 0.0], [0.11, 0.0], [0.125, 0.06], [0.128, 0.16], [0.135, 0.28], [0.14, 0.36],
      [0.13, 0.43], [0.1, 0.48], [0.055, 0.515], [0.0, 0.525],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const torsoMat = clay('#ffffff', { sheen: 0.6, extra: { map: torsoTexture(o), ...(knit ? { bumpMap: ribs, bumpScale: 0.7 } : {}) } });
    const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 48, Math.PI), torsoMat);
    torso.scale.set(1.22, 1, 0.8); torso.position.y = 0.04;
    torso.castShadow = torso.receiveShadow = true;
    this.torso.add(torso);
    if (o.outfit === 'hoodie') {
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 16), cloth(shade(o.top, 0.9)));
      hood.scale.set(1.5, 0.75, 0.9); hood.position.set(0, 0.47, -0.1); hood.castShadow = true;
      this.torso.add(hood);
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.12, 20), skin);
    neck.position.y = 0.56; this.torso.add(neck);

    // Head
    this.head = new THREE.Group();
    this.head.position.set(0, 0.73, 0);
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
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(this.R, 96, 64), clay('#ffffff', { sheen: 0.08, sheenColor: '#ffd9cc', roughness: 0.7, extra: { map: this.faceTex } }));
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
    this.buildAccessories();

    // Arms (IK, root space)
    const seg = (r, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, 1, 24, 1), mat); m.castShadow = true; this.root.add(m); return m; };
    const ball = (r, mat) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat); m.castShadow = true; this.root.add(m); return m; };
    const cuffMat = o.outfit === 'blazer' ? clay(o.shirt) : clay(shade(o.top, 0.8));
    this.arms = [-1, 1].map((side) => {
      const arm = {
        side,
        shoulder: ball(0.058, sleeve), upper: seg(0.044, sleeve), elbow: ball(bare ? 0.036 : 0.044, bare ? skin : sleeve),
        fore: seg(bare ? 0.032 : 0.038, fore), wrist: ball(0.016, skin), hand: ball(0.03, skin), thumb: ball(0.012, skin),
        cuff: new THREE.Mesh(new THREE.TorusGeometry(bare ? 0.046 : 0.03, 0.008, 12, 28), bare ? sleeve : cuffMat),
      };
      arm.cuff.castShadow = true; this.root.add(arm.cuff);
      return arm;
    });

    // Legs
    const pants = clay(o.pants, { sheen: 0.3 });
    const shoeMat = clay('#efe9e0');
    for (const s of [-1, 1]) {
      if (this.stance === 'sit') {
        const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.3, 6, 16), pants);
        thigh.rotation.x = Math.PI / 2; thigh.position.set(s * 0.08, this.hy + 0.02, 0.17); thigh.castShadow = true;
        const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, this.hy - 0.12, 6, 16), pants);
        shin.position.set(s * 0.08, (this.hy - 0.04) / 2 + 0.03, 0.36); shin.castShadow = true;
        const shoe = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.06, 0.16, 3, 0.025), shoeMat);
        shoe.position.set(s * 0.08, 0.03, 0.4); shoe.castShadow = true;
        this.root.add(thigh, shin, shoe);
      } else {
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, this.hy - 0.12, 6, 16), pants);
        leg.position.set(s * 0.075, this.hy / 2 + 0.02, 0); leg.castShadow = true;
        const shoe = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.06, 0.16, 3, 0.025), shoeMat);
        shoe.position.set(s * 0.075, 0.03, 0.03); shoe.castShadow = true;
        this.root.add(leg, shoe);
      }
    }

    // Hand props
    this.props = {
      phone: new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.15, 0.009, 3, 0.004), clay('#1d1e22', { roughness: 0.25 })),
      cup: (() => {
        const g = new THREE.Group();
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.085, 20), clay('#f4efe6'));
        const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.031, 20), clay('#5a3420'));
        coffee.rotation.x = -Math.PI / 2; coffee.position.y = 0.036;
        g.add(c, coffee); return g;
      })(),
      spatula: (() => {
        const g = new THREE.Group();
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.22, 8), clay('#3a2a20'));
        handle.position.y = 0.04;
        const blade = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.07, 0.006, 2, 0.002), clay('#d9d9dd', { roughness: 0.3 }));
        blade.position.y = -0.09;
        g.add(handle, blade); return g;
      })(),
    };
    for (const p of Object.values(this.props)) { p.visible = false; p.traverse((m) => { m.castShadow = true; }); this.root.add(p); }
  }

  buildHair() {
    const R = this.R, o = this.o;
    const tex = stripeTexture(36, false);
    const mat = clay(o.hairColor, { roughness: 0.55, sheen: 0.8, sheenColor: shade(o.hairColor, 1.3), extra: { bumpMap: tex, bumpScale: 0.9 } });
    const capMat = mat.clone(); capMat.bumpMap = stripeTexture(60, true);
    const hair = new THREE.Group();
    this.headScale.add(hair);
    this.hair = hair;
    const add = (g, parent = hair) => { const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    const P = (lon, lat, rf) => sph(lon, lat, rf, R);
    const V = (x, y, z) => new THREE.Vector3(x * R, y * R, z * R);
    const style = o.hair;

    const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.045, 64, 32, 0, Math.PI * 2, 0, Math.PI * (style === 'bun' ? 0.3 : 0.33)), capMat);
    const backLen = style === 'short' ? 0.66 : style === 'bun' ? 0.7 : 0.78;
    const back = new THREE.Mesh(new THREE.SphereGeometry(R * 1.04, 64, 48, Math.PI - 0.45, Math.PI + 0.9, 0, Math.PI * backLen), capMat);
    cap.castShadow = back.castShadow = true;
    hair.add(cap, back);

    const swoop = (full = true) => {
      add(lockGeometry([P(12, 86, 1.06), P(-4, 70, 1.12), P(-22, 50, 1.15), P(-40, 30, 1.15), P(-55, 8, 1.12), P(-62, -18, 1.1), P(-63, -40, 1.08)], { width: R * 0.42, thick: R * 0.16, taper: 0.7 }));
      add(lockGeometry([P(12, 86, 1.06), P(8, 66, 1.12), P(-8, 46, 1.14), P(-26, 30, 1.13), P(-40, 18, 1.1)], { width: R * 0.3, thick: R * 0.12, taper: 0.55 }));
      add(lockGeometry([P(14, 86, 1.06), P(20, 64, 1.12), P(26, 44, 1.13), P(30, 30, 1.11)], { width: R * 0.24, thick: R * 0.1, taper: 0.5 }));
      if (full) add(lockGeometry([P(16, 86, 1.06), P(32, 66, 1.11), P(48, 44, 1.13), P(60, 18, 1.12), P(66, -12, 1.1), P(66, -40, 1.08)], { width: R * 0.36, thick: R * 0.14, taper: 0.7 }));
      add(lockGeometry([P(12, 86, 1.06), P(-30, 76, 1.12), P(-70, 55, 1.12), P(-86, 30, 1.1)], { width: R * 0.5, thick: R * 0.16, taper: 0.8 }));
      add(lockGeometry([P(16, 86, 1.06), P(60, 74, 1.12), P(82, 50, 1.1), P(90, 25, 1.08)], { width: R * 0.5, thick: R * 0.16, taper: 0.8 }));
    };

    if (style === 'long') {
      swoop();
      for (const s of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const zf = 0.38 + k * 0.17, xo = 0.9 + k * 0.06;
          add(lockGeometry([
            P(s * (72 - k * 6), 30, 1.08), P(s * (80 - k * 4), 0, 1.13),
            V(s * xo, -0.75, zf + 0.05), V(s * (xo + 0.05), -1.5, zf + 0.12),
            V(s * (xo + 0.02), -2.3, zf + 0.3), V(s * (xo - 0.05), -3.0, zf + 0.32), V(s * (xo - 0.12), -3.35, zf + 0.25),
          ], { width: R * (0.26 - k * 0.03), thick: R * 0.1, taper: 0.82, rootTaper: 0.1 }));
        }
        for (let k = 0; k < 3; k++) {
          add(lockGeometry([
            P(s * (100 + k * 18), 35, 1.06), P(s * (105 + k * 20), 0, 1.1),
            V(s * (1.0 - k * 0.15), -1.2, -0.45 - k * 0.15), V(s * (1.05 - k * 0.2), -2.4, -0.6 - k * 0.15), V(s * (0.95 - k * 0.2), -3.3, -0.55 - k * 0.15),
          ], { width: R * 0.34, thick: R * 0.12, taper: 0.85 }));
        }
      }
      for (let k = -2; k <= 2; k++) {
        add(lockGeometry([P(180 + k * 18, 50, 1.06), P(180 + k * 20, 0, 1.12), V(k * 0.35, -1.2, -1.15), V(k * 0.4, -2.4, -1.1), V(k * 0.35, -3.3, -0.95)],
          { width: R * 0.36, thick: R * 0.14, taper: 0.85 }));
      }
    } else if (style === 'bob') {
      swoop();
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
        add(lockGeometry([P(s * (72 + k * 14), 30, 1.08), P(s * (84 + k * 12), 0, 1.14), V(s * (1.02 + k * 0.03), -0.72, 0.32 - k * 0.38), V(s * (0.92 + k * 0.02), -1.08, 0.3 - k * 0.4)],
          { width: R * 0.34, thick: R * 0.14, taper: 0.8 }));
      }
      for (let k = -2; k <= 2; k++) {
        add(lockGeometry([P(180 + k * 18, 50, 1.06), P(180 + k * 20, 0, 1.12), V(k * 0.36, -0.82, -1.08), V(k * 0.33, -1.12, -0.92)],
          { width: R * 0.38, thick: R * 0.16, taper: 0.8 }));
      }
    } else if (style === 'short') {
      for (let l = -40; l <= 40; l += 20) {
        add(lockGeometry([P(l * 0.2, 84, 1.06), P(l, 60, 1.13), P(l * 1.1, 42, 1.12), P(l * 1.15, 33, 1.09)], { width: R * 0.3, thick: R * 0.14, taper: 0.55 }));
      }
      for (const s of [-1, 1]) {
        add(lockGeometry([P(s * 60, 70, 1.07), P(s * 82, 40, 1.11), P(s * 88, 12, 1.08), P(s * 86, 0, 1.05)], { width: R * 0.36, thick: R * 0.12, taper: 0.7 }));
        add(lockGeometry([P(s * 110, 65, 1.07), P(s * 118, 30, 1.09), P(s * 115, 0, 1.06)], { width: R * 0.4, thick: R * 0.12, taper: 0.7 }));
      }
      add(lockGeometry([P(-20, 88, 1.06), P(30, 78, 1.16), P(70, 62, 1.14), P(95, 45, 1.1)], { width: R * 0.45, thick: R * 0.18, taper: 0.7 }));
      add(lockGeometry([P(20, 88, 1.06), P(-30, 78, 1.16), P(-70, 62, 1.14), P(-95, 45, 1.1)], { width: R * 0.45, thick: R * 0.18, taper: 0.7 }));
    } else if (style === 'bun') {
      // Swept-back locks starting on a curved hairline
      for (const l of [-75, -50, -25, 0, 25, 50, 75]) {
        const lat = 22 + Math.abs(l) * 0.1;
        add(lockGeometry([P(l, lat, 1.04), P(l * 0.85, lat + 25, 1.1), P(l * 0.45, 78, 1.11), P(180 - l * 0.4, 72, 1.1)], { width: R * 0.3, thick: R * 0.1, taper: 0.9, rootTaper: 0.25 }));
      }
      const bun = new THREE.Mesh(new THREE.SphereGeometry(R * 0.5, 32, 24), capMat);
      bun.position.copy(P(180, 52, 1.28)); bun.castShadow = true; hair.add(bun);
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(R * 0.42, R * 0.1, 10, 32), capMat);
      wrap.position.copy(P(180, 52, 1.1)); wrap.lookAt(new THREE.Vector3(0, 0, 0)); hair.add(wrap);
      for (const s of [-1, 1]) {
        add(lockGeometry([P(s * 62, 30, 1.06), P(s * 74, 0, 1.12), P(s * 76, -35, 1.12), V(s * 0.8, -1.05, 0.55)], { width: R * 0.12, thick: R * 0.06, taper: 0.7 }));
      }
    } else if (style === 'ponytail') {
      swoop(false);
      this.ponytail = new THREE.Group();
      this.ponytail.position.copy(P(180, 25, 1.05));
      hair.add(this.ponytail);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(R * 0.17, R * 0.07, 10, 24), clay(o.accent));
      tie.rotation.x = Math.PI / 2.4; this.ponytail.add(tie);
      add(lockGeometry([V(0, 0.05, 0.05), V(0, -0.2, -0.3), V(0, -1.0, -0.42), V(0, -1.9, -0.3), V(0, -2.5, -0.1)], { width: R * 0.36, thick: R * 0.28, taper: 0.7, rootTaper: 0.2 }), this.ponytail);
      for (const s of [-1, 1]) {
        add(lockGeometry([P(s * 66, 30, 1.06), P(s * 76, 0, 1.12), P(s * 76, -32, 1.11), V(s * 0.82, -1.0, 0.5)], { width: R * 0.13, thick: R * 0.06, taper: 0.7 }));
      }
    }
  }

  buildAccessories() {
    const R = this.R, acc = this.o.accessories || [];
    const P = (lon, lat, rf) => sph(lon, lat, rf, R);
    const hs = this.headScale;
    if (acc.includes('glasses')) {
      const m = clay('#26262b', { roughness: 0.35, sheen: 0 });
      for (const s of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.27, R * 0.028, 10, 32), m);
        ring.position.copy(P(s * 19.5, -7, 1.08));
        ring.lookAt(ring.position.clone().multiplyScalar(2));
        hs.add(ring);
      }
      const bridge = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.022, R * 0.022, R * 0.16, 8), m);
      bridge.rotation.z = Math.PI / 2; bridge.position.copy(P(0, -5, 1.1)); hs.add(bridge);
    }
    if (acc.includes('headphones')) {
      const m = clay(this.o.accent, { roughness: 0.4 });
      const band = new THREE.Mesh(new THREE.TorusGeometry(R * 1.2, R * 0.07, 10, 40, Math.PI), m);
      band.position.y = -R * 0.05; hs.add(band);
      for (const s of [-1, 1]) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.36, R * 0.36, R * 0.24, 24), m);
        cup.rotation.z = Math.PI / 2; cup.position.set(s * R * 1.1, -R * 0.1, 0); hs.add(cup);
      }
    }
    if (acc.includes('chefHat')) {
      const m = clay('#fbfaf7', { sheen: 0.6 });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.8, R * 0.86, R * 0.45, 32), m);
      band.position.y = R * 0.82; hs.add(band);
      for (let i = 0; i < 6; i++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(R * 0.36, 20, 16), m);
        const a = (i / 6) * Math.PI * 2;
        puff.position.set(Math.cos(a) * R * 0.48, R * 1.2, Math.sin(a) * R * 0.48); hs.add(puff);
      }
      const top = new THREE.Mesh(new THREE.SphereGeometry(R * 0.5, 20, 16), m);
      top.position.y = R * 1.3; top.scale.y = 0.8; hs.add(top);
    }
    if (acc.includes('cap')) {
      const m = clay(this.o.accent, { sheen: 0.4 });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.45), m);
      dome.position.y = R * 0.08; dome.castShadow = true; hs.add(dome);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.75, R * 0.75, R * 0.06, 32, 1, false, -Math.PI / 2, Math.PI), m);
      brim.position.copy(P(0, 32, 0.98)); brim.rotation.x = 0.25; brim.scale.set(1, 1, 0.9); hs.add(brim);
    }
    if (acc.includes('bow')) {
      const m = clay('#ff8fb1');
      const bow = new THREE.Group();
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.SphereGeometry(R * 0.22, 16, 12), m);
        w.scale.set(1.3, 0.8, 0.5); w.position.x = s * R * 0.22; bow.add(w);
      }
      bow.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.1, 12, 10), m));
      bow.position.copy(P(-45, 52, 1.18)); bow.lookAt(bow.position.clone().multiplyScalar(2)); hs.add(bow);
    }
  }

  shoulderLocal(side) {
    const p = new THREE.Vector3(side * 0.17, 0.43, -0.005);
    this.torso.updateMatrixWorld(true);
    return this.root.worldToLocal(this.torso.localToWorld(p));
  }

  // Hand targets & body offsets per action, in the character's local space.
  pose(action, t) {
    const hy = this.hy, S = this.surface;
    const B = (y) => hy + (y - 0.5);
    const tap = (ph) => Math.max(0, Math.sin(t * 22 + ph)) * 0.012;
    const P = (x, y, z) => new THREE.Vector3(x, y, z);
    const rest = () => (S ? [P(-0.13, S.y + 0.025, S.edge), P(0.13, S.y + 0.025, S.edge)]
      : this.stance === 'sit' ? [P(-0.11, hy + 0.1, 0.22), P(0.11, hy + 0.1, 0.22)] : [P(-0.21, hy + 0.02, 0.04), P(0.21, hy + 0.02, 0.04)]);
    const [L0, R0] = rest();
    const p = { lean: 0, twist: 0, yaw: 0, pitch: 0, roll: 0, shrug: 0, bob: 0, L: L0, R: R0, prop: null };
    const work = S || { y: B(0.78), z: 0.3, edge: 0.25 };
    switch (action) {
      case 'typing':
        p.L = P(-0.075 + noise(t * 3, 1) * 0.02, work.y + 0.035 + tap(0), work.z + noise(t * 2, 2) * 0.015);
        p.R = P(0.055 + noise(t * 3, 3) * 0.02, work.y + 0.035 + tap(1.7), work.z + noise(t * 2, 4) * 0.015);
        p.pitch = 0.12; p.lean = 0.05;
        break;
      case 'phone':
        p.L = P(-0.04, B(0.86), 0.22); p.R = P(0.04, B(0.86), 0.22); p.prop = 'phone'; p.pitch = 0.18; p.lean = 0.05;
        break;
      case 'cheeks':
        p.L = P(-0.088, B(1.17), 0.135); p.R = P(0.088, B(1.17), 0.135); p.pitch = -0.04; p.roll = Math.sin(t * 3) * 0.05;
        break;
      case 'shrug': {
        const k = 0.5 + 0.5 * Math.sin(t * 2.2);
        p.L = P(-0.3, B(0.9) + k * 0.04, 0.2); p.R = P(0.3, B(0.9) + k * 0.04, 0.2); p.shrug = 0.025 + 0.015 * k; p.roll = 0.1;
        break;
      }
      case 'point': p.L = P(-0.3, B(0.98), 0.42); p.twist = 0.15; break;
      case 'celebrate':
        p.L = P(-0.27, B(1.5) + Math.sin(t * 9) * 0.04, 0.06); p.R = P(0.27, B(1.5) + Math.sin(t * 9 + 1) * 0.04, 0.06);
        p.lean = -0.05; p.roll = Math.sin(t * 4.5) * 0.08;
        break;
      case 'facepalm': p.R = P(0.02, B(1.33), 0.13); p.pitch = 0.25; p.lean = 0.08; break;
      case 'think': p.R = P(0.03, B(1.12), 0.12); p.roll = -0.12; p.pitch = -0.1; p.yaw = 0.15; break;
      case 'wave': p.R = P(0.26 + Math.sin(t * 9) * 0.05, B(1.32), 0.12); break;
      case 'sleep':
        p.lean = S ? 0.78 : 0.15; p.pitch = 0.35; p.roll = 0.35; p.yaw = 0.2;
        if (S) { p.L = P(-0.16, S.y + 0.035, S.z - 0.06); p.R = P(0.1, S.y + 0.035, S.z - 0.04); }
        break;
      case 'lookDown': p.pitch = 0.35; break;
      case 'lean':
        p.lean = 0.14;
        if (S) { p.L = P(-0.12, S.y + 0.025, S.edge + 0.06); p.R = P(0.12, S.y + 0.025, S.edge + 0.06); }
        break;
      case 'armsCrossed': p.L = P(0.09, B(0.82), 0.17); p.R = P(-0.09, B(0.8), 0.19); p.lean = -0.04; break;
      case 'gesture':
        p.L = P(-0.17 + Math.sin(t * 3) * 0.05, B(0.88) + Math.sin(t * 4) * 0.04, 0.24);
        p.R = P(0.17 + Math.sin(t * 3.4 + 1) * 0.05, B(0.9) + Math.sin(t * 4.4 + 2) * 0.04, 0.25);
        p.roll = Math.sin(t * 2) * 0.05;
        break;
      case 'cook':
        p.R = P(0.08 + Math.cos(t * 5) * 0.05, work.y + 0.13, work.z + Math.sin(t * 5) * 0.04);
        p.L = P(-0.2, work.y + 0.06, work.z - 0.02); p.prop = 'spatula'; p.pitch = 0.3; p.lean = 0.06;
        break;
      case 'drink': {
        const k = smooth((Math.sin(t * 1.4) + 1) / 2);
        p.R = P(lerp(0.12, 0.03, k), lerp(B(0.85), B(1.13), k), lerp(0.25, 0.17, k)); p.pitch = -0.12 * k; p.prop = 'cup';
        break;
      }
      case 'dance':
        p.L = P(-0.24, B(1.0) + Math.sin(t * 6) * 0.13, 0.15); p.R = P(0.24, B(1.0) + Math.sin(t * 6 + Math.PI) * 0.13, 0.15);
        p.roll = Math.sin(t * 3) * 0.12; p.twist = Math.sin(t * 3) * 0.12; p.bob = Math.abs(Math.sin(t * 6)) * 0.018;
        break;
      case 'handsHips': p.L = P(-0.2, B(0.62), 0.02); p.R = P(0.2, B(0.62), 0.02); p.lean = -0.03; break;
    }
    return p;
  }

  update(t, s) {
    const pa = this.pose(s.prevAction || 'idle', t);
    const pb = this.pose(s.action || 'idle', t);
    const k = smooth(s.actionBlend ?? 1);
    const mix = (key) => lerp(pa[key], pb[key], k);
    const pose = {
      lean: mix('lean'), twist: mix('twist'), yaw: mix('yaw'), pitch: mix('pitch'), roll: mix('roll'), shrug: mix('shrug'), bob: mix('bob'),
      L: pa.L.clone().lerp(pb.L, k), R: pa.R.clone().lerp(pb.R, k),
      prop: k > 0.5 ? pb.prop : pa.prop,
    };
    const asleep = (s.action === 'sleep' ? k : 0) + (s.prevAction === 'sleep' ? 1 - k : 0);

    const breath = Math.sin(t * 1.6) * (asleep > 0.5 ? 0.012 : 0.006);
    this.torso.position.y = this.hy + pose.bob;
    this.torso.rotation.set(pose.lean + breath + noise(t * 0.5, 7) * 0.015, pose.twist + noise(t * 0.4, 8) * 0.02, noise(t * 0.45, 9) * 0.015);
    this.torso.scale.setScalar(1 + breath * 0.3);

    this.root.updateMatrixWorld(true);
    let yaw = 0, pitch = 0;
    if (s.look && asleep < 0.5) {
      const headW = this.head.getWorldPosition(new THREE.Vector3());
      const local = this.root.worldToLocal(s.look.clone()).sub(this.root.worldToLocal(headW.clone()));
      yaw = clamp(Math.atan2(local.x, local.z), -0.7, 0.7);
      pitch = clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.4, 0.45);
    }
    const nod = s.talk * 0.05 * Math.sin(t * 7);
    this.head.rotation.set(
      lerp(pitch * 0.85, 0, asleep) + pose.pitch + nod + noise(t * 0.7, 1) * 0.03 - pose.lean * 0.6,
      lerp(yaw * 0.75, 0, asleep) + pose.yaw - pose.twist * 0.5 + noise(t * 0.5, 2) * 0.04,
      pose.roll + noise(t * 0.6, 3) * 0.03,
      'YXZ',
    );
    if (this.ponytail) this.ponytail.rotation.set(noise(t * 1.3, 40) * 0.08, 0, Math.sin(t * 2.3) * 0.07 + pose.roll * 0.5);
    const eyeX = clamp((yaw - yaw * 0.75) * 4 + noise(t * 0.9, 11) * 0.12, -1, 1);
    const eyeY = clamp(-(pitch - pitch * 0.85) * 6 - (pitch > 0.2 ? 0.3 : 0), -1, 1);

    for (const arm of this.arms) {
      const S = this.shoulderLocal(arm.side); S.y += pose.shrug;
      const target = arm.side < 0 ? pose.L : pose.R;
      const pole = S.clone().add(new THREE.Vector3(arm.side * 0.45, -0.35, -0.25));
      const E = solveElbow(S, target, 0.28, 0.28, pole);
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

    for (const [name, mesh] of Object.entries(this.props)) mesh.visible = pose.prop === name;
    if (pose.prop === 'phone') {
      this.props.phone.position.copy(pose.L).lerp(pose.R, 0.5).add(new THREE.Vector3(0, 0.045, 0.015));
      this.props.phone.rotation.set(-0.75, Math.PI, 0);
    } else if (pose.prop === 'cup') {
      this.props.cup.position.copy(pose.R).add(new THREE.Vector3(-0.02, 0.03, 0.02));
    } else if (pose.prop === 'spatula') {
      this.props.spatula.position.copy(pose.R).add(new THREE.Vector3(0, 0.01, 0.01));
      this.props.spatula.rotation.set(0.5, 0, 0.2);
    }

    const e = { ...s.expr, blink: Math.max(blinkAmount(t, this.id.length + 1), asleep > 0.5 ? 1 : 0), talk: s.talk, lookX: eyeX, lookY: eyeY };
    const key = faceKey(e);
    if (key !== this.faceKey) {
      this.faceKey = key;
      drawHumanFace(this.faceCtx, e, this.faceLook);
      this.faceTex.needsUpdate = true;
    }
  }

  get focusPoint() {
    return this.head.getWorldPosition(new THREE.Vector3()).add(this.facing.multiplyScalar(0.1)).add(new THREE.Vector3(0, -0.02, 0));
  }
  get facing() {
    const y = this.root.rotation.y;
    return new THREE.Vector3(Math.sin(y), 0, Math.cos(y));
  }
  get size() { return 0.32; }
  get phonePoint() { return this.props.phone.getWorldPosition(new THREE.Vector3()); }
}

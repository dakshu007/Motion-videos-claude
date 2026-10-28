// Desk-sized mascots: cube, cat, robot, blob, mug. They share one rig
// (squash/hop body, optional head, painted face patch) and one action set.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, lerp, smooth, noise, clay, shade } from '../util.js';
import { drawMascotFace, blinkAmount, faceKey } from './faces.js';

const DEFAULT_COLOR = { cube: '#e27d5e', cat: '#f2a65a', robot: '#e9edf2', blob: '#7fd6a8', mug: '#f4efe6' };
const FACE_STYLE = { cube: 'pixel', cat: 'cat', robot: 'robot', blob: 'cute', mug: 'cute' };

export class Mascot {
  constructor(id, spec = {}, slot = {}) {
    this.id = id;
    this.kind = spec.type || 'cube';
    this.color = spec.color || DEFAULT_COLOR[this.kind] || DEFAULT_COLOR.cube;
    this.accent = spec.accent || '#4fd1ff';
    this.faceStyle = FACE_STYLE[this.kind] || 'pixel';
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.head = this.body;
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = this.faceCanvas.height = 512;
    this.faceCtx = this.faceCanvas.getContext('2d');
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.faceMat = new THREE.MeshStandardMaterial({ map: this.faceTex, transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
    this[`build_${this.kind}`]();
    this.root.scale.setScalar(spec.size || 1);
    this.root.position.set(...(slot.pos || [-0.36, 0.74, -0.03]));
    this.baseYaw = slot.yaw ?? 0;
    this.root.rotation.y = this.baseYaw;
    this.root.traverse((o) => { if (o.isMesh && o.material !== this.faceMat) { o.castShadow = true; o.receiveShadow = true; } });
  }

  mat(c = this.color, extra = {}) {
    return clay(c, { sheen: 0.5, sheenColor: '#ffffff', roughness: 0.6, ...extra });
  }

  // Face patch that hugs a sphere (u/v span 0..1 over the front)
  spherePatch(r, scale, phiLen = 1.8, thetaLen = 1.5, thetaShift = 0) {
    const g = new THREE.SphereGeometry(r * 1.004, 40, 30, Math.PI / 2 - phiLen / 2, phiLen, Math.PI / 2 - thetaLen / 2 + thetaShift, thetaLen);
    const m = new THREE.Mesh(g, this.faceMat);
    m.scale.copy(scale);
    return m;
  }

  build_cube() {
    const S = 0.15, mat = this.mat();
    const box = new THREE.Mesh(new RoundedBoxGeometry(S, S * 0.88, S * 0.86, 5, 0.018), mat);
    box.position.y = S * 0.44 + 0.022;
    this.body.add(box);
    for (const s of [-1, 1]) {
      const nub = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.036, 0.05, 3, 0.01), mat);
      nub.position.set(s * (S / 2 + 0.008), S * 0.34, 0); this.body.add(nub);
    }
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new RoundedBoxGeometry(0.022, 0.03, 0.022, 2, 0.005), mat);
      leg.position.set(x * S * 0.32, 0.013, z * S * 0.3); this.root.add(leg);
    }
    const face = new THREE.Mesh(new THREE.PlaneGeometry(S * 0.9, S * 0.8), this.faceMat);
    face.position.set(0, S * 0.44 + 0.022, S * 0.43 + 0.0008);
    this.body.add(face);
    this.focusLocal = new THREE.Vector3(0, S * 0.44 + 0.022, 0);
    this.height = 0.16;
  }

  build_cat() {
    const mat = this.mat(this.color, { sheen: 0.9, sheenColor: '#fff2dd' });
    const light = this.mat(shade(this.color, 1.6));
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.085, 32, 24), mat);
    body.scale.set(1, 1.15, 0.95); body.position.y = 0.095; this.body.add(body);
    for (const s of [-1, 1]) {
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.024, 16, 12), light);
      paw.scale.set(1, 0.7, 1.3); paw.position.set(s * 0.035, 0.016, 0.065); this.body.add(paw);
      const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), mat);
      haunch.position.set(s * 0.06, 0.04, -0.01); this.body.add(haunch);
    }
    this.head = new THREE.Group();
    this.head.position.set(0, 0.215, 0.015);
    this.body.add(this.head);
    const hs = new THREE.Vector3(1.12, 0.95, 0.95);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 40, 30), mat);
    head.scale.copy(hs); this.head.add(head);
    this.head.add(this.spherePatch(0.07, hs, 1.9, 1.7, 0.12));
    const pink = this.mat('#f2a0b0');
    this.ears = [];
    for (const s of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(s * 0.045, 0.052, -0.005); ear.rotation.z = -s * 0.35;
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.055, 16), mat);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.035, 16), pink);
      inner.position.set(0, -0.004, 0.012);
      ear.add(outer, inner); this.head.add(ear); this.ears.push(ear);
    }
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.03, -0.075);
    const curve = new THREE.CatmullRomCurve3([[0, 0, 0], [0.02, 0.02, -0.06], [0.07, 0.08, -0.07], [0.08, 0.16, -0.04], [0.05, 0.2, -0.02]].map((p) => new THREE.Vector3(...p)));
    this.tail.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.013, 10), mat));
    this.body.add(this.tail);
    this.focusLocal = new THREE.Vector3(0, 0.215, 0.015);
    this.height = 0.29;
  }

  build_robot() {
    const mat = this.mat(this.color, { roughness: 0.35, sheen: 0.2 });
    const acc = this.mat(this.accent, { roughness: 0.4 });
    for (const s of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 20), this.mat('#2b2e36'));
      wheel.rotation.z = Math.PI / 2; wheel.position.set(s * 0.04, 0.022, 0); this.root.add(wheel);
    }
    const torso = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.08, 0.09, 3, 0.02), mat);
    torso.position.y = 0.075; this.body.add(torso);
    const chest = new THREE.Mesh(new THREE.CircleGeometry(0.012, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(this.accent).multiplyScalar(2), toneMapped: false }));
    chest.position.set(0, 0.08, 0.0455); this.body.add(chest);
    this.arms = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(s * 0.062, 0.1, 0);
      const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.05, 4, 10), mat); a.position.y = -0.03;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 10), acc); hand.position.y = -0.065;
      arm.add(a, hand); arm.rotation.z = s * 0.25; this.body.add(arm); this.arms.push(arm);
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 12), this.mat('#2b2e36'));
    neck.position.y = 0.125; this.body.add(neck);
    this.head = new THREE.Group(); this.head.position.y = 0.185; this.body.add(this.head);
    this.head.add(new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.12, 0.12, 4, 0.028), mat));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.115), this.faceMat);
    face.position.z = 0.0605; this.head.add(face);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.016, 20), acc);
      ear.rotation.z = Math.PI / 2; ear.position.x = s * 0.084; this.head.add(ear);
    }
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 8), this.mat('#2b2e36'));
    ant.position.y = 0.085; this.head.add(ant);
    this.bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.accent), toneMapped: false });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), this.bulbMat);
    bulb.position.y = 0.115; this.head.add(bulb);
    this.focusLocal = new THREE.Vector3(0, 0.185, 0);
    this.height = 0.27;
  }

  build_blob() {
    const mat = new THREE.MeshPhysicalMaterial({
      color: this.color, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.35, sheen: 0.4,
      emissive: new THREE.Color(this.color).multiplyScalar(0.18),
    });
    const s = new THREE.Vector3(1.12, 0.85, 1.0);
    const blob = new THREE.Mesh(new THREE.SphereGeometry(0.075, 48, 32), mat);
    blob.scale.copy(s); blob.position.y = 0.062; this.body.add(blob);
    const patch = this.spherePatch(0.075, s, 1.3, 1.1, 0.0); patch.position.y = 0.062; this.body.add(patch);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }));
    shine.position.set(-0.04, 0.105, 0.035); shine.scale.set(1.4, 0.8, 0.6); this.body.add(shine);
    this.focusLocal = new THREE.Vector3(0, 0.07, 0);
    this.height = 0.13;
  }

  build_mug() {
    const mat = this.mat(this.color, { roughness: 0.35, sheen: 0.1 });
    const r = 0.062, h = 0.13;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, h, 40, 1, true), mat);
    wall.material.side = THREE.DoubleSide; wall.position.y = h / 2; this.body.add(wall);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(r * 0.92, 32), mat);
    bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.002; this.body.add(bottom);
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(r * 0.97, 32), this.mat('#5a3420', { roughness: 0.2, sheen: 0 }));
    coffee.rotation.x = -Math.PI / 2; coffee.position.y = h - 0.015; this.body.add(coffee);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.004, 8, 40), mat);
    rim.rotation.x = Math.PI / 2; rim.position.y = h; this.body.add(rim);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.011, 10, 24, Math.PI * 1.2), mat);
    // Handle at the back so the face (front, +z) is never hidden behind it.
    const hg = new THREE.Group(); hg.rotation.y = Math.PI / 2; this.body.add(hg);
    handle.position.set(r + 0.006, h * 0.55, 0); handle.rotation.z = -Math.PI * 0.6;
    this.body.remove(handle); hg.add(handle);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.004, r * 0.924, h * 0.85, 32, 1, true, -1.15, 2.3), this.faceMat);
    face.position.y = h / 2 - 0.004; this.body.add(face);
    this.focusLocal = new THREE.Vector3(0, h * 0.55, 0);
    this.height = 0.14;
  }

  actionOffsets(action, t) {
    const o = { y: 0, squash: 0, roll: 0, pitch: 0, yaw: 0, headRoll: 0 };
    switch (action) {
      case 'hop': {
        const ph = (t * 2.2) % 1;
        o.y = Math.sin(ph * Math.PI) * 0.05; o.squash = ph < 0.12 ? (0.12 - ph) * 1.4 : -Math.sin(ph * Math.PI) * 0.06;
        break;
      }
      case 'bounce': o.y = Math.abs(Math.sin(t * 6)) * 0.012; o.squash = -Math.abs(Math.sin(t * 6)) * 0.03; break;
      case 'wiggle': o.roll = Math.sin(t * 14) * 0.12; break;
      case 'lean': o.pitch = 0.18; break;
      case 'nod': o.pitch = Math.max(0, Math.sin(t * 7)) * 0.2; break;
      case 'shake': o.yaw = Math.sin(t * 16) * 0.22; break;
      case 'spin': o.yaw = (t * 5) % (Math.PI * 2); break;
      case 'proud': o.pitch = -0.15; o.y = 0.01; break;
      case 'sleep': o.squash = Math.sin(t * 1.5) * 0.03; o.pitch = 0.1; break;
      case 'type': o.y = Math.abs(Math.sin(t * 16)) * 0.008; o.pitch = 0.12; break;
      case 'dance': o.y = Math.abs(Math.sin(t * 6)) * 0.02; o.roll = Math.sin(t * 3) * 0.15; o.squash = -Math.abs(Math.sin(t * 6)) * 0.03; break;
      case 'tilt': o.headRoll = 0.35; o.roll = 0.08; break;
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
    let squash = m('squash') + breath - talkBob * 0.5;
    if (this.kind === 'blob') squash += noise(t * 3, 50) * 0.04 + s.talk * 0.05 * Math.sin(t * 20);
    this.body.position.y = m('y') + talkBob * 0.3;
    this.body.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
    let lookYaw = 0, lookPitch = 0;
    if (s.look) {
      const local = s.look.clone().sub(this.root.position);
      let d = Math.atan2(local.x, local.z) - this.baseYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      lookYaw = clamp(d, -0.7, 0.7);
      lookPitch = clamp(-Math.atan2(local.y - 0.15, Math.hypot(local.x, local.z)), -0.4, 0.4);
    }
    const separateHead = this.head !== this.body;
    this.root.rotation.y = this.baseYaw + lookYaw * (separateHead ? 0.35 : 0.6) + m('yaw') + noise(t * 0.5, 21) * 0.03;
    this.body.rotation.set(m('pitch') + noise(t * 0.6, 22) * 0.02, 0, m('roll') + noise(t * 0.7, 23) * 0.02);
    if (separateHead) {
      this.head.rotation.set(lookPitch * 0.5 + s.talk * 0.04 * Math.sin(t * 8), lookYaw * 0.35, m('headRoll') + noise(t * 0.8, 25) * 0.05, 'YXZ');
    } else {
      this.body.rotation.z += m('headRoll');
    }
    const expr = s.expr;
    if (this.tail) this.tail.rotation.set(0, Math.sin(t * (expr.brow < -0.5 ? 6 : 2)) * 0.35, Math.sin(t * 1.3) * 0.1);
    if (this.ears) this.ears.forEach((ear, i) => { ear.rotation.x = expr.brow < -0.5 ? -0.5 : 0; ear.rotation.z = (i ? -1 : 1) * 0.35 + (i ? -1 : 1) * Math.max(0, expr.brow - 0.5) * 0.4; });
    if (this.arms) this.arms.forEach((arm, i) => {
      const sgn = i ? 1 : -1;
      const wave = s.action === 'hop' || s.action === 'dance' ? Math.sin(t * 9 + i) * 0.6 + 1.2 : s.talk * Math.sin(t * 6 + i) * 0.4;
      arm.rotation.z = sgn * (0.25 + Math.max(0, wave));
    });
    if (this.bulbMat) this.bulbMat.color.set(this.accent).multiplyScalar(1 + s.talk * 2 + Math.sin(t * 3) * 0.3);

    const asleep = s.action === 'sleep';
    const e = { ...expr, blink: asleep ? 1 : blinkAmount(t, this.id.length + 5), talk: s.talk, lookX: clamp(lookYaw * 0.8 + noise(t * 0.8, 24) * 0.3, -1, 1), lookY: 0 };
    const key = faceKey(e);
    if (key !== this.faceKey) {
      this.faceKey = key;
      drawMascotFace(this.faceCtx, e, this.faceStyle);
      this.faceTex.needsUpdate = true;
    }
  }

  get focusPoint() {
    this.root.updateMatrixWorld(true);
    return this.root.localToWorld(this.focusLocal.clone());
  }
  get facing() {
    return new THREE.Vector3(Math.sin(this.baseYaw), 0, Math.cos(this.baseYaw));
  }
  get size() { return this.height * this.root.scale.x; }
}

import * as THREE from 'three';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOutBack = (t) => { t = clamp(t); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// Deterministic hash + 1D value noise so every frame renders identically.
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise(t, seed = 0) {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i + seed * 57.3), hash(i + 1 + seed * 57.3), u) * 2 - 1;
}
export const rand = (i, seed = 0) => hash(i * 13.37 + seed * 7.1);

// Two-bone IK. Returns the elbow position for a limb from `a` to target `c`
// with segment lengths l1, l2, bending toward `pole`.
export function solveElbow(a, c, l1, l2, pole) {
  const ac = new THREE.Vector3().subVectors(c, a);
  let d = ac.length();
  d = clamp(d, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const dir = ac.clone().normalize();
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const p = new THREE.Vector3().subVectors(pole, a);
  p.sub(dir.clone().multiplyScalar(p.dot(dir))).normalize();
  return a.clone().add(dir.multiplyScalar(x)).add(p.multiplyScalar(h));
}

const UP = new THREE.Vector3(0, 1, 0);
// Stretch a unit-height, Y-aligned mesh between two points.
export function placeSegment(mesh, a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(UP, d.normalize());
}

export function canvasTexture(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (opts.repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...opts.repeat);
  }
  return tex;
}

// Fine parallel grooves: used as a bump map for hair strands and knit ribs.
export function stripeTexture(lines = 64, vertical = true) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < lines; i++) {
      const p = (i / lines) * (vertical ? w : h);
      const g = vertical
        ? ctx.createLinearGradient(p, 0, p + w / lines, 0)
        : ctx.createLinearGradient(0, p, 0, p + h / lines);
      const k = 0.75 + rand(i, 3) * 0.25;
      g.addColorStop(0, '#303030');
      g.addColorStop(0.5, `rgb(${220 * k},${220 * k},${220 * k})`);
      g.addColorStop(1, '#303030');
      ctx.fillStyle = g;
      if (vertical) ctx.fillRect(p, 0, w / lines, h);
      else ctx.fillRect(0, p, w, h / lines);
    }
  }, { linear: true, repeat: [1, 1] });
}

// Darken (k < 1) or lighten toward white (k > 1) a hex color.
export function shade(hex, k) {
  const c = new THREE.Color(hex);
  if (k <= 1) c.multiplyScalar(k);
  else c.lerp(new THREE.Color('#ffffff'), Math.min(1, k - 1));
  return '#' + c.getHexString();
}

export function clay(color, opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: opts.roughness ?? 0.62,
    metalness: 0,
    sheen: opts.sheen ?? 0.35,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(opts.sheenColor ?? '#ffffff'),
    ...opts.extra,
  });
}

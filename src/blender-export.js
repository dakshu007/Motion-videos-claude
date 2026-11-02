// Exports the posed Three.js scene for rendering in Blender (tools/blender_render.py).
// init() returns the static scene (geometry, materials, textures, objects, lights);
// step(t) poses the scene at time t and returns only what changed since the last call.
// Coordinates stay in Three.js space (Y up); the Blender side converts.
import * as THREE from 'three';

const b64 = (typed) => {
  const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const r5 = (v) => Math.round(v * 1e5) / 1e5;
const col = (c) => (c ? [r5(c.r), r5(c.g), r5(c.b)] : null);

function imageToPNG(img) {
  if (!img) return null;
  const w = img.width || img.videoWidth, h = img.height || img.videoHeight;
  if (!w || !h) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/png');
}

export class BlenderExport {
  constructor(engine) {
    this.e = engine;
    this.geoIds = new Map();
    this.matIds = new Map();
    this.texIds = new Map();
    this.texVersion = new Map();
    this.objects = [];
    this.lights = [];
    this.prev = new Map();
  }

  texId(tex) {
    if (!tex) return null;
    if (!this.texIds.has(tex)) this.texIds.set(tex, `t${this.texIds.size}`);
    return this.texIds.get(tex);
  }

  matDesc(m) {
    const kind = m.isShadowMaterial ? 'shadow' : m.isMeshBasicMaterial ? 'basic' : m.isShaderMaterial ? 'shader' : 'std';
    return {
      kind, name: m.name || '',
      color: col(m.color), opacity: m.opacity, transparent: !!m.transparent, side: m.side, visible: m.visible,
      roughness: m.roughness ?? null, metalness: m.metalness ?? null,
      sheen: m.sheen ?? 0, sheenColor: col(m.sheenColor), sheenRoughness: m.sheenRoughness ?? null,
      emissive: col(m.emissive), emissiveIntensity: m.emissiveIntensity ?? 0,
      transmission: m.transmission ?? 0, ior: m.ior ?? 1.5, thickness: m.thickness ?? 0,
      clearcoat: m.clearcoat ?? 0, clearcoatRoughness: m.clearcoatRoughness ?? 0,
      map: this.texId(m.map), bumpMap: this.texId(m.bumpMap), bumpScale: m.bumpScale ?? 1,
      emissiveMap: this.texId(m.emissiveMap), alphaMap: this.texId(m.alphaMap),
      toneMapped: m.toneMapped !== false, alphaTest: m.alphaTest || 0, vertexColors: !!m.vertexColors,
    };
  }

  geoDesc(g) {
    const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv, colr = g.attributes.color;
    const flat = (a, n) => { const out = new Float32Array(a.count * n); for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = a.getComponent(i, k); return out; };
    let idx;
    if (g.index) idx = Uint32Array.from(g.index.array);
    else { idx = new Uint32Array(pos.count); for (let i = 0; i < pos.count; i++) idx[i] = i; }
    if (!nrm) g.computeVertexNormals();
    return {
      pos: b64(flat(pos, 3)), nrm: b64(flat(g.attributes.normal, 3)), uv: uv ? b64(flat(uv, 2)) : null,
      col: colr ? b64(flat(colr, colr.itemSize >= 3 ? 3 : colr.itemSize)) : null,
      idx: b64(idx), vcount: pos.count, type: g.type,
    };
  }

  init() {
    const e = this.e;
    e.frame(0, { scene: true });
    e.scene.updateMatrixWorld(true);
    const geoms = {}, materials = {}, objects = [];
    let n = 0;
    e.scene.traverse((o) => {
      if (o.isMesh && !o.isInstancedMesh) {
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (!m || m.isShaderMaterial) return; // sky dome is rebuilt as the Blender world
        if (!this.geoIds.has(o.geometry)) {
          const id = `g${this.geoIds.size}`;
          this.geoIds.set(o.geometry, id);
          geoms[id] = this.geoDesc(o.geometry);
        }
        if (!this.matIds.has(m)) {
          const id = `m${this.matIds.size}`;
          this.matIds.set(m, id);
          materials[id] = this.matDesc(m);
        }
        const name = `o${n++}`;
        this.objects.push({ name, o });
        objects.push({ name, geo: this.geoIds.get(o.geometry), mat: this.matIds.get(m), cast: o.castShadow, hint: o.parent?.name || '' });
      }
      if (o.isLight) this.lights.push({ name: `l${this.lights.length}`, o });
    });
    const textures = {};
    for (const [tex, id] of this.texIds) {
      textures[id] = {
        png: imageToPNG(tex.image), repeat: [tex.repeat.x, tex.repeat.y], offset: [tex.offset.x, tex.offset.y],
        wrap: tex.wrapS === THREE.RepeatWrapping, flipY: tex.flipY, srgb: tex.colorSpace === THREE.SRGBColorSpace,
      };
      this.texVersion.set(tex, tex.version);
    }
    const lights = this.lights.map(({ name, o }) => ({ name, type: o.type }));
    return { geoms, materials, textures, objects, lights, width: e.W, height: e.H, fps: e.fps, set: e.script.set };
  }

  diff(key, val) {
    const s = JSON.stringify(val);
    if (this.prev.get(key) === s) return false;
    this.prev.set(key, s);
    return true;
  }

  step(t) {
    const e = this.e;
    e.frame(t, { overlay: true });
    e.scene.updateMatrixWorld(true);
    e.camera.updateMatrixWorld(true);
    const out = { o: {}, m: {}, l: {}, tex: {} };
    for (const { name, o } of this.objects) {
      let vis = true;
      for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break; }
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m.visible) vis = false;
      const val = vis ? o.matrixWorld.elements.map(r5) : 0;
      if (this.diff(name, val)) out.o[name] = val;
    }
    for (const [m, id] of this.matIds) {
      const val = [col(m.color), m.opacity, col(m.emissive), m.emissiveIntensity ?? 0];
      if (this.diff(id, val)) out.m[id] = val;
    }
    for (const { name, o } of this.lights) {
      const val = { c: col(o.color), i: r5(o.intensity), p: [o.getWorldPosition(new THREE.Vector3())].map((v) => [r5(v.x), r5(v.y), r5(v.z)])[0] };
      if (o.isHemisphereLight) val.g = col(o.groundColor);
      if (o.target) { const v = o.target.getWorldPosition(new THREE.Vector3()); val.t = [r5(v.x), r5(v.y), r5(v.z)]; }
      if (o.isPointLight) { val.d = o.distance; val.k = o.decay; }
      val.s = o.castShadow;
      if (this.diff(name, val)) out.l[name] = val;
    }
    for (const [tex, id] of this.texIds) {
      if (tex.version !== this.texVersion.get(tex)) {
        this.texVersion.set(tex, tex.version);
        out.tex[id] = imageToPNG(tex.image);
      }
    }
    const u = e.set.skyMat?.uniforms;
    const sky = u ? { top: col(u.top.value), mid: col(u.mid.value), hor: col(u.horizon.value), sun: col(u.sunColor.value), sunPos: [u.sunPos.value.x, u.sunPos.value.y], sunSize: u.sunSize.value, sunGlow: u.sunGlow.value, on: e.set.dome ? e.set.dome.visible : true } : null;
    if (this.diff('sky', sky)) out.sky = sky;
    const fog = e.scene.fog ? { c: col(e.scene.fog.color), near: e.scene.fog.near, far: e.scene.fog.far } : null;
    if (this.diff('fog', fog)) out.fog = fog;
    const cam = e.lastCam;
    out.cam = { m: e.camera.matrixWorld.elements.map(r5), fov: e.camera.fov, focus: r5(cam.focus), ap: cam.aperture, whip: r5(e.lastWhip || 0) };
    out.exp = e.renderer.toneMappingExposure;
    out.overlay = e.out.toDataURL('image/png');
    return out;
  }
}

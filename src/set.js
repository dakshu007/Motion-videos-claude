// The environment: a cozy home office with a big window onto a city skyline,
// plus time-of-day lighting presets (dusk / night / sunset / day).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture, clay, rand, lerp } from './util.js';

export const DESK_Y = 0.74;

// ---------------------------------------------------------------------------
// Time-of-day presets. Every field is lerpable (numbers or colors).
// ---------------------------------------------------------------------------
export const TIMES = {
  dusk: {
    skyTop: '#25305e', skyMid: '#6a6aa6', skyHorizon: '#f0a37c',
    sunColor: '#ffd2a8', sunPos: [0.62, 0.06], sunSize: 0.0, sunGlow: 0.25,
    fog: '#5f5d8c', cityTint: 0.95, cityLit: 1.0,
    hemiSky: '#9aa6e0', hemiGround: '#6b4b45', hemi: 0.6,
    key: '#ffb48a', keyI: 2.2, fill: '#ecd3d6', fillI: 1.35,
    lamp: 0.0, screen: 0.9, wall: '#8a8fa6', exposure: 0.92, neon: 0.6,
  },
  night: {
    skyTop: '#070b1c', skyMid: '#111a35', skyHorizon: '#25305a',
    sunColor: '#f4f6ff', sunPos: [0.3, 0.72], sunSize: 0.035, sunGlow: 0.35,
    fog: '#151b33', cityTint: 1.0, cityLit: 1.25,
    hemiSky: '#3a4a8a', hemiGround: '#1d1a26', hemi: 0.55,
    key: '#8fa2ff', keyI: 0.7, fill: '#8f9be0', fillI: 0.75,
    lamp: 0.6, screen: 1.6, wall: '#5d6b66', exposure: 1.1, neon: 1.4,
  },
  sunset: {
    skyTop: '#e7a77a', skyMid: '#f2c193', skyHorizon: '#f8dcb4',
    sunColor: '#fff3dc', sunPos: [0.72, 0.42], sunSize: 0.075, sunGlow: 0.9,
    fog: '#e9b48a', cityTint: 0.45, cityLit: 0.15,
    hemiSky: '#ffd0a0', hemiGround: '#8a5a40', hemi: 0.9,
    key: '#ffb070', keyI: 2.6, fill: '#ffd6b0', fillI: 0.8,
    lamp: 0.0, screen: 0.5, wall: '#c69a7c', exposure: 1.0, neon: 0.35,
  },
  day: {
    skyTop: '#6fa6e8', skyMid: '#a9cdf2', skyHorizon: '#e6f0f7',
    sunColor: '#ffffff', sunPos: [0.8, 0.8], sunSize: 0.0, sunGlow: 0.2,
    fog: '#bcd2e6', cityTint: 0.8, cityLit: 0.0,
    hemiSky: '#cfe3ff', hemiGround: '#a08870', hemi: 1.1,
    key: '#fff1dc', keyI: 2.2, fill: '#dfe8ff', fillI: 1.0,
    lamp: 0.0, screen: 0.6, wall: '#c8c2b6', exposure: 1.0, neon: 0.25,
  },
};

export function lerpTime(a, b, k) {
  const out = {};
  for (const key of Object.keys(a)) {
    const va = a[key], vb = b[key];
    if (typeof va === 'number') out[key] = lerp(va, vb, k);
    else if (Array.isArray(va)) out[key] = va.map((v, i) => lerp(v, vb[i], k));
    else out[key] = '#' + new THREE.Color(va).lerp(new THREE.Color(vb), k).getHexString();
  }
  return out;
}

// ---------------------------------------------------------------------------
function woodTexture(base = '#c89a6e') {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    const planks = 8;
    for (let i = 0; i < planks; i++) {
      const x = (i / planks) * w;
      const shade = 0.88 + rand(i, 1) * 0.2;
      ctx.fillStyle = `rgba(${shade > 1 ? 255 : 0},${shade > 1 ? 220 : 0},${shade > 1 ? 180 : 0},${Math.abs(1 - shade) * 0.6})`;
      ctx.fillRect(x, 0, w / planks, h);
      for (let g = 0; g < 14; g++) {
        ctx.strokeStyle = `rgba(90,55,30,${0.05 + rand(i * 20 + g, 2) * 0.07})`;
        ctx.lineWidth = 1 + rand(g, i) * 2;
        ctx.beginPath();
        const gx = x + rand(i * 31 + g, 5) * (w / planks);
        ctx.moveTo(gx, 0);
        for (let y = 0; y <= h; y += 32) ctx.lineTo(gx + Math.sin(y * 0.01 + g) * 4, y);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(60,35,20,0.35)';
      ctx.fillRect(x, 0, 3, h);
      const seam = rand(i, 9) * h;
      ctx.fillRect(x, seam, w / planks, 3);
    }
  }, { repeat: [3, 3] });
}

function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color() }, mid: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() },
      sunPos: { value: new THREE.Vector2() }, sunSize: { value: 0 }, sunGlow: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top, mid, horizon, sunColor; uniform vec2 sunPos; uniform float sunSize, sunGlow;
      varying vec2 vUv;
      void main(){
        float y = vUv.y;
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.45, y));
        c = mix(c, top, smoothstep(0.4, 1.0, y));
        vec2 d = (vUv - sunPos) * vec2(1.5, 1.0);
        float r = length(d);
        c += sunColor * sunGlow * 0.6 * exp(-r * 7.0);
        c = mix(c, sunColor * 1.6, smoothstep(sunSize, sunSize * 0.92, r) * step(0.001, sunSize));
        gl_FragColor = vec4(c, 1.0);
      }`,
    depthWrite: false,
    fog: false,
  });
}

function cityTexture(seed) {
  return canvasTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#20202c'; ctx.fillRect(0, 0, w, h);
    const cols = 6, rows = 24;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = rand(r * 17 + c + seed * 100, seed) > 0.55;
        ctx.fillStyle = lit ? `hsl(${38 + rand(r + c, seed) * 15},90%,${62 + rand(c, r) * 15}%)` : '#2c2c3a';
        ctx.fillRect(c * (w / cols) + 10, r * (h / rows) + 6, w / cols - 20, h / rows - 12);
      }
    }
  });
}

function textCanvasTexture(text, { w = 512, h = 160, font = '700 110px Inter', color = '#ffffff', glow = null } = {}) {
  return canvasTexture(w, h, (ctx) => {
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 18; }
    ctx.fillStyle = color; ctx.fillText(text, w / 2, h / 2);
  });
}

// ---------------------------------------------------------------------------
// The laptop screen is a live canvas so scripts can show code, a render
// progress bar, a finished video, a big number, etc.
// ---------------------------------------------------------------------------
class Screen {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640; this.canvas.height = 400;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.key = '';
  }
  update(screen, progress, t) {
    const mode = screen?.mode || 'code';
    const p = Math.round(progress * 60) / 60;
    const key = JSON.stringify([screen, p, mode === 'code' ? Math.floor(t * 8) : 0]);
    if (key === this.key) return;
    this.key = key;
    const ctx = this.ctx, W = 640, H = 400;
    ctx.fillStyle = '#16171d'; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'top';
    if (mode === 'code' || mode === 'terminal') {
      ctx.fillStyle = '#22232b'; ctx.fillRect(0, 0, W, 34);
      ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(22 + i * 22, 17, 7, 0, 7); ctx.fill(); });
      ctx.font = '600 18px Inter'; ctx.fillStyle = '#9aa0b4';
      ctx.fillText(screen?.title || (mode === 'terminal' ? 'terminal' : 'app.tsx'), 100, 8);
      const lines = screen?.lines || [
        'export default function Launch() {', '  const [ready, setReady] = useState(false);',
        '  useEffect(() => ship(), []);', '  return <Hero title="Coming soon" />;', '}',
      ];
      const shown = mode === 'terminal' ? Math.ceil(progress * lines.length * 1.3) : lines.length;
      ctx.font = '500 21px "DejaVu Sans Mono", monospace';
      lines.slice(0, shown).forEach((ln, i) => {
        ctx.fillStyle = ln.startsWith('>') || ln.startsWith('$') ? '#e8a87c' : ln.startsWith('✓') ? '#7ee787' : '#d6d9e6';
        ctx.fillText(ln, 22, 56 + i * 32);
      });
      if (Math.floor(t * 2) % 2 === 0) {
        ctx.fillStyle = '#e8a87c';
        ctx.fillRect(22 + (mode === 'terminal' ? 0 : 0), 56 + Math.min(shown, lines.length) * 32, 12, 24);
      }
    } else if (mode === 'render') {
      const pr = Math.min(1, progress * (screen?.speed || 1));
      ctx.font = '700 30px Inter'; ctx.fillStyle = '#f2f2f5';
      ctx.fillText(screen?.title || 'Rendering launch_film.mp4', 40, 80);
      ctx.fillStyle = '#2a2b35'; ctx.fillRect(40, 190, W - 80, 26);
      ctx.fillStyle = '#e07a5f'; ctx.fillRect(40, 190, (W - 80) * pr, 26);
      ctx.font = '800 64px Inter'; ctx.fillStyle = '#ffffff';
      ctx.fillText(`${Math.floor(pr * 100)}%`, 40, 250);
      ctx.font = '500 20px Inter'; ctx.fillStyle = '#9aa0b4';
      ctx.fillText(`frame ${Math.floor(pr * 900)} / 900`, 40, 140);
    } else if (mode === 'done') {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#e07a5f'); g.addColorStop(1, '#f2b880');
      ctx.fillStyle = g; ctx.fillRect(30, 30, W - 60, H - 110);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath(); ctx.moveTo(W / 2 - 26, 110); ctx.lineTo(W / 2 + 34, 145); ctx.lineTo(W / 2 - 26, 180); ctx.fill();
      ctx.font = '700 26px Inter'; ctx.fillStyle = '#f2f2f5';
      ctx.fillText(screen?.title || 'launch_film.mp4  ✓', 34, H - 64);
    } else if (mode === 'stat') {
      ctx.fillStyle = '#e07a5f'; ctx.fillRect(0, 0, W * 0.42, H);
      ctx.font = '600 22px Inter'; ctx.fillStyle = '#ffe9df';
      ctx.fillText(screen?.label || 'Signups today', 26, 60);
      const target = screen?.value ?? 102;
      ctx.font = '800 96px Inter'; ctx.fillStyle = '#ffffff';
      ctx.fillText(String(Math.round(target * Math.min(1, progress * 2))), 22, 110);
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 ? '#1c1d24' : '#20212a';
        ctx.fillRect(W * 0.42, 20 + i * 36, W, 36);
        ctx.fillStyle = '#8b90a3'; ctx.font = '500 16px Inter';
        ctx.fillText(`user_${(1000 + i * 37).toString(16)}@mail.com`, W * 0.45, 30 + i * 36);
        ctx.fillStyle = '#7ee787'; ctx.fillText('paid', W * 0.88, 30 + i * 36);
      }
    } else if (mode === 'blank') {
      ctx.fillStyle = '#f4f4f6'; ctx.fillRect(0, 0, W, H);
      ctx.font = '500 22px Inter'; ctx.fillStyle = '#b5b7c0';
      ctx.fillText(screen?.title || 'untitled', 24, 20);
    }
    this.texture.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
export class OfficeSet {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.screen = new Screen();
    this.anchors = {};
    this.buildRoom();
    this.buildDesk();
    this.buildLights();
    this.applyTime(TIMES.dusk);
  }

  buildRoom() {
    const r = this.root;
    // Floor
    const floorMat = new THREE.MeshStandardMaterial({ map: woodTexture('#b98a62'), roughness: 0.75 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 1.5);
    floor.receiveShadow = true;
    r.add(floor);

    // Back wall with a window opening (built from four slabs).
    this.wallMat = new THREE.MeshStandardMaterial({ color: '#8a8fa6', roughness: 0.92 });
    const WZ = -1.7, wx0 = -1.25, wx1 = 1.25, wy0 = 0.82, wy1 = 2.7, H = 3.2;
    const slab = (x0, x1, y0, y1) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, 0.12), this.wallMat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, WZ);
      m.receiveShadow = true; m.castShadow = true;
      r.add(m);
    };
    slab(-3.2, wx0, 0, H); slab(wx1, 3.4, 0, H); slab(wx0, wx1, 0, wy0); slab(wx0, wx1, wy1, H);
    // Side wall + ceiling so wide shots feel enclosed
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.12, H, 6), this.wallMat);
    side.position.set(3.4, H / 2, 1.2); side.receiveShadow = true; r.add(side);

    // Front wall (seen behind the cube in POV shots) with a couple of frames
    const front = new THREE.Mesh(new THREE.BoxGeometry(7, H, 0.12), this.wallMat);
    front.position.set(0, H / 2, 2.6); front.receiveShadow = true; r.add(front);
    const frameCols = ['#e8b86a', '#7fa3c9', '#d9775b'];
    frameCols.forEach((c, i) => {
      const fr = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.65, 0.03, 2, 0.01), clay('#2b2b30'));
      fr.position.set(-0.9 + i * 0.75, 1.5 + (i % 2) * 0.12, 2.53); r.add(fr);
      const art = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.57), clay(c, { sheen: 0 }));
      art.position.set(-0.9 + i * 0.75, 1.5 + (i % 2) * 0.12, 2.513); art.rotation.y = Math.PI; r.add(art);
    });
    const sofa = new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.45, 0.7, 4, 0.12), clay('#5d7f8f'));
    sofa.position.set(-0.2, 0.3, 2.15); sofa.castShadow = sofa.receiveShadow = true; r.add(sofa);
    const sofaBack = new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.6, 0.22, 4, 0.1), clay('#5d7f8f'));
    sofaBack.position.set(-0.2, 0.6, 2.42); r.add(sofaBack);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.3, 48), clay('#d8c7b0', { sheen: 0.8 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.004, 0.2); rug.scale.set(1.3, 1, 1); rug.receiveShadow = true; r.add(rug);

    // Window frame + mullions
    const frameMat = clay('#26272c', { roughness: 0.5, sheen: 0 });
    const bar = (w, h, x, y, d = 0.07) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
      m.position.set(x, y, WZ + 0.02); m.castShadow = true; r.add(m);
    };
    const fw = 0.035;
    bar(wx1 - wx0 + fw, fw, 0, wy0); bar(wx1 - wx0 + fw, fw, 0, wy1);
    bar(fw, wy1 - wy0, wx0, (wy0 + wy1) / 2); bar(fw, wy1 - wy0, wx1, (wy0 + wy1) / 2);
    for (let i = 1; i < 3; i++) bar(0.022, wy1 - wy0, lerp(wx0, wx1, i / 3), (wy0 + wy1) / 2, 0.04);
    for (let i = 1; i < 3; i++) bar(wx1 - wx0, 0.022, 0, lerp(wy0, wy1, i / 3), 0.04);
    // Sill
    const sill = new THREE.Mesh(new RoundedBoxGeometry(2.7, 0.04, 0.3, 3, 0.012), clay('#e9e2d6'));
    sill.position.set(0, wy0 - 0.01, WZ + 0.12); sill.receiveShadow = true; sill.castShadow = true; r.add(sill);

    // Sky + skyline outside
    this.skyMat = skyMaterial();
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(140, 70), this.skyMat);
    sky.position.set(0, 18, -45);
    r.add(sky);
    this.cityMats = [];
    for (let k = 0; k < 4; k++) {
      const tex = cityTexture(k + 1);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1, 4);
      this.cityMats.push(new THREE.MeshBasicMaterial({ map: tex, color: '#ffffff' }));
    }
    for (let i = 0; i < 70; i++) {
      const w = 1.5 + rand(i, 1) * 3, d = 1.5 + rand(i, 2) * 2;
      const zz = -9 - rand(i, 3) * 26;
      const top = -2.4 + rand(i, 4) * 3.6 + (zz < -22 ? 2.5 : 0);
      const hgt = 40;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), this.cityMats[i % 4]);
      b.position.set(-22 + rand(i, 5) * 44, top - hgt / 2, zz);
      r.add(b);
    }

    // Shelf to the right of the window
    const shelfMat = clay('#f1ede6');
    const shelf = new THREE.Group();
    const sw = 0.85, sh = 1.9, sd = 0.32;
    const panel = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shelfMat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; shelf.add(m); };
    panel(0.03, sh, sd, -sw / 2, sh / 2, 0); panel(0.03, sh, sd, sw / 2, sh / 2, 0); panel(0.03, sh, sd, 0, sh / 2, 0);
    for (let i = 0; i <= 4; i++) panel(sw, 0.03, sd, 0, (i / 4) * sh, 0);
    const bookColors = ['#c0504d', '#e6b35a', '#4f6d8f', '#8aa37b', '#d9d2c3', '#2f3b4c', '#b5654a'];
    for (let s = 0; s < 4; s++) {
      for (let c = 0; c < 2; c++) {
        let x = -sw / 2 + 0.03 + c * (sw / 2);
        const n = 3 + Math.floor(rand(s * 3 + c, 7) * 5);
        for (let b = 0; b < n; b++) {
          const bw = 0.025 + rand(s * 10 + b + c, 8) * 0.025, bh = 0.18 + rand(b + s, c + 2) * 0.12;
          if (x + bw > -sw / 2 + (c + 1) * (sw / 2) - 0.04) break;
          const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.2), clay(bookColors[(s * 5 + b + c) % bookColors.length]));
          m.position.set(x + bw / 2, (s / 4) * sh + 0.015 + bh / 2, 0);
          m.castShadow = true; shelf.add(m); x += bw + 0.004;
        }
      }
    }
    shelf.add(this.makePlant(0.11, '#5f8f5a', -0.2, sh + 0.015, 0));
    shelf.position.set(1.95, 0, WZ + 0.25);
    r.add(shelf);

    // "ship it" neon sign
    this.neonMat = new THREE.MeshBasicMaterial({
      map: textCanvasTexture('ship it', { font: '700 120px Inter', color: '#ffd0ea', glow: '#ff5fb4' }),
      transparent: true, toneMapped: false, depthWrite: false,
    });
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.24), this.neonMat);
    neon.position.set(1.95, 2.28, WZ + 0.07);
    r.add(neon);

    // String lights draped across the top of the window
    this.bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.4), toneMapped: false });
    const bulbGeo = new THREE.SphereGeometry(0.012, 8, 6);
    for (let i = 0; i <= 46; i++) {
      const u = i / 46;
      const x = lerp(-1.6, 1.4, u);
      const sag = Math.abs(Math.sin(u * Math.PI * 3)) * 0.14;
      const b = new THREE.Mesh(bulbGeo, this.bulbMat);
      b.position.set(x, 2.95 - sag, WZ + 0.1);
      r.add(b);
    }
  }

  makePlant(scale, color, x, y, z) {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.8, 24), clay('#d9cfc0'));
    pot.position.y = 0.4; pot.castShadow = true; g.add(pot);
    const leafMat = clay(color, { sheen: 0.2 });
    for (let i = 0; i < 9; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), leafMat);
      const a = (i / 9) * Math.PI * 2;
      leaf.scale.set(0.45, 1.3, 0.2);
      leaf.position.set(Math.cos(a) * 0.25, 1.15 + rand(i, 4) * 0.3, Math.sin(a) * 0.25);
      leaf.rotation.set(Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5);
      leaf.castShadow = true;
      g.add(leaf);
    }
    g.scale.setScalar(scale);
    g.position.set(x, y, z);
    return g;
  }

  buildDesk() {
    const r = this.root;
    const top = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.045, 0.78, 4, 0.02),
      new THREE.MeshPhysicalMaterial({ map: woodTexture('#e6c49c'), roughness: 0.55, clearcoat: 0.15 }));
    top.position.set(0, DESK_Y - 0.0225, 0);
    top.castShadow = top.receiveShadow = true;
    r.add(top);
    const white = clay('#eceae6');
    const ped = new THREE.Mesh(new RoundedBoxGeometry(0.42, DESK_Y - 0.05, 0.7, 3, 0.015), white);
    ped.position.set(0.5, (DESK_Y - 0.05) / 2, 0); ped.castShadow = ped.receiveShadow = true; r.add(ped);
    for (let i = 0; i < 3; i++) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), clay('#c9a25e', { roughness: 0.3 }));
      knob.position.set(0.5, 0.15 + i * 0.2, 0.355); r.add(knob);
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.004, 0.004), clay('#cfccc6'));
      seam.position.set(0.5, 0.06 + i * 0.2 + 0.18, 0.352); r.add(seam);
    }
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, DESK_Y - 0.05, 12), white);
    for (const [x, z] of [[-0.68, 0.32], [-0.68, -0.32]]) {
      const l = leg.clone(); l.position.set(x, (DESK_Y - 0.05) / 2, z); l.castShadow = true; r.add(l);
    }

    // Laptop (screen faces the girl, who sits at -z)
    const laptop = new THREE.Group();
    const dark = clay('#3a3c44', { roughness: 0.4, sheen: 0.1 });
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.014, 0.23, 3, 0.005), dark);
    base.position.y = 0.007; base.castShadow = true; laptop.add(base);
    const kb = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.1), new THREE.MeshStandardMaterial({
      map: canvasTexture(512, 180, (ctx, w, h) => {
        ctx.fillStyle = '#2a2b31'; ctx.fillRect(0, 0, w, h);
        for (let row = 0; row < 5; row++) for (let k = 0; k < 14; k++) {
          ctx.fillStyle = '#1b1c20';
          ctx.beginPath(); ctx.roundRect(6 + k * 36 + (row % 2) * 6, 6 + row * 34, 30, 28, 5); ctx.fill();
        }
      }), roughness: 0.7,
    }));
    kb.rotation.x = -Math.PI / 2; kb.position.set(0, 0.0145, -0.03); laptop.add(kb);
    const lid = new THREE.Group();
    lid.position.set(0, 0.014, 0.112);
    const shell = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.23, 0.01, 3, 0.004), dark);
    shell.position.y = 0.115; shell.castShadow = true; lid.add(shell);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.315, 0.2), new THREE.MeshBasicMaterial({ map: this.screen.texture, toneMapped: true }));
    scr.position.set(0, 0.117, -0.0055); scr.rotation.y = Math.PI; lid.add(scr);
    this.screenMesh = scr;
    lid.rotation.x = -0.28; // leans away from the girl
    laptop.add(lid);
    laptop.position.set(-0.02, DESK_Y, -0.2);
    r.add(laptop);
    this.laptop = laptop;
    this.anchors.screen = new THREE.Vector3(-0.02, DESK_Y + 0.12, -0.08);
    this.anchors.keyboard = new THREE.Vector3(-0.02, DESK_Y + 0.02, -0.23);

    // Props
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.034, 0.09, 24), clay('#8fb8a0'));
    mug.position.set(-0.58, DESK_Y + 0.045, 0.2); mug.castShadow = true; r.add(mug);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.007, 8, 20), clay('#8fb8a0'));
    handle.position.set(-0.62, DESK_Y + 0.048, 0.2); handle.rotation.y = Math.PI / 2; r.add(handle);
    const phone = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.008, 0.15, 3, 0.004), clay('#1d1e22', { roughness: 0.25 }));
    phone.position.set(0.2, DESK_Y + 0.004, 0.18); phone.rotation.y = 0.3; phone.castShadow = true; r.add(phone);
    this.deskPhone = phone;
    const note = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.01, 0.15, 2, 0.003), clay('#f7f3ea'));
    note.position.set(0.48, DESK_Y + 0.005, 0.12); note.rotation.y = -0.2; note.castShadow = true; r.add(note);
    const sticky = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.003, 0.06), clay('#f2c66d'));
    sticky.position.set(-0.3, DESK_Y + 0.002, 0.24); sticky.rotation.y = 0.4; r.add(sticky);
    const cable = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.007, 10, 48), clay('#202126', { roughness: 0.4 }));
    cable.rotation.x = -Math.PI / 2; cable.position.set(0.55, DESK_Y + 0.007, -0.2); cable.castShadow = true; r.add(cable);
    r.add(this.makePlant(0.075, '#7fa36a', -0.62, DESK_Y, -0.22));
    // cactus
    const cactus = new THREE.Group();
    const cpot = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.05, 20), clay('#d98c6a'));
    cpot.position.y = 0.025; cactus.add(cpot);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.06, 6, 16), clay('#6fa05a'));
    body.position.y = 0.09; cactus.add(body);
    cactus.position.set(0.66, DESK_Y, 0.25); cactus.traverse(o => { o.castShadow = true; }); r.add(cactus);

    // Desk lamp (practical light at night)
    const lamp = new THREE.Group();
    const lampMat = clay('#efe6d8');
    const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.015, 24), lampMat); lb.position.y = 0.008; lamp.add(lb);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 8), lampMat); arm.position.set(0, 0.15, 0); lamp.add(arm);
    this.lampBulbMat = new THREE.MeshBasicMaterial({ color: '#fff3d6' });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 16), this.lampBulbMat); head.position.set(0, 0.31, 0); lamp.add(head);
    lamp.position.set(0.62, DESK_Y, -0.28);
    r.add(lamp);
    this.anchors.lamp = new THREE.Vector3(0.62, DESK_Y + 0.31, -0.28);

    // Chair (behind the girl)
    const chairMat = clay('#e0a43a');
    const back = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.5, 0.07, 4, 0.03), chairMat);
    back.position.set(0, 0.88, -0.92); back.rotation.x = -0.08; back.castShadow = back.receiveShadow = true; r.add(back);
    const seat = new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.07, 0.45, 4, 0.03), chairMat);
    seat.position.set(0, 0.46, -0.7); seat.castShadow = true; r.add(seat);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 12), clay('#2d2e33'));
    stem.position.set(0, 0.22, -0.7); r.add(stem);
  }

  buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
    s.add(this.hemi);
    // Key light through the window (backlight / rim on the characters)
    this.key = new THREE.DirectionalLight('#ffffff', 1);
    this.key.position.set(-2.0, 3.1, -4.6);
    this.key.target.position.set(0, 0.9, -0.3);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    const sc = this.key.shadow.camera;
    sc.left = -2; sc.right = 2; sc.top = 2; sc.bottom = -2; sc.near = 0.5; sc.far = 12;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = 4;
    s.add(this.key, this.key.target);
    // Soft front fill from the camera side
    this.fill = new THREE.DirectionalLight('#ffffff', 1);
    this.fill.position.set(1.2, 2.0, 3.0);
    this.fill.target.position.set(0, 1, -0.5);
    s.add(this.fill, this.fill.target);
    // Practical lamp and screen glow
    this.lamp = new THREE.PointLight('#ffc98a', 0, 3.5, 1.6);
    this.lamp.position.copy(this.anchors.lamp).add(new THREE.Vector3(-0.05, 0.02, 0.05));
    this.lamp.castShadow = true;
    this.lamp.shadow.mapSize.set(512, 512);
    this.lamp.shadow.bias = -0.002;
    s.add(this.lamp);
    this.screenLight = new THREE.PointLight('#bcd0ff', 0, 1.6, 1.5);
    this.screenLight.position.set(-0.02, DESK_Y + 0.42, -0.3);
    s.add(this.screenLight);
  }

  applyTime(p) {
    const C = (c) => new THREE.Color(c);
    const u = this.skyMat.uniforms;
    u.top.value.copy(C(p.skyTop)); u.mid.value.copy(C(p.skyMid)); u.horizon.value.copy(C(p.skyHorizon));
    u.sunColor.value.copy(C(p.sunColor)); u.sunPos.value.set(...p.sunPos);
    u.sunSize.value = p.sunSize; u.sunGlow.value = p.sunGlow;
    if (!this.scene.fog) this.scene.fog = new THREE.Fog('#000', 8, 46);
    this.scene.fog.color.copy(C(p.fog));
    for (const m of this.cityMats) m.color.setScalar(p.cityTint * (0.5 + 0.5 * p.cityLit));
    this.hemi.color.copy(C(p.hemiSky)); this.hemi.groundColor.copy(C(p.hemiGround)); this.hemi.intensity = p.hemi;
    this.key.color.copy(C(p.key)); this.key.intensity = p.keyI;
    this.fill.color.copy(C(p.fill)); this.fill.intensity = p.fillI;
    this.lamp.intensity = p.lamp;
    this.lampBulbMat.color.setScalar(0.6 + p.lamp * 0.5).multiply(C('#fff0d0'));
    this.screenLight.intensity = p.screen * 0.12;
    this.wallMat.color.copy(C(p.wall));
    this.neonMat.color.setScalar(p.neon);
    this.bulbMat.color.set(3, 2.4, 1.4).multiplyScalar(0.3 + p.neon * 0.7);
    this.exposure = p.exposure;
  }
}

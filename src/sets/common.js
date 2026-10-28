// Shared building blocks for every set: sky dome, time-of-day lighting,
// the live screen texture, and helpers for walls, windows, props and lights.
//
// Layout convention (all sets): the work surface is centered at x=0, z=0;
// the main character sits/stands at z≈-0.6 facing +z; the back wall is at
// z≈-1.7; the camera side is +z. Shots are computed from character
// positions, so sets only need to respect this rough layout.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture, clay, rand, lerp, shade } from '../util.js';

// ---------------------------------------------------------------------------
// Time of day. Every field is lerpable. sunPos = [azimuth, elevation] in
// radians (azimuth 0 = straight out the back window, -z).
// ---------------------------------------------------------------------------
export const TIMES = {
  dawn: {
    skyTop: '#7f9bd0', skyMid: '#e9b8c8', skyHorizon: '#ffd9b0',
    sunColor: '#fff0dc', sunPos: [-0.5, 0.08], sunSize: 0.06, sunGlow: 0.7,
    fog: '#d9b8c0', cityTint: 0.7, cityLit: 0.3,
    hemiSky: '#ffd6e0', hemiGround: '#7a6a70', hemi: 0.85,
    key: '#ffc9a8', keyI: 1.8, fill: '#f0d8e8', fillI: 1.1,
    practical: 0.3, screen: 0.6, tint: '#f4e2e2', exposure: 1.0, neon: 0.4,
  },
  day: {
    skyTop: '#6fa6e8', skyMid: '#a9cdf2', skyHorizon: '#e6f0f7',
    sunColor: '#ffffff', sunPos: [0.9, 0.9], sunSize: 0.0, sunGlow: 0.25,
    fog: '#bcd2e6', cityTint: 0.8, cityLit: 0.0,
    hemiSky: '#cfe3ff', hemiGround: '#a08870', hemi: 1.1,
    key: '#fff1dc', keyI: 2.4, fill: '#eef2ff', fillI: 1.1,
    practical: 0.15, screen: 0.6, tint: '#ffffff', exposure: 1.0, neon: 0.25,
  },
  sunset: {
    skyTop: '#e7a77a', skyMid: '#f2c193', skyHorizon: '#f8dcb4',
    sunColor: '#fff3dc', sunPos: [0.6, 0.22], sunSize: 0.11, sunGlow: 0.9,
    fog: '#e9b48a', cityTint: 0.45, cityLit: 0.15,
    hemiSky: '#ffd0a0', hemiGround: '#8a5a40', hemi: 0.9,
    key: '#ffb070', keyI: 2.6, fill: '#ffd6b0', fillI: 0.8,
    practical: 0.25, screen: 0.5, tint: '#ffd9c0', exposure: 1.0, neon: 0.35,
  },
  dusk: {
    skyTop: '#25305e', skyMid: '#6a6aa6', skyHorizon: '#f0a37c',
    sunColor: '#ffd2a8', sunPos: [0.36, -0.28], sunSize: 0.0, sunGlow: 0.25,
    fog: '#5f5d8c', cityTint: 0.95, cityLit: 1.0,
    hemiSky: '#9aa6e0', hemiGround: '#6b4b45', hemi: 0.6,
    key: '#ffb48a', keyI: 2.2, fill: '#ecd3d6', fillI: 1.35,
    practical: 0.55, screen: 0.9, tint: '#d4cde8', exposure: 0.92, neon: 0.6,
  },
  night: {
    skyTop: '#070b1c', skyMid: '#111a35', skyHorizon: '#25305a',
    sunColor: '#f4f6ff', sunPos: [-0.56, 0.56], sunSize: 0.045, sunGlow: 0.35,
    fog: '#151b33', cityTint: 1.0, cityLit: 1.25,
    hemiSky: '#3a4a8a', hemiGround: '#1d1a26', hemi: 0.55,
    key: '#8fa2ff', keyI: 0.7, fill: '#8f9be0', fillI: 0.75,
    practical: 1.0, screen: 1.6, tint: '#a3add0', exposure: 1.1, neon: 1.4,
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
// Textures
// ---------------------------------------------------------------------------
export function woodTexture(base = '#c89a6e', repeat = 3) {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    const planks = 8;
    for (let i = 0; i < planks; i++) {
      const x = (i / planks) * w;
      ctx.fillStyle = `rgba(0,0,0,${rand(i, 1) * 0.08})`;
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
      ctx.fillRect(x, rand(i, 9) * h, w / planks, 3);
    }
  }, { repeat: [repeat, repeat] });
}

export function tileTexture(a = '#efe9df', b = '#2f3a40', repeat = 6, grout = 'rgba(0,0,0,0.12)') {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const n = 4;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      ctx.fillStyle = (i + j) % 2 ? b : a;
      ctx.fillRect(i * w / n, j * h / n, w / n, h / n);
    }
    ctx.strokeStyle = grout; ctx.lineWidth = 4;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i * w / n, 0); ctx.lineTo(i * w / n, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * h / n); ctx.lineTo(w, i * h / n); ctx.stroke();
    }
  }, { repeat: [repeat, repeat] });
}

export function noiseTexture(base, spread = 18, repeat = 8) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) {
      const v = (rand(i, 3) - 0.5) * spread;
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 100})` : `rgba(0,0,0,${-v / 100})`;
      ctx.fillRect(rand(i, 1) * w, rand(i, 2) * h, 3, 3);
    }
  }, { repeat: [repeat, repeat] });
}

function cityTexture(seed) {
  return canvasTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#20202c'; ctx.fillRect(0, 0, w, h);
    const cols = 6, rows = 24;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const lit = rand(r * 17 + c + seed * 100, seed) > 0.55;
      ctx.fillStyle = lit ? `hsl(${38 + rand(r + c, seed) * 15},90%,${62 + rand(c, r) * 15}%)` : '#2c2c3a';
      ctx.fillRect(c * (w / cols) + 10, r * (h / rows) + 6, w / cols - 20, h / rows - 12);
    }
  });
}

export function textTexture(text, { w = 512, h = 160, font = '700 110px Inter', color = '#ffffff', glow = null, bg = null } = {}) {
  return canvasTexture(w, h, (ctx) => {
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 18; }
    ctx.fillStyle = color;
    const lines = String(text).split('\n');
    const lh = h / (lines.length + 0.3);
    lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * lh));
  });
}

function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color() }, mid: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() },
      sunPos: { value: new THREE.Vector2() }, sunSize: { value: 0 }, sunGlow: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top, mid, horizon, sunColor; uniform vec2 sunPos; uniform float sunSize, sunGlow;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float el = asin(clamp(d.y, -1.0, 1.0));
        float y = clamp((el + 0.35) / 1.25, 0.0, 1.0);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.45, y));
        c = mix(c, top, smoothstep(0.4, 1.0, y));
        vec3 s = vec3(sin(sunPos.x) * cos(sunPos.y), sin(sunPos.y), -cos(sunPos.x) * cos(sunPos.y));
        float r = acos(clamp(dot(d, s), -1.0, 1.0));
        c += sunColor * sunGlow * 0.6 * exp(-r * 4.8);
        c = mix(c, sunColor * 1.6, smoothstep(sunSize, sunSize * 0.92, r) * step(0.001, sunSize));
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
}

// ---------------------------------------------------------------------------
// The live screen (laptop / monitor / tablet)
// ---------------------------------------------------------------------------
export class Screen {
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
    const animated = ['code', 'terminal', 'live', 'game', 'chat'].includes(mode);
    const key = JSON.stringify([screen, Math.round(progress * 60), animated ? Math.floor(t * 8) : 0]);
    if (key === this.key) return;
    this.key = key;
    const ctx = this.ctx, W = 640, H = 400;
    ctx.fillStyle = '#16171d'; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'top';
    const titleBar = (title) => {
      ctx.fillStyle = '#22232b'; ctx.fillRect(0, 0, W, 34);
      ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(22 + i * 22, 17, 7, 0, 7); ctx.fill(); });
      ctx.font = '600 18px Inter'; ctx.fillStyle = '#9aa0b4'; ctx.fillText(title, 100, 8);
    };
    if (mode === 'code' || mode === 'terminal') {
      titleBar(screen?.title || (mode === 'terminal' ? 'terminal' : 'app.tsx'));
      const lines = screen?.lines || ['export default function Launch() {', '  const [ready, setReady] = useState(false);', '  useEffect(() => ship(), []);', '  return <Hero title="Coming soon" />;', '}'];
      const shown = mode === 'terminal' ? Math.ceil(progress * lines.length * 1.3) : lines.length;
      ctx.font = '500 21px "DejaVu Sans Mono", monospace';
      lines.slice(0, shown).forEach((ln, i) => {
        ctx.fillStyle = ln.startsWith('>') || ln.startsWith('$') ? '#e8a87c' : ln.startsWith('✓') ? '#7ee787' : '#d6d9e6';
        ctx.fillText(ln, 22, 56 + i * 32);
      });
      if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = '#e8a87c'; ctx.fillRect(22, 56 + Math.min(shown, lines.length) * 32, 12, 24); }
    } else if (mode === 'render') {
      const pr = Math.min(1, progress * (screen?.speed || 1));
      ctx.font = '700 30px Inter'; ctx.fillStyle = '#f2f2f5'; ctx.fillText(screen?.title || 'Rendering launch_film.mp4', 40, 80);
      ctx.fillStyle = '#2a2b35'; ctx.fillRect(40, 190, W - 80, 26);
      ctx.fillStyle = '#e07a5f'; ctx.fillRect(40, 190, (W - 80) * pr, 26);
      ctx.font = '800 64px Inter'; ctx.fillStyle = '#ffffff'; ctx.fillText(`${Math.floor(pr * 100)}%`, 40, 250);
      ctx.font = '500 20px Inter'; ctx.fillStyle = '#9aa0b4'; ctx.fillText(`frame ${Math.floor(pr * 900)} / 900`, 40, 140);
    } else if (mode === 'done') {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#e07a5f'); g.addColorStop(1, '#f2b880');
      ctx.fillStyle = g; ctx.fillRect(30, 30, W - 60, H - 110);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath(); ctx.moveTo(W / 2 - 26, 110); ctx.lineTo(W / 2 + 34, 145); ctx.lineTo(W / 2 - 26, 180); ctx.fill();
      ctx.font = '700 26px Inter'; ctx.fillStyle = '#f2f2f5'; ctx.fillText(screen?.title || 'launch_film.mp4  ✓', 34, H - 64);
    } else if (mode === 'stat') {
      ctx.fillStyle = '#e07a5f'; ctx.fillRect(0, 0, W * 0.42, H);
      ctx.font = '600 22px Inter'; ctx.fillStyle = '#ffe9df'; ctx.fillText(screen?.label || 'Signups today', 26, 60);
      const target = screen?.value ?? 102;
      ctx.font = '800 96px Inter'; ctx.fillStyle = '#ffffff';
      ctx.fillText(String(Math.round(target * Math.min(1, progress * 2))), 22, 110);
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 ? '#1c1d24' : '#20212a'; ctx.fillRect(W * 0.42, 20 + i * 36, W, 36);
        ctx.fillStyle = '#8b90a3'; ctx.font = '500 16px Inter'; ctx.fillText(`user_${(1000 + i * 37).toString(16)}@mail.com`, W * 0.45, 30 + i * 36);
        ctx.fillStyle = '#7ee787'; ctx.fillText('paid', W * 0.88, 30 + i * 36);
      }
    } else if (mode === 'chat') {
      ctx.fillStyle = '#f3f4f7'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, 44);
      ctx.font = '700 20px Inter'; ctx.fillStyle = '#222'; ctx.fillText(screen?.title || 'Chat', 20, 12);
      const msgs = screen?.messages || [{ from: 'them', text: 'hey' }, { from: 'me', text: 'hi!' }];
      const shown = Math.max(1, Math.ceil(progress * msgs.length * 1.2));
      let y = 60;
      ctx.font = '500 19px Inter';
      for (const m of msgs.slice(0, shown)) {
        const tw = Math.min(ctx.measureText(m.text).width, W * 0.62);
        const me = m.from === 'me';
        ctx.fillStyle = me ? '#3b82f6' : '#e2e4ea';
        ctx.beginPath(); ctx.roundRect(me ? W - tw - 50 : 20, y, tw + 30, 40, 16); ctx.fill();
        ctx.fillStyle = me ? '#fff' : '#222'; ctx.fillText(m.text, me ? W - tw - 35 : 35, y + 10, W * 0.62);
        y += 52;
      }
    } else if (mode === 'recipe') {
      ctx.fillStyle = '#fffaf2'; ctx.fillRect(0, 0, W, H);
      ctx.font = '800 32px Inter'; ctx.fillStyle = '#c0573a'; ctx.fillText(screen?.title || 'Recipe', 28, 24);
      ctx.font = '500 22px Inter'; ctx.fillStyle = '#3a2a20';
      (screen?.lines || ['2 eggs', 'pinch of salt', 'butter', 'love']).forEach((l, i) => ctx.fillText(`•  ${l}`, 34, 86 + i * 38));
    } else if (mode === 'live') {
      ctx.fillStyle = '#0f1016'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#e5484d'; ctx.beginPath(); ctx.roundRect(24, 22, 92, 34, 8); ctx.fill();
      ctx.font = '800 20px Inter'; ctx.fillStyle = '#fff'; ctx.fillText('● LIVE', 36, 29);
      ctx.font = '600 20px Inter'; ctx.fillStyle = '#c9cbd6';
      const viewers = Math.round((screen?.value ?? 1200) * (0.6 + 0.4 * Math.min(1, progress * 1.5)));
      ctx.fillText(`${viewers.toLocaleString('en-US')} watching`, 134, 29);
      ctx.font = '700 26px Inter'; ctx.fillStyle = '#fff'; ctx.fillText(screen?.title || 'Episode 42', 24, 80);
      for (let i = 0; i < 48; i++) {
        const a = Math.abs(Math.sin(i * 0.7 + t * 9) * Math.sin(i * 0.23 + t * 3));
        ctx.fillStyle = '#7c5cff'; ctx.fillRect(24 + i * 12, 250 - a * 90, 8, a * 180 + 4);
      }
    } else if (mode === 'game') {
      ctx.fillStyle = '#1a1033'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 40; i++) { ctx.fillStyle = '#ffffff55'; ctx.fillRect((i * 97 + t * 40) % W, (i * 53) % 200, 3, 3); }
      ctx.fillStyle = '#3ddc84'; ctx.fillRect(0, 320, W, 80);
      const px = (t * 160) % W;
      ctx.fillStyle = '#ffcc4d'; ctx.fillRect(px, 290 - Math.abs(Math.sin(t * 5)) * 70, 30, 30);
      ctx.fillStyle = '#ff4f6a'; for (let i = 0; i < 3; i++) ctx.fillRect((i * 230 + 120 - t * 80) % W + W * (i * 230 + 120 - t * 80 < 0), 290, 26, 30);
      ctx.font = '800 24px "DejaVu Sans Mono", monospace'; ctx.fillStyle = '#fff';
      ctx.fillText(`${screen?.title || 'SCORE'} ${String(Math.floor(t * 137) % 99999).padStart(5, '0')}`, 20, 18);
    } else {
      ctx.fillStyle = '#f4f4f6'; ctx.fillRect(0, 0, W, H);
      ctx.font = '500 22px Inter'; ctx.fillStyle = '#b5b7c0'; ctx.fillText(screen?.title || 'untitled', 24, 20);
    }
    this.texture.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
export class BaseSet {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.options = options;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.anchors = {};
    this.wallMats = [];
    this.cityMats = [];
    this.practicals = [];
    this.glows = [];
    this.keyPos = [-2.0, 3.1, -4.6];
    this.defaultTime = 'dusk';
    this.slots = {};
    this.wides = {
      wide: { pos: [1.55, 1.95, 2.35], target: [0.05, 0.98, -0.45], fov: 38 },
      wide2: { pos: [0.0, 1.45, 2.4], target: [0.0, 1.15, -0.5], fov: 40 },
    };
    const dome = new THREE.Mesh(new THREE.SphereGeometry(70, 48, 24), (this.skyMat = skyMaterial()));
    this.root.add(dome);
    this.build();
    this.buildLights();
  }

  // ---- primitive helpers -------------------------------------------------
  mesh(geo, mat, x = 0, y = 0, z = 0, parent = this.root) {
    const m = new THREE.Mesh(geo, typeof mat === 'string' ? clay(mat) : mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  box(w, h, d, mat, x, y, z, r = 0) {
    return this.mesh(r ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  }
  cyl(rt, rb, h, mat, x, y, z, seg = 24) {
    return this.mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);
  }
  wallMat(color) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
    this.wallMats.push({ mat: m, base: new THREE.Color(color) });
    return m;
  }
  glow(color, k = 1) {
    const m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    this.glows.push({ mat: m, base: new THREE.Color(color), k });
    return m;
  }

  floor(mat, size = 12) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    f.rotation.x = -Math.PI / 2; f.position.set(0, 0, 1);
    f.receiveShadow = true;
    this.root.add(f);
    return f;
  }

  // Back wall at z with an optional window opening, plus side/front walls.
  room({ color = '#b7bcc4', z = -1.7, window: win = { x0: -1.25, x1: 1.25, y0: 0.82, y1: 2.7, cols: 3, rows: 3 }, H = 3.2, left = -3.2, right = 3.4, front = 2.6, frameColor = '#26272c' } = {}) {
    const mat = this.wallMat(this.options.wall || color);
    const slab = (x0, x1, y0, y1) => { if (x1 - x0 > 0.001 && y1 - y0 > 0.001) this.box(x1 - x0, y1 - y0, 0.12, mat, (x0 + x1) / 2, (y0 + y1) / 2, z); };
    if (win) {
      slab(left, win.x0, 0, H); slab(win.x1, right, 0, H); slab(win.x0, win.x1, 0, win.y0); slab(win.x0, win.x1, win.y1, H);
      const fm = clay(frameColor, { roughness: 0.5, sheen: 0 });
      const fw = 0.035, cx = (win.x0 + win.x1) / 2, cy = (win.y0 + win.y1) / 2;
      this.box(win.x1 - win.x0 + fw, fw, 0.07, fm, cx, win.y0, z + 0.02); this.box(win.x1 - win.x0 + fw, fw, 0.07, fm, cx, win.y1, z + 0.02);
      this.box(fw, win.y1 - win.y0, 0.07, fm, win.x0, cy, z + 0.02); this.box(fw, win.y1 - win.y0, 0.07, fm, win.x1, cy, z + 0.02);
      for (let i = 1; i < (win.cols || 3); i++) this.box(0.022, win.y1 - win.y0, 0.04, fm, lerp(win.x0, win.x1, i / win.cols), cy, z + 0.02);
      for (let i = 1; i < (win.rows || 3); i++) this.box(win.x1 - win.x0, 0.022, 0.04, fm, cx, lerp(win.y0, win.y1, i / win.rows), z + 0.02);
      this.box(win.x1 - win.x0 + 0.2, 0.04, 0.3, '#e9e2d6', cx, win.y0 - 0.01, z + 0.12, 0.012);
    } else {
      slab(left, right, 0, H);
    }
    if (right) this.box(0.12, H, front - z, mat, right, H / 2, (front + z) / 2);
    if (left) this.box(0.12, H, front - z, mat, left, H / 2, (front + z) / 2);
    if (front) this.box(right - left, H, 0.12, mat, (left + right) / 2, H / 2, front);
    return mat;
  }

  city() {
    for (let k = 0; k < 4; k++) {
      const tex = cityTexture(k + 1);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 4);
      this.cityMats.push(new THREE.MeshBasicMaterial({ map: tex, color: '#ffffff' }));
    }
    for (let i = 0; i < 70; i++) {
      const w = 1.5 + rand(i, 1) * 3, d = 1.5 + rand(i, 2) * 2;
      const zz = -9 - rand(i, 3) * 26;
      const top = -2.4 + rand(i, 4) * 3.6 + (zz < -22 ? 2.5 : 0);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 40, d), this.cityMats[i % 4]);
      b.position.set(-22 + rand(i, 5) * 44, top - 20, zz);
      this.root.add(b);
    }
  }

  // Grass, hills and trees all around (for outdoor sets and garden windows).
  nature({ ground = '#7fae5a', trees = 40, inner = 3.5, outer = 22, groundY = 0 } = {}) {
    const g = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ map: noiseTexture(ground, 30, 40), roughness: 0.95 }));
    g.rotation.x = -Math.PI / 2; g.position.y = groundY - 0.01; g.receiveShadow = true; this.root.add(g);
    const leaf = ['#5c8f4a', '#6fa25a', '#4f7f45', '#86b16a'];
    for (let i = 0; i < trees; i++) {
      const a = rand(i, 11) * Math.PI * 2, r = inner + rand(i, 12) * (outer - inner);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 2.2 && z > -2.2 && z < 2.4) continue;
      const s = 0.7 + rand(i, 13) * 0.9;
      this.cyl(0.08 * s, 0.11 * s, 1.2 * s, '#7a5a40', x, groundY + 0.6 * s, z, 10);
      const canopy = this.mesh(new THREE.SphereGeometry(0.75 * s, 18, 14), clay(leaf[i % 4], { sheen: 0.3 }), x, groundY + 1.5 * s, z);
      canopy.scale.set(1, 0.9, 1);
      if (i % 3 === 0) this.mesh(new THREE.SphereGeometry(0.5 * s, 16, 12), clay(leaf[(i + 1) % 4]), x + 0.35 * s, groundY + 1.2 * s, z + 0.2);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(14, 24, 12), new THREE.MeshStandardMaterial({ color: i % 2 ? '#7ea86a' : '#6d9a5e', roughness: 1 }));
      hill.scale.set(1.6, 0.35, 1); hill.position.set(Math.cos(a) * 45, groundY - 2, Math.sin(a) * 45);
      this.root.add(hill);
    }
  }

  plant(scale, color, x, y, z, pot = '#d9cfc0') {
    const g = new THREE.Group();
    this.mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.8, 24), pot, 0, 0.4, 0, g);
    const leafMat = clay(color, { sheen: 0.2 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const leaf = this.mesh(new THREE.SphereGeometry(0.35, 16, 12), leafMat, Math.cos(a) * 0.25, 1.15 + rand(i, 4) * 0.3, Math.sin(a) * 0.25, g);
      leaf.scale.set(0.45, 1.3, 0.2);
      leaf.rotation.set(Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5);
    }
    g.scale.setScalar(scale); g.position.set(x, y, z);
    this.root.add(g);
    return g;
  }

  bookshelf(x, z, { w = 0.85, h = 1.9, d = 0.32, color = '#f1ede6' } = {}) {
    const g = new THREE.Group();
    const m = clay(color);
    const panel = (pw, ph, pd, px, py) => this.mesh(new THREE.BoxGeometry(pw, ph, pd), m, px, py, 0, g);
    panel(0.03, h, d, -w / 2, h / 2); panel(0.03, h, d, w / 2, h / 2); panel(0.03, h, d, 0, h / 2);
    for (let i = 0; i <= 4; i++) panel(w, 0.03, d, 0, (i / 4) * h);
    const cols = ['#c0504d', '#e6b35a', '#4f6d8f', '#8aa37b', '#d9d2c3', '#2f3b4c', '#b5654a'];
    for (let s = 0; s < 4; s++) for (let c = 0; c < 2; c++) {
      let bx = -w / 2 + 0.03 + c * (w / 2);
      const n = 3 + Math.floor(rand(s * 3 + c, 7) * 5);
      for (let b = 0; b < n; b++) {
        const bw = 0.025 + rand(s * 10 + b + c, 8) * 0.025, bh = 0.18 + rand(b + s, c + 2) * 0.12;
        if (bx + bw > -w / 2 + (c + 1) * (w / 2) - 0.04) break;
        this.mesh(new THREE.BoxGeometry(bw, bh, 0.2), clay(cols[(s * 5 + b + c) % cols.length]), bx + bw / 2, (s / 4) * h + 0.015 + bh / 2, 0, g);
        bx += bw + 0.004;
      }
    }
    g.position.set(x, 0, z);
    this.root.add(g);
    return g;
  }

  frames(list, z, y = 1.5) {
    for (const [x, color, w = 0.5, h = 0.65] of list) {
      this.box(w, h, 0.03, '#2b2b30', x, y, z, 0.01);
      const art = this.mesh(new THREE.PlaneGeometry(w * 0.84, h * 0.88), clay(color, { sheen: 0 }), x, y, z + (z > 0 ? -0.017 : 0.017));
      if (z > 0) art.rotation.y = Math.PI;
    }
  }

  neon(text, x, y, z, { w = 0.75, h = 0.24, color = '#ffd0ea', glow = '#ff5fb4', rotY = 0 } = {}) {
    const mat = new THREE.MeshBasicMaterial({
      map: textTexture(this.options.sign ?? text, { font: '700 110px Inter', color, glow, w: 768, h: 200 }),
      transparent: true, toneMapped: false, depthWrite: false,
    });
    this.glows.push({ mat, base: new THREE.Color('#ffffff'), k: 1, neon: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.rotation.y = rotY;
    this.root.add(m);
    return m;
  }

  stringLights(x0, x1, y, z, n = 46) {
    const mat = this.glow(new THREE.Color(3, 2.4, 1.4));
    const geo = new THREE.SphereGeometry(0.012, 8, 6);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const b = new THREE.Mesh(geo, mat);
      b.position.set(lerp(x0, x1, u), y - Math.abs(Math.sin(u * Math.PI * 3)) * 0.14, z);
      this.root.add(b);
    }
  }

  practical(x, y, z, { color = '#ffc98a', intensity = 0.6, distance = 3.5, shadow = false } = {}) {
    const l = new THREE.PointLight(color, 0, distance, 1.6);
    l.position.set(x, y, z);
    if (shadow) { l.castShadow = true; l.shadow.mapSize.set(512, 512); l.shadow.bias = -0.002; }
    this.scene.add(l);
    this.practicals.push({ light: l, base: intensity });
    return l;
  }

  pendant(x, y, z, { cord = 3.2, color = '#2b2b30', light = true } = {}) {
    this.cyl(0.004, 0.004, cord - y, '#222', x, (cord + y) / 2 + 0.1, z, 6);
    const shade_ = this.mesh(new THREE.ConeGeometry(0.13, 0.14, 24, 1, true), clay(color, { roughness: 0.4 }), x, y + 0.08, z);
    shade_.material.side = THREE.DoubleSide;
    this.mesh(new THREE.SphereGeometry(0.04, 16, 12), this.glow(new THREE.Color('#fff0d0').multiplyScalar(2.5)), x, y + 0.02, z);
    if (light) this.practical(x, y - 0.05, z, { intensity: 0.7, distance: 3 });
  }

  chair(x, z, { color = '#e0a43a', seatY = 0.46, rotY = 0, back = true } = {}) {
    const g = new THREE.Group();
    const m = clay(color);
    if (back) {
      const b = this.mesh(new RoundedBoxGeometry(0.5, 0.5, 0.07, 4, 0.03), m, 0, seatY + 0.42, -0.24, g);
      b.rotation.x = -0.08;
    }
    this.mesh(new RoundedBoxGeometry(0.48, 0.07, 0.45, 4, 0.03), m, 0, seatY, 0, g);
    this.mesh(new THREE.CylinderGeometry(0.025, 0.025, seatY - 0.04, 12), clay('#2d2e33'), 0, (seatY - 0.04) / 2, 0, g);
    this.mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 20), clay('#2d2e33'), 0, 0.015, 0, g);
    g.position.set(x, 0, z); g.rotation.y = rotY;
    this.root.add(g);
    return g;
  }

  // Screen devices. Each faces the main character (toward -z by default).
  device(kind, x, y, z, { rotY = 0, tilt = 0.28 } = {}) {
    this.screen = new Screen();
    const g = new THREE.Group();
    const dark = clay('#3a3c44', { roughness: 0.4, sheen: 0.1 });
    let sw, sh, lidY;
    if (kind === 'laptop') {
      this.mesh(new RoundedBoxGeometry(0.34, 0.014, 0.23, 3, 0.005), dark, 0, 0.007, 0, g);
      const kb = this.mesh(new THREE.PlaneGeometry(0.29, 0.1), new THREE.MeshStandardMaterial({
        map: canvasTexture(512, 180, (ctx, w, h) => {
          ctx.fillStyle = '#2a2b31'; ctx.fillRect(0, 0, w, h);
          for (let r = 0; r < 5; r++) for (let k = 0; k < 14; k++) { ctx.fillStyle = '#1b1c20'; ctx.beginPath(); ctx.roundRect(6 + k * 36 + (r % 2) * 6, 6 + r * 34, 30, 28, 5); ctx.fill(); }
        }), roughness: 0.7,
      }), 0, 0.0145, -0.03, g);
      kb.rotation.x = -Math.PI / 2;
      sw = 0.315; sh = 0.2; lidY = 0.014;
    } else if (kind === 'monitor') {
      this.mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.015, 24), dark, 0, 0.008, 0.05, g);
      this.mesh(new THREE.BoxGeometry(0.04, 0.2, 0.03), dark, 0, 0.1, 0.06, g);
      sw = 0.5; sh = 0.29; lidY = 0.07; tilt = 0.05;
    } else { // tablet on a stand
      this.mesh(new THREE.BoxGeometry(0.1, 0.012, 0.08), dark, 0, 0.006, 0.03, g);
      sw = 0.22; sh = 0.15; lidY = 0.01; tilt = 0.35;
    }
    const lid = new THREE.Group();
    lid.position.set(0, lidY, kind === 'laptop' ? 0.112 : 0.05);
    this.mesh(new RoundedBoxGeometry(sw + 0.025, sh + 0.03, 0.012, 3, 0.005), dark, 0, (sh + 0.03) / 2, 0, lid);
    // Not tone-mapped and kept under the bloom threshold so text stays readable.
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: this.screen.texture, toneMapped: false, color: new THREE.Color(0.8, 0.8, 0.8) }));
    scr.position.set(0, (sh + 0.03) / 2, -0.0065); scr.rotation.y = Math.PI;
    lid.add(scr);
    lid.rotation.x = -tilt;
    g.add(lid);
    g.position.set(x, y, z); g.rotation.y = rotY;
    this.root.add(g);
    this.root.updateMatrixWorld(true);
    this.anchors.screen = scr.getWorldPosition(new THREE.Vector3());
    // The screen's visible side faces -z in lid space; the camera sits in front of it.
    const n = new THREE.Vector3(0, 0, -1).applyQuaternion(lid.getWorldQuaternion(new THREE.Quaternion()));
    // Back off until the whole screen width fits the vertical frame (the
    // laptop is capped so the camera stays in front of the person using it).
    const fov = 50, hHalf = Math.atan(Math.tan((fov * Math.PI) / 360) * (9 / 16));
    const fit = (sw * 0.55) / Math.tan(hHalf);
    const dist = kind === 'laptop' ? Math.min(fit, 0.42) : fit;
    this.screenCam = { pos: this.anchors.screen.clone().addScaledVector(n, dist).add(new THREE.Vector3(0, 0.02, 0)), target: this.anchors.screen.clone(), fov };
    return g;
  }

  // ---- lights -------------------------------------------------------------
  buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
    s.add(this.hemi);
    this.key = new THREE.DirectionalLight('#ffffff', 1);
    this.key.position.set(...this.keyPos);
    this.key.target.position.set(0, 0.9, -0.3);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    Object.assign(this.key.shadow.camera, { left: -2.2, right: 2.2, top: 2.2, bottom: -2.2, near: 0.5, far: 14 });
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    s.add(this.key, this.key.target);
    this.fill = new THREE.DirectionalLight('#ffffff', 1);
    this.fill.position.set(1.2, 2.0, 3.0);
    this.fill.target.position.set(0, 1, -0.5);
    s.add(this.fill, this.fill.target);
    this.screenLight = new THREE.PointLight('#bcd0ff', 0, 1.6, 1.5);
    if (this.anchors.screen) this.screenLight.position.copy(this.anchors.screen).add(new THREE.Vector3(0, 0.3, -0.25));
    s.add(this.screenLight);
  }

  applyTime(p) {
    const C = (c) => new THREE.Color(c);
    const u = this.skyMat.uniforms;
    u.top.value.copy(C(p.skyTop)); u.mid.value.copy(C(p.skyMid)); u.horizon.value.copy(C(p.skyHorizon));
    u.sunColor.value.copy(C(p.sunColor)); u.sunPos.value.set(...p.sunPos);
    u.sunSize.value = p.sunSize; u.sunGlow.value = p.sunGlow;
    if (!this.scene.fog) this.scene.fog = new THREE.Fog('#000', 8, 60);
    this.scene.fog.color.copy(C(p.fog));
    for (const m of this.cityMats) m.color.setScalar(p.cityTint * (0.5 + 0.5 * p.cityLit));
    this.hemi.color.copy(C(p.hemiSky)); this.hemi.groundColor.copy(C(p.hemiGround)); this.hemi.intensity = p.hemi;
    this.key.color.copy(C(p.key)); this.key.intensity = p.keyI;
    this.fill.color.copy(C(p.fill)); this.fill.intensity = p.fillI;
    for (const { light, base } of this.practicals) light.intensity = base * p.practical;
    this.screenLight.intensity = this.anchors.screen ? p.screen * 0.12 : 0;
    const tint = C(p.tint);
    for (const { mat, base } of this.wallMats) mat.color.copy(base).multiply(tint);
    for (const g of this.glows) {
      if (g.neon) g.mat.color.setScalar(p.neon);
      else g.mat.color.copy(g.base).multiplyScalar((0.3 + 0.7 * Math.min(1, p.neon + p.practical * 0.5)) * g.k);
    }
    this.exposure = p.exposure;
  }
}

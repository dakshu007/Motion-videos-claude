// Expressions + 2D face painters. Faces are canvas textures, so every
// expression, blink and mouth shape is just drawing.
import { clamp, lerp, rand } from '../util.js';

const E = (o) => ({ brow: 0, browY: 0, browAsym: 0, open: 1, happyEyes: 0, smile: 0.25, mouthW: 1, o: 0, blush: 0.55, pupil: 1, hearts: 0, tears: 0, ...o });
export const EXPRESSIONS = {
  neutral: E({}),
  happy: E({ brow: 0.15, browY: 0.15, open: 0.92, smile: 1, mouthW: 1.2, blush: 0.8 }),
  joy: E({ brow: 0.2, browY: 0.25, happyEyes: 1, smile: 1, mouthW: 1.3, o: 0.35, blush: 0.95 }),
  worried: E({ brow: 1, browY: 0.1, open: 0.95, smile: -0.6, mouthW: 0.9, blush: 0.4, pupil: 0.95 }),
  sad: E({ brow: 1, browY: -0.1, open: 0.7, smile: -0.9, mouthW: 0.8, blush: 0.3 }),
  smug: E({ brow: -0.2, browAsym: 1, open: 0.62, smile: 0.75, blush: 0.6 }),
  skeptical: E({ brow: -0.3, browAsym: 1, open: 0.72, smile: -0.2, mouthW: 0.8, blush: 0.45 }),
  annoyed: E({ brow: -0.9, browY: -0.1, open: 0.55, smile: -0.4, mouthW: 0.9, blush: 0.5 }),
  angry: E({ brow: -1.3, browY: -0.2, open: 0.8, smile: -0.8, mouthW: 1.1, o: 0.2, blush: 0.9, pupil: 0.8 }),
  shocked: E({ brow: 0.5, browY: 0.6, open: 1.15, smile: 0, mouthW: 0.8, o: 0.75, blush: 0.7, pupil: 0.7 }),
  sleepy: E({ brow: 0.2, browY: -0.1, open: 0, smile: 0.1, mouthW: 0.8, o: 0.1, blush: 0.5 }),
  determined: E({ brow: -0.6, open: 0.85, smile: 0.4, mouthW: 1.1, blush: 0.6 }),
  love: E({ brow: 0.3, browY: 0.2, open: 1, smile: 1, mouthW: 1.2, o: 0.15, blush: 1, hearts: 1 }),
  crying: E({ brow: 1.1, browY: 0, open: 0.55, smile: -1, mouthW: 1.1, o: 0.45, blush: 0.8, tears: 1 }),
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

export function faceKey(e) {
  return Object.values(e).map((v) => (typeof v === 'number' ? v.toFixed(2) : v)).join(',');
}

function heart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.45, y - s * 1.0, x, y - s * 0.4);
  ctx.bezierCurveTo(x + s * 0.45, y - s * 1.0, x + s * 1.1, y - s * 0.35, x, y + s * 0.35);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Human face: painted on an equirectangular texture wrapped around the head.
// ---------------------------------------------------------------------------
export const FACE_W = 2048, FACE_H = 1024;
const PX = FACE_W / 360; // px per degree

export function drawHumanFace(ctx, e, look) {
  ctx.fillStyle = look.skin;
  ctx.fillRect(0, 0, FACE_W, FACE_H);
  const at = (lon, lat, fn) => {
    ctx.save();
    ctx.translate(FACE_W * 0.25 + lon * PX, FACE_H * 0.5 - lat * PX);
    ctx.scale(1 / Math.cos((lat * Math.PI) / 180), 1);
    fn();
    ctx.restore();
  };
  const ink = look.lashColor;

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

  const ew = 17 * PX, eh = 19 * PX;
  for (const s of [-1, 1]) {
    at(s * 19.5, -7, () => {
      const open = clamp(e.open * (1 - e.blink), 0, 1.2) * (1 - e.happyEyes);
      ctx.lineCap = 'round';
      if (e.happyEyes > 0.5) {
        ctx.strokeStyle = ink; ctx.lineWidth = 9;
        ctx.beginPath(); ctx.arc(0, eh * 0.18, ew * 0.42, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        return;
      }
      const h = eh * open;
      if (h < 10) {
        ctx.strokeStyle = ink; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(0, -eh * 0.25, ew * 0.48, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
        if (look.lashes) {
          ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(s * ew * 0.42, eh * 0.05); ctx.lineTo(s * ew * 0.58, eh * 0.12); ctx.stroke();
        }
        return;
      }
      const top = -h * 0.5 + eh * 0.08, bottom = eh * 0.5;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-ew * 0.5, eh * 0.05);
      ctx.bezierCurveTo(-ew * 0.45, top, ew * 0.45, top, ew * 0.5, eh * 0.05);
      ctx.bezierCurveTo(ew * 0.5, bottom, -ew * 0.5, bottom, -ew * 0.5, eh * 0.05);
      ctx.closePath();
      ctx.fillStyle = '#fdf8f4'; ctx.fill(); ctx.clip();
      const ix = e.lookX * ew * 0.2, iy = eh * 0.08 - e.lookY * eh * 0.12;
      const ir = ew * 0.37;
      if (e.hearts > 0.5) {
        ctx.fillStyle = '#ff4f86'; heart(ctx, ix, iy + ir * 0.2, ir * 1.05);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(ix - ir * 0.35, iy - ir * 0.25, ir * 0.18, 0, Math.PI * 2); ctx.fill();
      } else {
        const g = ctx.createLinearGradient(0, iy - ir, 0, iy + ir);
        g.addColorStop(0, look.irisDark); g.addColorStop(0.55, look.iris); g.addColorStop(1, look.irisLight);
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(ix, iy, ir, ir * 1.12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1d0e08';
        ctx.beginPath(); ctx.ellipse(ix, iy, ir * 0.45 * e.pupil, ir * 0.52 * e.pupil, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath(); ctx.arc(ix - ir * 0.35, iy - ir * 0.4, ir * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ix + ir * 0.35, iy + ir * 0.45, ir * 0.13, 0, Math.PI * 2); ctx.fill();
      }
      const sh = ctx.createLinearGradient(0, top, 0, top + eh * 0.3);
      sh.addColorStop(0, 'rgba(120,60,40,0.45)'); sh.addColorStop(1, 'rgba(120,60,40,0)');
      ctx.fillStyle = sh; ctx.fillRect(-ew, top, ew * 2, eh * 0.3);
      ctx.restore();
      ctx.strokeStyle = ink; ctx.lineWidth = look.lashes ? 11 : 7;
      ctx.beginPath();
      ctx.moveTo(-ew * 0.52, eh * 0.08);
      ctx.bezierCurveTo(-ew * 0.45, top - 2, ew * 0.45, top - 2, ew * 0.52, eh * 0.08);
      ctx.stroke();
      if (look.lashes) {
        ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(s * ew * 0.48, 0); ctx.lineTo(s * ew * 0.66, -eh * 0.08); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * ew * 0.42, -h * 0.25); ctx.lineTo(s * ew * 0.58, -h * 0.38); ctx.stroke();
      }
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(80,40,25,0.6)';
      ctx.beginPath(); ctx.arc(0, eh * 0.02, ew * 0.48, Math.PI * 0.25, Math.PI * 0.75); ctx.stroke();
    });
    if (e.tears > 0.5) {
      at(s * 21, -16, () => {
        const g = ctx.createLinearGradient(0, 0, 0, 160);
        g.addColorStop(0, 'rgba(140,200,255,0.95)'); g.addColorStop(1, 'rgba(140,200,255,0.2)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect(-9, 0, 18, 150, 9); ctx.fill();
      });
    }
  }

  for (const s of [-1, 1]) {
    const asym = e.browAsym * (s > 0 ? 1 : -0.3);
    at(s * 20, 10.5 + e.browY * 3 + asym * 2.5, () => {
      ctx.strokeStyle = look.browColor; ctx.lineWidth = look.browWidth; ctx.lineCap = 'round';
      const inner = -s * 50, outer = s * 50;
      const tilt = e.brow * 14;
      ctx.beginPath();
      ctx.moveTo(inner, -tilt);
      ctx.quadraticCurveTo(0, -12 - Math.abs(tilt) * 0.2, outer, tilt * 0.4 + 6);
      ctx.stroke();
    });
  }

  at(0, -30, () => {
    const w = 30 * e.mouthW, o = clamp(e.o + e.talk * 0.85, 0, 1), sm = e.smile;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (o < 0.08) {
      ctx.strokeStyle = look.lip; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-w, -sm * 8); ctx.quadraticCurveTo(0, sm * 16, w, -sm * 8); ctx.stroke();
      return;
    }
    const h = 8 + o * 38, ww = w * (1.05 - o * 0.35);
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
// Mascot faces: drawn into a 512x512 transparent canvas mapped onto a front
// patch (plane, sphere patch or cylinder patch).
// ---------------------------------------------------------------------------
export function drawMascotFace(ctx, e, style) {
  const W = 512, H = 512;
  ctx.clearRect(0, 0, W, H);
  const open = clamp(e.open * (1 - e.blink), 0, 1.2);
  const talk = clamp(e.o + e.talk * 0.9, 0, 1);
  const shocked = e.o > 0.5;
  const lx = e.lookX * 14, ly = -e.lookY * 10;
  const INK = style === 'robot' ? '#6ff3ff' : '#16120f';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  if (style === 'robot') {
    ctx.fillStyle = '#12161f';
    ctx.beginPath(); ctx.roundRect(20, 40, W - 40, H - 80, 60); ctx.fill();
    ctx.shadowColor = '#6ff3ff'; ctx.shadowBlur = 24;
  }
  if (style === 'cat') {
    // muzzle
    ctx.fillStyle = 'rgba(255,248,240,0.95)';
    ctx.beginPath(); ctx.ellipse(W / 2, H * 0.7, 120, 80, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Eyes
  const eyeY = style === 'cat' ? H * 0.46 : H * 0.4;
  const eyeDX = style === 'cat' ? 0.2 : style === 'cute' ? 0.17 : 0.22;
  for (const s of [-1, 1]) {
    const cx = W / 2 + s * W * eyeDX + lx, cy = eyeY + ly;
    ctx.fillStyle = INK; ctx.strokeStyle = INK;
    if (e.hearts > 0.5) {
      ctx.fillStyle = '#ff4f86'; heart(ctx, cx, cy + 20, 48);
      continue;
    }
    if (e.happyEyes > 0.5) {
      ctx.lineWidth = 20;
      ctx.beginPath(); ctx.moveTo(cx - 28, cy + 14); ctx.lineTo(cx, cy - 14); ctx.lineTo(cx + 28, cy + 14); ctx.stroke();
      continue;
    }
    // brow cut for angry / worried looks
    const browCut = Math.abs(e.brow) > 0.3 ? Math.abs(e.brow) * 24 : 0;
    const slant = e.brow < -0.3 ? -s : e.brow > 0.3 ? s : 0;
    if (style === 'pixel' || style === 'robot') {
      const h = 120 * open, w = 64 * (shocked ? 1.15 : 1);
      if (h < 12) { ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(cx - 26, cy + 8); ctx.lineTo(cx + 26, cy + 8); ctx.stroke(); continue; }
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - 60, cy - h / 2 + browCut + slant * -18); ctx.lineTo(cx + 60, cy - h / 2 + browCut + slant * 18);
      ctx.lineTo(cx + 60, cy + 200); ctx.lineTo(cx - 60, cy + 200); ctx.closePath(); ctx.clip();
      ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - h / 2, w, h, style === 'robot' ? 30 : 12); ctx.fill();
      ctx.restore();
      if (style === 'pixel') { ctx.fillStyle = '#fff'; ctx.fillRect(cx - w / 2 + 12, cy - h / 2 + 13 + browCut, 20, 20); }
    } else if (style === 'cat') {
      const h = 110 * open, w = 92;
      if (h < 12) { ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(cx, cy - 10, 34, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); continue; }
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - 70, cy - h / 2 + browCut + slant * -20); ctx.lineTo(cx + 70, cy - h / 2 + browCut + slant * 20);
      ctx.lineTo(cx + 70, cy + 200); ctx.lineTo(cx - 70, cy + 200); ctx.closePath(); ctx.clip();
      ctx.fillStyle = '#c9d65a';
      ctx.beginPath(); ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = '#3a3020'; ctx.stroke();
      ctx.fillStyle = '#16120f';
      const pw = shocked || e.pupil < 0.9 ? 30 : 12;
      ctx.beginPath(); ctx.ellipse(cx + lx * 0.5, cy, pw, h * 0.42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - 18, cy - 22, 10, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else { // cute
      const r = 38 * (shocked ? 1.2 : 1), h = r * 2.2 * open;
      if (h < 10) { ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(cx, cy - 12, 26, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); continue; }
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - 60, cy - h / 2 + browCut * 0.7 + slant * -16); ctx.lineTo(cx + 60, cy - h / 2 + browCut * 0.7 + slant * 16);
      ctx.lineTo(cx + 60, cy + 200); ctx.lineTo(cx - 60, cy + 200); ctx.closePath(); ctx.clip();
      ctx.beginPath(); ctx.ellipse(cx, cy, r, h / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - h * 0.2, r * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + r * 0.3, cy + h * 0.18, r * 0.14, 0, Math.PI * 2); ctx.fill();
    }
    if (e.tears > 0.5) {
      ctx.fillStyle = 'rgba(120,190,255,0.9)';
      ctx.beginPath(); ctx.roundRect(cx - 10, cy + 40, 20, 110, 10); ctx.fill();
    }
  }

  // Mouth
  const mx = W / 2 + lx * 0.6;
  const my = style === 'cat' ? H * 0.72 : H * 0.66;
  ctx.fillStyle = INK; ctx.strokeStyle = INK;
  if (style === 'cat') {
    ctx.fillStyle = '#f08ca0';
    ctx.beginPath(); ctx.moveTo(mx - 16, my - 40); ctx.lineTo(mx + 16, my - 40); ctx.lineTo(mx, my - 24); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#3a2a20'; ctx.lineWidth = 7;
    if (talk > 0.08) {
      ctx.fillStyle = '#7a2b2b';
      ctx.beginPath(); ctx.ellipse(mx, my + 4, 16 + talk * 6, 6 + talk * 22, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(mx - 15, my - 22, 15, Math.PI * 0.1, Math.PI * 0.9 + e.smile * 0.1); ctx.stroke();
      ctx.beginPath(); ctx.arc(mx + 15, my - 22, 15, Math.PI * 0.1 - e.smile * 0.1, Math.PI * 0.9); ctx.stroke();
    }
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(60,40,30,0.7)';
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      ctx.beginPath(); ctx.moveTo(mx + s * 60, my - 26 + k * 14); ctx.lineTo(mx + s * 170, my - 40 + k * 22); ctx.stroke();
    }
  } else if (style === 'robot') {
    if (talk > 0.05) {
      for (let k = -4; k <= 4; k++) {
        const hgt = 10 + talk * 70 * (0.4 + 0.6 * Math.abs(Math.sin(k * 1.7 + e.talk * 9)));
        ctx.fillRect(mx + k * 22 - 7, my - hgt / 2, 14, hgt);
      }
    } else {
      ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(mx - 50, my - e.smile * 10); ctx.quadraticCurveTo(mx, my + e.smile * 30, mx + 50, my - e.smile * 10); ctx.stroke();
    }
    ctx.shadowBlur = 0;
  } else if (talk > 0.08) {
    ctx.beginPath(); ctx.ellipse(mx, my, 20 + talk * 12, 12 + talk * 32, 0, 0, Math.PI * 2); ctx.fill();
  } else if (Math.abs(e.smile) > 0.3) {
    ctx.lineWidth = 12;
    if (style === 'cute' && e.smile > 0.3) {
      ctx.beginPath(); ctx.arc(mx - 13, my - 6, 13, Math.PI * 0.1, Math.PI * 0.95); ctx.stroke();
      ctx.beginPath(); ctx.arc(mx + 13, my - 6, 13, Math.PI * 0.05, Math.PI * 0.9); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(mx - 28, my - e.smile * 8); ctx.quadraticCurveTo(mx, my + e.smile * 24, mx + 28, my - e.smile * 8); ctx.stroke();
    }
  } else {
    ctx.beginPath(); ctx.arc(mx, my, 17, 0, Math.PI * 2); ctx.fill();
  }

  if (e.blush > 0.7 && style !== 'robot') {
    ctx.fillStyle = `rgba(255,120,130,${(e.blush - 0.7) * 1.6})`;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(W / 2 + s * 150, my - 30, 34, 18, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  if (style === 'robot' && e.blush > 0.7) {
    ctx.fillStyle = `rgba(255,110,170,${(e.blush - 0.7) * 2})`;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(W / 2 + s * 160, my - 40, 26, 12, 0, 0, Math.PI * 2); ctx.fill(); }
  }
}

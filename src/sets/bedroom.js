import * as THREE from 'three';
import { BaseSet, woodTexture, textTexture } from './common.js';
import { clay, canvasTexture } from '../util.js';

const DESK = 0.74;

export class BedroomSet extends BaseSet {
  build() {
    this.defaultTime = 'night';
    this.keyPos = [3.0, 3.2, -4.6];
    this.floor(new THREE.MeshStandardMaterial({ map: woodTexture('#7a5a42'), roughness: 0.75 }));
    this.room({ color: '#4a5478', window: { x0: 0.7, x1: 1.9, y0: 1.0, y1: 2.4, cols: 2, rows: 2 } });
    this.city();
    const rug = this.mesh(new THREE.CircleGeometry(1.2, 48), clay('#3b3f5c', { sheen: 0.8 }), 0, 0.004, 0.1);
    rug.rotation.x = -Math.PI / 2;

    // Desk + big monitor + RGB keyboard
    this.box(1.6, 0.04, 0.75, clay('#1d1e24', { roughness: 0.4 }), 0, DESK - 0.02, 0, 0.01);
    for (const x of [-0.75, 0.75]) this.box(0.05, DESK - 0.04, 0.65, '#2b2c33', x, (DESK - 0.04) / 2, 0);
    this.device('monitor', 0, DESK, -0.12);
    const rgb = canvasTexture(512, 128, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      ['#ff3d7f', '#ffb13d', '#3dff8f', '#3dc8ff', '#a23dff'].forEach((c, i) => g.addColorStop(i / 4, c));
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
      for (let r = 0; r < 4; r++) for (let k = 0; k < 16; k++) { ctx.fillStyle = g; ctx.globalAlpha = 0.85; ctx.fillRect(6 + k * 31, 8 + r * 30, 26, 24); }
    });
    this.box(0.4, 0.018, 0.13, clay('#18181c'), -0.02, DESK + 0.009, -0.22);
    const keys = this.mesh(new THREE.PlaneGeometry(0.38, 0.11), new THREE.MeshBasicMaterial({ map: rgb, toneMapped: false }), -0.02, DESK + 0.0185, -0.22);
    keys.rotation.x = -Math.PI / 2;
    this.box(0.06, 0.02, 0.1, '#18181c', 0.3, DESK + 0.01, -0.24, 0.008);
    this.cyl(0.03, 0.03, 0.12, clay('#3dff8f', { roughness: 0.3 }), -0.6, DESK + 0.06, 0.15, 16);
    this.cyl(0.03, 0.03, 0.12, clay('#ff3d7f', { roughness: 0.3 }), -0.66, DESK + 0.06, 0.05, 16);
    // LED strips (desk edge + wall)
    this.box(1.55, 0.012, 0.012, this.glow(new THREE.Color('#ff3dc8').multiplyScalar(3)), 0, DESK - 0.045, -0.37);
    this.box(3.0, 0.02, 0.02, this.glow(new THREE.Color('#3dc8ff').multiplyScalar(3)), -0.6, 2.9, -1.62);
    this.practical(-0.6, 1.0, -1.2, { color: '#ff3dc8', intensity: 0.9, distance: 3 });
    this.practical(0.6, 2.4, -1.2, { color: '#3dc8ff', intensity: 0.9, distance: 3.5 });
    this.practical(0, 1.3, -0.1, { color: '#a0b4ff', intensity: 0.35, distance: 2 });
    this.neon('gg', -0.55, 2.2, -1.63, { w: 0.5, h: 0.3, color: '#d6fff6', glow: '#3dffd0' });
    // Posters
    const poster = (text, x, y, bg, fg) => {
      const m = this.mesh(new THREE.PlaneGeometry(0.42, 0.58), new THREE.MeshStandardMaterial({ map: textTexture(text, { w: 420, h: 580, font: '900 84px Inter', bg, color: fg }), roughness: 0.8 }), x, y, -1.635);
      m.castShadow = false;
    };
    poster('LEVEL\nUP', -1.3, 1.65, '#ff4f6a', '#fff3d6');
    poster('PRESS\nSTART', 0.25, 1.85, '#2b2f6b', '#ffd23f');

    // Gaming chair
    const chair = this.chair(0, -0.72, { color: '#24242c' });
    this.box(0.08, 0.48, 0.072, '#e5484d', 0, 0.88, -0.96);

    // Bed
    this.box(1.3, 0.32, 2.0, '#3b3f5c', -2.2, 0.16, -0.65, 0.04);
    this.box(1.25, 0.14, 1.9, '#e9e6f2', -2.2, 0.38, -0.65, 0.05);
    this.box(1.28, 0.08, 1.2, '#7c5cff', -2.2, 0.46, -0.3, 0.04);
    for (const x of [-2.5, -1.9]) this.box(0.45, 0.12, 0.3, '#f2f0f8', x, 0.52, -1.42, 0.06);
    this.box(1.35, 0.7, 0.08, '#3b3f5c', -2.2, 0.5, -1.63, 0.03);
    this.plant(0.12, '#5f8f5a', 2.2, 0, -1.3, '#3b3f5c');
    this.chair(1.0, -0.2, { rotY: -0.8, back: false, color: '#7c5cff' });

    // Behind the camera: wardrobe + door
    this.box(1.2, 2.1, 0.55, '#d9d4e8', -1.6, 1.05, 2.25, 0.02);
    this.box(0.9, 2.05, 0.05, '#8a7a6a', 1.2, 1.025, 2.55, 0.01);
    this.mesh(new THREE.SphereGeometry(0.03, 12, 10), clay('#c9a25e'), 0.85, 1.0, 2.5);

    this.slots = {
      main: { pos: [0, 0, -0.66], yaw: 0, pose: 'sit', surface: { y: DESK, z: 0.42, edge: 0.3 } },
      side: { pos: [1.0, 0, -0.2], yaw: -0.8, pose: 'sit' },
      desk: { pos: [-0.45, DESK, 0.02] },
      desk2: { pos: [0.45, DESK, 0.05] },
    };
    this.chairMesh = chair;
  }
}

import * as THREE from 'three';
import { BaseSet, woodTexture, tileTexture, textTexture } from './common.js';
import { clay, canvasTexture } from '../util.js';

const TOP = 0.95;

export class CafeSet extends BaseSet {
  build() {
    this.defaultTime = 'day';
    this.keyPos = [-6.0, 3.6, -5.3];
    this.floor(new THREE.MeshStandardMaterial({ map: tileTexture('#efe9df', '#2f3a40', 10), roughness: 0.6 }));
    this.room({ color: '#eadcc8', window: { x0: -2.7, x1: -1.1, y0: 0.9, y1: 2.5, cols: 2, rows: 2 }, right: 3.0, left: -3.0, front: 2.8 });
    this.city();

    // Chalkboard menu
    this.box(1.3, 0.85, 0.04, '#5a4030', 0.15, 1.85, -1.62, 0.01);
    const menu = this.mesh(new THREE.PlaneGeometry(1.2, 0.75), new THREE.MeshStandardMaterial({
      map: textTexture('MENU\nespresso ....... 3\nlatte ........... 4.5\nmatcha ......... 5\ncroissant ...... 3.5', { w: 1024, h: 640, font: '600 64px "DejaVu Sans Mono", monospace', color: '#f4f1e8', bg: '#2a2f2c' }),
      roughness: 0.9,
    }), 0.15, 1.85, -1.595);
    menu.castShadow = false;
    this.neon('coffee', 1.75, 2.55, -1.63, { color: '#ffe7c4', glow: '#ff9a3c' });
    // Shelves with jars and cups
    for (const [y, n] of [[1.45, 5], [1.85, 4]]) {
      this.box(1.1, 0.03, 0.22, '#8a6448', 1.75, y, -1.55);
      for (let i = 0; i < n; i++) {
        const c = ['#c9e0d8', '#f2d1a8', '#e8e3da', '#b9cbe0', '#f0b8a8'][i];
        this.cyl(0.06, 0.06, 0.16, clay(c, { roughness: 0.3 }), 1.3 + i * 0.22, y + 0.095, -1.55);
      }
    }
    this.plant(0.14, '#5f8f5a', -0.75, 0, -1.4);
    this.plant(0.1, '#6fa05a', 2.6, 0, -1.3);

    // Counter
    const slats = canvasTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#4d7c78'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 24; i++) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(i * w / 24, 0, 3, h); }
    }, { repeat: [3, 1] });
    this.box(2.2, TOP - 0.03, 0.55, new THREE.MeshStandardMaterial({ map: slats, roughness: 0.7 }), 0, (TOP - 0.03) / 2, 0.02);
    this.box(2.3, 0.05, 0.64, new THREE.MeshPhysicalMaterial({ map: woodTexture('#c8956a', 2), roughness: 0.45, clearcoat: 0.3 }), 0, TOP - 0.025, 0, 0.015);

    // Espresso machine (back panel faces the camera) + grinder
    const steel = clay('#c9ccd1', { roughness: 0.25, sheen: 0.2 });
    this.box(0.4, 0.3, 0.3, steel, -0.68, TOP + 0.15, -0.12, 0.02);
    this.box(0.36, 0.04, 0.26, '#2b2c30', -0.68, TOP + 0.32, -0.12, 0.01);
    this.box(0.2, 0.06, 0.005, this.glow(new THREE.Color('#e07a5f'), 0.6), -0.68, TOP + 0.18, 0.031);
    for (let i = 0; i < 3; i++) this.cyl(0.035, 0.03, 0.07, '#f4efe6', -0.8 + i * 0.12, TOP + 0.375, -0.12, 16);
    this.cyl(0.07, 0.08, 0.2, '#2b2c30', -1.0, TOP + 0.1, -0.1, 20);
    this.mesh(new THREE.ConeGeometry(0.08, 0.14, 20), clay('#c9ccd1', { roughness: 0.3 }), -1.0, TOP + 0.27, -0.1).rotation.x = Math.PI;

    // Pastry case
    this.box(0.4, 0.03, 0.34, '#8a6448', 0.82, TOP + 0.015, 0.0);
    const glass = this.box(0.4, 0.24, 0.34, new THREE.MeshPhysicalMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.18, roughness: 0.05 }), 0.82, TOP + 0.15, 0.0);
    glass.castShadow = false;
    for (let i = 0; i < 4; i++) {
      const d = this.mesh(new THREE.TorusGeometry(0.035, 0.018, 10, 20), clay(i % 2 ? '#e6a96b' : '#d9895a'), 0.7 + (i % 2) * 0.12, TOP + 0.05, -0.08 + Math.floor(i / 2) * 0.12);
      d.rotation.x = Math.PI / 2;
    }
    this.mesh(new THREE.SphereGeometry(0.04, 16, 12), clay('#f2c8d8'), 0.95, TOP + 0.07, 0.05);

    this.device('tablet', 0.22, TOP, -0.12);
    for (let i = 0; i < 3; i++) this.cyl(0.038, 0.032, 0.09, '#f4efe6', 0.5, TOP + 0.045 + i * 0.07, -0.14, 20);
    this.cyl(0.05, 0.05, 0.12, new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.3, roughness: 0.05 }), 0.38, TOP + 0.06, 0.2);

    for (const x of [-0.75, 0, 0.75]) this.pendant(x, 2.05, 0.0, { color: '#2f4f4c' });

    // Seating area behind the camera
    for (const [x, z] of [[-1.3, 1.6], [1.4, 1.8]]) {
      this.cyl(0.4, 0.4, 0.04, '#e9e2d6', x, 0.74, z, 32);
      this.cyl(0.03, 0.03, 0.72, '#2b2c30', x, 0.37, z, 10);
      this.chair(x - 0.55, z, { rotY: Math.PI / 2, color: '#c47a4a', seatY: 0.46 });
      this.chair(x + 0.55, z, { rotY: -Math.PI / 2, color: '#c47a4a', seatY: 0.46 });
    }
    this.frames([[-0.4, '#f2b880'], [0.3, '#8fb8a0', 0.4, 0.5]], 2.73);
    this.plant(0.16, '#4f7f45', 2.5, 0, 2.3);

    this.slots = {
      main: { pos: [0, 0, -0.6], yaw: 0, pose: 'stand', surface: { y: TOP, z: 0.34, edge: 0.27 } },
      side: { pos: [0.8, 0, -0.62], yaw: -0.3, pose: 'stand', surface: { y: TOP, z: 0.38, edge: 0.3 } },
      desk: { pos: [-0.3, TOP, 0.06] },
      desk2: { pos: [0.48, TOP, 0.1] },
    };
    this.wides = {
      wide: { pos: [1.7, 1.9, 2.4], target: [0, 1.2, -0.4], fov: 40 },
      wide2: { pos: [-1.4, 1.6, 2.2], target: [0.1, 1.25, -0.6], fov: 40 },
    };
  }
}

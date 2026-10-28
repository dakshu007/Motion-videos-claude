import * as THREE from 'three';
import { BaseSet, woodTexture, tileTexture } from './common.js';
import { clay } from '../util.js';

const TOP = 0.945;

export class KitchenSet extends BaseSet {
  build() {
    this.defaultTime = 'day';
    this.keyPos = [-0.8, 3.2, -5.0];
    this.floor(new THREE.MeshStandardMaterial({ map: woodTexture('#d7b98f'), roughness: 0.7 }));
    this.room({ color: '#e3ece4', window: { x0: -0.7, x1: 0.7, y0: 1.15, y1: 2.2, cols: 2, rows: 2 }, right: 2.6, left: -2.6 });
    this.nature({ ground: '#8cbf63', trees: 30, inner: 5 });

    // Back counter run, sink, upper cabinets, fridge
    const sage = clay('#7aa39a'), marble = clay('#f2f0ec', { roughness: 0.3, sheen: 0.2 });
    this.box(3.6, 0.88, 0.6, sage, 0, 0.44, -1.38, 0.01);
    this.box(3.7, 0.04, 0.64, marble, 0, 0.9, -1.38, 0.01);
    for (let i = 0; i < 6; i++) {
      this.box(0.004, 0.8, 0.004, '#5d8278', -1.5 + i * 0.6, 0.44, -1.077);
      this.box(0.12, 0.015, 0.02, '#c9a25e', -1.35 + i * 0.6, 0.78, -1.07);
    }
    const splash = this.mesh(new THREE.PlaneGeometry(3.6, 0.25), new THREE.MeshStandardMaterial({ map: tileTexture('#ffffff', '#dfeaf0', 14), roughness: 0.4 }), 0, 1.04, -1.635);
    splash.castShadow = false;
    this.box(0.5, 0.02, 0.36, '#9aa3ab', 0, 0.915, -1.38);
    this.cyl(0.015, 0.015, 0.25, '#c9ccd1', 0, 1.04, -1.55, 10);
    this.mesh(new THREE.TorusGeometry(0.07, 0.013, 8, 20, Math.PI), clay('#c9ccd1'), 0, 1.16, -1.48).rotation.y = Math.PI / 2;
    for (const x of [-1.45, 1.2]) {
      this.box(0.9, 0.7, 0.35, sage, x, 1.95, -1.52, 0.01);
      this.box(0.004, 0.66, 0.004, '#5d8278', x, 1.95, -1.343);
    }
    this.box(0.75, 2.0, 0.7, clay('#e8eaec', { roughness: 0.3 }), 2.1, 1.0, -1.25, 0.03);
    this.box(0.02, 0.5, 0.03, '#9aa3ab', 1.8, 1.3, -0.88);
    this.box(0.02, 0.4, 0.03, '#9aa3ab', 1.8, 0.6, -0.88);
    this.plant(0.08, '#5f8f5a', -0.55, 0.92, -1.4);
    this.plant(0.07, '#7fa36a', 0.6, 0.92, -1.45, '#e07a5f');

    // Island
    this.box(1.7, TOP - 0.06, 0.68, '#2f4858', 0, (TOP - 0.06) / 2, 0, 0.01);
    this.box(1.85, 0.05, 0.78, marble, 0, TOP - 0.025, 0, 0.01);
    this.box(0.52, 0.012, 0.42, clay('#121316', { roughness: 0.15 }), 0.0, TOP + 0.006, -0.12, 0.004);
    const ring = this.mesh(new THREE.TorusGeometry(0.1, 0.006, 8, 40), this.glow(new THREE.Color('#ff5a2a').multiplyScalar(1.5), 0.6), 0.05, TOP + 0.013, -0.15);
    ring.rotation.x = -Math.PI / 2;
    // Pan with an egg
    this.cyl(0.12, 0.11, 0.035, clay('#2b2c30', { roughness: 0.3 }), 0.05, TOP + 0.03, -0.15, 32);
    this.box(0.16, 0.015, 0.03, '#2b2c30', -0.15, TOP + 0.04, -0.15);
    const white = this.mesh(new THREE.CircleGeometry(0.06, 24), clay('#fbfaf5'), 0.05, TOP + 0.049, -0.15);
    white.rotation.x = -Math.PI / 2; white.scale.set(1.2, 1, 1);
    this.mesh(new THREE.SphereGeometry(0.025, 16, 12), clay('#ffb52e', { roughness: 0.2 }), 0.06, TOP + 0.05, -0.15).scale.y = 0.6;
    // Cutting board + veggies
    this.box(0.34, 0.02, 0.24, '#c89a6e', 0.6, TOP + 0.01, 0.0, 0.006);
    for (let i = 0; i < 3; i++) this.mesh(new THREE.SphereGeometry(0.03, 16, 12), clay('#e0443a', { roughness: 0.35 }), 0.5 + i * 0.07, TOP + 0.045, 0.05);
    const carrot = this.mesh(new THREE.ConeGeometry(0.018, 0.14, 12), clay('#f08a2a'), 0.7, TOP + 0.04, -0.05);
    carrot.rotation.z = Math.PI / 2;
    this.box(0.18, 0.004, 0.03, '#c9ccd1', 0.62, TOP + 0.024, -0.07).rotation.y = 0.3;
    // Fruit bowl
    this.cyl(0.13, 0.08, 0.06, '#f4efe6', -0.72, TOP + 0.03, 0.2, 24);
    for (let i = 0; i < 4; i++) this.mesh(new THREE.SphereGeometry(0.035, 14, 10), clay(['#f2c94c', '#e0443a', '#8bc34a', '#f08a2a'][i]), -0.76 + (i % 2) * 0.07, TOP + 0.075 + Math.floor(i / 2) * 0.03, 0.17 + (i % 2) * 0.05);
    this.device('tablet', -0.45, TOP, -0.12);
    this.pendant(-0.5, 2.0, 0.0, { color: '#f2f0ec' });
    this.pendant(0.5, 2.0, 0.0, { color: '#f2f0ec' });

    // Dining nook behind the camera
    this.box(1.2, 0.04, 0.8, new THREE.MeshStandardMaterial({ map: woodTexture('#b98a62', 1), roughness: 0.6 }), -0.4, 0.74, 1.8, 0.01);
    for (const x of [-0.9, 0.1]) this.cyl(0.03, 0.03, 0.72, '#2b2c30', x, 0.36, 1.8, 10);
    this.chair(-0.75, 2.35, { rotY: Math.PI, color: '#f2c94c' });
    this.chair(-0.05, 2.35, { rotY: Math.PI, color: '#f2c94c' });
    this.frames([[1.3, '#e07a5f', 0.45, 0.6], [1.9, '#7fa3c9', 0.45, 0.6]], 2.53);
    this.plant(0.15, '#4f7f45', 2.2, 0, 2.2);

    this.slots = {
      main: { pos: [0, 0, -0.6], yaw: 0, pose: 'stand', surface: { y: TOP, z: 0.38, edge: 0.24 } },
      side: { pos: [0.85, 0, -0.55], yaw: -0.35, pose: 'stand', surface: { y: TOP, z: 0.32, edge: 0.24 } },
      desk: { pos: [-0.25, TOP, 0.13] },
      desk2: { pos: [0.3, TOP, 0.22] },
    };
    this.wides = {
      wide: { pos: [1.6, 1.85, 2.3], target: [0, 1.15, -0.45], fov: 40 },
      wide2: { pos: [-1.3, 1.55, 2.1], target: [0.1, 1.2, -0.6], fov: 40 },
    };
  }
}

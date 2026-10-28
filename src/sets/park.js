import * as THREE from 'three';
import { BaseSet, woodTexture, noiseTexture } from './common.js';
import { clay, rand } from '../util.js';

const TOP = 0.74;

export class ParkSet extends BaseSet {
  build() {
    this.defaultTime = 'day';
    this.keyPos = [-3.0, 4.2, -4.5];
    this.nature({ ground: '#83b860', trees: 70, inner: 3.0, outer: 25 });
    const path = this.mesh(new THREE.PlaneGeometry(1.4, 40), new THREE.MeshStandardMaterial({ map: noiseTexture('#d8c3a0', 24, 6), roughness: 0.95 }), 2.6, 0.003, 0);
    path.rotation.x = -Math.PI / 2;
    // flowers
    for (let i = 0; i < 60; i++) {
      const x = -3 + rand(i, 41) * 6, z = -2.8 + rand(i, 42) * 5.6;
      if (Math.abs(x) < 1.2 && Math.abs(z) < 1.2) continue;
      this.mesh(new THREE.SphereGeometry(0.025, 8, 6), clay(['#ff8fb1', '#ffd23f', '#ffffff', '#b39dff'][i % 4]), x, 0.03, z);
    }

    // Picnic table + benches
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture('#b8875c', 1), roughness: 0.7 });
    for (let i = 0; i < 5; i++) this.box(1.6, 0.04, 0.155, wood, 0, TOP - 0.02, -0.32 + i * 0.16, 0.008);
    for (const z of [-0.66, 0.66]) {
      for (let i = 0; i < 2; i++) this.box(1.6, 0.035, 0.13, wood, 0, 0.44, z - 0.07 + i * 0.14, 0.008);
    }
    for (const x of [-0.65, 0.65]) {
      for (const s of [-1, 1]) {
        const leg = this.box(0.06, 0.95, 0.06, wood, x, 0.4, s * 0.38);
        leg.rotation.x = s * 0.62;
      }
      this.box(0.06, 0.05, 1.5, wood, x, 0.4, 0);
    }
    this.device('laptop', -0.02, TOP, -0.2);
    // Basket, lemonade, sandwich
    this.box(0.3, 0.16, 0.2, '#c99a5e', 0.58, TOP + 0.08, 0.12, 0.02);
    this.mesh(new THREE.TorusGeometry(0.11, 0.01, 8, 24, Math.PI), clay('#a87a46'), 0.58, TOP + 0.16, 0.12);
    this.box(0.31, 0.02, 0.21, '#e5484d', 0.58, TOP + 0.15, 0.12);
    this.cyl(0.05, 0.05, 0.16, new THREE.MeshPhysicalMaterial({ color: '#fff3a0', transparent: true, opacity: 0.6, roughness: 0.1 }), -0.58, TOP + 0.08, 0.15, 20);
    this.box(0.12, 0.04, 0.1, '#e8c38a', -0.45, TOP + 0.02, -0.05, 0.015);
    const blanket = this.mesh(new THREE.PlaneGeometry(1.6, 1.2), clay('#e5484d', { sheen: 0.6 }), -1.9, 0.01, 1.0);
    blanket.rotation.x = -Math.PI / 2;
    // Lamp post + a bench behind the camera
    this.cyl(0.035, 0.05, 2.6, '#2b2c33', 2.0, 1.3, -1.2, 12);
    this.mesh(new THREE.SphereGeometry(0.12, 16, 12), this.glow(new THREE.Color('#fff0d0').multiplyScalar(1.5)), 2.0, 2.65, -1.2);
    this.practical(2.0, 2.6, -1.2, { intensity: 1.2, distance: 6 });
    this.box(1.4, 0.05, 0.4, wood, -0.4, 0.45, 2.6, 0.01);
    this.box(1.4, 0.35, 0.05, wood, -0.4, 0.68, 2.8, 0.01);
    // A few balloons tied to the table
    for (let i = 0; i < 3; i++) {
      const x = 0.78 + i * 0.07;
      this.cyl(0.002, 0.002, 0.9, '#ffffff', x, TOP + 0.45, -0.3, 4);
      this.mesh(new THREE.SphereGeometry(0.08, 20, 16), clay(['#ff8fb1', '#7fd6a8', '#ffd23f'][i], { roughness: 0.2, sheen: 0 }), x, TOP + 0.95 + i * 0.05, -0.3).scale.y = 1.2;
    }

    this.slots = {
      main: { pos: [0, 0, -0.62], yaw: 0, pose: 'sit', surface: { y: TOP, z: 0.42, edge: 0.28 } },
      side: { pos: [0.55, 0, -0.62], yaw: -0.25, pose: 'sit', surface: { y: TOP, z: 0.4, edge: 0.28 } },
      desk: { pos: [-0.36, TOP, 0.0] },
      desk2: { pos: [0.3, TOP, 0.18] },
    };
    this.wides = {
      wide: { pos: [1.8, 1.7, 3.0], target: [0, 0.9, -0.4], fov: 40 },
      wide2: { pos: [-1.4, 1.25, 2.6], target: [0.1, 1.0, -0.5], fov: 42 },
    };
  }
}

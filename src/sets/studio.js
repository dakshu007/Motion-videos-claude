import * as THREE from 'three';
import { BaseSet, noiseTexture } from './common.js';
import { clay } from '../util.js';

const TOP = 0.745;

export class StudioSet extends BaseSet {
  build() {
    this.defaultTime = 'night';
    this.keyPos = [-1.6, 3.0, -1.0];
    this.floor(new THREE.MeshStandardMaterial({ map: noiseTexture('#3a3640', 16, 10), roughness: 0.95 }));
    this.room({ color: '#4a4458', window: null });

    // Acoustic foam wall
    const foamA = clay('#2f2a3a', { roughness: 1, sheen: 0.2 }), foamB = clay(this.options.accent || '#5b4a8a', { roughness: 1, sheen: 0.2 });
    for (let i = 0; i < 12; i++) for (let j = 0; j < 6; j++) {
      this.box(0.27, 0.27, 0.05, (i + j) % 3 === 0 ? foamB : foamA, -1.65 + i * 0.3, 0.95 + j * 0.3, -1.62, 0.02);
    }
    this.neon('ON AIR', 1.65, 2.75, -1.6, { w: 0.6, h: 0.18, color: '#ffd6d6', glow: '#ff2a2a' });
    this.neon('THE PODCAST', -0.1, 2.8, -1.6, { w: 1.3, h: 0.3, color: '#f2e9ff', glow: '#b18cff' });
    this.practical(-1.4, 2.2, -1.2, { color: '#ff4fd8', intensity: 1.1, distance: 3.5 });
    this.practical(1.4, 2.2, -1.2, { color: '#3dc8ff', intensity: 1.1, distance: 3.5 });
    this.practical(0, 2.4, 0.6, { color: '#ffd9b0', intensity: 0.9, distance: 4 });
    for (const x of [-2.4, 2.4]) {
      this.box(0.6, 0.03, 0.25, '#8a6448', x, 1.3, -1.5);
      this.plant(0.08, '#5f8f5a', x, 1.315, -1.5);
    }
    this.plant(0.16, '#4f7f45', -2.5, 0, -1.2);

    // Round table
    this.cyl(0.78, 0.78, 0.05, clay('#d9c3a5', { roughness: 0.4 }), 0.05, TOP - 0.025, -0.05, 48);
    this.cyl(0.06, 0.12, TOP - 0.05, '#2b2c33', 0.05, (TOP - 0.05) / 2, -0.05, 16);
    this.cyl(0.3, 0.3, 0.02, '#2b2c33', 0.05, 0.01, -0.05, 24);
    // Boom mics in front of each host
    const mic = (hx, hz, yaw) => {
      const g = new THREE.Group();
      const dark = clay('#202126', { roughness: 0.35 });
      this.mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.42, 8), dark, 0, 0.21, 0, g);
      const arm = this.mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.25, 8), dark, 0, 0.42, -0.1, g);
      arm.rotation.x = Math.PI / 2.4;
      const cap = this.mesh(new THREE.CapsuleGeometry(0.03, 0.08, 6, 16), dark, 0, 0.43, -0.22, g);
      cap.rotation.x = Math.PI / 2.6;
      this.mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16), clay('#5b4a8a'), 0, 0.4, -0.19, g);
      g.position.set(hx, TOP, hz); g.rotation.y = yaw;
      this.root.add(g);
    };
    mic(-0.36, -0.12, 0.3);
    mic(0.43, -0.1, -0.35);
    this.device('laptop', -0.2, TOP, -0.15, { rotY: 0.3 });
    this.cyl(0.035, 0.03, 0.09, '#f4efe6', 0.2, TOP + 0.045, 0.05, 20);
    this.cyl(0.035, 0.035, 0.12, new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, roughness: 0.05 }), -0.5, TOP + 0.06, 0.12, 16);

    this.chair(-0.43, -0.7, { rotY: 0.3, color: '#24242c' });
    this.chair(0.51, -0.66, { rotY: -0.35, color: '#24242c' });
    // Behind the camera: shelves of records + a sofa
    this.box(1.8, 0.45, 0.7, '#5b4a8a', -0.3, 0.3, 2.15, 0.12);
    this.box(1.8, 0.6, 0.22, '#5b4a8a', -0.3, 0.6, 2.42, 0.1);
    this.bookshelf(1.6, 2.35, { color: '#2b2c33' });

    this.slots = {
      main: { pos: [-0.42, 0, -0.66], yaw: 0.3, pose: 'sit', surface: { y: TOP, z: 0.4, edge: 0.3 } },
      side: { pos: [0.5, 0, -0.62], yaw: -0.35, pose: 'sit', surface: { y: TOP, z: 0.4, edge: 0.3 } },
      desk: { pos: [0.05, TOP, 0.22] },
      desk2: { pos: [0.4, TOP, 0.3] },
    };
    this.wides = {
      wide: { pos: [0.05, 1.6, 2.6], target: [0.05, 1.05, -0.5], fov: 40 },
      wide2: { pos: [1.9, 1.8, 2.1], target: [0, 1.05, -0.5], fov: 40 },
    };
  }
}

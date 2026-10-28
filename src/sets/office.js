import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BaseSet, woodTexture } from './common.js';
import { clay } from '../util.js';

const DESK = 0.74;

export class OfficeSet extends BaseSet {
  build() {
    this.defaultTime = 'dusk';
    this.floor(new THREE.MeshStandardMaterial({ map: woodTexture('#b98a62'), roughness: 0.75 }));
    this.room({ color: '#b4b2b4' });
    this.city();
    this.frames([[-0.9, '#e8b86a'], [-0.15, '#7fa3c9'], [0.6, '#d9775b']], 2.53);
    this.box(1.8, 0.45, 0.7, '#5d7f8f', -0.2, 0.3, 2.15, 0.12);
    this.box(1.8, 0.6, 0.22, '#5d7f8f', -0.2, 0.6, 2.42, 0.1);
    const rug = this.mesh(new THREE.CircleGeometry(1.3, 48), clay('#d8c7b0', { sheen: 0.8 }), 0, 0.004, 0.2);
    rug.rotation.x = -Math.PI / 2; rug.scale.set(1.3, 1, 1);
    this.bookshelf(1.95, -1.45);
    this.plant(0.11, '#5f8f5a', 1.75, 1.915, -1.45);
    this.neon('ship it', 1.95, 2.28, -1.63);
    this.stringLights(-1.6, 1.4, 2.95, -1.6);

    // Desk
    const top = this.box(1.5, 0.045, 0.78, new THREE.MeshStandardMaterial({ map: woodTexture('#e6c49c'), roughness: 0.6 }), 0, DESK - 0.0225, 0, 0.02);
    top.castShadow = true;
    const white = clay('#eceae6');
    this.box(0.42, DESK - 0.05, 0.7, white, 0.5, (DESK - 0.05) / 2, 0, 0.015);
    for (let i = 0; i < 3; i++) {
      this.mesh(new THREE.SphereGeometry(0.012, 10, 8), clay('#c9a25e', { roughness: 0.3 }), 0.5, 0.15 + i * 0.2, 0.355);
      this.box(0.38, 0.004, 0.004, '#cfccc6', 0.5, 0.24 + i * 0.2, 0.352);
    }
    for (const z of [0.32, -0.32]) this.cyl(0.02, 0.02, DESK - 0.05, white, -0.68, (DESK - 0.05) / 2, z, 12);
    this.device('laptop', -0.02, DESK, -0.2);

    // Props
    this.cyl(0.038, 0.034, 0.09, '#8fb8a0', -0.6, DESK + 0.045, -0.24);
    const handle = this.mesh(new THREE.TorusGeometry(0.022, 0.007, 8, 20), clay('#8fb8a0'), -0.64, DESK + 0.048, -0.24);
    handle.rotation.y = Math.PI / 2;
    this.box(0.075, 0.008, 0.15, clay('#1d1e22', { roughness: 0.25 }), 0.2, DESK + 0.004, 0.18, 0.004).rotation.y = 0.3;
    this.box(0.2, 0.01, 0.15, '#f7f3ea', 0.55, DESK + 0.005, 0.22, 0.003).rotation.y = -0.2;
    this.box(0.06, 0.003, 0.06, '#f2c66d', -0.3, DESK + 0.002, 0.24).rotation.y = 0.4;
    const cable = this.mesh(new THREE.TorusGeometry(0.07, 0.007, 10, 48), clay('#202126', { roughness: 0.4 }), 0.55, DESK + 0.007, -0.2);
    cable.rotation.x = -Math.PI / 2;
    this.plant(0.075, '#7fa36a', -0.64, DESK, 0.28);
    this.cyl(0.035, 0.03, 0.05, '#d98c6a', 0.66, DESK + 0.025, 0.25, 20);
    this.mesh(new THREE.CapsuleGeometry(0.022, 0.06, 6, 16), clay('#6fa05a'), 0.66, DESK + 0.09, 0.25);

    // Desk lamp (practical light at night)
    const lampMat = clay('#efe6d8');
    this.cyl(0.05, 0.06, 0.015, lampMat, 0.62, DESK + 0.008, -0.28);
    this.cyl(0.006, 0.006, 0.3, lampMat, 0.62, DESK + 0.15, -0.28, 8);
    this.mesh(new THREE.SphereGeometry(0.045, 20, 16), this.glow(new THREE.Color('#fff0d0').multiplyScalar(1.4)), 0.62, DESK + 0.31, -0.28);
    this.practical(0.57, DESK + 0.33, -0.23, { intensity: 0.6, shadow: true });

    this.chair(0, -0.7);
    this.chair(1.0, -0.25, { rotY: -0.75, back: false, color: '#c9b8a6' });

    this.slots = {
      main: { pos: [0, 0, -0.66], yaw: 0, pose: 'sit', surface: { y: DESK, z: 0.42, edge: 0.3 } },
      side: { pos: [1.0, 0, -0.25], yaw: -0.75, pose: 'sit' },
      desk: { pos: [-0.36, DESK, -0.03] },
      desk2: { pos: [0.33, DESK, 0.0] },
    };
  }
}

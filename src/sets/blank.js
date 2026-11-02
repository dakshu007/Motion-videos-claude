import * as THREE from 'three';
import { BaseSet } from './common.js';
import { canvasTexture } from '../util.js';

// A clean seamless backdrop: soft radial gradient + contact shadow only.
// For profile pictures, thumbnails and title cards.
export class BlankSet extends BaseSet {
  build() {
    this.defaultTime = 'day';
    this.keyPos = [-1.6, 2.6, 2.4];
    this.dome.visible = false;
    const [inner, outer] = this.options.bg || ['#fff3e8', '#f3c7a6'];
    const tex = canvasTexture(1024, 1024, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, w * 0.62);
      g.addColorStop(0, inner); g.addColorStop(1, outer);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false }));
    back.position.set(0, 0.6, -2.2);
    this.root.add(back);
    this.backdrop = back;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.22 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    this.root.add(floor);
    this.slots = {
      main: { pos: [0, 0, -0.3], yaw: 0, pose: 'stand' },
      side: { pos: [0.7, 0, -0.3], yaw: -0.3, pose: 'stand' },
      desk: { pos: [0, 0, 0], yaw: 0 },
      desk2: { pos: [0.4, 0, 0], yaw: -0.2 },
    };
    this.wides = {
      wide: { pos: [0, 0.6, 2.4], target: [0, 0.3, 0], fov: 30 },
      wide2: { pos: [1.2, 0.8, 2.0], target: [0, 0.3, 0], fov: 30 },
    };
  }

  applyTime(p) {
    super.applyTime(p);
    if (this.scene.fog) { this.scene.fog.near = 100; this.scene.fog.far = 200; }
  }
}

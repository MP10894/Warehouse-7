// The mine's blasting, made visible: red dynamite bundles on the bench walls where the charges
// are, yellow-and-black hazard boards on the unstable faces, and the detonator's plunger with a
// red lamp that flashes while the siren sounds. Looks only; the rules are in sim/blasting.js.
import * as THREE from 'three';
import { box } from './models.js';

export function createBlastMarkers(scene, world) {
  const d = world.data.levels[world.levelId].blasting;
  const group = new THREE.Group();
  group.userData.blocks = true;   // cleared with the rest of the scenery
  scene.add(group);
  let lamp = null;
  if (d) {
    const cx = 196, cz = 60;   // the bundles face away from the pit's middle, towards their wall
    const out = (x, z) => { const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
    for (const c of d.charges || []) {
      const [ox, oz] = out(c.x, c.z);
      const g = new THREE.Group();
      g.position.set(c.x + 0.5 + ox * 1.5, c.y + 0.9, c.z + 0.5 + oz * 1.5);
      g.rotation.y = Math.atan2(ox, oz);
      for (let k = -1; k <= 1; k++) box(0.08, 0.36, 0.08, 0xb0281c, k * 0.09, 0, 0, g);   // three sticks
      box(0.3, 0.05, 0.1, 0x1b1a18, 0, 0.08, 0, g);                                       // tape
      box(0.02, 0.6, 0.02, 0x1b1a18, 0.05, -0.45, 0.05, g);                               // wire to the ground
      group.add(g);
    }
    for (const u of d.unstable || []) {
      const [ox, oz] = out(u.x, u.z);
      const g = new THREE.Group();
      g.position.set(u.x + 0.5 - ox * 0.6, u.y - 1.6, u.z + 0.5 - oz * 0.6);
      g.rotation.y = Math.atan2(ox, oz);
      for (let k = 0; k < 5; k++) box(0.24, 0.6, 0.04, k % 2 ? 0x1b1a18 : 0xe0b030, -0.48 + k * 0.24, 0, 0, g);
      box(0.06, 1.2, 0.06, 0x6a5a40, -0.62, -0.3, 0.02, g);
      box(0.06, 1.2, 0.06, 0x6a5a40, 0.62, -0.3, 0.02, g);
      group.add(g);
    }
    if (d.detonator) {
      const g = new THREE.Group();
      g.position.set(d.detonator.x + 0.5, 0, d.detonator.z + 0.5);
      group.add(g);
      // on top of the detonator's box (the highest block in its column)
      const top = (() => {
        for (let yy = world.grid.h - 1; yy >= 0; yy--) {
          const i = d.detonator.x + d.detonator.z * world.grid.w + yy * world.grid.w * world.grid.d;
          if (world.grid.cells[i]) return yy + 1;
        }
        return 1;
      })();
      g.position.y = top;
      box(0.06, 0.4, 0.06, 0x9a9a92, 0, 0.2, 0, g);           // plunger rod
      box(0.36, 0.06, 0.08, 0xb0281c, 0, 0.42, 0, g);         // T handle
      lamp = box(0.12, 0.12, 0.12, 0x5a1a14, 0.32, 0.06, 0.2, g);
      lamp.material = new THREE.MeshBasicMaterial({ color: 0x5a1a14 });
    }
  }
  return {
    /** Every frame: the lamp flashes while the siren sounds, and glows steadily once ready. */
    update(world) {
      if (!lamp || !world.blast) return;
      const siren = world.blast.state === 'siren';
      const ready = !siren && world.time >= world.blast.readyAt;
      lamp.material.color.setHex(siren ? (Math.floor(world.time * 6) % 2 ? 0xff3020 : 0x5a1a14) : ready ? 0x40e060 : 0xd08020);
    }
  };
}

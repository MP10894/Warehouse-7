// Short-lived visual effects driven by world events: impact dust, sparks, blood,
// muzzle flashes, explosions and flying debris from broken walls.
import * as THREE from 'three';
import { makeCanvas, pixelTexture } from './textures.js';
import { cellXYZ } from '../sim/grid.js';

const POOL = 160;
const MATERIAL_COLOUR = {
  wall: [0.75, 0.68, 0.55], lowwall: [0.68, 0.6, 0.47], crate: [0.6, 0.45, 0.26], sandbags: [0.7, 0.62, 0.44],
  concrete: [0.62, 0.6, 0.56], ground: [0.8, 0.68, 0.48], terrain: [0.8, 0.68, 0.48],
  tank: [0.3, 0.28, 0.26], locker: [0.32, 0.36, 0.28]
};

function blobTex(soft) {
  return pixelTexture(makeCanvas(8, 8, g => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const d = Math.hypot(x - 3.5, y - 3.5) / 4;
      if (d < 1 && Math.random() > d * (soft ? 0.9 : 0.4)) { g.fillStyle = '#fff'; g.fillRect(x, y, 1, 1); }
    }
  }), false);
}

export function createEffects(scene) {
  const tex = blobTex(true), hard = blobTex(false);
  const parts = [];
  for (let i = 0; i < POOL; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.visible = false; scene.add(sp);
    parts.push({ sp, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 0, size: 0, grav: 0 });
  }
  const debrisGeo = new THREE.BoxGeometry(0.18, 0.12, 0.15);
  const debris = [];
  let next = 0;
  const r = () => Math.random() - 0.5;

  function emit(x, y, z, colour, size, life, vx = 0, vy = 0, vz = 0, grow = 0, grav = 0, blend = false, map = tex) {
    const p = parts[next++ % POOL];
    p.sp.material.map = map;
    p.sp.material.color.setRGB(...colour);
    p.sp.material.blending = blend ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.sp.material.opacity = 1;
    p.sp.position.set(x, y, z);
    p.sp.scale.set(size, size, 1);
    p.sp.visible = true;
    Object.assign(p, { life, max: life, vx, vy, vz, grow, size, grav });
  }

  function chunk(x, y, z, colour) {
    const m = new THREE.Mesh(debrisGeo, new THREE.MeshLambertMaterial({ color: new THREE.Color(...colour), flatShading: true }));
    m.position.set(x, y, z);
    scene.add(m);
    debris.push({ m, vx: r() * 6, vy: 2 + Math.random() * 4, vz: r() * 6, life: 1.6 + Math.random(), spin: r() * 12 });
  }

  return {
    reset() {
      for (const p of parts) { p.life = 0; p.sp.visible = false; }
      for (const d of debris) scene.remove(d.m);
      debris.length = 0;
    },

    handle(ev, world) {
      if (ev.type === 'impact') {
        if (ev.kind === 'flesh') {
          for (let i = 0; i < 5; i++) emit(ev.x, ev.y, ev.z, [0.55, 0.06, 0.04], 0.12, 0.45, r() * 2 + ev.nx, Math.random() * 1.5, r() * 2 + ev.nz, 0, 6);
        } else {
          const c = MATERIAL_COLOUR[ev.material] || MATERIAL_COLOUR.concrete;
          emit(ev.x + ev.nx * 0.05, ev.y + ev.ny * 0.05, ev.z + ev.nz * 0.05, c, 0.25, 0.6, ev.nx * 0.8, 0.5, ev.nz * 0.8, 0.5);
          emit(ev.x, ev.y, ev.z, [1, 0.85, 0.5], 0.07, 0.12, 0, 0, 0, 0, 0, true, hard);
          for (let i = 0; i < 2; i++) emit(ev.x, ev.y, ev.z, c.map(v => v * 0.8), 0.06, 0.5, ev.nx * 2 + r() * 2, 1.5 + Math.random(), ev.nz * 2 + r() * 2, 0, 9, false, hard);
        }
      } else if (ev.type === 'shot') {
        emit(ev.x, ev.y - 0.15, ev.z, [1, 0.8, 0.4], ev.team === 'player' ? 0.0 : 0.35, 0.05, 0, 0, 0, 0, 0, true, hard);
      } else if (ev.type === 'explosion') {
        const R = ev.r;
        emit(ev.x, ev.y, ev.z, [1, 0.85, 0.5], R * 0.5, 0.35, 0, 0.5, 0, R * 1.4, 0, true);
        emit(ev.x, ev.y, ev.z, [1, 0.5, 0.15], R * 0.4, 0.5, 0, 1, 0, R, 0, true);
        for (let i = 0; i < 10; i++) emit(ev.x + r() * R * 0.5, ev.y + Math.random() * R * 0.4, ev.z + r() * R * 0.5, [0.35, 0.32, 0.28], R * 0.35, 1.8 + Math.random(), r() * 1.5, 0.8 + Math.random(), r() * 1.5, R * 0.6);
        for (let i = 0; i < 10; i++) emit(ev.x, ev.y, ev.z, [1, 0.75, 0.3], 0.1, 0.6, r() * 14, Math.random() * 8, r() * 14, 0, 12, true, hard);
        if (ev.big) {
          // a fuel tank: a rising fireball and a column of black smoke
          for (let i = 0; i < 14; i++) emit(ev.x + r() * R * 0.4, ev.y + i * 0.8, ev.z + r() * R * 0.4, [1, 0.45 + Math.random() * 0.3, 0.1], R * 0.3, 0.9 + Math.random() * 0.6, r() * 2, 4 + Math.random() * 5, r() * 2, R * 0.4, 0, true);
          for (let i = 0; i < 18; i++) emit(ev.x + r() * R * 0.5, ev.y + Math.random() * 6, ev.z + r() * R * 0.5, [0.12, 0.11, 0.1], R * 0.4, 4 + Math.random() * 3, r() * 2, 3 + Math.random() * 3, r() * 2, R * 0.8);
        }
      } else if (ev.type === 'blocks' && !ev.placed && ev.cells && ev.cells.length && world) {
        const c = MATERIAL_COLOUR[ev.material] || MATERIAL_COLOUR.wall;
        // big breaks (a whole fuel tank) throw debris from a sample of their blocks only
        const cells = ev.cells.length > 30 ? ev.cells.filter((_, k) => k % Math.ceil(ev.cells.length / 30) === 0) : ev.cells;
        for (const i of cells) {
          const [x, y, z] = cellXYZ(world.grid, i);
          for (let k = 0; k < 3; k++) chunk(x + Math.random(), y + Math.random(), z + Math.random(), c);
          emit(x + 0.5, y + 0.5, z + 0.5, c, 1.0, 1.4, r(), 0.6, r(), 1.5);
        }
      }
    },

    update(dt) {
      for (const p of parts) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) { p.sp.visible = false; continue; }
        p.vy -= p.grav * dt;
        p.sp.position.x += p.vx * dt; p.sp.position.y += p.vy * dt; p.sp.position.z += p.vz * dt;
        const k = p.life / p.max;
        p.sp.material.opacity = Math.min(1, k * 1.8);
        if (p.grow) { const s = p.size + p.grow * (1 - k); p.sp.scale.set(s, s, 1); }
      }
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i];
        d.life -= dt;
        d.vy -= 14 * dt;
        d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
        if (d.m.position.y < 0.05) { d.m.position.y = 0.05; d.vy *= -0.3; d.vx *= 0.6; d.vz *= 0.6; }
        d.m.rotation.x += d.spin * dt; d.m.rotation.z += d.spin * dt * 0.7;
        if (d.life <= 0) { scene.remove(d.m); d.m.material.dispose(); debris.splice(i, 1); }
      }
    }
  };
}

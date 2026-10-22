// Collision against the grid and hit-scan ray tests. No Three.js here: the simulation
// must be able to run on its own (on a co-op host, or in Node for tests).
import { WALL_H, BLOCK_HEIGHTS, charAt, blockH, cellOf } from './map.js';

// Hit volumes, in metres.
export const ENEMY_HIT_RADIUS = 0.3;
export const ENEMY_HIT_HEIGHT = 1.8;
export const ENEMY_HEAD_Y = 1.45;   // hits above this height count as headshots
export const BARREL_RADIUS = 0.45;
export const BARREL_HEIGHT = 1.2;

export function solidCell(world, cx, cy) {
  return !!BLOCK_HEIGHTS[charAt(world.map, cx, cy)] || !!(world.barrelAt[cy] && world.barrelAt[cy][cx]);
}

export function collides(world, x, z, r) {
  for (let cy = cellOf(z - r); cy <= cellOf(z + r); cy++) {
    for (let cx = cellOf(x - r); cx <= cellOf(x + r); cx++) {
      if (solidCell(world, cx, cy)) return true;
    }
  }
  return false;
}

/** Move a body, sliding along walls one axis at a time. */
export function moveBody(world, body, dx, dz, r) {
  if (!collides(world, body.x + dx, body.z, r)) body.x += dx;
  if (!collides(world, body.x, body.z + dz, r)) body.z += dz;
}

function rayCylinder(o, d, cx, cz, r, y0, y1) {
  const px = o.x - cx, pz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-9) return null;
  const b = 2 * (px * d.x + pz * d.z);
  const c = px * px + pz * pz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  let t = (-b - s) / (2 * a);
  if (t < 0) t = (-b + s) / (2 * a);
  if (t < 0) return null;
  const y = o.y + d.y * t;
  return y >= y0 && y <= y1 ? t : null;
}

const at = (o, d, t) => ({ x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t });

/**
 * Fire a ray from o along the unit vector d. Returns the nearest thing hit:
 * { kind: 'level' | 'enemy' | 'barrel' | 'none', t, point, normal?, target?, head? }
 */
export function raycast(world, o, d, range) {
  let best = { kind: 'none', t: range };

  // Level: march in small steps until we are inside something solid.
  const step = 0.05;
  let pcx = cellOf(o.x), pcy = cellOf(o.z);
  for (let t = step; t < best.t; t += step) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    const cx = cellOf(x), cy = cellOf(z);
    let n = null;
    if (y <= 0) n = { x: 0, y: 1, z: 0 };
    else if (y >= WALL_H) n = { x: 0, y: -1, z: 0 };
    else if (y < blockH(world.map, cx, cy)) {
      if (cx !== pcx) n = { x: -Math.sign(d.x), y: 0, z: 0 };
      else if (cy !== pcy) n = { x: 0, y: 0, z: -Math.sign(d.z) };
      else n = { x: 0, y: 1, z: 0 };
    }
    if (n) { best = { kind: 'level', t, point: { x, y, z }, normal: n }; break; }
    pcx = cx; pcy = cy;
  }

  for (const e of world.enemies) {
    if (e.state === 'dead') continue;
    const t = rayCylinder(o, d, e.x, e.z, ENEMY_HIT_RADIUS, 0, ENEMY_HIT_HEIGHT);
    if (t !== null && t < best.t) {
      const point = at(o, d, t);
      best = { kind: 'enemy', t, point, target: e, head: point.y > ENEMY_HEAD_Y };
    }
  }
  for (const b of world.barrels) {
    if (!b.alive) continue;
    const t = rayCylinder(o, d, b.x, b.z, BARREL_RADIUS, 0, BARREL_HEIGHT);
    if (t !== null && t < best.t) best = { kind: 'barrel', t, point: at(o, d, t), target: b };
  }
  return best;
}

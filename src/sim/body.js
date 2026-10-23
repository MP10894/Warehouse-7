// Movement for anyone with a body (players and enemies): walking, sliding along walls,
// stepping up stairs and rubble, falling off edges.
import { V, getV, blockTop } from './grid.js';
import { terrainHeight } from './terrain.js';

/** Highest standing surface at (x, z) that is no higher than maxY. */
export function groundAt(world, x, z, maxY) {
  const g = world.grid;
  let best = terrainHeight(world.terrain, x, z);
  const cx = Math.floor(x), cz = Math.floor(z);
  for (let y = Math.min(g.h - 1, Math.floor(maxY)); y >= 0; y--) {
    const t = getV(g, cx, y, cz);
    if (t === V.AIR) continue;
    const top = blockTop(t, y, x, z);
    if (top <= maxY + 1e-6) { if (top > best) best = top; break; }
  }
  return best;
}

/** Would a body standing with its feet at y, centred at (x, z), overlap a wall? */
export function blocked(world, x, z, y, r, height, step) {
  const size = world.level.size;
  if (x < r || z < r || x > size - r || z > size - r) return true;
  const g = world.grid;
  // where the feet would end up after stepping onto rubble or a stair: the body must fit there too
  const feet = Math.max(y, groundAt(world, x, z, y + step));
  const y0 = Math.max(0, Math.floor(y + step)), y1 = Math.floor(feet + height - 0.05);
  for (let cz = Math.floor(z - r); cz <= Math.floor(z + r); cz++) {
    for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
      // closest point of this cell to the body's centre
      const px = Math.max(cx, Math.min(cx + 1, x)), pz = Math.max(cz, Math.min(cz + 1, z));
      if ((px - x) ** 2 + (pz - z) ** 2 >= r * r) continue;
      const near2 = (px - x) ** 2 + (pz - z) ** 2;
      for (let cy = y0; cy <= y1; cy++) {
        // shoulders and head are narrower than the body, so stairs next to a low ceiling work
        if (cy + 1 > feet + 1.2 && near2 >= (r * 0.5) ** 2) continue;
        const t = getV(g, cx, cy, cz);
        if (t === V.AIR) continue;
        if (blockTop(t, cy, Math.min(px, cx + 0.999), Math.min(pz, cz + 0.999)) > y + step) return true;
      }
    }
  }
  return false;
}

/**
 * Move a body by (dx, dz) metres this tick, then settle it on the ground or let it fall.
 * body: { x, y, z, vy, onGround }
 */
export function moveBody(world, body, dx, dz, dt) {
  const s = world.data.settings.player;
  const r = s.radius, h = s.height, step = s.step_height;
  // safety net: if the body somehow overlaps a block (it shouldn't), push it out to the
  // nearest free spot rather than leaving it stuck
  if (blocked(world, body.x, body.z, body.y, r, h, step)) unstick(world, body, r, h, step);
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.2));
  let movedX = 0, movedZ = 0;
  for (let k = 0; k < n; k++) {
    const nx = body.x + dx / n;
    if (!blocked(world, nx, body.z, body.y, r, h, step)) { movedX += nx - body.x; body.x = nx; }
    const nz = body.z + dz / n;
    if (!blocked(world, body.x, nz, body.y, r, h, step)) { movedZ += nz - body.z; body.z = nz; }
  }
  let ground = groundAt(world, body.x, body.z, body.y + step);
  // don't drop into a gap the body doesn't fit (e.g. over the edge of a stairwell while
  // still overlapping the floor beside it): stay on the edge until clear of it
  if (ground < body.y - 0.02 && blocked(world, body.x, body.z, ground, r, h, step)) ground = body.y;
  if (ground >= body.y - 0.02 || (body.onGround && body.y - ground <= step)) {
    body.y = ground; body.vy = 0; body.onGround = true;
  } else {
    body.vy -= s.fall_gravity * dt;
    body.y += body.vy * dt;
    if (body.y <= ground) { body.y = ground; body.vy = 0; body.onGround = true; } else body.onGround = false;
  }
  return Math.hypot(movedX, movedZ);
}

/** Move an overlapping body to the nearest spot (within half a metre) where it fits. */
function unstick(world, body, r, h, step) {
  for (let d = 0.05; d <= 0.5; d += 0.05) {
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8;
      const x = body.x + Math.cos(a) * d, z = body.z + Math.sin(a) * d;
      for (const y of [body.y, groundAt(world, x, z, body.y + step)]) {
        if (!blocked(world, x, z, y, r, h, step)) { body.x = x; body.z = z; body.y = Math.max(y, groundAt(world, x, z, y + step)); return true; }
      }
    }
  }
  return false;
}

// Bullets and rockets as real objects: they fly, drop under gravity and hit whatever is
// in their path (ground, blocks, people). Also used for line-of-sight checks.
import { solidAt, gidx } from './grid.js';
import { terrainHeight } from './terrain.js';

// Hit volumes for people, relative to their feet, in metres.
export const BODY_RADIUS = 0.3;
export const BODY_TOP = 1.45;
export const HEAD_Y = 1.62;
export const HEAD_RADIUS = 0.17;

function segCylinder(ax, ay, az, dx, dy, dz, len, cx, cz, r, y0, y1) {
  const px = ax - cx, pz = az - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return null;
  const b = 2 * (px * dx + pz * dz), c = px * px + pz * pz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  let t = (-b - s) / (2 * a);
  if (t < 0) t = (-b + s) / (2 * a);
  if (t < 0 || t > len) return null;
  const y = ay + dy * t;
  return y >= y0 && y <= y1 ? t : null;
}

function segSphere(ax, ay, az, dx, dy, dz, len, cx, cy, cz, r) {
  const px = ax - cx, py = ay - cy, pz = az - cz;
  const b = px * dx + py * dy + pz * dz, c = px * px + py * py + pz * pz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  let t = -b - Math.sqrt(disc);
  if (t < 0) t = -b + Math.sqrt(disc);
  return t >= 0 && t <= len ? t : null;
}

/**
 * Trace a straight segment from a to b. Returns the first thing hit, or null:
 * { kind: 'terrain' | 'block' | 'actor', dist, x, y, z, nx, ny, nz, cell?, actor?, head? }
 * opts.actors: list of people to test against; opts.ignore: an actor id to skip.
 */
export function traceSegment(world, ax, ay, az, bx, by, bz, opts = {}) {
  let dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return null;
  dx /= len; dy /= len; dz /= len;
  const g = world.grid, step = 0.1;
  let hit = null;
  let px = ax, py = ay, pz = az;
  for (let d = step; d <= len + step * 0.5; d += step) {
    const dd = Math.min(d, len);
    const x = ax + dx * dd, y = ay + dy * dd, z = az + dz * dd;
    if (y < terrainHeight(world.terrain, x, z)) {
      hit = { kind: 'terrain', dist: dd, x, y, z, nx: 0, ny: 1, nz: 0 };
      break;
    }
    if (solidAt(g, x, y, z)) {
      const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
      let nx = 0, ny = 0, nz = 0;
      if (Math.floor(px) !== cx) nx = -Math.sign(dx);
      else if (Math.floor(pz) !== cz) nz = -Math.sign(dz);
      else ny = dy < 0 ? 1 : -1;
      hit = { kind: 'block', dist: dd, x, y, z, nx, ny, nz, cell: gidx(g, cx, cy, cz) };
      break;
    }
    px = x; py = y; pz = z;
  }
  if (opts.actors) {
    const maxLen = hit ? hit.dist : len;
    for (const a of opts.actors) {
      if (!a.alive || a.id === opts.ignore) continue;
      if (Math.abs(a.x - ax) > maxLen + 2 && Math.abs(a.x - bx) > 2) continue;
      let t = segCylinder(ax, ay, az, dx, dy, dz, maxLen, a.x, a.z, BODY_RADIUS, a.y, a.y + BODY_TOP);
      let head = false;
      const th = segSphere(ax, ay, az, dx, dy, dz, maxLen, a.x, a.y + HEAD_Y, a.z, HEAD_RADIUS);
      if (th !== null && (t === null || th < t)) { t = th; head = true; }
      if (t !== null && (!hit || t < hit.dist)) {
        hit = { kind: 'actor', dist: t, x: ax + dx * t, y: ay + dy * t, z: az + dz * t, nx: -dx, ny: -dy, nz: -dz, actor: a, head };
      }
    }
  }
  return hit;
}

/** Can a see b? (eye to eye, blocks and ground only) */
export function lineOfSight(world, ax, ay, az, bx, by, bz) {
  return !traceSegment(world, ax, ay, az, bx, by, bz);
}

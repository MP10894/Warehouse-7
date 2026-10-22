// Path-finding for enemies: a "flow field" that stores, for every tile, how many steps
// it is from the nearest living player. Enemies just walk downhill on it. With several
// players it automatically leads each enemy to whichever player is closest.
import { cellOf, cellCenter } from './map.js';
import { solidCell } from './physics.js';

export function updateFlowField(world) {
  const { w, h } = world.map;
  const live = world.players.filter(p => p.alive);
  const key = live.map(p => cellOf(p.x) + cellOf(p.z) * w).join(',') + '|' + world.barrelVersion;
  if (world.cache.flowKey === key) return;
  world.cache.flowKey = key;
  const field = world.cache.flow || (world.cache.flow = new Int16Array(w * h));
  field.fill(-1);
  const queue = [];
  for (const p of live) {
    const c = cellOf(p.x) + cellOf(p.z) * w;
    if (field[c] !== 0) { field[c] = 0; queue.push(c); }
  }
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head], cx = c % w, cy = (c / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, ni = nx + ny * w;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || field[ni] >= 0 || solidCell(world, nx, ny)) continue;
      field[ni] = field[c] + 1;
      queue.push(ni);
    }
  }
}

/** Where should this enemy walk next? Returns a point; falls back to (fx, fz). */
export function flowStep(world, e, fx, fz) {
  const { w, h } = world.map;
  const field = world.cache.flow;
  if (!field) return [fx, fz];
  const cx = cellOf(e.x), cy = cellOf(e.z), here = field[cx + cy * w];
  if (here <= 0) return [fx, fz];
  let best = null, bd = here;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      // only cut corners when both side tiles are open
      if (dx && dy && (solidCell(world, cx + dx, cy) || solidCell(world, cx, cy + dy))) continue;
      const d = field[nx + ny * w];
      if (d >= 0 && (d < bd || (d === bd && dx && dy && best === null))) { bd = d; best = [nx, ny]; }
    }
  }
  return best ? [cellCenter(best[0]), cellCenter(best[1])] : [fx, fz];
}

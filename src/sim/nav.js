// Enemy path-finding in 3D. Every place a person can stand (open ground, floors,
// stair steps, rubble) becomes a node; nodes link to neighbours that can be walked to.
// "Flow fields" then store how many steps each node is from a goal (the players, or
// the base), and enemies simply walk downhill.
import { V, getV, blockTop } from './grid.js';
import { terrainHeight } from './terrain.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const CLEAR = 1.8;

function surfaceOf(world, nav, n, px, pz) {
  const cx = nav.x[n], cz = nav.z[n];
  const x = Math.max(cx + 0.001, Math.min(cx + 0.999, px)), z = Math.max(cz + 0.001, Math.min(cz + 0.999, pz));
  if (nav.layer[n] < 0) return terrainHeight(world.terrain, x, z);
  return blockTop(nav.type[n], nav.layer[n], x, z);
}

const rampAxis = t => t === V.RAMP_E || t === V.RAMP_W ? 'x' : (t === V.RAMP_N || t === V.RAMP_S ? 'z' : null);
const alongAxis = (t, dx, dz) => rampAxis(t) === 'x' ? dz === 0 : dx === 0;

/** Is there standing room above surface height s in node n's column? */
function clearAbove(g, nav, n, s) {
  const cx = nav.x[n], cz = nav.z[n];
  for (let y = Math.max(0, Math.floor(s + 0.05)); y <= Math.floor(s + CLEAR - 0.05); y++) {
    if (y >= g.h) break;
    if (y === nav.layer[n]) continue;
    if (getV(g, cx, y, cz) !== V.AIR) return false;
  }
  return true;
}

function headroom(g, cx, cz, from, s) {
  for (let y = Math.max(0, from); y <= Math.floor(s + CLEAR - 0.01); y++) {
    if (y >= g.h) break;
    if (getV(g, cx, y, cz) !== V.AIR) return false;
  }
  return true;
}

export function buildNav(world) {
  const g = world.grid, W = g.w, D = g.d;
  const xs = [], zs = [], layers = [], types = [], ys = [];
  const colStart = new Int32Array(W * D + 1);
  for (let cz = 0; cz < D; cz++) {
    for (let cx = 0; cx < W; cx++) {
      colStart[cx + cz * W] = xs.length;
      const th = terrainHeight(world.terrain, cx + 0.5, cz + 0.5);
      if (headroom(g, cx, cz, Math.floor(th + 0.05), th)) {
        xs.push(cx); zs.push(cz); layers.push(-1); types.push(0); ys.push(th);
      }
      for (let y = 0; y < g.h; y++) {
        const t = getV(g, cx, y, cz);
        if (t === V.AIR) continue;
        const s = blockTop(t, y, cx + 0.5, cz + 0.5);
        if (s < th + 0.3) continue;
        if (!headroom(g, cx, cz, y + 1, s)) continue;
        xs.push(cx); zs.push(cz); layers.push(y); types.push(t); ys.push(s);
      }
    }
  }
  colStart[W * D] = xs.length;
  const count = xs.length;
  const nav = {
    count, W, D, colStart,
    x: Int16Array.from(xs), z: Int16Array.from(zs), layer: Int8Array.from(layers),
    type: Uint8Array.from(types), y: Float32Array.from(ys),
    links: new Int32Array(count * 8).fill(-1)
  };
  const step = world.data.settings.player.step_height;
  for (let n = 0; n < count; n++) {
    const cx = nav.x[n], cz = nav.z[n];
    for (let d = 0; d < 8; d++) {
      const [dx, dz] = DIRS[d];
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
      if (d >= 4) {
        // diagonal: only if both side moves are possible
        const sx = nav.links[n * 8 + (dx > 0 ? 0 : 1)], sz = nav.links[n * 8 + (dz > 0 ? 2 : 3)];
        if (sx < 0 || sz < 0) continue;
      }
      const ex = cx + 0.5 + dx * 0.5, ez = cz + 0.5 + dz * 0.5;
      // stairs are entered and left along their direction only
      if (rampAxis(nav.type[n]) && !alongAxis(nav.type[n], dx, dz)) continue;
      const sn = surfaceOf(world, nav, n, ex, ez);
      let best = -1, bd = step + 1e-3;
      for (let m = colStart[nx + nz * W]; m < colStart[nx + nz * W + 1]; m++) {
        if (rampAxis(nav.type[m]) && !alongAxis(nav.type[m], dx, dz)) continue;
        const sm = surfaceOf(world, nav, m, ex, ez);
        const diff = Math.abs(sm - sn);
        if (diff > bd) continue;
        const top = Math.max(sm, sn);
        if (!clearAbove(g, nav, n, top) || !clearAbove(g, nav, m, top)) continue;
        bd = diff; best = m;
      }
      nav.links[n * 8 + d] = best;
    }
  }
  // incoming links, so flow fields measure the distance *to* a goal along walkable moves
  const inCount = new Int32Array(count + 1);
  for (let i = 0; i < count * 8; i++) if (nav.links[i] >= 0) inCount[nav.links[i] + 1]++;
  for (let n = 0; n < count; n++) inCount[n + 1] += inCount[n];
  const rev = new Int32Array(inCount[count]);
  const fill = inCount.slice(0, count);
  for (let i = 0; i < count * 8; i++) {
    const m = nav.links[i];
    if (m >= 0) rev[fill[m]++] = (i / 8) | 0;
  }
  nav.revStart = inCount;
  nav.rev = rev;
  return nav;
}

/** The node someone standing at (x, y, z) is on, or −1. */
export function nodeAt(nav, x, y, z) {
  const cx = Math.floor(x), cz = Math.floor(z);
  if (cx < 0 || cz < 0 || cx >= nav.W || cz >= nav.D) return -1;
  let best = -1, bd = 1.2;
  for (let n = nav.colStart[cx + cz * nav.W]; n < nav.colStart[cx + cz * nav.W + 1]; n++) {
    const d = Math.abs(nav.y[n] - y);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

/** Breadth-first distances (in steps) from the source nodes. */
export function flowField(nav, sources) {
  const dist = new Int32Array(nav.count).fill(-1);
  const q = new Int32Array(nav.count);
  let head = 0, tail = 0;
  for (const s of sources) if (s >= 0 && dist[s] < 0) { dist[s] = 0; q[tail++] = s; }
  while (head < tail) {
    const n = q[head++];
    for (let k = nav.revStart[n]; k < nav.revStart[n + 1]; k++) {
      const m = nav.rev[k];
      if (dist[m] < 0) { dist[m] = dist[n] + 1; q[tail++] = m; }
    }
  }
  return dist;
}

/** Next point to walk towards, following a flow field downhill, or null. */
export function flowNext(nav, field, x, y, z) {
  const n = nodeAt(nav, x, y, z);
  if (n < 0 || field[n] <= 0) return null;
  let best = -1, bd = field[n];
  for (let d = 0; d < 8; d++) {
    const m = nav.links[n * 8 + d];
    if (m >= 0 && field[m] >= 0 && field[m] < bd) { bd = field[m]; best = m; }
  }
  if (best < 0) return null;
  return [nav.x[best] + 0.5, nav.y[best], nav.z[best] + 0.5];
}

/** Rebuild navigation after blocks change (throttled), and refresh flow fields. */
export function maintainNav(world) {
  const c = world.cache;
  if (!c.nav || (c.navDirty && world.time - (c.navBuiltAt || 0) > 0.5)) {
    c.nav = buildNav(world);
    c.navBuiltAt = world.time;
    c.navDirty = false;
    c.playerKey = null;
    c.baseField = null;
  }
  const nav = c.nav;
  const srcs = world.players.filter(p => p.alive && !p.downed).map(p => nodeAt(nav, p.x, p.y, p.z));
  const key = srcs.join(',');
  if (key !== c.playerKey && world.time - (c.playerFieldAt || -1) > 0.25) {
    c.playerField = flowField(nav, srcs);
    c.playerKey = key;
    c.playerFieldAt = world.time;
  }
  if (!c.baseField && world.base) {
    const a = world.base.area, src = [];
    const cx = Math.floor((a.x0 + a.x1) / 2), cz = Math.floor((a.z0 + a.z1) / 2);
    for (let z = cz - 3; z <= cz + 3; z++) for (let x = cx - 3; x <= cx + 3; x++) {
      for (let n = nav.colStart[x + z * nav.W]; n < nav.colStart[x + z * nav.W + 1]; n++) src.push(n);
    }
    c.baseField = flowField(nav, src);
  }
}

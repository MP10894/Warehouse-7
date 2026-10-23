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

/** The standing places in one column, bottom to top: [layer, type, surface height]. */
function columnNodes(world, cx, cz, out) {
  const g = world.grid;
  const th = terrainHeight(world.terrain, cx + 0.5, cz + 0.5);
  if (headroom(g, cx, cz, Math.floor(th + 0.05), th)) out.push(-1, 0, th);
  for (let y = 0; y < g.h; y++) {
    const t = getV(g, cx, y, cz);
    if (t === V.AIR) continue;
    const s = blockTop(t, y, cx + 0.5, cz + 0.5);
    if (s < th + 0.3) continue;
    if (!headroom(g, cx, cz, y + 1, s)) continue;
    out.push(y, t, s);
  }
}

/** Work out node n's eight links to walkable neighbours. */
function linkNode(world, nav, n) {
  const g = world.grid, W = nav.W, D = nav.D, colStart = nav.colStart;
  const step = world.data.settings.player.step_height;
  const cx = nav.x[n], cz = nav.z[n];
  for (let d = 0; d < 8; d++) {
    nav.links[n * 8 + d] = -1;
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

/** Incoming links, so flow fields measure the distance *to* a goal along walkable moves. */
function buildReverse(nav) {
  const count = nav.count;
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
}

/**
 * Build the navigation nodes and links. With `old` and a rectangle of changed columns,
 * only that area is worked out again and everything else is copied, which keeps
 * breaking a wall cheap on a big map.
 */
export function buildNav(world, old = null, rects = null) {
  if (old && rects && rects.length) return updateNav(world, old, rects);
  const g = world.grid, W = g.w, D = g.d;
  const xs = [], zs = [], layers = [], types = [], ys = [];
  const colStart = new Int32Array(W * D + 1);
  const tmp = [];
  for (let cz = 0; cz < D; cz++) {
    for (let cx = 0; cx < W; cx++) {
      colStart[cx + cz * W] = xs.length;
      tmp.length = 0;
      columnNodes(world, cx, cz, tmp);
      for (let k = 0; k < tmp.length; k += 3) { xs.push(cx); zs.push(cz); layers.push(tmp[k]); types.push(tmp[k + 1]); ys.push(tmp[k + 2]); }
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
  for (let n = 0; n < count; n++) linkNode(world, nav, n);
  buildReverse(nav);
  return nav;
}

/** Work out the columns inside `rects` again and copy everything else from `old`. */
function updateNav(world, old, rects) {
  const W = old.W, D = old.D;
  const mark = new Uint8Array(W * D); // 2 = columns that changed, 1 = their neighbours
  for (const r of rects) {
    for (let z = Math.max(0, r.z0 - 1); z <= Math.min(D - 1, r.z1 + 1); z++) {
      for (let x = Math.max(0, r.x0 - 1); x <= Math.min(W - 1, r.x1 + 1); x++) {
        const inside = x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
        if (inside) mark[x + z * W] = 2; else if (!mark[x + z * W]) mark[x + z * W] = 1;
      }
    }
  }
  const fresh = new Map();
  for (let c = 0; c < W * D; c++) {
    if (mark[c] !== 2) continue;
    const tmp = [];
    columnNodes(world, c % W, (c / W) | 0, tmp);
    fresh.set(c, tmp);
  }
  const colStart = new Int32Array(W * D + 1);
  let count = 0;
  for (let c = 0; c < W * D; c++) {
    colStart[c] = count;
    count += mark[c] === 2 ? fresh.get(c).length / 3 : old.colStart[c + 1] - old.colStart[c];
  }
  colStart[W * D] = count;
  const nav = {
    count, W, D, colStart,
    x: new Int16Array(count), z: new Int16Array(count), layer: new Int8Array(count),
    type: new Uint8Array(count), y: new Float32Array(count),
    links: new Int32Array(count * 8).fill(-1)
  };
  const remap = new Int32Array(old.count).fill(-1);
  for (let c = 0; c < W * D; c++) {
    let n = colStart[c];
    if (mark[c] === 2) {
      const tmp = fresh.get(c), cx = c % W, cz = (c / W) | 0;
      for (let k = 0; k < tmp.length; k += 3, n++) { nav.x[n] = cx; nav.z[n] = cz; nav.layer[n] = tmp[k]; nav.type[n] = tmp[k + 1]; nav.y[n] = tmp[k + 2]; }
    } else {
      for (let o = old.colStart[c]; o < old.colStart[c + 1]; o++, n++) {
        remap[o] = n;
        nav.x[n] = old.x[o]; nav.z[n] = old.z[o]; nav.layer[n] = old.layer[o]; nav.type[n] = old.type[o]; nav.y[n] = old.y[o];
      }
    }
  }
  // copy links away from the change; work out links in and next to it again
  for (let c = 0; c < W * D; c++) {
    if (mark[c]) continue;
    for (let o = old.colStart[c]; o < old.colStart[c + 1]; o++) {
      const m = remap[o] * 8, ob = o * 8;
      for (let d = 0; d < 8; d++) { const l = old.links[ob + d]; nav.links[m + d] = l >= 0 ? remap[l] : -1; }
    }
  }
  for (let c = 0; c < W * D; c++) {
    if (!mark[c]) continue;
    for (let n = colStart[c]; n < colStart[c + 1]; n++) linkNode(world, nav, n);
  }
  buildReverse(nav);
  return nav;
}

/** Note that blocks changed in a rectangle of columns, so path-finding updates there. */
export function markNavDirty(world, x0, z0, x1, z1) {
  const c = world.cache;
  c.navDirty = true;
  if (x0 === undefined) { c.navRect = 'all'; return; }
  if (c.navRect === 'all') return;
  const list = c.navRect || (c.navRect = []);
  list.push({ x0, z0, x1, z1 });
  if (list.length > 24) c.navRect = 'all';
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
    const rects = c.nav && Array.isArray(c.navRect) ? c.navRect : null;
    c.nav = rects ? buildNav(world, c.nav, rects) : buildNav(world);
    c.navRect = null;
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
  if (!c.baseField && world.base && world.base.claimed && world.base.area) {
    const a = world.base.area, src = [];
    const cx = Math.floor((a.x0 + a.x1) / 2), cz = Math.floor((a.z0 + a.z1) / 2);
    for (let z = cz - 3; z <= cz + 3; z++) for (let x = cx - 3; x <= cx + 3; x++) {
      for (let n = nav.colStart[x + z * nav.W]; n < nav.colStart[x + z * nav.W + 1]; n++) src.push(n);
    }
    c.baseField = flowField(nav, src);
  }
}

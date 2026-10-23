// Decoration that makes the place look lived in. Purely visual, like the rubble: nothing
// here blocks people or bullets or changes path-finding, and the simulation never sees it.
//
//  - Buildings: rolled-down shop shutters and striped awnings on ground floors facing a
//    street, window frames and wooden shutters, air-conditioning boxes, grime streaks under
//    the roof line; on roofs water tanks, satellite dishes, aerials and washing lines;
//    sagging electric wires across the streets.
//  - Ground: oil stains, cracks, scorch marks, tyre tracks, and sand blown against walls.
//
// Everything is placed by rules from the level itself (the same every run and on both co-op
// phones) and drawn in 32 × 32 m regions, one mesh per region plus one for wires, so it adds
// few draw calls. Each piece hangs on the wall or roof cells it is fixed to: when those break,
// the piece goes with them. How much is placed: settings.json → decor.amount (tuning panel).
import * as THREE from 'three';
import { V, isFull, cellXYZ } from '../sim/grid.js';
import { terrainHeight, groundType } from '../sim/terrain.js';
import { makeCanvas, pixelTexture } from './textures.js';
import { buildingLooks } from './blocks-mesh.js';

const REGION = 32;
const T = 128;   // atlas size in pixels

// ---------------------------------------------------------------- the texture atlas
// Regions of the atlas in pixels: [x0, y0, x1, y1]
const A = {
  shutter: [0, 0, 32, 32], awning: [32, 0, 64, 32], slats: [64, 0, 96, 32], plain: [100, 4, 108, 12],
  dish: [112, 0, 128, 16], cloth: [100, 18, 124, 30],
  streak: [0, 32, 32, 64], oil: [32, 32, 64, 64], crack: [64, 32, 96, 64], scorch: [96, 32, 128, 64],
  tyres: [0, 64, 32, 96], drift: [32, 64, 64, 96], stain: [64, 64, 96, 96], dark: [100, 68, 108, 76]
};

function atlas() {
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  return pixelTexture(makeCanvas(T, T, g => {
    g.clearRect(0, 0, T, T);
    const px = (x, y, c, a = 1) => { g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`; g.fillRect(x, y, 1, 1); };
    // rolled-down shutter: horizontal ribs, a bottom bar, a little rust
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const v = 190 + (y % 3 === 0 ? -50 : y % 3 === 1 ? 20 : 0) + (rnd() - 0.5) * 16 - (y > 28 ? 60 : 0);
      px(x, y, rnd() < 0.03 ? [150, 100, 70] : [v, v, v - 6]);
    }
    // awning cloth: wide stripes (white and grey, coloured by the vertex colour), a scalloped edge
    for (let y = 0; y < 32; y++) for (let x = 32; x < 64; x++) {
      const stripe = Math.floor((x - 32) / 4) % 2 ? 235 : 150;
      const edge = y > 27 && ((x >> 1) % 2 === 0 ? y > 29 : false);
      if (edge) continue;
      px(x, y, [stripe + (rnd() - 0.5) * 12, stripe + (rnd() - 0.5) * 12, stripe - 8]);
    }
    // wooden shutter slats
    for (let y = 0; y < 32; y++) for (let x = 64; x < 96; x++) {
      const v = 200 + (y % 4 === 0 ? -70 : 0) + ((x === 64 || x === 95) ? -60 : 0) + (rnd() - 0.5) * 18;
      px(x, y, [v, v, v]);
    }
    g.fillStyle = '#fff'; g.fillRect(96, 0, 16, 16);                    // plain (vertex colour does the work)
    // satellite dish: a pale disc, transparent outside
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d < 7.5) px(112 + x, y, d > 6.5 ? [150, 150, 146] : [228 - d * 4, 228 - d * 4, 222 - d * 4]);
    }
    // washing: little cloth rectangles with a fold line
    for (let y = 16; y < 32; y++) for (let x = 96; x < 128; x++) px(x, y, [235 - (y === 20 ? 40 : 0), 235, 230]);
    // grime streaks running down from the top, transparent between them
    for (let x = 0; x < 32; x++) {
      const len = 6 + Math.floor(rnd() * 26) * (rnd() < 0.55 ? 1 : 0.3);
      for (let y = 32; y < 32 + len; y++) px(x, y, [60, 52, 42], 0.55 * (1 - (y - 32) / len));
    }
    // oil stain: dark irregular blob
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 15.5, (y - 15.5) * 1.3) / 15 + (rnd() - 0.5) * 0.25;
      if (d < 1) px(32 + x, 32 + y, [20, 18, 16], 0.75 * (1 - d * d));
    }
    // cracks: a few jagged dark lines
    for (let k = 0; k < 4; k++) {
      let x = 16, y = 16, a = rnd() * Math.PI * 2;
      for (let i = 0; i < 18; i++) {
        px(64 + Math.round(x), 32 + Math.round(y), [40, 36, 32], 0.9);
        a += (rnd() - 0.5) * 0.9; x += Math.cos(a); y += Math.sin(a);
        if (x < 0 || y < 0 || x > 31 || y > 31) break;
      }
    }
    // scorch mark: black centre fading out
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5) / 15.5 + (rnd() - 0.5) * 0.3;
      if (d < 1) px(96 + x, 32 + y, [16, 14, 12], 0.85 * (1 - d));
    }
    // tyre tracks: two worn bands with tread marks
    for (let y = 64; y < 96; y++) for (const x0 of [36 - 32, 22]) for (let x = x0; x < x0 + 5; x++) {
      if ((y + x) % 3) px(x, y, [50, 44, 36], 0.45);
    }
    // sand drift: solid at the wall side, thinning out (ripples)
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const a = Math.max(0, 1 - y / 30) * (0.75 + 0.25 * Math.sin(x * 0.7 + y * 0.4)) + (rnd() - 0.5) * 0.25;
      if (a > 0.2) px(32 + x, 64 + y, [214 + rnd() * 12, 184 + rnd() * 10, 130], Math.min(1, a));
    }
    // damp / dirt stain: soft brown blob
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5) / 15.5 + (rnd() - 0.5) * 0.35;
      if (d < 1) px(64 + x, 64 + y, [90, 74, 52], 0.45 * (1 - d));
    }
    g.fillStyle = '#222'; g.fillRect(100, 68, 8, 8);                    // plain dark
  }), false);
}
const uv = r => [r[0] / T, 1 - r[3] / T, r[2] / T, 1 - r[1] / T];   // [u0, v0, u1, v1] (v up)

// ---------------------------------------------------------------- colours
const SHUTTER = [[0.82, 0.82, 0.8], [0.62, 0.74, 0.86], [0.66, 0.78, 0.6], [0.86, 0.7, 0.55]];
const AWNING = [[0.95, 0.35, 0.3], [0.35, 0.6, 0.4], [0.35, 0.5, 0.8], [0.95, 0.8, 0.35], [0.95, 0.55, 0.25], [0.6, 0.4, 0.7]];
const WOOD = [[0.45, 0.6, 0.42], [0.42, 0.55, 0.72], [0.62, 0.45, 0.3], [0.7, 0.66, 0.55]];
const CLOTH = [[0.95, 0.95, 0.92], [0.85, 0.3, 0.25], [0.3, 0.45, 0.8], [0.9, 0.8, 0.35], [0.4, 0.65, 0.4], [0.75, 0.5, 0.7]];

function rng(seed) {
  let s = (seed % 2147483646) + 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

// ---------------------------------------------------------------- placing things
/**
 * Work out every decoration for the level. Returns { items } where each item is
 * { region, anchors: [cell indices that must stay solid], kind, ... }.
 */
export function planDecor(world, amount = 1) {
  const g = world.grid, size = world.level.size;
  const cell = (x, y, z) => (x < 0 || z < 0 || y < 0 || x >= g.w || z >= g.d || y >= g.h) ? V.AIR : g.cells[x + z * g.w + y * g.w * g.d];
  const idx = (x, y, z) => x + z * g.w + y * g.w * g.d;
  const { owner, looks } = buildingLooks(world);
  const items = [];
  const regionOf = (x, z) => Math.floor(Math.max(0, Math.min(size - 1, x)) / REGION) + Math.floor(Math.max(0, Math.min(size - 1, z)) / REGION) * Math.ceil(size / REGION);
  const add = (it, x, z) => { it.region = regionOf(x, z); items.push(it); };
  const isWall = (x, y, z) => cell(x, y, z) === V.WALL;
  // the top metre of every storey is the floor slab of the storey above (or the roof)
  const isSolid = (x, y, z) => { const t = cell(x, y, z); return t === V.WALL || t === V.SLAB || t === V.COLUMN; };
  const open = gt => gt === 'r' || gt === 'p' || gt === 'g' || gt === 'd' || gt === 'c';

  looks.forEach((b, bi) => {
    const r = rng(b.seed);
    const industrial = /^refinery/.test(b.file || '');
    // the four sides: cells along it, outward normal
    const sides = [
      { n: [0, -1], cells: Array.from({ length: b.w - 2 }, (_, i) => [b.x + 1 + i, b.z]) },
      { n: [0, 1], cells: Array.from({ length: b.w - 2 }, (_, i) => [b.x + 1 + i, b.z + b.d - 1]) },
      { n: [-1, 0], cells: Array.from({ length: b.d - 2 }, (_, i) => [b.x, b.z + 1 + i]) },
      { n: [1, 0], cells: Array.from({ length: b.d - 2 }, (_, i) => [b.x + b.w - 1, b.z + 1 + i]) }
    ];
    const shopOwner = !industrial && b.walled && r() < 0.65 * amount;
    const awningColour = AWNING[Math.floor(r() * AWNING.length)];
    const woodColour = WOOD[Math.floor(r() * WOOD.length)];
    for (const side of sides) {
      const [nx, nz] = side.n;
      // does this side face a street or open ground?
      const mid = side.cells[Math.floor(side.cells.length / 2)] || [b.x, b.z];
      const fx = mid[0] + nx * 3 + 0.5, fz = mid[1] + nz * 3 + 0.5;
      const facesStreet = owner[Math.floor(fx) + Math.floor(fz) * g.w] < 0 && open(groundType(world.ground, fx, fz));
      // ground floor: shop shutters and awnings
      if (shopOwner && facesStreet && b.walled) {
        let run = 0;
        side.cells.forEach(([x, z], i) => {
          const solid = isWall(x, b.base, z) && isWall(x, b.base + 1, z) && isSolid(x, b.base + 2, z);
          const door = !isSolid(x, b.base, z) && !isSolid(x, b.base + 1, z) && isSolid(x, b.base + 2, z);
          if (solid && run < 3 && r() < 0.7) {
            run++;
            add({ kind: 'shutter', x, z, y: b.base, n: side.n, half: r() < 0.3, colour: SHUTTER[Math.floor(r() * SHUTTER.length)],
              anchors: [idx(x, b.base, z), idx(x, b.base + 1, z)] }, x, z);
            if (run === 1 || r() < 0.5) add({ kind: 'awning', x, z, y: b.base + 2.15, n: side.n, colour: awningColour, anchors: [idx(x, b.base + 1, z)] }, x, z);
          } else {
            run = 0;
            if (door && r() < 0.6) add({ kind: 'awning', x, z, y: b.base + 2.15, n: side.n, colour: awningColour, anchors: [] }, x, z);
          }
        });
      }
      // windows on every floor: frames, wooden shutters, air conditioners
      for (let k = 0; k < b.top; k++) {
        const by = b.base + k * 3;
        side.cells.forEach(([x, z]) => {
          const win = isWall(x, by, z) && cell(x, by + 1, z) === V.AIR && isSolid(x, by + 2, z);
          if (!win) return;
          add({ kind: 'frame', x, z, y: by, n: side.n, anchors: [idx(x, by, z)] }, x, z);
          if (!industrial && r() < 0.45 * amount) {
            // shutters fold back against the wall on both sides of the window
            const [tx, tz] = [Math.abs(nz), Math.abs(nx)];
            const ok = isWall(x - tx, by + 1, z - tz) && isWall(x + tx, by + 1, z + tz);
            if (ok) add({ kind: 'shutters', x, z, y: by, n: side.n, colour: woodColour, anchors: [idx(x - tx, by + 1, z - tz), idx(x + tx, by + 1, z + tz)] }, x, z);
          }
          if (k > 0 && r() < 0.15 * amount) add({ kind: 'ac', x, z, y: by, n: side.n, anchors: [idx(x, by, z)] }, x, z);
        });
      }
      // grime streaks under the roof line
      if (b.walled && b.top > 0) {
        const ty = b.base + b.top * 3 - 2;    // the wall row just under the roof slab
        side.cells.forEach(([x, z]) => {
          if (isWall(x, ty, z) && r() < 0.3 * amount) add({ kind: 'streak', x, z, y: ty + 2, n: side.n, anchors: [idx(x, ty, z)] }, x, z);
        });
      }
      // electric wires across the street, to the next building facing this one (east and south sides only, so each street is crossed once)
      if (b.walled && (nx > 0 || nz > 0) && !industrial) {
        const wy = b.base + Math.max(1, b.top) * 3 - 1.2;
        side.cells.forEach(([x, z], i) => {
          if (i % 4 !== 1 || r() > 0.8 * amount) return;
          const y = Math.floor(wy);
          if (!isWall(x, y, z)) return;
          for (let s = 2; s <= 18; s++) {
            const qx = x + nx * s, qz = z + nz * s;
            const o = owner[Math.max(0, Math.min(g.w - 1, qx)) + Math.max(0, Math.min(g.d - 1, qz)) * g.w];
            if (cell(qx, y, qz) !== V.AIR || (o >= 0 && o !== bi)) {
              if (isSolid(qx, y, qz) && o >= 0 && o !== bi) {
                const n = 1 + (r() < 0.5 ? 1 : 0);
                add({ kind: 'wire', x, z, y: wy, n: side.n, to: [qx, qz], count: n, sag: 0.35 + s * 0.04, anchors: [idx(x, y, z)] }, x, z);
              }
              break;
            }
          }
        });
      }
    }
    // rooftops
    if (b.roofed && b.w >= 5 && b.d >= 5) {
      const ry = b.base + b.top * 3;
      const onRoof = (x, z) => cell(x, ry - 1, z) === V.SLAB && cell(x, ry, z) === V.AIR;
      const corners = [[b.x + 1, b.z + 1], [b.x + b.w - 2, b.z + 1], [b.x + 1, b.z + b.d - 2], [b.x + b.w - 2, b.z + b.d - 2]]
        .sort(() => r() - 0.5);
      let used = 0;
      if (r() < (industrial ? 0.3 : 0.75) * amount) {
        const tanks = 1 + (r() < 0.4 ? 1 : 0);
        const colour = [[0.16, 0.16, 0.16], [0.9, 0.9, 0.88], [0.35, 0.5, 0.75]][Math.floor(r() * 3)];
        for (let t = 0; t < tanks && used < 4; used++) {
          const [x, z] = corners[used];
          if (onRoof(x, z)) { add({ kind: 'tank', x: x + 0.5, z: z + 0.5, y: ry, colour, anchors: [] }, x, z); t++; }
        }
      }
      if (used < 4 && r() < 0.4 * amount) { const [x, z] = corners[used++]; if (onRoof(x, z)) add({ kind: 'dish', x: x + 0.5, z: z + 0.5, y: ry, turn: r() * 6.28, anchors: [] }, x, z); }
      if (used < 4 && r() < 0.35 * amount) { const [x, z] = corners[used++]; if (onRoof(x, z)) add({ kind: 'aerial', x: x + 0.5, z: z + 0.5, y: ry, anchors: [] }, x, z); }
      if (!industrial && r() < 0.25 * amount) {
        // washing line across the middle of the roof
        const along = b.w >= b.d;
        const cx = b.x + b.w / 2, cz = b.z + b.d / 2, half = Math.min(along ? b.w : b.d, 7) / 2 - 1;
        const p0 = along ? [cx - half, cz] : [cx, cz - half], p1 = along ? [cx + half, cz] : [cx, cz + half];
        if (onRoof(Math.floor(p0[0]), Math.floor(p0[1])) && onRoof(Math.floor(p1[0]), Math.floor(p1[1]))) {
          const clothes = Array.from({ length: 3 + Math.floor(r() * 4) }, () => ({ t: 0.12 + r() * 0.76, colour: CLOTH[Math.floor(r() * CLOTH.length)], w: 0.3 + r() * 0.35, h: 0.35 + r() * 0.4 }));
          add({ kind: 'washing', p0, p1, y: ry, clothes, anchors: [] }, cx, cz);
        }
      }
    }
    // sand blown against the walls
    for (const side of sides) {
      const [nx, nz] = side.n;
      side.cells.forEach(([x, z]) => {
        if (r() > 0.35 * amount) return;
        const gx = x + nx, gz = z + nz;
        if (owner[Math.max(0, Math.min(g.w - 1, gx)) + Math.max(0, Math.min(g.d - 1, gz)) * g.w] >= 0) return;
        const gy = Math.round(terrainHeight(world.terrain, gx + 0.5, gz + 0.5));
        if (cell(gx, gy, gz) !== V.AIR && cell(gx, gy, gz) !== V.RUBBLE) return;
        add({ kind: 'drift', x, z, y: b.base, n: side.n, len: 1 + Math.floor(r() * 2), anchors: [] }, x, z);
      });
    }
  });

  // ground marks: oil, cracks, scorch, tyre tracks, dirt
  const r = rng(4242);
  for (let z = 2; z < size - 2; z += 2) for (let x = 2; x < size - 2; x += 2) {
    if (owner[x + z * g.w] >= 0) continue;
    const gt = groundType(world.ground, x, z);
    const roll = r();
    let kind = null;
    if (gt === 'r') kind = roll < 0.05 ? 'oil' : roll < 0.1 ? 'crack' : roll < 0.115 ? 'scorch' : roll < 0.14 && x > 136 ? 'tyres' : roll < 0.16 ? 'stain' : null;
    else if (gt === 'p' || gt === 'c') kind = roll < 0.04 ? 'crack' : roll < 0.06 ? 'stain' : roll < 0.075 ? 'oil' : roll < 0.085 ? 'scorch' : null;
    else if (gt === 'g' || gt === 'd') kind = roll < 0.03 ? 'stain' : roll < 0.04 ? 'tyres' : null;
    if (!kind || r() > amount) continue;
    const px = x + r() * 2, pz = z + r() * 2, y = terrainHeight(world.terrain, px, pz);
    const gy = Math.round(y);
    if (cell(Math.floor(px), gy, Math.floor(pz)) !== V.AIR && cell(Math.floor(px), gy, Math.floor(pz)) !== V.RUBBLE) continue;
    const sizeM = kind === 'tyres' ? 3 + r() * 2 : kind === 'scorch' ? 1.5 + r() * 2 : 0.8 + r() * 1.6;
    add({ kind: 'mark', mark: kind, x: px, z: pz, y, size: sizeM, turn: r() * Math.PI, anchors: [] }, px, pz);
  }
  return { items };
}

// ---------------------------------------------------------------- drawing
export function createDecor(scene, world, settings) {
  const tex = atlas();
  const mat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, alphaTest: 0.3, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const wireMat = new THREE.LineBasicMaterial({ color: 0x1c1a17 });
  const g = world.grid;
  const regions = new Map();     // region → [mesh, lines]
  let plan = null, byRegion = null, anchorRegions = null;

  function replan() {
    plan = planDecor(world, settings.decor?.amount ?? 1);
    byRegion = new Map(); anchorRegions = new Map();
    for (const it of plan.items) {
      if (!byRegion.has(it.region)) byRegion.set(it.region, []);
      byRegion.get(it.region).push(it);
      for (const a of it.anchors) {
        if (!anchorRegions.has(a)) anchorRegions.set(a, new Set());
        anchorRegions.get(a).add(it.region);
      }
    }
  }

  function buildRegion(key) {
    const old = regions.get(key);
    if (old) for (const m of old) { scene.remove(m); m.geometry.dispose(); }
    regions.delete(key);
    const items = byRegion.get(key);
    if (!items) return;
    const P = [], U = [], C = [], L = [];
    const quad = (v, r, c, shade = 1) => {
      const [u0, v0, u1, v1] = uv(A[r]);
      const t = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];   // v: top-left, top-right, bottom-right, bottom-left
      for (const i of [0, 1, 2, 0, 2, 3]) { P.push(...v[i]); U.push(...t[i]); C.push(c[0] * shade, c[1] * shade, c[2] * shade); }
    };
    // a quad on a wall face: from (a, y0) to (b, y1) along the face, `out` metres off the wall
    const onFace = (it, a0, a1, y0, y1, out, r, c, shade = 1) => {
      const [nx, nz] = it.n;
      const px = it.x + 0.5 + nx * (0.5 + out), pz = it.z + 0.5 + nz * (0.5 + out);
      const tx = -nz, tz = nx;    // along the wall
      const P0 = [px + tx * a0, y1, pz + tz * a0], P1 = [px + tx * a1, y1, pz + tz * a1];
      const P2 = [px + tx * a1, y0, pz + tz * a1], P3 = [px + tx * a0, y0, pz + tz * a0];
      quad([P0, P1, P2, P3], r, c, shade);
    };
    const boxAt = (cx, y0, cz, sx, sy, sz, c, r = 'plain') => {
      const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2, y1 = y0 + sy;
      quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], r, c, 1.05);
      quad([[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]], r, c, 0.85);
      quad([[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]], r, c, 0.75);
      quad([[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]], r, c, 0.8);
      quad([[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]], r, c, 0.95);
    };
    const shadeFor = n => 0.75 + 0.25 * Math.max(0, -n[0] * 0.5 + n[1] * 0.4);
    const solid = i => { const t = g.cells[i]; return t !== V.AIR && t !== V.RUBBLE; };

    for (const it of items) {
      if (!it.anchors.every(solid)) continue;
      const sh = it.n ? shadeFor(it.n) : 1;
      switch (it.kind) {
        case 'shutter':
          onFace(it, -0.48, 0.48, it.y + (it.half ? 0.9 : 0), it.y + 2, 0.03, 'shutter', it.colour, sh);
          if (it.half) onFace(it, -0.48, 0.48, it.y, it.y + 0.9, 0.025, 'dark', [1, 1, 1], 1);
          break;
        case 'awning': {
          // slopes down and out from the wall
          const [nx, nz] = it.n, tx = -nz, tz = nx;
          const bx = it.x + 0.5 + nx * 0.5, bz = it.z + 0.5 + nz * 0.5, out = 0.95, drop = 0.45;
          quad([[bx - tx * 0.52, it.y, bz - tz * 0.52], [bx + tx * 0.52, it.y, bz + tz * 0.52],
            [bx + tx * 0.52 + nx * out, it.y - drop, bz + tz * 0.52 + nz * out], [bx - tx * 0.52 + nx * out, it.y - drop, bz - tz * 0.52 + nz * out]], 'awning', it.colour, sh);
          break;
        }
        case 'frame':
          onFace(it, -0.5, 0.5, it.y + 0.92, it.y + 1.04, 0.05, 'plain', [0.85, 0.82, 0.76], sh);   // sill
          onFace(it, -0.5, 0.5, it.y + 1.96, it.y + 2.06, 0.03, 'plain', [0.7, 0.68, 0.62], sh);   // lintel
          break;
        case 'shutters':
          onFace(it, -0.98, -0.52, it.y + 1.02, it.y + 1.96, 0.03, 'slats', it.colour, sh);
          onFace(it, 0.52, 0.98, it.y + 1.02, it.y + 1.96, 0.03, 'slats', it.colour, sh);
          break;
        case 'ac': {
          const [nx, nz] = it.n;
          boxAt(it.x + 0.5 + nx * 0.68, it.y + 0.25, it.z + 0.5 + nz * 0.68, nx ? 0.36 : 0.7, 0.45, nz ? 0.36 : 0.7, [0.86, 0.85, 0.8]);
          break;
        }
        case 'streak':
          onFace(it, -0.5, 0.5, it.y - 1.8, it.y, 0.015, 'streak', [1, 1, 1], 1);
          break;
        case 'drift': {
          // sand against the wall: a strip on the ground, solid at the wall, thinning out
          const [nx, nz] = it.n, tx = -nz, tz = nx;
          const bx = it.x + 0.5 + nx * 0.5, bz = it.z + 0.5 + nz * 0.5, w = 0.5 * it.len + 0.1, out = 0.9 + 0.3 * it.len;
          const y = terrainHeight(world.terrain, bx + nx * 0.5, bz + nz * 0.5) + 0.03;
          quad([[bx - tx * w, y + 0.08, bz - tz * w], [bx + tx * w, y + 0.08, bz + tz * w],
            [bx + tx * w + nx * out, y, bz + tz * w + nz * out], [bx - tx * w + nx * out, y, bz - tz * w + nz * out]], 'drift', [1, 1, 1], 1);
          break;
        }
        case 'tank': {
          // round water tank on a little stand
          boxAt(it.x, it.y, it.z, 0.8, 0.25, 0.8, [0.3, 0.3, 0.3]);
          const r0 = 0.45, h = 1.0, y0 = it.y + 0.25, N = 8;
          for (let k = 0; k < N; k++) {
            const a0 = k / N * Math.PI * 2, a1 = (k + 1) / N * Math.PI * 2;
            const p = a => [it.x + Math.cos(a) * r0, it.z + Math.sin(a) * r0];
            const [x0, z0] = p(a0), [x1, z1] = p(a1);
            const s = 0.7 + 0.3 * Math.max(0, Math.cos((a0 + a1) / 2 - 2.4));
            quad([[x0, y0 + h, z0], [x1, y0 + h, z1], [x1, y0, z1], [x0, y0, z0]], 'plain', it.colour, s);
            quad([[it.x, y0 + h + 0.08, it.z], [x0, y0 + h, z0], [x1, y0 + h, z1], [x1, y0 + h, z1]], 'plain', it.colour, 1.08);
          }
          break;
        }
        case 'dish': {
          boxAt(it.x, it.y, it.z, 0.06, 0.7, 0.06, [0.6, 0.6, 0.58]);
          const c = Math.cos(it.turn), s = Math.sin(it.turn), R = 0.4, cy = it.y + 0.85;
          // tilted disc facing the sky to the south-ish
          const pt = (u, v) => [it.x + c * u - s * 0.25 * v, cy + v * 0.85, it.z + s * u + c * 0.25 * v];
          quad([pt(-R, R), pt(R, R), pt(R, -R), pt(-R, -R)], 'dish', [1, 1, 1], 1);
          break;
        }
        case 'aerial':
          boxAt(it.x, it.y, it.z, 0.04, 2.2, 0.04, [0.25, 0.25, 0.24]);
          for (const [h, w] of [[1.7, 0.9], [1.95, 0.7], [2.15, 0.5]]) boxAt(it.x, it.y + h, it.z, w, 0.03, 0.03, [0.25, 0.25, 0.24]);
          break;
        case 'washing': {
          const [x0, z0] = it.p0, [x1, z1] = it.p1, H = 1.6;
          boxAt(x0, it.y, z0, 0.05, H, 0.05, [0.35, 0.33, 0.3]);
          boxAt(x1, it.y, z1, 0.05, H, 0.05, [0.35, 0.33, 0.3]);
          L.push(x0, it.y + H, z0, x1, it.y + H, z1);
          const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), tx = dx / len, tz = dz / len;
          for (const c of it.clothes) {
            const sag = 0.12 * Math.sin(Math.PI * c.t);
            const cx = x0 + dx * c.t, cz = z0 + dz * c.t, top = it.y + H - sag;
            quad([[cx - tx * c.w / 2, top, cz - tz * c.w / 2], [cx + tx * c.w / 2, top, cz + tz * c.w / 2],
              [cx + tx * c.w / 2, top - c.h, cz + tz * c.w / 2], [cx - tx * c.w / 2, top - c.h, cz - tz * c.w / 2]], 'cloth', c.colour, 1);
          }
          break;
        }
        case 'wire': {
          const [nx, nz] = it.n;
          const ax = it.x + 0.5 + nx * 0.5, az = it.z + 0.5 + nz * 0.5;
          const bx = it.to[0] + 0.5 - nx * 0.5, bz = it.to[1] + 0.5 - nz * 0.5;
          for (let w = 0; w < it.count; w++) {
            const off = (w - (it.count - 1) / 2) * 0.35, tx = -nz * off, tz = nx * off;
            let prev = null;
            for (let k = 0; k <= 8; k++) {
              const t = k / 8, y = it.y - it.sag * 4 * t * (1 - t) - w * 0.08;
              const p = [ax + (bx - ax) * t + tx, y, az + (bz - az) * t + tz];
              if (prev) L.push(...prev, ...p);
              prev = p;
            }
          }
          break;
        }
        case 'mark': {
          const c = Math.cos(it.turn) * it.size / 2, s = Math.sin(it.turn) * it.size / 2, y = it.y + 0.025;
          const len = it.mark === 'tyres' ? 2.2 : 1;
          quad([[it.x - c * len + s, y, it.z - s * len - c], [it.x + c * len + s, y, it.z + s * len - c],
            [it.x + c * len - s, y, it.z + s * len + c], [it.x - c * len - s, y, it.z - s * len + c]], it.mark, [1, 1, 1], 1);
          break;
        }
      }
    }
    const meshes = [];
    if (P.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      m.userData.blocks = true;
      scene.add(m); meshes.push(m);
    }
    if (L.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(L, 3));
      geo.computeBoundingSphere();
      const l = new THREE.LineSegments(geo, wireMat);
      l.userData.blocks = true;
      scene.add(l); meshes.push(l);
    }
    regions.set(key, meshes);
  }

  replan();
  for (const k of byRegion.keys()) buildRegion(k);

  return {
    /** Blocks changed (something broke or was built): redraw decoration hanging on them. */
    update(cells) {
      const dirty = new Set();
      for (const i of cells) { const s = anchorRegions.get(i); if (s) for (const r of s) dirty.add(r); }
      for (const k of dirty) buildRegion(k);
    },
    /** Settings changed (decoration amount): place everything again. */
    rebuild() {
      for (const ms of regions.values()) for (const m of ms) { scene.remove(m); m.geometry.dispose(); }
      regions.clear();
      replan();
      for (const k of byRegion.keys()) buildRegion(k);
    },
    get count() { return plan.items.length; }
  };
}

// Decoration that makes the place look lived in. Purely visual, like the rubble: nothing
// here blocks people or bullets or changes path-finding, and the simulation never sees it.
//
//  - Buildings: rolled-down shop shutters and striped awnings on ground floors facing a
//    street, window frames and wooden shutters, air-conditioning boxes, grime streaks under
//    the roof line; on roofs water tanks, satellite dishes, aerials and washing lines;
//    sagging electric wires across the streets.
//  - Ground: oil stains, cracks, scorch marks, tyre tracks, and sand blown against walls.
//  - Street clutter: bullet holes, wall scorch and torn posters; rubbish, tyres, gas bottles,
//    chairs, potted plants and produce crates by the walls; paper, broken concrete, shrubs;
//    razor wire on low walls and sandbags.
//  - Hand-placed (level.json → decor): market stalls, carpets, date palms.
//  - Wrecked vehicles: these ARE solid (V.WRECK blocks in the simulation); this only draws
//    the car, pickup or lorry over its blocks.
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
const T = 256;   // atlas size in pixels

// ---------------------------------------------------------------- the texture atlas
// Regions of the atlas in pixels: [x0, y0, x1, y1]
const A = {
  shutter: [0, 0, 32, 32], awning: [32, 0, 64, 32], slats: [64, 0, 96, 32], plain: [100, 4, 108, 12],
  dish: [112, 0, 128, 16], cloth: [100, 18, 124, 30],
  streak: [0, 32, 32, 64], oil: [32, 32, 64, 64], crack: [64, 32, 96, 64], scorch: [96, 32, 128, 64],
  tyres: [0, 64, 32, 96], drift: [32, 64, 64, 96], stain: [64, 64, 96, 96], dark: [100, 68, 108, 76],
  holes: [128, 0, 160, 32], poster: [160, 0, 192, 32], frond: [192, 0, 256, 32], bush: [128, 32, 160, 64],
  carpet: [160, 32, 192, 64], rust: [192, 32, 224, 64], paper: [224, 32, 240, 48], produce: [224, 48, 240, 64],
  rubber: [240, 32, 256, 48], frond1: [192, 0, 224, 32], frond2: [224, 0, 256, 32]
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
    // bullet holes: dark pits with a pale chipped rim, scattered
    for (let k = 0; k < 9; k++) {
      const cx = 3 + Math.floor(rnd() * 26), cy = 3 + Math.floor(rnd() * 26);
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
        const d = Math.hypot(x, y);
        if (d < 1) px(128 + cx + x, cy + y, [30, 26, 22]);
        else if (d < 2.3 && rnd() < 0.7) px(128 + cx + x, cy + y, [200, 190, 170], 0.8);
      }
    }
    // a torn poster: faded paper, blocks of colour and a figure, no lettering
    for (let y = 2; y < 30; y++) for (let x = 4; x < 28; x++) {
      if ((y < 4 || y > 27 || x < 6 || x > 25) && rnd() < 0.45) continue;      // torn edges
      let c = [214, 206, 186];
      if (y > 5 && y < 14) c = [178, 70, 60];
      if (y > 16 && y < 26 && x > 10 && x < 21 && Math.hypot(x - 15.5, y - 19) < 4.5) c = [60, 70, 90];
      if (y > 23 && y < 26) c = [70, 110, 70];
      px(160 + x, y, c.map(v => v - rnd() * 20));
    }
    // palm frond: a long drooping leaf with a midrib, transparent around it
    for (let x = 0; x < 64; x++) {
      const w = Math.max(0, 9 * Math.sin(Math.PI * x / 64)) + 1;
      for (let y = 0; y < 32; y++) {
        const dy = Math.abs(y - 16);
        if (dy < w && (dy < 1 || (x + y) % 3 !== 0)) px(192 + x, y, dy < 1 ? [120, 110, 60] : [70 + rnd() * 20, 100 + rnd() * 25, 45]);
      }
    }
    // dry shrub: twiggy clump, transparent around it
    for (let k = 0; k < 220; k++) {
      const a = rnd() * Math.PI, rr = rnd() * 15;
      const x = Math.round(15.5 + Math.cos(a) * rr), y = Math.round(31 - Math.sin(a) * rr * 1.1);
      if (y >= 0 && y < 32) px(128 + x, 32 + y, rnd() < 0.5 ? [120, 108, 70] : [96, 104, 60]);
    }
    // carpet: deep red with a border and a pattern
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const edge = x < 3 || x > 28 || y < 3 || y > 28, ring = x === 5 || x === 26 || y === 5 || y === 26;
      const diamond = Math.abs(x - 15.5) + Math.abs(y - 15.5) < 7 && (x + y) % 2 === 0;
      px(160 + x, 32 + y, edge ? [40, 50, 90] : ring ? [200, 170, 90] : diamond ? [210, 180, 110] : [150 + rnd() * 20, 34, 30]);
    }
    // burnt, rusty metal
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const n = Math.sin(x * 0.5) * 0.6 + Math.sin(y * 0.4 + x * 0.25) * 0.6 + rnd() * 0.8;
      const base = n > 1.1 ? [118, 72, 44] : n > 0.5 ? [88, 66, 50] : n > -0.4 ? [66, 58, 52] : [44, 40, 38];
      px(192 + x, 32 + y, base.map(v => v + (rnd() - 0.5) * 10));
    }
    // crumpled paper, fruit and vegetables, rubber
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(224 + x, 32 + y, [230 - rnd() * 40, 226 - rnd() * 40, 214 - rnd() * 40]);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = (Math.floor(x / 3) * 7 + Math.floor(y / 3) * 3) % 4;
      px(224 + x, 48 + y, [[220, 120, 30], [190, 40, 30], [110, 150, 50], [230, 190, 50]][k].map(v => v - ((x % 3 === 0 || y % 3 === 0) ? 50 : 0)));
    }
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(240 + x, 32 + y, (y % 4 === 0) ? [12, 12, 12] : [34, 34, 34]);
  }), false);
}
const uv = r => [r[0] / T, 1 - r[3] / T, r[2] / T, 1 - r[1] / T];   // [u0, v0, u1, v1] (v up)

// ---------------------------------------------------------------- colours
const SHUTTER = [[0.82, 0.82, 0.8], [0.62, 0.74, 0.86], [0.66, 0.78, 0.6], [0.86, 0.7, 0.55]];
const AWNING = [[0.95, 0.35, 0.3], [0.35, 0.6, 0.4], [0.35, 0.5, 0.8], [0.95, 0.8, 0.35], [0.95, 0.55, 0.25], [0.6, 0.4, 0.7]];
const WOOD = [[0.45, 0.6, 0.42], [0.42, 0.55, 0.72], [0.62, 0.45, 0.3], [0.7, 0.66, 0.55]];
const PAINT = [[0.85, 0.84, 0.8], [0.55, 0.62, 0.7], [0.66, 0.32, 0.26], [0.86, 0.72, 0.36], [0.42, 0.46, 0.36], [0.92, 0.6, 0.3]];
const BAGS = [[0.18, 0.18, 0.19], [0.25, 0.32, 0.5], [0.85, 0.85, 0.82], [0.3, 0.3, 0.28]];
const CHAIRS = [[0.92, 0.92, 0.9], [0.3, 0.45, 0.75], [0.75, 0.3, 0.25], [0.35, 0.6, 0.4]];
const BOTTLES = [[0.25, 0.4, 0.7], [0.9, 0.5, 0.2], [0.55, 0.55, 0.55]];
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
      const corners = [[b.x + 1, b.z + 1], [b.x + b.w - 2, b.z + 1], [b.x + 1, b.z + b.d - 2], [b.x + b.w - 2, b.z + b.d - 2]];
      // shuffle (Fisher–Yates: a sort with a random comparison gives different results in different browsers)
      for (let i = corners.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [corners[i], corners[j]] = [corners[j], corners[i]]; }
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
    // ---- street clutter (group 2). Drawn after the above so earlier placements don't move.
    const damaged = /damaged|ruined/.test(b.file || ''), ruined = /ruined/.test(b.file || '');
    for (const side of sides) {
      const [nx, nz] = side.n;
      const mid = side.cells[Math.floor(side.cells.length / 2)] || [b.x, b.z];
      const fx = mid[0] + nx * 3 + 0.5, fz = mid[1] + nz * 3 + 0.5;
      const facesStreet = owner[Math.floor(fx) + Math.floor(fz) * g.w] < 0 && open(groundType(world.ground, fx, fz));
      // bullet holes and scorch on walls (lots on damaged buildings), torn posters at street level
      for (let k = 0; k < Math.max(1, b.top); k++) {
        const by = b.base + k * 3;
        side.cells.forEach(([x, z]) => {
          for (const y of [by, by + 1]) {
            if (!isWall(x, y, z)) continue;
            const roll = r();
            if (roll < (damaged ? 0.18 : 0.035) * amount) add({ kind: 'holes', x, z, y, n: side.n, anchors: [idx(x, y, z)] }, x, z);
            else if (damaged && roll < (ruined ? 0.3 : 0.23) * amount) add({ kind: 'wallscorch', x, z, y, n: side.n, anchors: [idx(x, y, z)] }, x, z);
            else if (!industrial && k === 0 && y === by + 1 && facesStreet && roll > 1 - 0.06 * amount)
              add({ kind: 'poster', x, z, y, n: side.n, tilt: (r() - 0.5) * 0.12, anchors: [idx(x, y, z)] }, x, z);
          }
        });
      }
      // things left against the wall in the street: rubbish, tyres, gas bottles, chairs, pots, produce
      if (industrial || !b.walled) continue;
      side.cells.forEach(([x, z]) => {
        const gx = x + nx, gz = z + nz;
        if (gx < 0 || gz < 0 || gx >= g.w || gz >= g.d || owner[gx + gz * g.w] >= 0) return;
        if (!open(groundType(world.ground, gx + 0.5, gz + 0.5))) return;
        const gy = Math.round(terrainHeight(world.terrain, gx + 0.5, gz + 0.5));
        if (cell(gx, gy, gz) !== V.AIR) return;
        const door = !isSolid(x, b.base, z) && isSolid(x, b.base + 2, z);
        const roll = r();
        let kind = null;
        if (door) kind = roll < 0.35 * amount ? 'pot' : roll < 0.5 * amount ? 'chair' : null;
        else if (roll < 0.035 * amount) kind = 'trash';
        else if (roll < 0.055 * amount) kind = 'tyrestack';
        else if (roll < 0.07 * amount) kind = 'gas';
        else if (roll < 0.085 * amount) kind = 'chair';
        else if (roll < 0.1 * amount && shopOwner && facesStreet) kind = 'produce';
        if (!kind) return;
        const along = r() - 0.5;
        add({ kind, x: gx + 0.5 - nx * 0.15 + -nz * along * 0.5, z: gz + 0.5 - nz * 0.15 + nx * along * 0.5, y: terrainHeight(world.terrain, gx + 0.5, gz + 0.5),
          n: side.n, seed: Math.floor(r() * 1e6), anchors: [] }, gx, gz);
      });
    }
  });

  // ---- coils of razor wire along the tops of low walls and sandbags (in chunks, not everywhere)
  {
    const r = rng(777);
    const top = (x, z) => {
      for (let y = 0; y < Math.min(g.h, 6); y++) {
        const t = cell(x, y, z);
        if ((t === V.LOWWALL || t === V.SANDBAG) && cell(x, y + 1, z) === V.AIR) return y;
      }
      return -1;
    };
    const chunk = new Map();
    for (let z = 0; z < g.d; z++) for (let x = 0; x < g.w; x++) {
      if (owner[x + z * g.w] >= 0) continue;
      const y = top(x, z);
      if (y < 0) continue;
      const key = Math.floor(x / 6) + ',' + Math.floor(z / 6);
      if (!chunk.has(key)) chunk.set(key, r() < 0.35 * amount);
      if (!chunk.get(key)) continue;
      const alongX = top(x - 1, z) >= 0 || top(x + 1, z) >= 0;
      add({ kind: 'coil', x, z, y: y + 1, alongX, anchors: [idx(x, y, z)] }, x, z);
    }
  }

  // ---- wrecked vehicles (solid cover in the simulation; this draws the vehicle over its blocks)
  (world.level.wrecks || []).forEach((w, i) => {
    const seed = 1000 + i * 7919, q = rng(seed);
    q();   // (flip: the same draws as drawWreck)
    const burnt = (q() < 0.45 && !w.colour) || !!w.burnt;
    const r2 = rng(seed + 1); r2();
    const smoke = burnt && r2() < 0.45 * amount;
    add({ kind: 'wreck', ...w, burnt, smoke, seed, anchors: [] }, w.x + w.w / 2, w.z + w.d / 2);
  });

  // a few rubbish heaps in the city smoulder
  {
    const r = rng(9091);
    const bases = (world.data.levels[world.levelId]?.bases || []).map(b => b.area).filter(Boolean);
    const inBase = it => bases.some(a => it.x >= a.x0 - 3 && it.x <= a.x1 + 3 && it.z >= a.z0 - 3 && it.z <= a.z1 + 3);
    for (const it of items) if (it.kind === 'trash' && it.x < 136 && it.z < 136 && r() < 0.12 * amount && !inBase(it)) it.fire = true;
  }

  // ---- hand-placed decoration from the level file: market stalls, carpets, palms ...
  (world.level.decor || []).forEach((d, i) => {
    add({ ...d, kind: d.type, y: terrainHeight(world.terrain, d.x, d.z), seed: 5000 + i * 104729, anchors: [] }, d.x, d.z);
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
    if (!kind || r() > amount) {
      // (group 2) loose paper in the streets, broken concrete, dry shrubs out in the open
      const roll2 = r();
      let k2 = null;
      if (gt === 'r' || gt === 'p' || gt === 'c') k2 = roll2 < 0.07 * amount ? 'paper' : roll2 < 0.085 * amount ? 'chunks' : null;
      else if (gt === 's' || gt === 'g' || gt === 'd') k2 = roll2 < 0.05 * amount ? 'shrub' : null;
      if (!k2) continue;
      const px = x + 0.3 + r() * 1.4, pz = z + 0.3 + r() * 1.4, y = terrainHeight(world.terrain, px, pz);
      const c0 = cell(Math.floor(px), Math.round(y), Math.floor(pz));
      if (c0 !== V.AIR && c0 !== V.RUBBLE) continue;
      add({ kind: k2, x: px, z: pz, y, seed: Math.floor(r() * 1e6), anchors: [] }, px, pz);
      continue;
    }
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
    // a flat quad lying on the ground, w × d, turned by `turn` radians
    const flat = (x, y, z, w, d, turn, r, c) => {
      const cs = Math.cos(turn), sn = Math.sin(turn), yy = y + 0.03;
      const pt = (a, b) => [x + cs * a - sn * b, yy, z + sn * a + cs * b];
      quad([pt(-w / 2, -d / 2), pt(w / 2, -d / 2), pt(w / 2, d / 2), pt(-w / 2, d / 2)], r, c, 1);
    };
    // a bush: three crossed upright quads
    const bush = (x, y, z, w, h, c, turn) => {
      for (let k = 0; k < 3; k++) {
        const a = turn + k * Math.PI / 3, cs = Math.cos(a) * w / 2, sn = Math.sin(a) * w / 2;
        quad([[x - cs, y + h, z - sn], [x + cs, y + h, z + sn], [x + cs, y, z + sn], [x - cs, y, z - sn]], 'bush', c, 1 - k * 0.08);
      }
    };
    // ---- a burnt-out car, pickup or lorry, filling its blocks
    const drawWreck = it => {
      const q = rng(it.seed);
      const alongX = it.w >= it.d, Lg = alongX ? it.w : it.d, W = alongX ? it.d : it.w;
      const flip = q() < 0.5;
      const burnt = q() < 0.45 && !it.colour || it.burnt;
      const paint = burnt ? [1, 1, 1] : it.colour === 'army' ? [0.5, 0.52, 0.38] : PAINT[Math.floor(q() * PAINT.length)];
      const skin = burnt ? 'rust' : 'plain';
      // a box in the vehicle's own frame: a along its length (0 = front), b across, y up from the ground
      const vb = (a0, a1, b0, b1, y0, y1, c, r = 'plain') => {
        if (flip) [a0, a1] = [Lg - a1, Lg - a0];
        const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
        const cx = alongX ? it.x + ca : it.x + cb, cz = alongX ? it.z + cb : it.z + ca;
        boxAt(cx, it.y + y0, cz, alongX ? a1 - a0 : b1 - b0, y1 - y0, alongX ? b1 - b0 : a1 - a0, c, r);
      };
      const glass = [0.5, 0.55, 0.6];
      const wheels = (axles, rad) => {
        if (burnt) {   // burnt ones sit on their bare rims
          for (const a of axles) for (const [b0, b1] of [[0.06, 0.2], [W - 0.2, W - 0.06]]) vb(a - rad * 0.6, a + rad * 0.6, b0, b1, 0, rad * 0.9, [0.35, 0.33, 0.3]);
          return;
        }
        for (const a of axles) for (const [b0, b1] of [[0.02, 0.32], [W - 0.32, W - 0.02]]) vb(a - rad, a + rad, b0, b1, 0, rad * 2, [1, 1, 1], 'rubber');
      };
      const low = burnt ? -0.2 : 0;
      if (it.model === 'truck') {
        wheels([1.1, Lg - 2.4, Lg - 1.2], 0.5);
        vb(0.1, Lg - 0.1, 0.5, W - 0.5, 0.45 + low, 0.8 + low, [0.2, 0.2, 0.2], skin);                 // chassis
        vb(0, 2.2, 0.15, W - 0.15, 0.8 + low, 2.5 + low, paint, skin);                                // cab
        vb(-0.02, 0.02, 0.35, W - 0.35, 1.6 + low, 2.3 + low, [1, 1, 1], 'dark');                      // windscreen
        vb(0.4, 1.6, 0.13, W - 0.13, 1.6 + low, 2.25 + low, glass, 'dark');                             // side windows
        vb(-0.05, 0.05, 0.25, W - 0.25, 0.8 + low, 1.2 + low, [0.25, 0.25, 0.25], skin);             // bumper
        if (q() < 0.5) vb(2.4, Lg - 0.05, 0.1, W - 0.1, 0.8 + low, 2.7 + low, burnt ? [1, 1, 1] : PAINT[Math.floor(q() * PAINT.length)].map(v => v * 0.85), skin);   // cargo box
        else {                                                                                       // open flatbed with a load of crates
          vb(2.4, Lg - 0.05, 0.1, W - 0.1, 0.8 + low, 1.0 + low, [0.45, 0.36, 0.26], burnt ? 'rust' : 'slats');
          for (let k = 0; k < 3; k++) if (q() < 0.7) vb(2.7 + k * 1.3, 3.7 + k * 1.3, 0.3 + q() * 0.6, 1.3 + q() * 0.6, 1.0 + low, 1.8 + low, [0.7, 0.56, 0.38], 'slats');
        }
      } else if (it.model === 'pickup') {
        wheels([0.85, Lg - 1.0], 0.36);
        vb(0.05, 2.6, 0.1, W - 0.1, 0.3 + low, 0.95 + low, paint, skin);                             // bonnet and cab bottom
        vb(1.3, 2.6, 0.18, W - 0.18, 0.95 + low, 1.45 + low, glass, 'dark');                           // cab glass
        vb(1.25, 2.65, 0.15, W - 0.15, 1.45 + low, 1.55 + low, paint, skin);                          // cab roof
        vb(2.6, Lg - 0.05, 0.1, W - 0.1, 0.3 + low, 0.5 + low, paint, skin);                          // bed floor
        vb(2.6, Lg - 0.05, 0.1, 0.22, 0.5 + low, 1.0 + low, paint, skin);                             // bed sides
        vb(2.6, Lg - 0.05, W - 0.22, W - 0.1, 0.5 + low, 1.0 + low, paint, skin);
        vb(Lg - 0.17, Lg - 0.05, 0.22, W - 0.22, 0.5 + low, 0.95 + low, paint, skin);                 // tailgate
      } else {
        wheels([0.75, Lg - 0.8], 0.32);
        vb(0.05, Lg - 0.05, 0.1, W - 0.1, 0.28 + low, 0.92 + low, paint, skin);                       // body
        vb(1.35, Lg - 0.95, 0.25, W - 0.25, 0.92 + low, 1.36 + low, glass, 'dark');                    // glass
        vb(1.3, Lg - 0.9, 0.22, W - 0.22, 1.36 + low, 1.45 + low, paint, skin);                       // roof
        if (!burnt && q() < 0.6) vb(0.15, 1.2, 0.3, W - 0.3, 0.92, 0.95, [1, 1, 1], 'rust');           // rusty bonnet
      }
      if (it.model !== 'truck') {
        // bumpers, headlights and tail lights make it read as a car from a distance
        vb(-0.02, 0.08, 0.05, W - 0.05, 0.3 + low, 0.48 + low, [0.3, 0.3, 0.3], skin);
        vb(Lg - 0.08, Lg + 0.02, 0.05, W - 0.05, 0.3 + low, 0.48 + low, [0.3, 0.3, 0.3], skin);
        const lamp = burnt ? [0.2, 0.2, 0.2] : [0.95, 0.92, 0.75], tail = burnt ? [0.2, 0.2, 0.2] : [0.8, 0.15, 0.1];
        for (const [b0, b1] of [[0.2, 0.5], [W - 0.5, W - 0.2]]) {
          vb(-0.03, 0.02, b0, b1, 0.6 + low, 0.75 + low, lamp);
          vb(Lg - 0.02, Lg + 0.03, b0, b1, 0.62 + low, 0.78 + low, tail);
        }
      }
      // a scorch mark under burnt ones
      if (burnt) flat(it.x + it.w / 2, it.y, it.z + it.d / 2, it.w + 1.5, it.d + 1.5, 0, 'scorch', [1, 1, 1]);
    };
    // ---- a market stall: four poles, a cloth roof, a table of produce and goods hanging at the front
    const drawStall = it => {
      const q = rng(it.seed), turn = (it.turn || 0) * Math.PI / 2, cs = Math.cos(turn), sn = Math.sin(turn);
      const W = it.w || 2.4, D = it.d || 1.6, H = 2.1;
      const P = (a, b, y) => [it.x + cs * a - sn * b, it.y + y, it.z + sn * a + cs * b];   // a across, b front(-)/back(+)
      const roof = AWNING[Math.floor(q() * AWNING.length)];
      for (const [a, b] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
        const p = P(a, b, 0);
        boxAt(p[0], it.y, p[2], 0.06, b < 0 ? H : H + 0.3, 0.06, [0.4, 0.33, 0.25]);
      }
      quad([P(-W / 2 - 0.1, D / 2 + 0.1, H + 0.3), P(W / 2 + 0.1, D / 2 + 0.1, H + 0.3), P(W / 2 + 0.1, -D / 2 - 0.25, H - 0.05), P(-W / 2 - 0.1, -D / 2 - 0.25, H - 0.05)], 'awning', roof, 1);
      // table: a box in the stall's frame (only quarter turns, so it stays axis-aligned)
      const t0 = P(0, -D / 4, 0), quarter = Math.round((it.turn || 0)) % 2 !== 0;
      if (it.counter) {
        // a crate (solid, from the level) stands under the front of the stall: goods go on top of it
        flat(t0[0], it.y + 0.98, t0[2], 1.9, 0.85, turn, 'produce', [1, 1, 1]);
      } else {
        boxAt(t0[0], it.y + 0.75, t0[2], quarter ? D / 2 : W - 0.2, 0.08, quarter ? W - 0.2 : D / 2, [0.55, 0.42, 0.3]);
        flat(t0[0], it.y + 0.81, t0[2], W - 0.3, D / 2 - 0.1, turn, 'produce', [1, 1, 1]);
        boxAt(t0[0], it.y, t0[2], quarter ? D / 2 - 0.1 : W - 0.3, 0.75, quarter ? W - 0.3 : D / 2 - 0.1, [0.5, 0.4, 0.3], 'slats');
      }
      // goods hanging from the front: cloth, bags, sandals
      for (let k = 0; k < 3 + Math.floor(q() * 3); k++) {
        const a = -W / 2 + 0.25 + q() * (W - 0.5), w = 0.15 + q() * 0.2, h = 0.25 + q() * 0.35, c = CLOTH[Math.floor(q() * CLOTH.length)];
        quad([P(a - w / 2, -D / 2 - 0.1, H - 0.1), P(a + w / 2, -D / 2 - 0.1, H - 0.1), P(a + w / 2, -D / 2 - 0.1, H - 0.1 - h), P(a - w / 2, -D / 2 - 0.1, H - 0.1 - h)], 'cloth', c, 1);
      }
      // a crate or two of extra stock beside it
      if (q() < 0.7) { const p = P(W / 2 + 0.4, 0, 0); boxAt(p[0], it.y, p[2], 0.5, 0.3, 0.4, [0.72, 0.56, 0.36], 'slats'); flat(p[0], it.y + 0.27, p[2], 0.46, 0.36, turn, 'produce', [1, 1, 1]); }
    };
    // ---- a date palm: a leaning ringed trunk and a crown of drooping fronds
    const drawPalm = it => {
      const q = rng(it.seed), H = it.h || (5 + q() * 2.5), lean = q() * Math.PI * 2, tilt = 0.04 + q() * 0.06;
      const segs = Math.round(H / 0.6);
      let x = it.x, z = it.z;
      for (let k = 0; k < segs; k++) {
        const w = 0.42 - k * 0.012;
        boxAt(x, it.y + k * (H / segs) - 0.05, z, w, H / segs + 0.02, w, k % 2 ? [0.5, 0.4, 0.28] : [0.44, 0.35, 0.24]);
        x += Math.cos(lean) * tilt * (k / segs + 0.5); z += Math.sin(lean) * tilt * (k / segs + 0.5);
      }
      const top = [x, it.y + H, z], n = 9 + Math.floor(q() * 4);
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2 + q() * 0.3, dx = Math.cos(a), dz = Math.sin(a), len = 2 + q() * 0.8, up = 0.2 + q() * 0.5;
        const px = -dz * 0.38, pz = dx * 0.38;   // half-width across the leaf
        const mid = [top[0] + dx * len * 0.5, top[1] + up, top[2] + dz * len * 0.5];
        const tip = [top[0] + dx * len, top[1] + up - 0.9 - q() * 0.6, top[2] + dz * len];
        const c = [0.9 + q() * 0.2, 0.9 + q() * 0.2, 0.9];
        quad([[top[0] - px * 0.4, top[1], top[2] - pz * 0.4], [mid[0] - px, mid[1], mid[2] - pz], [mid[0] + px, mid[1], mid[2] + pz], [top[0] + px * 0.4, top[1], top[2] + pz * 0.4]], 'frond1', c, 1);
        quad([[mid[0] - px, mid[1], mid[2] - pz], [tip[0] - px * 0.3, tip[1], tip[2] - pz * 0.3], [tip[0] + px * 0.3, tip[1], tip[2] + pz * 0.3], [mid[0] + px, mid[1], mid[2] + pz]], 'frond2', c, 0.92);
      }
      // dates hanging under the crown
      for (let k = 0; k < 3; k++) { const a = q() * 6.28; boxAt(top[0] + Math.cos(a) * 0.3, top[1] - 0.6, top[2] + Math.sin(a) * 0.3, 0.2, 0.4, 0.2, [0.75, 0.45, 0.18]); }
    };

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
          // (the clothes themselves sway in the wind: see createMoving)
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
        // ---------------- group 2: street clutter
        case 'holes': {
          const f = (it.x + it.z) % 2 ? 1 : -1;
          onFace(it, -0.5 * f, 0.5 * f, it.y, it.y + 1, 0.012, 'holes', [1, 1, 1], 1);
          break;
        }
        case 'wallscorch':
          onFace(it, -0.6, 0.6, it.y - 0.1, it.y + 1.1, 0.014, 'scorch', [1, 1, 1], 1);
          break;
        case 'poster':
          onFace(it, -0.34, 0.34, it.y + 0.05 + it.tilt, it.y + 0.95 - it.tilt, 0.016, 'poster', [1, 1, 1], sh);
          break;
        case 'trash': {
          const q = rng(it.seed);
          for (let k = 0; k < 3 + Math.floor(q() * 3); k++) {
            const sz = 0.3 + q() * 0.25;
            boxAt(it.x + (q() - 0.5) * 0.8, it.y, it.z + (q() - 0.5) * 0.8, sz, sz * (0.7 + q() * 0.4), sz * (0.8 + q() * 0.4), BAGS[Math.floor(q() * BAGS.length)]);
          }
          for (let k = 0; k < 2; k++) flat(it.x + (q() - 0.5) * 1.4, it.y, it.z + (q() - 0.5) * 1.4, 0.25, 0.2, q() * 3, 'paper', [1, 1, 1]);
          if (it.fire) {   // a burnt patch with glowing embers in the middle
            flat(it.x, it.y + 0.005, it.z, 1.8, 1.8, 0.4, 'scorch', [1, 1, 1]);
            boxAt(it.x, it.y, it.z, 0.5, 0.12, 0.5, [1, 0.45, 0.12]);
            boxAt(it.x + 0.1, it.y + 0.1, it.z - 0.05, 0.25, 0.1, 0.3, [1, 0.7, 0.2]);
          }
          break;
        }
        case 'tyrestack': {
          const q = rng(it.seed);
          for (let s = 0; s < 1 + Math.floor(q() * 2); s++) {
            const cx = it.x + (q() - 0.5) * 0.7, cz = it.z + (q() - 0.5) * 0.7, n = 1 + Math.floor(q() * 4);
            for (let k = 0; k < n; k++) boxAt(cx + (q() - 0.5) * 0.06, it.y + k * 0.22, cz + (q() - 0.5) * 0.06, 0.62, 0.22, 0.62, [1, 1, 1], 'rubber');
          }
          break;
        }
        case 'gas': {
          const q = rng(it.seed), [nx, nz] = it.n, tx = -nz, tz = nx;
          const n = 2 + Math.floor(q() * 2), c = BOTTLES[Math.floor(q() * BOTTLES.length)];
          for (let k = 0; k < n; k++) {
            const o = (k - (n - 1) / 2) * 0.34, cx = it.x + tx * o, cz = it.z + tz * o;
            boxAt(cx, it.y, cz, 0.28, 0.62, 0.28, c);
            boxAt(cx, it.y + 0.62, cz, 0.1, 0.1, 0.1, [0.6, 0.55, 0.4]);
          }
          break;
        }
        case 'chair': {
          const q = rng(it.seed), c = CHAIRS[Math.floor(q() * CHAIRS.length)], [nx, nz] = it.n;
          const cx = it.x + (q() - 0.5) * 0.3, cz = it.z + (q() - 0.5) * 0.3;
          for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) boxAt(cx + a * 0.19, it.y, cz + b * 0.19, 0.04, 0.42, 0.04, c);
          boxAt(cx, it.y + 0.42, cz, 0.46, 0.05, 0.46, c);
          // the back is against the wall
          boxAt(cx - nx * 0.21, it.y + 0.47, cz - nz * 0.21, nx ? 0.04 : 0.46, 0.42, nz ? 0.04 : 0.46, c, 'plain');
          break;
        }
        case 'pot': {
          const q = rng(it.seed), sz = 0.3 + q() * 0.15;
          boxAt(it.x, it.y, it.z, sz, sz * 1.1, sz, [0.72, 0.42, 0.28]);
          bush(it.x, it.y + sz * 1.05, it.z, 0.5 + q() * 0.3, 0.7 + q() * 0.4, [0.75, 1.05, 0.7], q() * 3);
          break;
        }
        case 'produce': {
          const q = rng(it.seed), [nx, nz] = it.n, tx = -nz, tz = nx;
          for (let k = 0; k < 2 + Math.floor(q() * 2); k++) {
            const o = (k - 0.5) * 0.55, cx = it.x + tx * o, cz = it.z + tz * o, stack = q() < 0.4 ? 2 : 1;
            for (let j = 0; j < stack; j++) {
              boxAt(cx, it.y + j * 0.3, cz, 0.5, 0.28, 0.4, [0.72, 0.56, 0.36], 'slats');
              if (j === stack - 1) flat(cx, it.y + j * 0.3 + 0.27, cz, 0.46, 0.36, 0, 'produce', [1, 1, 1]);
            }
          }
          break;
        }
        case 'paper': {
          const q = rng(it.seed);
          for (let k = 0; k < 1 + Math.floor(q() * 3); k++) flat(it.x + (q() - 0.5) * 1.2, it.y, it.z + (q() - 0.5) * 1.2, 0.18 + q() * 0.15, 0.14 + q() * 0.12, q() * 3, 'paper', [1, 1, 1]);
          break;
        }
        case 'chunks': {
          const q = rng(it.seed);
          for (let k = 0; k < 2 + Math.floor(q() * 2); k++) {
            const sx = 0.25 + q() * 0.5, sz = 0.25 + q() * 0.4;
            boxAt(it.x + (q() - 0.5) * 1.2, it.y - 0.05, it.z + (q() - 0.5) * 1.2, sx, 0.2 + q() * 0.35, sz, [0.68, 0.66, 0.6]);
          }
          if (q() < 0.5) {   // a broken piece of a striped road barrier
            const turn = q() < 0.5;
            boxAt(it.x, it.y, it.z, turn ? 0.4 : 1.1, 0.75, turn ? 1.1 : 0.4, [0.82, 0.8, 0.74]);
            boxAt(it.x, it.y + 0.55, it.z, turn ? 0.42 : 1.12, 0.12, turn ? 1.12 : 0.42, [0.85, 0.7, 0.2]);
            L.push(it.x, it.y + 0.75, it.z, it.x + 0.15, it.y + 1.05, it.z + 0.1);
          }
          break;
        }
        case 'shrub': {
          const q = rng(it.seed), size = 0.7 + q() * 0.8;
          bush(it.x, it.y - 0.05, it.z, size * 1.3, size, [1, 1, 1], q() * 3);
          break;
        }
        case 'coil': {
          // concertina: overlapping loops along the top of the wall
          const R = 0.27, cy = it.y + R - 0.02, turns = 5;
          let prev = null;
          for (let k = 0; k <= 30; k++) {
            const t = k / 30, a = t * turns * Math.PI * 2, along = t + Math.sin(a) * 0.08;
            const c = Math.cos(a) * R, yy = cy + Math.sin(a) * R;
            const p = it.alongX ? [it.x + along, yy, it.z + 0.5 + c] : [it.x + 0.5 + c, yy, it.z + along];
            if (prev) L.push(...prev, ...p);
            prev = p;
          }
          break;
        }
        case 'stall': drawStall(it); break;
        case 'carpet': {
          const q = rng(it.seed);
          if (it.hang) {   // hung over a rail to show it off
            const turn = (it.turn || 0) * Math.PI / 2, c = Math.cos(turn), s2 = Math.sin(turn);
            const top = it.y + 1.9, half = 0.7;
            boxAt(it.x - c * 0.85, it.y, it.z - s2 * 0.85, 0.05, 2, 0.05, [0.35, 0.3, 0.25]);
            boxAt(it.x + c * 0.85, it.y, it.z + s2 * 0.85, 0.05, 2, 0.05, [0.35, 0.3, 0.25]);
            quad([[it.x - c * half, top, it.z - s2 * half], [it.x + c * half, top, it.z + s2 * half], [it.x + c * half, top - 1.6, it.z + s2 * half], [it.x - c * half, top - 1.6, it.z - s2 * half]], 'carpet', [1, 1, 1], 1);
          } else flat(it.x, it.y + 0.01, it.z, it.w || 1.4, it.d || 2.1, (it.turn || 0) * Math.PI / 2 + (q() - 0.5) * 0.1, 'carpet', [0.9 + q() * 0.1, 0.9, 0.9]);
          break;
        }
        case 'palm': drawPalm(it); break;
        case 'wreck': drawWreck(it); break;
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
  let moving = createMoving(scene, world, plan.items, mat);

  return {
    /** Every frame: the washing sways and the smoke drifts. */
    tick(dt, camera) { moving.tick(dt, camera); },
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
      moving.dispose();
      moving = createMoving(scene, world, plan.items, mat);
    },
    get count() { return plan.items.length; },
    get plan() { return plan; }
  };
}

// ---------------------------------------------------------------- things that move
// Washing on the lines swings in the wind, and smoke rises from burnt-out wrecks and
// smouldering rubbish and drifts with the wind (the same way as the refinery flare's smoke).
// One mesh each, rewritten every frame on the CPU: a few hundred quads, so it stays cheap.
const WIND = [0.82, 0.57];   // drift direction (matches the flare's plume)

function smokeTex() {
  return pixelTexture(makeCanvas(32, 32, g => {
    let s = 3;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5) / 16;
      if (d >= 1 || rnd() < d * d * 0.8) continue;
      const v = 215 + rnd() * 40;
      g.fillStyle = `rgba(${v},${v},${v},${(1 - d * d) * 0.9})`; g.fillRect(x, y, 1, 1);
    }
  }), false);
}

function createMoving(scene, world, items, decorMat) {
  const meshes = [];
  // ---- washing
  const cloth = [];
  for (const it of items) {
    if (it.kind !== 'washing') continue;
    const [x0, z0] = it.p0, [x1, z1] = it.p1, H = 1.6;
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), tx = dx / len, tz = dz / len;
    for (const c of it.clothes) {
      const sag = 0.12 * Math.sin(Math.PI * c.t);
      cloth.push({ cx: x0 + dx * c.t, cz: z0 + dz * c.t, top: it.y + H - sag, tx, tz, w: c.w, h: c.h, colour: c.colour,
        phase: (c.t * 13 + x0 * 0.7 + z0 * 0.3) % 6.28 });
    }
  }
  let washGeo = null;
  if (cloth.length) {
    const [u0, v0, u1, v1] = uv(A.cloth);
    const n = cloth.length * 6, P = new Float32Array(n * 3), U = [], C = [];
    for (const c of cloth) for (const i of [0, 1, 2, 0, 2, 3]) {
      U.push(...[[u0, v1], [u1, v1], [u1, v0], [u0, v0]][i]); C.push(...c.colour);
    }
    washGeo = new THREE.BufferGeometry();
    washGeo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    washGeo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    washGeo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    const m = new THREE.Mesh(washGeo, decorMat);
    m.frustumCulled = false; m.userData.blocks = true;
    scene.add(m); meshes.push(m);
  }

  // ---- smoke
  const sources = [];
  for (const it of items) {
    if (it.kind === 'wreck' && it.smoke) sources.push({ x: it.x + it.w / 2, y: it.y + it.h * 0.9, z: it.z + it.d / 2, size: it.model === 'truck' ? 1.4 : 1, dark: 0.32, rate: 0.11 });
    if (it.kind === 'trash' && it.fire) sources.push({ x: it.x, y: it.y + 0.2, z: it.z, size: 0.6, dark: 0.55, rate: 0.14 });
  }
  const PER = 14, smokeQuads = sources.length * PER;
  let smokeGeo = null, smokeMesh = null;
  if (smokeQuads) {
    smokeGeo = new THREE.BufferGeometry();
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(smokeQuads * 18), 3));
    const U = [];
    for (let q = 0; q < smokeQuads; q++) for (const i of [0, 1, 2, 0, 2, 3]) U.push(...[[0, 1], [1, 1], [1, 0], [0, 0]][i]);
    smokeGeo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    smokeGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(smokeQuads * 24), 4));
    const smat = new THREE.MeshBasicMaterial({ map: smokeTex(), vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    smokeMesh = new THREE.Mesh(smokeGeo, smat);
    smokeMesh.frustumCulled = false; smokeMesh.userData.blocks = true; smokeMesh.renderOrder = 2;
    scene.add(smokeMesh); meshes.push(smokeMesh);
    sources.forEach((s, i) => { s.t0 = (i * 0.37) % 1; });
  }

  let t = 0;
  const right = new THREE.Vector3(), up = new THREE.Vector3();
  return {
    tick(dt, camera) {
      t += dt;
      if (washGeo) {
        const P = washGeo.attributes.position.array;
        let k = 0;
        for (const c of cloth) {
          // the cloth swings out from the line, round its top edge
          const nx = -c.tz, nz = c.tx;
          const swing = Math.sin(t * 1.9 + c.phase) * 0.35 + Math.sin(t * 3.7 + c.phase * 2) * 0.12 + 0.15;
          const ox = nx * swing * c.h, oz = nz * swing * c.h, lift = Math.abs(swing) * c.h * 0.25;
          const hw = c.w / 2, flap = Math.sin(t * 5.3 + c.phase) * 0.04;
          const v = [
            [c.cx - c.tx * hw, c.top, c.cz - c.tz * hw], [c.cx + c.tx * hw, c.top, c.cz + c.tz * hw],
            [c.cx + c.tx * hw + ox, c.top - c.h + lift + flap, c.cz + c.tz * hw + oz], [c.cx - c.tx * hw + ox, c.top - c.h + lift - flap, c.cz - c.tz * hw + oz]
          ];
          for (const i of [0, 1, 2, 0, 2, 3]) { P[k++] = v[i][0]; P[k++] = v[i][1]; P[k++] = v[i][2]; }
        }
        washGeo.attributes.position.needsUpdate = true;
      }
      if (smokeGeo) {
        const P = smokeGeo.attributes.position.array, C = smokeGeo.attributes.color.array;
        camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
        const cx = camera.position.x, cz = camera.position.z;
        let k = 0, c = 0;
        for (const s of sources) {
          const far = Math.hypot(s.x - cx, s.z - cz) > 110;
          for (let j = 0; j < PER; j++) {
            const life = ((t * s.rate + s.t0 + j / PER) % 1);
            const rise = life * 9 * s.size, drift = life * life * 7 * s.size;
            const wob = Math.sin(t * 0.8 + j * 2.1) * 0.4 * life;
            const px = s.x + WIND[0] * drift + wob, py = s.y + rise, pz = s.z + WIND[1] * drift - wob * 0.5;
            const half = (0.35 + life * 1.8) * s.size;
            const a = far ? 0 : Math.min(1, life * 6) * (1 - life) * 0.55;
            const rx = right.x * half, ry = right.y * half, rz = right.z * half, ux = up.x * half, uy = up.y * half, uz = up.z * half;
            const v = [[px - rx + ux, py - ry + uy, pz - rz + uz], [px + rx + ux, py + ry + uy, pz + rz + uz],
              [px + rx - ux, py + ry - uy, pz + rz - uz], [px - rx - ux, py - ry - uy, pz - rz - uz]];
            const g = s.dark + life * 0.3;
            for (const i of [0, 1, 2, 0, 2, 3]) {
              P[k++] = v[i][0]; P[k++] = v[i][1]; P[k++] = v[i][2];
              C[c++] = g; C[c++] = g * 0.97; C[c++] = g * 0.94; C[c++] = a;
            }
          }
        }
        smokeGeo.attributes.position.needsUpdate = true;
        smokeGeo.attributes.color.needsUpdate = true;
      }
    },
    dispose() { for (const m of meshes) { scene.remove(m); m.geometry.dispose(); } }
  };
}

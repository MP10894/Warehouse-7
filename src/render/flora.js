// Trees, undergrowth and grass: the leafy parts, drawn as cut-out leaf cards.
//
//  - Tree canopies (broadleaf and palm) on top of the trunks in world.level.trees. The trunk is
//    a block (blocks-mesh.js); when it is shot or blown down, its canopy goes too.
//  - Undergrowth (world.level.shrubs): ferns and banana plants, 2 m tall. In the rules it hides
//    whoever is behind it but stops nothing (see hiddenByShrubs); here it is just leaves.
//  - Grass tufts scattered on open red earth and the jungle floor (looks only, never in the rules).
//
// Drawn in 32 × 32 m regions, one mesh each, so the whole forest costs a few dozen draw calls.
// Everything is placed from the level itself, the same on every device.
import * as THREE from 'three';
import { terrainHeight, groundType } from '../sim/terrain.js';
import { getV, V } from '../sim/grid.js';
import { makeCanvas, pixelTexture } from './textures.js';

const REGION = 32;
const AW = 128, AH = 64;
// atlas regions in pixels [x0, y0, x1, y1]
const A = { canopy: [0, 0, 64, 64], fern: [64, 0, 96, 32], banana: [96, 0, 128, 32], frond: [64, 32, 96, 64], grass: [96, 32, 112, 48], grass2: [112, 32, 128, 48] };

// a small repeatable "random" number from a position, so every phone draws the same plants
const hash = (x, z, k = 0) => { const s = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };

function atlas() {
  let s = 3;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  return pixelTexture(makeCanvas(AW, AH, g => {
    g.clearRect(0, 0, AW, AH);
    const px = (x, y, c) => { g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; g.fillRect(x, y, 1, 1); };
    const leaf = (cx, cy, r, base, x0, y0, x1, y1) => {
      for (let y = Math.max(y0, Math.floor(cy - r)); y <= Math.min(y1 - 1, cy + r); y++)
        for (let x = Math.max(x0, Math.floor(cx - r)); x <= Math.min(x1 - 1, cx + r); x++)
          if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
            const v = (rnd() - 0.5) * 30 + (y - cy) * 2;   // a little darker underneath
            px(x, y, base.map(c => Math.max(0, Math.min(255, c + v))));
          }
    };
    // broadleaf canopy: a crown of leaf clusters, ragged at the edge
    for (let k = 0; k < 70; k++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 24;
      leaf(32 + Math.cos(a) * d, 30 + Math.sin(a) * d * 0.8, 3 + rnd() * 4, rnd() < 0.3 ? [70, 112, 46] : [44, 86, 36], 0, 0, 64, 64);
    }
    // fern / undergrowth: arching blades from the bottom middle
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * (0.15 + 0.7 * k / 8), len = 14 + rnd() * 12;
      for (let t = 0; t < 1; t += 0.03) {
        const x = 80 + Math.cos(a) * len * t * 0.55 * (k < 4.5 ? -1 : 1) * (1 - Math.abs(k - 4) / 6);
        const y = 31 - Math.sin(a) * len * t + t * t * 6;
        leaf(x, y, 1.6 - t, [52 + rnd() * 20, 100 + rnd() * 20, 40], 64, 0, 96, 32);
      }
    }
    // banana plant: a few big paddle leaves
    for (let k = 0; k < 6; k++) {
      const a = Math.PI * (0.12 + 0.76 * k / 5), len = 13 + rnd() * 4;
      for (let t = 0.15; t < 1; t += 0.025) {
        const x = 112 + Math.cos(a) * len * t, y = 31 - Math.sin(a) * len * t + t * t * 5;
        leaf(x, y, 2.6 * Math.sin(t * Math.PI), [90 + rnd() * 20, 134, 50], 96, 0, 128, 32);
      }
    }
    // palm frond: a long midrib with leaflets
    for (let t = 0; t < 1; t += 0.02) {
      const x = 66 + t * 28, y = 36 + t * 10 + t * t * 10;
      leaf(x, y, 0.8, [80, 70, 40], 64, 32, 96, 64);
      for (const side of [-1, 1]) leaf(x + 1, y + side * (4 - t * 3), 1.2, [60, 110, 46], 64, 32, 96, 64);
    }
    // grass tufts (two kinds: green and dry)
    for (const [ox, col] of [[96, [96, 126, 52]], [112, [150, 136, 70]]]) {
      for (let k = 0; k < 9; k++) {
        const bx = ox + 2 + k * 1.4, top = 32 + 4 + rnd() * 6;
        for (let y = Math.floor(top); y < 48; y++) px(Math.round(bx + (48 - y) * (k - 4) * 0.08), y, col.map(c => c + (rnd() - 0.5) * 30));
      }
    }
  }), false);
}

export function createFlora(scene, world) {
  const tex = atlas();
  tex.magFilter = THREE.NearestFilter;
  const mat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const size = world.level.size, nr = Math.ceil(size / REGION);
  const meshes = new Map();
  const trees = world.level.trees || [], shrubs = world.level.shrubs || [];
  const region = (x, z) => Math.floor(x / REGION) + Math.floor(z / REGION) * nr;

  function build(ri) {
    const old = meshes.get(ri);
    if (old) { scene.remove(old); old.geometry.dispose(); meshes.delete(ri); }
    const pos = [], uv = [], col = [];
    const quad = (pts, r, shade) => {
      const [u0, v0, u1, v1] = [r[0] / AW, 1 - r[1] / AH, r[2] / AW, 1 - r[3] / AH];
      const uvs = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
      for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...pts[k]); uv.push(...uvs[k]); col.push(shade, shade, shade * 0.95); }
    };
    // a vertical card standing on (x, y, z), w wide and h tall, turned by angle a
    const card = (x, y, z, w, h, a, r, shade) => {
      const dx = Math.cos(a) * w / 2, dz = Math.sin(a) * w / 2;
      quad([[x - dx, y, z - dz], [x + dx, y, z + dz], [x + dx, y + h, z + dz], [x - dx, y + h, z - dz]], r, shade);
    };
    const flat = (x, y, z, s, a, r, shade) => {
      const c = Math.cos(a) * s / 2, sn = Math.sin(a) * s / 2;
      quad([[x - c + sn, y, z - sn - c], [x + c + sn, y, z + sn - c], [x + c - sn, y, z + sn + c], [x - c - sn, y, z - sn + c]], r, shade);
    };
    const x0 = (ri % nr) * REGION, z0 = Math.floor(ri / nr) * REGION;
    for (const t of trees) {
      if (region(t.x, t.z) !== ri) continue;
      if (t.piece && !world.pieces[t.piece - 1].alive) continue;   // blown down: stump only
      const cx = t.x + 0.5, cz = t.z + 0.5, top = t.y + t.h, a = hash(t.x, t.z) * Math.PI;   // (t.y: bottom of the trunk)
      const shade = 0.8 + hash(t.x, t.z, 2) * 0.35;
      if (t.kind === 'palm') {
        // fronds radiating from the top, drooping
        for (let k = 0; k < 7; k++) {
          const b = a + k * Math.PI * 2 / 7, L = 3.2, dx = Math.cos(b), dz = Math.sin(b), w = 0.6;
          quad([[cx - dz * w, top + 0.3, cz + dx * w], [cx + dx * L - dz * w, top - 1.3, cz + dz * L + dx * w],
                [cx + dx * L + dz * w, top - 1.3, cz + dz * L - dx * w], [cx + dz * w, top + 0.3, cz - dx * w]], A.frond, shade);
        }
      } else {
        const R = 2.3 + hash(t.x, t.z, 1) * 1.2;
        card(cx, top - 2.2, cz, R * 2, R * 1.7, a, A.canopy, shade);
        card(cx, top - 2.2, cz, R * 2, R * 1.7, a + Math.PI / 2, A.canopy, shade * 0.92);
        flat(cx, top - 0.4, cz, R * 2.1, a, A.canopy, shade * 0.85);        // seen from below
        flat(cx, top + 0.6, cz, R * 1.5, a + 0.7, A.canopy, shade * 1.05);
      }
    }
    for (const s of shrubs) {
      if (region(s.x, s.z) !== ri) continue;
      if (getV(world.grid, s.x, Math.floor(s.y), s.z) !== V.AIR) continue;   // something built over it
      const big = s.kind === 'banana', r = big ? A.banana : A.fern;
      const a = hash(s.x, s.z) * Math.PI, sc = 0.85 + hash(s.x, s.z, 3) * 0.4, shade = 0.75 + hash(s.x, s.z, 4) * 0.35;
      const w = (big ? 2.4 : 1.8) * sc, h = s.h * sc * (big ? 1.15 : 1);
      card(s.x + 0.5, s.y, s.z + 0.5, w, h, a, r, shade);
      card(s.x + 0.5, s.y, s.z + 0.5, w, h, a + Math.PI / 2, r, shade * 0.9);
    }
    // grass tufts on open red earth and the jungle floor
    for (let z = z0; z < z0 + REGION; z += 2) for (let x = x0; x < x0 + REGION; x += 2) {
      const ty = groundType(world.ground, x + 1, z + 1);
      const p = ty === 'j' ? 0.45 : ty === 'l' ? 0.22 : 0;
      if (!p || hash(x, z, 5) > p) continue;
      const px = x + hash(x, z, 6) * 2, pz = z + hash(x, z, 7) * 2, py = terrainHeight(world.terrain, px, pz);
      if (getV(world.grid, Math.floor(px), Math.round(py), Math.floor(pz)) !== V.AIR) continue;
      const r = hash(x, z, 8) < 0.6 ? A.grass : A.grass2, a = hash(x, z, 9) * Math.PI, shade = 0.85 + hash(x, z, 10) * 0.3;
      card(px, py - 0.05, pz, 0.8, 0.5, a, r, shade);
      card(px, py - 0.05, pz, 0.8, 0.5, a + Math.PI / 2, r, shade * 0.9);
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(geo, mat);
    m.userData.blocks = true;   // removed with the other scenery when a new run starts
    scene.add(m);
    meshes.set(ri, m);
  }
  for (let ri = 0; ri < nr * nr; ri++) build(ri);

  return {
    /** Blocks changed (a tree blown down, a base wall built over undergrowth): redraw those regions. */
    update(cells) {
      if (!cells || !cells.length) return;
      const g = world.grid, todo = new Set();
      for (const i of cells) {
        const y = Math.floor(i / (g.w * g.d)), r = i - y * g.w * g.d;
        todo.add(region(r % g.w, Math.floor(r / g.w)));
      }
      for (const ri of todo) build(ri);
    }
  };
}

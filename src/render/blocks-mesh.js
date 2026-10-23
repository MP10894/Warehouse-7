// Turns the block grid into meshes, in 16 × 16 m chunks so a broken wall only rebuilds
// its own chunk. Lighting is baked into vertex colours: sunlit faces are bright, faces
// under a roof are darker.
import * as THREE from 'three';
import { V, isFull, cellXYZ } from '../sim/grid.js';
import { SUN } from './terrain-mesh.js';

const CHUNK = 16;
const LOOK = {
  [V.SLAB]: { tex: 'concrete', scale: 0.5 },
  [V.COLUMN]: { tex: 'column', scale: 1 },
  [V.WALL]: { tex: 'wall', scale: 1 },
  [V.RUBBLE]: { tex: 'rubble', scale: 1 },
  [V.CRATE]: { tex: 'crate', scale: 1 },
  [V.LOWWALL]: { tex: 'lowwall', scale: 1 },
  [V.SANDBAG]: { tex: 'sandbag', scale: 1 },
  [V.RAMP_E]: { tex: 'stairs', scale: 1 },
  [V.RAMP_W]: { tex: 'stairs', scale: 1 },
  [V.RAMP_N]: { tex: 'stairs', scale: 1 },
  [V.RAMP_S]: { tex: 'stairs', scale: 1 }
};
const SUN_H = new THREE.Vector2(SUN.x, SUN.z).normalize();

export function createBlockMeshes(scene, world, tex) {
  const g = world.grid;
  const cw = Math.ceil(g.w / CHUNK), cd = Math.ceil(g.d / CHUNK);
  const chunks = new Map();
  const mats = {};
  const mat = k => mats[k] || (mats[k] = new THREE.MeshBasicMaterial({ map: tex[k], vertexColors: true, side: THREE.DoubleSide }));
  const decalsByChunk = new Map();
  for (const [x, y, z] of world.level.decals) {
    const key = Math.floor(x / CHUNK) + Math.floor(z / CHUNK) * cw;
    if (!decalsByChunk.has(key)) decalsByChunk.set(key, []);
    decalsByChunk.get(key).push([x, y, z]);
  }

  const cell = (x, y, z) => (x < 0 || z < 0 || y < 0 || x >= g.w || z >= g.d || y >= g.h) ? V.AIR : g.cells[x + z * g.w + y * g.w * g.d];
  const roofed = (x, y, z) => {
    for (let yy = y; yy < Math.min(g.h, y + 14); yy++) if (isFull(cell(x, yy, z))) return true;
    return false;
  };
  const sideShade = (nx, nz) => 0.66 + 0.3 * Math.max(0, nx * SUN_H.x + nz * SUN_H.y);

  function buildChunk(ci, cj) {
    const key = ci + cj * cw;
    const old = chunks.get(key);
    if (old) { for (const m of old) { scene.remove(m); m.geometry.dispose(); } }
    const B = {};
    const buf = k => B[k] || (B[k] = { p: [], u: [], c: [] });
    const quad = (k, v, uv, shade) => {
      const b = buf(k);
      for (const i of [0, 1, 2, 0, 2, 3]) { b.p.push(...v[i]); b.u.push(...uv[i]); b.c.push(shade * 1.0, shade * 0.97, shade * 0.9); }
    };
    const tri = (k, v, uv, shade) => {
      const b = buf(k);
      for (let i = 0; i < 3; i++) { b.p.push(...v[i]); b.u.push(...uv[i]); b.c.push(shade, shade * 0.97, shade * 0.9); }
    };

    for (let z = cj * CHUNK; z < Math.min(g.d, (cj + 1) * CHUNK); z++) {
      for (let x = ci * CHUNK; x < Math.min(g.w, (ci + 1) * CHUNK); x++) {
        for (let y = 0; y < g.h; y++) {
          const t = cell(x, y, z);
          if (t === V.AIR) continue;
          const L = LOOK[t], k = L.tex, s = L.scale;
          if (isFull(t)) {
            // +x / −x / +z / −z / top / bottom
            if (!isFull(cell(x + 1, y, z))) quad(k, [[x + 1, y, z + 1], [x + 1, y, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1]], [[z * s, y * s], [(z + 1) * s, y * s], [(z + 1) * s, (y + 1) * s], [z * s, (y + 1) * s]], sideShade(1, 0) * (roofed(x + 1, y + 1, z) ? 0.62 : 1));
            if (!isFull(cell(x - 1, y, z))) quad(k, [[x, y, z], [x, y, z + 1], [x, y + 1, z + 1], [x, y + 1, z]], [[z * s, y * s], [(z + 1) * s, y * s], [(z + 1) * s, (y + 1) * s], [z * s, (y + 1) * s]], sideShade(-1, 0) * (roofed(x - 1, y + 1, z) ? 0.62 : 1));
            if (!isFull(cell(x, y, z + 1))) quad(k, [[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]], [[x * s, y * s], [(x + 1) * s, y * s], [(x + 1) * s, (y + 1) * s], [x * s, (y + 1) * s]], sideShade(0, 1) * (roofed(x, y + 1, z + 1) ? 0.62 : 1));
            if (!isFull(cell(x, y, z - 1))) quad(k, [[x + 1, y, z], [x, y, z], [x, y + 1, z], [x + 1, y + 1, z]], [[x * s, y * s], [(x + 1) * s, y * s], [(x + 1) * s, (y + 1) * s], [x * s, (y + 1) * s]], sideShade(0, -1) * (roofed(x, y + 1, z - 1) ? 0.62 : 1));
            if (!isFull(cell(x, y + 1, z))) quad(k, [[x, y + 1, z], [x, y + 1, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z]], [[x * s, z * s], [x * s, (z + 1) * s], [(x + 1) * s, (z + 1) * s], [(x + 1) * s, z * s]], roofed(x, y + 2, z) ? 0.66 : 1.05);
            if (!isFull(cell(x, y - 1, z)) && y > 0) quad(k, [[x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1]], [[x * s, z * s], [(x + 1) * s, z * s], [(x + 1) * s, (z + 1) * s], [x * s, (z + 1) * s]], 0.42);
          } else if (t === V.RUBBLE) {
            const h = 0.22, sh = roofed(x, y + 1, z) ? 0.62 : 1; // low: people walk through it
            quad(k, [[x, y + h, z], [x, y + h, z + 1], [x + 1, y + h, z + 1], [x + 1, y + h, z]], [[0, 0], [0, 1], [1, 1], [1, 0]], 0.95 * sh);
            if (!isFull(cell(x + 1, y, z))) quad(k, [[x + 1, y, z + 1], [x + 1, y, z], [x + 1, y + h, z], [x + 1, y + h, z + 1]], [[0, 0], [1, 0], [1, h], [0, h]], 0.7 * sh);
            if (!isFull(cell(x - 1, y, z))) quad(k, [[x, y, z], [x, y, z + 1], [x, y + h, z + 1], [x, y + h, z]], [[0, 0], [1, 0], [1, h], [0, h]], 0.7 * sh);
            if (!isFull(cell(x, y, z + 1))) quad(k, [[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + h, z + 1], [x, y + h, z + 1]], [[0, 0], [1, 0], [1, h], [0, h]], 0.8 * sh);
            if (!isFull(cell(x, y, z - 1))) quad(k, [[x + 1, y, z], [x, y, z], [x, y + h, z], [x + 1, y + h, z]], [[0, 0], [1, 0], [1, h], [0, h]], 0.8 * sh);
          } else {
            // stairs: a sloped surface with stepped texture, two side triangles and a back face
            const sh = roofed(x, y + 1, z) ? 0.66 : 1;
            let lo0, lo1, hi0, hi1, back, sides;
            if (t === V.RAMP_E) { lo0 = [x, y, z]; lo1 = [x, y, z + 1]; hi0 = [x + 1, y + 1, z]; hi1 = [x + 1, y + 1, z + 1]; back = [[x + 1, y, z], [x + 1, y, z + 1]]; sides = [[[x, y, z], [x + 1, y, z], [x + 1, y + 1, z]], [[x, y, z + 1], [x + 1, y + 1, z + 1], [x + 1, y, z + 1]]]; }
            else if (t === V.RAMP_W) { lo0 = [x + 1, y, z + 1]; lo1 = [x + 1, y, z]; hi0 = [x, y + 1, z + 1]; hi1 = [x, y + 1, z]; back = [[x, y, z + 1], [x, y, z]]; sides = [[[x + 1, y, z], [x, y, z], [x, y + 1, z]], [[x + 1, y, z + 1], [x, y + 1, z + 1], [x, y, z + 1]]]; }
            else if (t === V.RAMP_S) { lo0 = [x + 1, y, z]; lo1 = [x, y, z]; hi0 = [x + 1, y + 1, z + 1]; hi1 = [x, y + 1, z + 1]; back = [[x + 1, y, z + 1], [x, y, z + 1]]; sides = [[[x, y, z], [x, y, z + 1], [x, y + 1, z + 1]], [[x + 1, y, z], [x + 1, y + 1, z + 1], [x + 1, y, z + 1]]]; }
            else { lo0 = [x, y, z + 1]; lo1 = [x + 1, y, z + 1]; hi0 = [x, y + 1, z]; hi1 = [x + 1, y + 1, z]; back = [[x, y, z], [x + 1, y, z]]; sides = [[[x, y, z + 1], [x, y, z], [x, y + 1, z]], [[x + 1, y, z + 1], [x + 1, y + 1, z], [x + 1, y, z]]]; }
            quad(k, [lo0, lo1, hi1, hi0], [[0, 0], [1, 0], [1, 1.5], [0, 1.5]], 0.95 * sh);
            quad(k, [back[0], back[1], hi1, hi0], [[0, 0], [1, 0], [1, 1], [0, 1]], 0.7 * sh);
            for (const tr of sides) tri(k, tr, [[0, 0], [1, 0], [1, 1]], 0.75 * sh);
          }
        }
      }
    }
    for (const [x, y, z] of decalsByChunk.get(key) || []) {
      if (cell(x, y, z) !== V.AIR) continue;
      const yy = y + 0.02;
      quad('floorTile', [[x, yy, z], [x, yy, z + 1], [x + 1, yy, z + 1], [x + 1, yy, z]], [[0, 0], [0, 1], [1, 1], [1, 0]], roofed(x, y + 1, z) ? 0.66 : 1);
    }
    const meshes = [];
    for (const k in B) {
      const b = B[k];
      if (!b.p.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat(k));
      m.userData.blocks = true;
      scene.add(m);
      meshes.push(m);
    }
    chunks.set(key, meshes);
  }

  for (let cj = 0; cj < cd; cj++) for (let ci = 0; ci < cw; ci++) buildChunk(ci, cj);

  return {
    /** React to changed cells (destruction, building). */
    update(cells, all = false) {
      if (all) { for (let cj = 0; cj < cd; cj++) for (let ci = 0; ci < cw; ci++) buildChunk(ci, cj); return; }
      const dirty = new Set();
      for (const i of cells) {
        const [x, , z] = cellXYZ(g, i);
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ci = Math.floor((x + dx) / CHUNK), cj = Math.floor((z + dz) / CHUNK);
          if (ci >= 0 && cj >= 0 && ci < cw && cj < cd) dirty.add(ci + cj * cw);
        }
      }
      for (const k of dirty) buildChunk(k % cw, Math.floor(k / cw));
    }
  };
}

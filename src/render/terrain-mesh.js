// The ground as one mesh: heights from the simulation's terrain, colours from the
// surface map (sand, road, paving, gravel), shading from a fixed sun direction.
import * as THREE from 'three';
import { terrainHeight, groundType } from '../sim/terrain.js';

const SURFACE = {
  s: [0.86, 0.72, 0.5],  // sand
  r: [0.34, 0.33, 0.32], // road
  p: [0.66, 0.62, 0.56], // paving
  g: [0.6, 0.55, 0.48],  // gravel
  c: [0.6, 0.6, 0.57],   // concrete (refinery)
  d: [0.74, 0.6, 0.42],  // dirt track
  l: [0.66, 0.34, 0.22], // laterite (red earth)
  t: [0.74, 0.46, 0.32], // packed red earth (village, haul roads)
  k: [0.52, 0.46, 0.42], // cut rock (mine pit)
  j: [0.36, 0.33, 0.2]   // jungle floor
};
export const SUN = new THREE.Vector3(-0.45, 0.8, 0.35).normalize();

export function buildTerrain(scene, world, tex) {
  const size = world.level.size, step = 2, n = size / step + 1;
  const pos = [], col = [], uv = [], idx = [];
  const h = (x, z) => terrainHeight(world.terrain, x, z);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = i * step, z = j * step, y = h(x, z);
      pos.push(x, y, z);
      uv.push(x / 4, z / 4);
      const nx = h(x - 1, z) - h(x + 1, z), nz = h(x, z - 1) - h(x, z + 1);
      const nrm = new THREE.Vector3(nx, 2, nz).normalize();
      const light = 0.55 + 0.5 * Math.max(0, nrm.dot(SUN));
      const s = SURFACE[groundType(world.ground, Math.min(size - 0.1, x), Math.min(size - 0.1, z))] || SURFACE.s;
      col.push(s[0] * light, s[1] * light, s[2] * light);
    }
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = i + j * n, b = a + 1, c = a + n, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex.ground, vertexColors: true }));
  scene.add(mesh);

  // a skirt beyond the edges, at the edge's own height and colour, so the world doesn't end in a cliff
  let edgeH = 0, edgeN = 0;
  for (let k = 0; k <= size; k += 8) for (const [x, z] of [[k, 0], [k, size], [0, k], [size, k]]) { edgeH += h(x, z); edgeN++; }
  const ec = SURFACE[groundType(world.ground, 1, 1)] || SURFACE.s;
  // (a frame round the map, never under it: under it, it would show through wherever the ground
  // dips below the edge's height, like Kambala's pit)
  const skirtMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ec[0] * 0.72, ec[1] * 0.72, ec[2] * 0.72) });
  const far = size * 2, y = edgeH / edgeN - 0.05;
  for (const [cx, cz, w, d] of [[size / 2, -far / 2, size + far * 2, far], [size / 2, size + far / 2, size + far * 2, far],
                                [-far / 2, size / 2, far, size], [size + far / 2, size / 2, far, size]]) {
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(w, d), skirtMat);
    skirt.rotation.x = -Math.PI / 2; skirt.position.set(cx, y, cz);
    skirt.userData.blocks = true;
    scene.add(skirt);
  }
  return mesh;
}

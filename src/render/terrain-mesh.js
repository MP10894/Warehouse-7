// The ground as one mesh: heights from the simulation's terrain, colours from the
// surface map (sand, road, paving, gravel), shading from a fixed sun direction.
import * as THREE from 'three';
import { terrainHeight, groundType } from '../sim/terrain.js';

const SURFACE = {
  s: [0.86, 0.72, 0.5],  // sand
  r: [0.34, 0.33, 0.32], // road
  p: [0.66, 0.62, 0.56], // paving
  g: [0.6, 0.55, 0.48]   // gravel
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

  // a sand-coloured skirt beyond the edges so the world doesn't end in a cliff
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(size * 5, size * 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.62, 0.52, 0.37) }));
  skirt.rotation.x = -Math.PI / 2; skirt.position.set(size / 2, -0.05, size / 2);
  scene.add(skirt);
  return mesh;
}

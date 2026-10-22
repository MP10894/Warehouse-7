// What a sandstorm looks like from where you stand: thick sandy haze and blowing grit.
import * as THREE from 'three';
import { stormAt } from '../sim/weather.js';

const COUNT = 500;
const wrap = (v, size) => ((((v + size / 2) % size) + size) % size) - size / 2;

export function createWeatherFx(scene, settings) {
  const clear = new THREE.Color(0xd9c49c), sand = new THREE.Color(0xb48e58);
  scene.fog.color.copy(clear);
  scene.background = clear.clone();
  const pos = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) { pos[i * 3] = (Math.random() - 0.5) * 30; pos[i * 3 + 1] = Math.random() * 8; pos[i * 3 + 2] = (Math.random() - 0.5) * 30; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xc9a46a, size: 0.09, transparent: true, opacity: 0, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  let level = 0;

  return {
    get level() { return level; },
    update(dt, world, camera) {
      const target = world ? stormAt(world, camera.position.x, camera.position.z) : 0;
      level += (target - level) * Math.min(1, dt * 1.5);
      const near = settings.world.fog_near, far = settings.world.fog_far;
      scene.fog.near = near * (1 - level) + 1 * level;
      scene.fog.far = far * (1 - level) + 13 * level;
      scene.fog.color.copy(clear).lerp(sand, level);
      scene.background.copy(scene.fog.color);
      mat.opacity = Math.min(0.85, level * 1.2);
      points.visible = level > 0.02;
      if (!points.visible) return;
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      for (let i = 0; i < COUNT; i++) {
        let x = pos[i * 3] + 14 * dt, y = pos[i * 3 + 1] + (Math.random() - 0.5) * dt * 2, z = pos[i * 3 + 2] + 4 * dt;
        x = cx + wrap(x - cx, 30); z = cz + wrap(z - cz, 30); y = cy - 3 + wrap(y - cy + 3 - 4, 8) + 4;
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      }
      geo.attributes.position.needsUpdate = true;
    }
  };
}

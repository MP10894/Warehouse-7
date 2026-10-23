// What the weather looks like from where you stand: thick sandy haze and blowing grit in a
// sandstorm, grey haze and drifting soot in the flare stack's smoke. Smoke zones with a
// "source" also get a smoke plume and a flame you can see from far away.
import * as THREE from 'three';
import { stormAt } from '../sim/weather.js';
import { makeCanvas, pixelTexture } from './textures.js';

const COUNT = 500;
const PUFFS = 60;
const wrap = (v, size) => ((((v + size / 2) % size) + size) % size) - size / 2;

function puffTex() {
  return pixelTexture(makeCanvas(16, 16, g => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) / 8;
      if (d < 1 && Math.random() > d * d * 0.9) { const v = 200 + Math.random() * 40; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 1, 1); }
    }
  }), false);
}

export function createWeatherFx(scene, settings) {
  const clear = new THREE.Color(0xd9c49c), sand = new THREE.Color(0xb48e58), smoke = new THREE.Color(0x6c6862);
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
  let level = 0, smokeShare = 0;

  // plumes: built the first time a world with smoke sources is seen
  const tex = puffTex();
  let plumes = [], plumeWorld = null;
  function buildPlumes(world) {
    for (const p of plumes) { for (const s of p.puffs) scene.remove(s.sp); scene.remove(p.flame); }
    plumes = [];
    plumeWorld = world.levelId;
    for (const z of world.weather) {
      if (z.type !== 'smoke' || !z.source) continue;
      const src = z.source;
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      flame.position.set(src.x, src.y, src.z);
      scene.add(flame);
      const puffs = [];
      for (let i = 0; i < PUFFS; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x4a4744, transparent: true, depthWrite: false }));
        scene.add(sp);
        puffs.push({ sp, t: i / PUFFS });
      }
      plumes.push({ src, zone: z, flame, puffs });
    }
  }

  return {
    get level() { return level; },
    update(dt, world, camera) {
      if (world && plumeWorld !== world.levelId) buildPlumes(world);
      const cxp = camera.position.x, czp = camera.position.z;
      const sandL = world ? stormAt(world, cxp, czp, 'sandstorm') : 0;
      const smokeL = world ? stormAt(world, cxp, czp, 'smoke') : 0;
      const target = Math.max(sandL, smokeL * 0.85);
      level += (target - level) * Math.min(1, dt * 1.5);
      smokeShare += ((smokeL > sandL ? 1 : 0) - smokeShare) * Math.min(1, dt * 1.5);
      const near = settings.world.fog_near, far = settings.world.fog_far;
      scene.fog.near = near * (1 - level) + 1 * level;
      scene.fog.far = far * (1 - level) + 13 * level;
      const haze = sand.clone().lerp(smoke, smokeShare);
      scene.fog.color.copy(clear).lerp(haze, level);
      scene.background.copy(scene.fog.color);
      mat.color.set(smokeShare > 0.5 ? 0x3c3a38 : 0xc9a46a);
      mat.opacity = Math.min(0.85, level * 1.2);

      // the flare's flame flickers; its smoke rises and drifts with the wind
      const now = performance.now() / 1000;
      for (const p of plumes) {
        const fl = 2.2 + Math.sin(now * 13) * 0.4 + Math.sin(now * 31) * 0.25;
        p.flame.scale.set(fl * 0.8, fl * 1.4, 1);
        for (const s of p.puffs) {
          s.t = (s.t + dt * 0.06) % 1;
          const k = s.t;
          s.sp.position.set(p.src.x + k * 26 + Math.sin(k * 9 + s.t) * 1.5, p.src.y + 1 + k * 22, p.src.z + k * 18);
          const size = 2 + k * 9;
          s.sp.scale.set(size, size, 1);
          s.sp.material.opacity = 0.75 * Math.min(1, k * 8) * (1 - k);
        }
      }

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

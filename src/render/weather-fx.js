// What the weather looks like from where you stand: thick sandy haze and blowing grit in a
// sandstorm, grey haze and drifting soot in the flare stack's smoke, grey skies and falling
// rain in a downpour, white haze in a mist bank. Smoke zones with a "source" also get a smoke
// plume and a flame you can see from far away. A level's clear-sky colour: level.json → "sky".
import * as THREE from 'three';
import { stormAt } from '../sim/weather.js';
import { makeCanvas, pixelTexture } from './textures.js';

const COUNT = 500;
const RAIN = 1400;      // rain streaks round the camera
// how close the fog comes in each kind of weather at full strength (metres), and its colour
const FOG = { sandstorm: [13, 0xb48e58], smoke: [15, 0x6c6862], rain: [30, 0x7e868a], mist: [16, 0xc4cbc6] };
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
  const clear = new THREE.Color(0xd9c49c);
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
  let level = 0, smokeShare = 0, skyWorld = null;
  const L = { sandstorm: 0, smoke: 0, rain: 0, mist: 0 };
  const tmp = new THREE.Color();
  // rain: short falling streaks in a box that follows the camera
  const rpos = new Float32Array(RAIN * 6);
  for (let i = 0; i < RAIN; i++) {
    const x = (Math.random() - 0.5) * 36, y = Math.random() * 16, z = (Math.random() - 0.5) * 36;
    rpos.set([x, y, z, x + 0.12, y + 0.7, z + 0.05], i * 6);
  }
  const rgeo = new THREE.BufferGeometry();
  rgeo.setAttribute('position', new THREE.BufferAttribute(rpos, 3));
  const rmat = new THREE.LineBasicMaterial({ color: 0xc8d2d8, transparent: true, opacity: 0, depthWrite: false });
  const rain = new THREE.LineSegments(rgeo, rmat);
  rain.frustumCulled = false;
  scene.add(rain);

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
      // the level's own clear sky (Najaf's dusty tan, Kambala's humid grey-green)
      if (world && skyWorld !== world.levelId) { skyWorld = world.levelId; clear.set(world.data.levels[world.levelId].sky || 0xd9c49c); }
      const cxp = camera.position.x, czp = camera.position.z;
      for (const k of Object.keys(L)) {
        const want = world ? stormAt(world, cxp, czp, k) : 0;
        L[k] += (want - L[k]) * Math.min(1, dt * 1.5);
      }
      // the haziest weather here sets how close the fog comes and its colour
      const near = settings.world.fog_near, far = settings.world.fog_far;
      let fogFar = far, top = null, topL = 0;
      for (const [k, [minFar]] of Object.entries(FOG)) {
        const f = far + (minFar - far) * L[k];
        if (f < fogFar) { fogFar = f; top = k; topL = L[k]; }
      }
      level = Math.max(L.sandstorm, L.smoke * 0.85, L.rain * 0.7, L.mist * 0.8);
      smokeShare = L.smoke > L.sandstorm ? 1 : 0;
      scene.fog.near = Math.min(near, fogFar * 0.25);
      scene.fog.far = fogFar;
      scene.fog.color.copy(clear);
      if (top) scene.fog.color.lerp(tmp.set(FOG[top][1]), Math.min(1, topL * 1.2));
      scene.background.copy(scene.fog.color);
      mat.color.set(smokeShare > 0.5 ? 0x3c3a38 : 0xc9a46a);
      mat.opacity = Math.min(0.85, Math.max(L.sandstorm, L.smoke) * 1.2);

      // rain falls (slightly slanted by the wind) round the camera
      rain.visible = L.rain > 0.02;
      if (rain.visible) {
        rmat.opacity = Math.min(0.55, L.rain * 0.7);
        const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
        for (let i = 0; i < RAIN; i++) {
          const o = i * 6;
          let x = rpos[o] - 2.4 * dt, y = rpos[o + 1] - 16 * dt, z = rpos[o + 2] - 0.8 * dt;
          x = cx + wrap(x - cx, 36); z = cz + wrap(z - cz, 36);
          if (y < cy - 6) y += 16;
          rpos[o] = x; rpos[o + 1] = y; rpos[o + 2] = z;
          rpos[o + 3] = x + 0.12; rpos[o + 4] = y + 0.7; rpos[o + 5] = z + 0.05;
        }
        rgeo.attributes.position.needsUpdate = true;
      }

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

      points.visible = Math.max(L.sandstorm, L.smoke) > 0.02;
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

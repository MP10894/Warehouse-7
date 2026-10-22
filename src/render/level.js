// Turns the map grid into 3D geometry, with Doom-style lighting baked into vertex colours.
// Purely visual: gameplay never reads anything from here.
import * as THREE from 'three';
import { CELL as S, WALL_H, BLOCK_HEIGHTS, charAt } from '../sim/map.js';

/** How each solid map symbol looks. vu = metres of height covered by one texture repeat. */
const BLOCK_LOOK = {
  '#': { tex: 'wall', vu: 4 },
  'R': { tex: 'rack', vu: 1.6, top: 'crate' },
  'C': { tex: 'crate', vu: 1.2, top: 'crate' },
  'c': { tex: 'crate', vu: 1.2, top: 'crate' }
};
const LIGHT_RADIUS = 8;
const AMBIENT = [0.14, 0.15, 0.18];
const WARM = [1.0, 0.8, 0.52], COLD = [0.62, 0.78, 1.0], ALARM = [1.0, 0.22, 0.14];

function placeLamps(map) {
  const lamps = [];
  for (let cy = 0; cy < map.h; cy++) for (let cx = 0; cx < map.w; cx++) {
    if (cx % 5 === 2 && cy % 4 === 1 && !BLOCK_HEIGHTS[map.cells[cy][cx]]) {
      let col = cx >= 15 ? COLD : WARM;
      if (cx === 22 && cy === 17) col = ALARM;
      lamps.push({ cx, cy, x: (cx + .5) * S, z: (cy + .5) * S, col });
    }
  }
  return lamps;
}

function wallLos(map, x0, z0, x1, z1, tcx, tcy) {
  const dx = x1 - x0, dz = z1 - z0, n = Math.ceil(Math.hypot(dx, dz) / .4);
  for (let i = 1; i < n; i++) {
    const cx = Math.floor((x0 + dx * i / n) / S), cy = Math.floor((z0 + dz * i / n) / S);
    if (cx === tcx && cy === tcy) continue;
    if (charAt(map, cx, cy) === '#') return false;
  }
  return true;
}

export function buildLevel(scene, map, assets) {
  const lamps = placeLamps(map);
  const cellL = [];
  for (let cy = 0; cy < map.h; cy++) {
    const row = [];
    for (let cx = 0; cx < map.w; cx++) {
      const L = AMBIENT.slice();
      const x = (cx + .5) * S, z = (cy + .5) * S;
      if (map.cells[cy][cx] !== '#') {
        for (const lp of lamps) {
          const d = Math.hypot(x - lp.x, z - lp.z);
          if (d > LIGHT_RADIUS || !wallLos(map, lp.x, lp.z, x, z, cx, cy)) continue;
          const k = Math.pow(1 - d / LIGHT_RADIUS, 1.4) * 1.15;
          L[0] += lp.col[0] * k; L[1] += lp.col[1] * k; L[2] += lp.col[2] * k;
        }
      }
      row.push(L.map(v => Math.min(1.25, v)));
    }
    cellL.push(row);
  }
  const cornerL = (ix, iy) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (const [cx, cy] of [[ix - 1, iy - 1], [ix, iy - 1], [ix - 1, iy], [ix, iy]]) {
      if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h || map.cells[cy][cx] === '#') continue;
      const L = cellL[cy][cx]; r += L[0]; g += L[1]; b += L[2]; n++;
    }
    return n ? [r / n, g / n, b / n] : [0.12, 0.12, 0.14];
  };

  const builders = {};
  const quad = (k, v, uv, col) => {
    const b = builders[k] || (builders[k] = { p: [], u: [], c: [] });
    for (const i of [0, 1, 2, 0, 2, 3]) { b.p.push(...v[i]); b.u.push(...uv[i]); b.c.push(...col[i]); }
  };
  const mul = (L, f) => [L[0] * f, L[1] * f, L[2] * f];
  const heightAt = (cx, cy) => BLOCK_HEIGHTS[charAt(map, cx, cy)] || 0;

  for (let cy = 0; cy < map.h; cy++) for (let cx = 0; cx < map.w; cx++) {
    const ch = map.cells[cy][cx], h = BLOCK_HEIGHTS[ch] || 0, look = BLOCK_LOOK[ch];
    const x0 = cx * S, x1 = x0 + S, z0 = cy * S, z1 = z0 + S;
    const c00 = cornerL(cx, cy), c10 = cornerL(cx + 1, cy), c11 = cornerL(cx + 1, cy + 1), c01 = cornerL(cx, cy + 1);
    if (ch !== '#') {
      if (!h) quad(ch === '=' ? 'hazard' : 'floor', [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], [[0, 1], [1, 1], [1, 0], [0, 0]], [c00, c10, c11, c01]);
      quad('ceiling', [[x0, WALL_H, z0], [x0, WALL_H, z1], [x1, WALL_H, z1], [x1, WALL_H, z0]], [[0, 0], [0, 1], [1, 1], [1, 0]],
        [mul(c00, .55), mul(c01, .55), mul(c11, .55), mul(c10, .55)]);
    }
    if (!h || !look) continue;
    const sides = [
      [1, 0, [x1, z0], [x1, z1], [cx + 1, cy], [cx + 1, cy + 1]],
      [-1, 0, [x0, z1], [x0, z0], [cx, cy + 1], [cx, cy]],
      [0, 1, [x1, z1], [x0, z1], [cx + 1, cy + 1], [cx, cy + 1]],
      [0, -1, [x0, z0], [x1, z0], [cx, cy], [cx + 1, cy]]
    ];
    for (const [dx, dy, a, b, ca, cb] of sides) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const nh = heightAt(nx, ny);
      if (nh >= h) continue;
      const La = cornerL(...ca), Lb = cornerL(...cb);
      const f = y => .62 + .38 * (y / WALL_H);
      quad(look.tex, [[a[0], nh, a[1]], [b[0], nh, b[1]], [b[0], h, b[1]], [a[0], h, a[1]]],
        [[0, nh / look.vu], [1, nh / look.vu], [1, h / look.vu], [0, h / look.vu]],
        [mul(La, f(nh)), mul(Lb, f(nh)), mul(Lb, f(h)), mul(La, f(h))]);
    }
    if (h < WALL_H) {
      const L = mul(cellL[cy][cx], 1.05);
      quad(look.top, [[x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1]], [[0, 1], [1, 1], [1, 0], [0, 0]], [L, L, L, L]);
    }
  }

  const materials = [], meshes = [];
  for (const k in builders) {
    const b = builders[k], geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
    const m = new THREE.MeshBasicMaterial({ map: assets.level[k], vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, m);
    scene.add(mesh); materials.push(m); meshes.push(mesh);
  }

  const lampGeo = new THREE.PlaneGeometry(0.5, 1.5);
  const lampMeshes = lamps.map(lp => {
    const m = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(...lp.col.map(v => Math.min(1, v * 1.1 + .15))), fog: false }));
    m.rotation.x = Math.PI / 2;
    m.position.set(lp.x, WALL_H - .02, lp.z);
    scene.add(m);
    return m;
  });
  const alarm = lamps.findIndex(l => l.col === ALARM);

  return {
    /** Light colour at a floor position, used to tint sprites. */
    lightAt(x, z) {
      const cx = Math.floor(x / S), cy = Math.floor(z / S);
      return (cellL[cy] && cellL[cy][cx]) || [.3, .3, .3];
    },
    /** Per-frame: muzzle-flash brightening and the blinking alarm lamp. */
    animate(now, flashing) {
      const boost = flashing ? 1.28 : 1;
      for (const m of materials) m.color.setScalar(boost);
      if (alarm >= 0) lampMeshes[alarm].visible = Math.sin(now / 160) > -.2;
    }
  };
}

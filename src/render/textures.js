// All artwork is drawn in code for now: tiny pixel-art canvases turned into textures.
// When real art arrives (PNG files in /assets), each function here is replaced by a
// texture loader, and nothing else in the game needs to change.
import * as THREE from 'three';

let seed = 7;
const rnd = () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const C = (r, g, b) => `rgb(${Math.max(0, Math.min(255, r | 0))},${Math.max(0, Math.min(255, g | 0))},${Math.max(0, Math.min(255, b | 0))})`;

export function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  draw(g, w, h);
  return c;
}
const px = (g, x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };

export function texFrom(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const tex = (w, h, d) => texFrom(canvas(w, h, d), true);

function levelTextures() {
  const T = {};
  T.floor = tex(32, 32, g => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { let n = (rnd() - .5) * 16; if (x === 0 || y === 0) n -= 26; px(g, x, y, C(100 + n, 97 + n, 90 + n)); }
    for (let i = 0; i < 4; i++) {
      const cx = rnd() * 32, cy = rnd() * 32, r = 2 + rnd() * 5;
      g.fillStyle = 'rgba(25,20,15,.14)';
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < r * r && rnd() < .7) g.fillRect(x, y, 1, 1);
    }
  });
  T.hazard = tex(32, 32, g => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const n = (rnd() - .5) * 14, s = ((x + y) >> 3) & 1;
      let c = s ? [200 + n, 158 + n, 40 + n] : [42 + n, 40 + n, 36 + n];
      if (rnd() < .2) c = [100 + n, 97 + n, 90 + n];
      if (x === 0 || y === 0) c = c.map(v => v - 26);
      px(g, x, y, C(...c));
    }
  });
  T.wall = tex(32, 64, g => {
    const rib = [20, 5, -16, 5];
    const rust = Array.from({ length: 32 }, () => rnd() < .28 ? 8 + rnd() * 34 | 0 : 0);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) {
      const n = (rnd() - .5) * 8 + rib[x % 4];
      let c = [84 + n, 94 + n, 98 + n];
      if (rust[x] && y < rust[x]) { const k = 1 - y / rust[x] * .6; c = [c[0] + 34 * k, c[1] - 4 * k, c[2] - 28 * k]; }
      if (y === 3) c = c.map(v => v + 22);
      if (y === 30) c = c.map(v => v - 20);
      if (y >= 52) { const m = (rnd() - .5) * 12; c = [72 + m, 69 + m, 62 + m]; if (y === 52) c = c.map(v => v - 30); }
      px(g, x, y, C(...c));
    }
  });
  T.crate = tex(32, 32, g => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const n = (rnd() - .5) * 14;
      let c = [140 + n, 106 + n, 62 + n];
      if (y % 8 === 7) c = [74 + n, 52 + n, 30 + n];
      if (Math.abs(x - y) < 2 && x > 2 && x < 29) c = [118 + n, 86 + n, 46 + n];
      if (x < 3 || x > 28 || y < 3 || y > 28) c = [104 + n, 76 + n, 40 + n];
      if (x === 0 || y === 0 || x === 31 || y === 31) c = [60, 42, 24];
      px(g, x, y, C(...c));
    }
    [[1, 1], [30, 1], [1, 30], [30, 30]].forEach(([x, y]) => px(g, x, y, '#2a2a28'));
  });
  T.rack = tex(32, 32, g => {
    g.fillStyle = '#1a1916'; g.fillRect(0, 0, 32, 32);
    const box = (x0, y0, x1, y1) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const n = (rnd() - .5) * 12; let c = [166 + n, 124 + n, 78 + n];
        if (x === x1 || y === y1) c = c.map(v => v - 40);
        if (y === Math.round((y0 + y1) / 2)) c = [196 + n, 170 + n, 120 + n];
        px(g, x, y, C(...c));
      }
    };
    box(3, 5, 14, 26); box(16, 10, 28, 26);
    g.fillStyle = '#e8e4d8'; g.fillRect(19, 19, 5, 3); g.fillRect(6, 21, 4, 2);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const n = (rnd() - .5) * 12;
      if (x < 3 || x > 28) {
        let c = [200 + n, 98 + n, 30 + n];
        if (y % 4 === 1 && (x === 1 || x === 30)) c = [40, 20, 10];
        if (x === 2 || x === 29) c = c.map(v => v - 40);
        px(g, x, y, C(...c));
      } else if (y > 26) {
        let c = [206 + n, 102 + n, 30 + n];
        if (y === 27) c = c.map(v => v + 30);
        if (y === 31) c = c.map(v => v - 50);
        px(g, x, y, C(...c));
      }
    }
  });
  T.ceiling = tex(32, 32, g => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const n = (rnd() - .5) * 8; let c = [44 + n, 46 + n, 46 + n];
      if (x % 16 === 0 || y % 16 === 0) c = [70 + n, 72 + n, 70 + n];
      if (x % 16 === 3 && y % 16 === 3) c = [100, 100, 94];
      px(g, x, y, C(...c));
    }
  });
  T.barrel = tex(32, 32, g => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const n = (rnd() - .5) * 14; let c = [152 + n, 42 + n, 28 + n];
      if (y === 6 || y === 24) c = c.map(v => v - 50);
      if (y === 7 || y === 25) c = c.map(v => v + 34);
      if (y < 2 || y > 29) c = c.map(v => v - 40);
      for (const cx of [8, 24]) {
        const d = Math.abs(x - cx) + Math.abs(y - 16);
        if (d < 6) c = [214 + n, 172 + n, 40 + n];
        if (d < 6 && d >= 5) c = [40, 30, 20];
        if (d < 2) c = [30, 26, 20];
      }
      if (rnd() < .05) c = [70, 30, 20];
      px(g, x, y, C(...c));
    }
  });
  return T;
}

// Enemy: 24 × 40 pixel sprite in several poses.
function soldier(pose) {
  return canvas(24, 40, g => {
    const P = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const wrap = '#b49a6e', wrapD = '#8a7350', skin = '#94684a', jac = '#5a6039', jacD = '#40452a', vest = '#373a26',
      pouch = '#525638', trou = '#3f3c34', boot = '#1f1d19', gun = '#1c1c1c', wood = '#74421f', belt = '#2c2216', eye = '#140f0b';
    if (pose === 'dead') {
      P(2, 37, 21, 3, 'rgba(96,12,8,.9)'); P(1, 33, 6, 4, trou); P(0, 34, 2, 3, boot); P(6, 32, 11, 5, jac); P(7, 33, 8, 3, vest);
      P(17, 32, 5, 5, wrap); P(18, 33, 3, 2, skin); P(4, 30, 14, 1, gun); P(5, 30, 4, 2, wood);
      return;
    }
    const l = pose === 'pain' ? 1 : 0;
    if (pose === 'walk1') { P(7, 25, 4, 12, trou); P(13, 25, 4, 11, trou); P(6, 37, 5, 3, boot); P(13, 36, 5, 3, boot); }
    else if (pose === 'walk0') { P(8, 25, 4, 11, trou); P(14, 25, 4, 12, trou); P(7, 36, 5, 3, boot); P(14, 37, 5, 3, boot); }
    else { P(8, 25, 4, 12, trou); P(13, 25, 4, 12, trou); P(7, 37, 5, 3, boot); P(13, 37, 5, 3, boot); }
    P(8, 24, 9, 1, belt);
    P(7 + l, 10, 11, 14, jac); P(7 + l, 10, 1, 14, jacD); P(8 + l, 12, 9, 9, vest);
    for (const i of [9, 11, 13, 15]) P(i + l, 17, 1, 2, pouch);
    P(9 + l, 1, 7, 9, wrap); P(9 + l, 1, 7, 1, wrapD); P(10 + l, 4, 5, 3, skin); P(11 + l, 5, 1, 1, eye); P(13 + l, 5, 1, 1, eye); P(15 + l, 7, 2, 5, wrap);
    if (pose === 'aim' || pose === 'fire') {
      P(5, 12, 3, 7, jac); P(16, 12, 3, 7, jac);
      P(8, 13, 9, 5, gun); P(10, 12, 5, 1, '#3a3a3a'); P(9, 17, 2, 3, wood); P(14, 18, 2, 3, gun);
      P(7, 15, 2, 2, skin); P(16, 15, 2, 2, skin);
      if (pose === 'fire') { P(9, 9, 7, 6, '#ffcf55'); P(11, 7, 3, 9, '#fff4c4'); P(6, 11, 13, 2, '#ffae2e'); }
    } else {
      P(5 + l, 12, 2, 8, jac); P(17 + l, 11, 2, 6, jac);
      for (let i = 0; i < 15; i++) { const x = 5 + i, y = 22 - Math.round(i * .6); P(x + l, y, 1, 2, i < 5 ? wood : gun); }
      P(12 + l, 17, 1, 3, gun); P(6 + l, 19, 2, 2, skin); P(16 + l, 13, 2, 2, skin);
    }
    if (pose === 'pain') {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(220,40,20,.45)'; g.fillRect(0, 0, 24, 40);
      g.globalCompositeOperation = 'source-over';
    }
  });
}

function puff(r, g0, b) {
  return texFrom(canvas(8, 8, g => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const d = Math.hypot(x - 3.5, y - 3.5) / 4;
      if (d < 1 && rnd() > d * .6) { g.fillStyle = `rgba(${r},${g0},${b},1)`; g.fillRect(x, y, 1, 1); }
    }
  }), false);
}

function weaponSprites() {
  const gun = canvas(64, 60, g => {
    for (let y = 0; y < 60; y++) {
      let hw = y < 10 ? 2 : y < 36 ? 5 + (y - 10) * .28 : 12 + (y - 36) * .26;
      hw = Math.round(hw);
      const base = y < 10 ? [46, 48, 48] : y < 36 ? [58, 56, 46] : [34, 34, 34];
      for (let x = 32 - hw; x < 32 + hw; x++) {
        const k = (x - (32 - hw)) / (2 * hw);
        let sh = k < .15 ? 24 : k > .8 ? -18 : 0;
        if (y >= 10 && y < 36 && y % 3 === 0 && Math.abs(x - 32) < hw - 1) sh -= 12;
        if (y >= 10 && Math.abs(x - 32) <= 1) sh += 14;
        const n = (rnd() - .5) * 6;
        px(g, x, y, C(base[0] + sh + n, base[1] + sh + n, base[2] + sh + n));
      }
    }
    g.fillStyle = '#1a1a1a'; g.fillRect(31, 0, 3, 4);
    g.fillStyle = '#141414'; g.fillRect(27, 33, 11, 7);
    g.fillStyle = '#3a3a3a'; g.fillRect(31, 35, 3, 3);
    const glove = (x0, y0, w, h) => {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
        const ex = (x - x0) / w - .5, ey = (y - y0) / h - .5;
        if (ex * ex + ey * ey > .26) continue;
        const n = (rnd() - .5) * 10, sh = ex < -.25 ? 18 : ex > .25 ? -16 : 0;
        px(g, x, y, C(74 + n + sh, 78 + n + sh, 50 + n + sh));
      }
    };
    glove(18, 17, 10, 15); glove(44, 45, 14, 15);
  });
  const flash = canvas(24, 20, g => {
    const P = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    P(4, 8, 16, 4, '#ffae2e'); P(10, 1, 4, 18, '#ffae2e'); P(7, 5, 10, 10, '#ffd25a'); P(9, 7, 6, 6, '#fff6d0');
    P(2, 2, 2, 2, '#ffd25a'); P(20, 2, 2, 2, '#ffd25a'); P(2, 16, 2, 2, '#ffae2e'); P(20, 16, 2, 2, '#ffae2e');
  });
  return { gun, flash };
}

/** Build every texture the game uses. Call once at start-up. */
export function makeAssets() {
  seed = 7;
  const level = levelTextures();
  const frames = {};
  for (const k of ['walk0', 'walk1', 'aim', 'fire', 'pain', 'dead']) frames[k] = texFrom(soldier(k), false);
  const pickups = {
    medkit: texFrom(canvas(16, 16, g => {
      g.fillStyle = '#d8d4c8'; g.fillRect(1, 4, 14, 11);
      g.fillStyle = '#9c988c'; g.fillRect(1, 14, 14, 1); g.fillRect(6, 2, 4, 2);
      g.fillStyle = '#c42a1e'; g.fillRect(6, 6, 4, 7); g.fillRect(4, 8, 8, 3);
    }), false),
    ammo: texFrom(canvas(16, 16, g => {
      g.fillStyle = '#4f5634'; g.fillRect(1, 6, 14, 9);
      g.fillStyle = '#3a4026'; g.fillRect(1, 14, 14, 1); g.fillRect(1, 6, 14, 1);
      g.fillStyle = '#d6b23a'; g.fillRect(3, 9, 10, 2);
      g.fillStyle = '#c8a040'; for (let i = 0; i < 4; i++) g.fillRect(3 + i * 3, 2, 2, 4);
      g.fillStyle = '#8a6a2a'; for (let i = 0; i < 4; i++) g.fillRect(3 + i * 3, 2, 2, 1);
    }), false)
  };
  const boom = texFrom(canvas(32, 32, g => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5) / 16 + (rnd() - .5) * .25;
      if (d >= 1) continue;
      const c = d < .3 ? [255, 246, 200] : d < .55 ? [255, 190, 60] : d < .8 ? [230, 100, 30] : [120, 40, 20];
      g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${d < .8 ? 1 : .7})`;
      g.fillRect(x, y, 1, 1);
    }
  }), false);
  return {
    level,
    frames,
    pickups,
    fx: { boom, dust: puff(170, 162, 146), blood: puff(150, 16, 10), spark: puff(255, 220, 120) },
    weapon: weaponSprites()
  };
}

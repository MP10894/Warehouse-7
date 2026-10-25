// Small pixel-art textures drawn in code (PS1 style). Real art can replace any of these
// later by loading a PNG with the same name; nothing else needs to change.
import * as THREE from 'three';

let seed = 11;
const rnd = () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const clamp = v => Math.max(0, Math.min(255, v | 0));
const rgb = (r, g, b) => `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`;

export function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  draw(g, w, h);
  return c;
}

export function pixelTexture(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function noiseTex(size, base, amount, extra) {
  return pixelTexture(makeCanvas(size, size, (g) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const n = (rnd() - 0.5) * amount;
      let c = [base[0] + n, base[1] + n, base[2] + n];
      if (extra) c = extra(x, y, c, n) || c;
      g.fillStyle = rgb(...c);
      g.fillRect(x, y, 1, 1);
    }
  }));
}

export function makeTextures() {
  seed = 11;
  const T = {};
  // ground: neutral-ish so the terrain's vertex colours can tint it
  T.ground = noiseTex(32, [200, 200, 200], 40, (x, y, c) => (rnd() < 0.04 ? c.map(v => v - 40) : c));
  // plaster / brick wall: light plaster with chipped patches showing brick
  T.wall = noiseTex(32, [186, 170, 140], 18, (x, y, c) => {
    const chip = Math.sin(x * 0.45 + y * 0.21) + Math.sin(y * 0.33 - x * 0.17) > 1.72;
    if (chip) {
      const brick = (y % 4 === 0) || ((x + (Math.floor(y / 4) % 2) * 4) % 8 === 0);
      return brick ? [110, 96, 80] : [150 + (rnd() * 16), 112, 86];
    }
    if (y === 31 || y === 0) return c.map(v => v - 25);
    return c;
  });
  T.concrete = noiseTex(32, [150, 146, 138], 22, (x, y, c) => (x % 16 === 0 || y % 16 === 0 ? c.map(v => v - 22) : c));
  T.column = noiseTex(16, [138, 134, 126], 20, (x, y, c) => (x === 0 || x === 15 ? c.map(v => v - 30) : c));
  T.rubble = noiseTex(16, [140, 128, 110], 70);
  T.lowwall = noiseTex(32, [168, 150, 118], 26, (x, y, c) => {
    const row = Math.floor(y / 8), off = (row % 2) * 6;
    if (y % 8 === 0 || (x + off) % 12 === 0) return [96, 84, 66];
    return c;
  });
  T.crate = noiseTex(32, [146, 110, 64], 20, (x, y, c) => {
    if (y % 8 === 7) return [80, 56, 30];
    if (x < 3 || x > 28 || y < 3 || y > 28) return c.map(v => v - 30);
    if (Math.abs(x - y) < 2) return c.map(v => v - 18);
    return c;
  });
  T.sandbag = noiseTex(32, [176, 156, 112], 20, (x, y, c) => {
    const row = Math.floor(y / 8), off = (row % 2) * 8;
    const bx = (x + off) % 16, by = y % 8;
    if (by === 7 || bx === 15) return [104, 90, 62];
    if (by === 0 || bx === 0) return c.map(v => v + 16);
    return c;
  });
  T.stairs = noiseTex(16, [158, 152, 142], 18, (x, y, c) => (y % 8 === 0 ? [96, 92, 86] : c));
  T.floorTile = noiseTex(16, [168, 160, 146], 16, (x, y, c) => (x === 0 || y === 0 ? c.map(v => v - 26) : c));
  // refinery and outskirts
  T.metal = noiseTex(32, [122, 128, 128], 14, (x, y, c) => {
    if (x % 8 === 0) return c.map(v => v - 34);            // corrugation
    if (x % 8 === 1) return c.map(v => v + 14);
    if (y === 0 || y === 31) return c.map(v => v - 40);    // panel seam
    if (Math.sin(x * 0.7 + y * 0.13) + Math.sin(y * 0.41) > 1.6) return [128, 84, 52]; // rust
    return c;
  });
  T.pipe = noiseTex(16, [92, 112, 124], 12, (x, y, c) => (y % 8 === 0 ? [62, 74, 82] : x % 16 === 3 ? c.map(v => v + 22) : c));
  T.tank = noiseTex(32, [206, 206, 198], 10, (x, y, c) => {
    if (y % 16 === 0) return [150, 150, 144];               // welded seams
    if (x % 32 === 0) return c.map(v => v - 22);
    if (rnd() < 0.015 || (x % 32 > 10 && x % 32 < 12 && y % 16 > 2)) return [170, 132, 96]; // rust streak
    return c;
  });
  T.rock = noiseTex(16, [138, 120, 98], 40, (x, y, c) => (rnd() < 0.08 ? c.map(v => v - 30) : c));
  // tree bark: dark grey-brown with vertical fissures
  T.bark = noiseTex(16, [92, 78, 62], 18, (x, y, c) => ((x * 5 + Math.floor(y / 3)) % 7 === 0 ? c.map(v => v - 30) : x % 4 === 1 ? c.map(v => v + 10) : c));
  T.locker = noiseTex(16, [86, 98, 70], 12, (x, y, c) => {
    if (y < 2) return [214, 170, 48];                       // yellow band
    if (x === 0 || x === 15 || y === 15) return c.map(v => v - 30);
    if (y > 5 && y < 11 && y % 2 === 0 && x > 3 && x < 12) return [52, 58, 42]; // vents
    return c;
  });
  // chain-link: see-through diamonds, solid top and bottom rails
  T.fence = pixelTexture(makeCanvas(16, 16, g => {
    g.clearRect(0, 0, 16, 16);
    g.fillStyle = 'rgb(150,150,142)';
    for (let i = 0; i < 16; i++) { g.fillRect(i, i % 8, 1, 1); g.fillRect(i, 7 - (i % 8), 1, 1); g.fillRect(i, 8 + (i % 8), 1, 1); g.fillRect(i, 15 - (i % 8), 1, 1); }
    g.fillStyle = 'rgb(110,110,104)';
    g.fillRect(0, 0, 1, 16);
  }));
  return T;
}

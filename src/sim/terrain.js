// The ground: a smooth height field from terrain.txt (one point every `spacing` metres), plus a
// coarse surface-type map from ground.txt. Heights in half metres: digits 0–9 are 0–4.5 m,
// letters a–z carry on from 5 m to 17.5 m (a = 5, b = 5.5 … z = 17.5), for deep ground like a pit.

export function parseTerrain(text, spacing) {
  const rows = text.replace(/^﻿/, '').split(/\r?\n/).map(r => r.trim()).filter(Boolean);
  const n = rows.length;
  const m = Math.max(...rows.map(r => r.length));
  const h = new Float32Array(n * m);
  rows.forEach((r, j) => {
    for (let i = 0; i < m; i++) {
      const c = r[i] ?? '0';
      h[i + j * m] = /[0-9]/.test(c) ? Number(c) * 0.5 : /[a-z]/.test(c) ? 5 + (c.charCodeAt(0) - 97) * 0.5 : 0;
    }
  });
  return { cols: m, rows: n, spacing, h: Array.from(h) };
}

export function parseGround(text) {
  return text.replace(/^﻿/, '').split(/\r?\n/).map(r => r.trim()).filter(Boolean);
}

const pointH = (t, i, j) => {
  i = Math.max(0, Math.min(t.cols - 1, i));
  j = Math.max(0, Math.min(t.rows - 1, j));
  return t.h[i + j * t.cols];
};

/** Ground height at any point, smoothly interpolated. */
export function terrainHeight(t, x, z) {
  const gx = x / t.spacing, gz = z / t.spacing;
  const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
  const a = pointH(t, i, j), b = pointH(t, i + 1, j), c = pointH(t, i, j + 1), d = pointH(t, i + 1, j + 1);
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

/** Level the ground under a rectangle (plus a margin) to height h. */
export function flattenTerrain(t, x0, z0, x1, z1, h) {
  const s = t.spacing;
  for (let j = Math.floor(z0 / s); j <= Math.ceil(z1 / s); j++) {
    for (let i = Math.floor(x0 / s); i <= Math.ceil(x1 / s); i++) {
      if (i >= 0 && j >= 0 && i < t.cols && j < t.rows) t.h[i + j * t.cols] = h;
    }
  }
}

/** Surface letter (s, r, p, g) at a point. */
export function groundType(ground, x, z, cell = 4) {
  const row = ground[Math.max(0, Math.min(ground.length - 1, Math.floor(z / cell)))] || '';
  return row[Math.max(0, Math.min(row.length - 1, Math.floor(x / cell)))] || 's';
}

// The level grid: parsing, block heights and line-of-sight.
// Gameplay facts only. How blocks look (textures) lives in src/render/level.js.

export const CELL = 2;          // metres per map tile
export const WALL_H = 4;        // ceiling height
export const SIGHT_BLOCK_H = 1.7; // blocks at least this tall stop sight and shots between enemies and players

/** Heights of solid map symbols. Anything not listed is walkable floor. */
export const BLOCK_HEIGHTS = { '#': 4, 'R': 3.2, 'C': 2.4, 'c': 1.2 };

export function parseMap(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.length);
  const w = Math.max(...lines.map(l => l.length));
  const h = lines.length;
  const cells = lines.map((line, y) => {
    let row = (line + '#'.repeat(w)).slice(0, w).split('');
    if (y === 0 || y === h - 1) row = row.map(() => '#');
    row[0] = '#';
    row[w - 1] = '#';
    return row;
  });
  return { w, h, cells };
}

export const cellOf = v => Math.floor(v / CELL);
export const cellCenter = c => (c + 0.5) * CELL;
export const charAt = (map, cx, cy) => (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) ? '#' : map.cells[cy][cx];
export const blockH = (map, cx, cy) => BLOCK_HEIGHTS[charAt(map, cx, cy)] || 0;

/** True if nothing tall stands between two points on the floor plan. */
export function sightClear(map, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  const n = Math.ceil(Math.hypot(dx, dz) / 0.3);
  for (let i = 1; i < n; i++) {
    if (blockH(map, cellOf(x0 + dx * i / n), cellOf(z0 + dz * i / n)) >= SIGHT_BLOCK_H) return false;
  }
  return true;
}

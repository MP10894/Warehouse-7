// The block world: a 3D grid of 1-metre cells for everything built (walls, floors,
// stairs, crates, rubble). The ground itself is a separate smooth height field
// (terrain.js). x runs east, y up, z south.

export const V = {
  AIR: 0,
  SLAB: 1,      // floor/ceiling slab, indestructible
  COLUMN: 2,    // structural column, indestructible
  WALL: 3,      // building wall, destructible
  RUBBLE: 4,    // debris: decoration only, you walk through it
  CRATE: 5,     // wooden crate, destructible
  LOWWALL: 6,   // 1 m stone wall, destructible
  SANDBAG: 7,   // player-built base wall, destructible
  RAMP_E: 8,    // stairs rising towards +x
  RAMP_W: 9,    //                    −x
  RAMP_N: 10,   //                    −z
  RAMP_S: 11    //                    +z
};

/** Per block type: does it fill the whole cell, and which materials.csv row it uses (null = unbreakable). */
export const V_INFO = {
  [V.SLAB]: { full: true, material: null },
  [V.COLUMN]: { full: true, material: null },
  [V.WALL]: { full: true, material: 'wall' },
  [V.RUBBLE]: { full: false, top: 0.4, material: null },
  [V.CRATE]: { full: true, material: 'crate' },
  [V.LOWWALL]: { full: true, material: 'lowwall' },
  [V.SANDBAG]: { full: true, material: 'sandbags' },
  [V.RAMP_E]: { full: false, ramp: true, material: null },
  [V.RAMP_W]: { full: false, ramp: true, material: null },
  [V.RAMP_N]: { full: false, ramp: true, material: null },
  [V.RAMP_S]: { full: false, ramp: true, material: null }
};

export const isRamp = t => t >= V.RAMP_E && t <= V.RAMP_S;
export const isFull = t => !!(V_INFO[t] && V_INFO[t].full);

export function createGrid(w, h, d) {
  return { w, h, d, cells: new Uint8Array(w * h * d) };
}

export const gidx = (g, x, y, z) => x + z * g.w + y * g.w * g.d;
export const inGrid = (g, x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < g.w && y < g.h && z < g.d;
// What the game rules see in a cell. Rubble is decoration only (drawn, but nothing stands
// on it, bumps into it or is stopped by it), so to the rules it is air.
export const getV = (g, x, y, z) => {
  if (!inGrid(g, x, y, z)) return V.AIR;
  const t = g.cells[gidx(g, x, y, z)];
  return t === V.RUBBLE ? V.AIR : t;
};
/** What is drawn in a cell, rubble included. */
export const getDrawn = (g, x, y, z) => inGrid(g, x, y, z) ? g.cells[gidx(g, x, y, z)] : V.AIR;
export function setV(g, x, y, z, t) { if (inGrid(g, x, y, z)) g.cells[gidx(g, x, y, z)] = t; }
export function cellXYZ(g, i) {
  const y = Math.floor(i / (g.w * g.d)), r = i - y * g.w * g.d;
  return [r % g.w, y, Math.floor(r / g.w)];
}

/**
 * Height of the top surface of block type t in cell (cx, cy, cz) at point (px, pz),
 * or -Infinity for air.
 */
export function blockTop(t, cy, px, pz) {
  if (t === V.AIR) return -Infinity;
  if (isFull(t)) return cy + 1;
  if (t === V.RUBBLE) return cy + 0.4;
  const fx = px - Math.floor(px), fz = pz - Math.floor(pz);
  if (t === V.RAMP_E) return cy + fx;
  if (t === V.RAMP_W) return cy + 1 - fx;
  if (t === V.RAMP_N) return cy + 1 - fz;
  if (t === V.RAMP_S) return cy + fz;
  return cy + 1;
}

/** Is the point inside something solid (for bullets and sight)? Ignores the terrain. */
export function solidAt(g, x, y, z) {
  const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
  const t = getV(g, cx, cy, cz);
  if (t === V.AIR) return false;
  return y < blockTop(t, cy, x, z);
}

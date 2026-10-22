// Builds the static world (ground + blocks) from a level folder in /data/levels.
import { V, V_INFO, createGrid, gidx, getV, setV, inGrid } from './grid.js';
import { parseTerrain, parseGround, terrainHeight, flattenTerrain } from './terrain.js';

const FLOOR_H = 3;
const RAMP = { '>': V.RAMP_E, '<': V.RAMP_W, '^': V.RAMP_N, 'v': V.RAMP_S };
// For each stair symbol: the direction to look for the lower steps of the same flight.
const RAMP_BACK = { '>': [-1, 0], '<': [1, 0], '^': [0, 1], 'v': [0, -1] };

/** Split a building file into floors: [{ floor, rows: [string] }] */
export function parseBuilding(text) {
  const floors = [];
  let cur = null;
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.replace(/\t/g, ' ');
    const m = line.match(/^\s*floor\s+(\d+)\s*$/i);
    if (m) { cur = { floor: Number(m[1]), rows: [] }; floors.push(cur); continue; }
    if (!cur) continue; // comments before the first floor
    cur.rows.push(line);
  }
  for (const f of floors) {
    while (f.rows.length && f.rows[f.rows.length - 1].trim() === '') f.rows.pop();
  }
  return floors.sort((a, b) => a.floor - b.floor);
}

/** Destructible pieces: groups of cells that take damage and break together. */
function addPiece(world, material, cells) {
  const def = world.data.materials[material];
  const id = world.pieces.length + 1;
  world.pieces.push({ id, material, cells, hp: def.health, armour: def.armour, alive: true });
  for (const i of cells) world.pieceOf[i] = id;
  return id;
}

/** Empty a cell, removing it from any destructible piece it belonged to. */
export function clearCell(world, x, y, z, replaceWith = V.AIR) {
  const g = world.grid;
  if (!inGrid(g, x, y, z)) return;
  const i = gidx(g, x, y, z);
  const pid = world.pieceOf[i];
  if (pid) {
    const p = world.pieces[pid - 1];
    p.cells = p.cells.filter(c => c !== i);
    world.pieceOf[i] = 0;
  }
  g.cells[i] = replaceWith;
}

const TURN_CW = { '>': 'v', 'v': '<', '<': '^', '^': '>' };
const MIRROR = { '>': '<', '<': '>' };

/** Turn a building clockwise (seen from above) by 90, 180 or 270 degrees, and/or mirror it
 *  left to right. Stairs keep pointing the right way. */
export function orientFloors(floors, turn = 0, mirror = false) {
  const w = Math.max(...floors.flatMap(f => f.rows.map(r => r.length)));
  const d = Math.max(...floors.map(f => f.rows.length));
  let out = floors.map(f => ({
    floor: f.floor,
    grid: Array.from({ length: d }, (_, j) => Array.from({ length: w }, (_, i) => (f.rows[j] || '')[i] || ' '))
  }));
  if (mirror) out = out.map(f => ({ floor: f.floor, grid: f.grid.map(r => r.slice().reverse().map(c => MIRROR[c] || c)) }));
  const steps = ((Math.round((turn || 0) / 90) % 4) + 4) % 4;
  for (let s = 0; s < steps; s++) {
    out = out.map(f => {
      const H = f.grid.length, W = f.grid[0].length;
      return { floor: f.floor, grid: Array.from({ length: W }, (_, i) => Array.from({ length: H }, (_, j) => { const c = f.grid[H - 1 - j][i]; return TURN_CW[c] || c; })) };
    });
  }
  return out.map(f => ({ floor: f.floor, rows: f.grid.map(r => r.join('')) }));
}

function stampBuilding(world, text, ox, oz, turn = 0, mirror = false) {
  let floors = parseBuilding(text);
  if (floors.length && (turn || mirror)) floors = orientFloors(floors, turn, mirror);
  if (!floors.length) return;
  const g = world.grid;
  const w = Math.max(...floors.flatMap(f => f.rows.map(r => r.length)));
  const d = Math.max(...floors.map(f => f.rows.length));

  // Level the ground under the building.
  const t = world.terrain;
  const samples = [[ox, oz], [ox + w, oz], [ox, oz + d], [ox + w, oz + d], [ox + w / 2, oz + d / 2]];
  const base = Math.round(samples.reduce((s, [x, z]) => s + terrainHeight(t, x, z), 0) / samples.length);
  flattenTerrain(t, ox - 1, oz - 1, ox + w + 1, oz + d + 1, base);

  const ramps = [], rubble = [];
  for (const f of floors) {
    const by = base + f.floor * FLOOR_H;
    f.rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i], x = ox + i, z = oz + j;
        if (ch === ' ') continue;
        if (f.floor > 0) clearCell(world, x, by - 1, z, V.SLAB);
        const wallPiece = ys => {
          const cells = [];
          for (const y of ys) { if (!inGrid(g, x, y, z)) continue; setV(g, x, y, z, V.WALL); cells.push(gidx(g, x, y, z)); }
          if (cells.length) addPiece(world, 'wall', cells);
        };
        switch (ch) {
          case '#': wallPiece([by, by + 1, by + 2]); break;
          case 'w': wallPiece([by, by + 2]); break;
          case 'd': wallPiece([by + 2]); break;
          case 'X': for (let y = by; y < by + 3; y++) setV(g, x, y, z, V.COLUMN); break;
          case 'l': setV(g, x, by, z, V.LOWWALL); addPiece(world, 'lowwall', [gidx(g, x, by, z)]); break;
          case 'c': setV(g, x, by, z, V.CRATE); addPiece(world, 'crate', [gidx(g, x, by, z)]); break;
          case ',': rubble.push([x, by, z]); break;
          case '.': if (f.floor === 0) world.level.decals.push([x, base, z]); break;
          default:
            if (RAMP[ch]) {
              const [bx, bz] = RAMP_BACK[ch];
              let k = 0;
              while (row[i + bx * (k + 1)] !== undefined && (f.rows[j + bz * (k + 1)] || '')[i + bx * (k + 1)] === ch && k < 2) k++;
              ramps.push({ x, z, y: by + k, type: RAMP[ch] });
            }
        }
      }
    });
  }
  // Rubble only where there's standing room above it (not under a floor).
  for (const [x, y, z] of rubble) {
    if (getV(g, x, y, z) === V.AIR && getV(g, x, y + 1, z) === V.AIR && getV(g, x, y + 2, z) === V.AIR) setV(g, x, y, z, V.RUBBLE);
  }
  // Stairs last, so they cut through the floors above them.
  for (const r of ramps) {
    clearCell(world, r.x, r.y, r.z, r.type);
    clearCell(world, r.x, r.y + 1, r.z);
    clearCell(world, r.x, r.y + 2, r.z);
  }
}

function stampProp(world, p) {
  const g = world.grid;
  const type = p.type === 'crate' ? V.CRATE : V.LOWWALL;
  const material = p.type === 'crate' ? 'crate' : 'lowwall';
  for (let dz = 0; dz < (p.d || 1); dz++) {
    for (let dx = 0; dx < (p.w || 1); dx++) {
      const x = p.x + dx, z = p.z + dz;
      const y0 = Math.max(0, Math.round(terrainHeight(world.terrain, x + 0.5, z + 0.5)));
      const cells = [];
      for (let y = y0; y < y0 + (p.h || 1); y++) {
        if (getV(g, x, y, z) !== V.AIR) continue;
        setV(g, x, y, z, type);
        cells.push(gidx(g, x, y, z));
      }
      if (cells.length) addPiece(world, material, cells);
    }
  }
}

/** Fill world.grid, world.terrain, world.pieces from the level definition. */
export function buildLevel(world, level) {
  const size = level.size, h = level.max_height || 16;
  world.grid = createGrid(size, h, size);
  world.pieceOf = new Int32Array(size * h * size);
  world.pieces = [];
  world.terrain = parseTerrain(level.terrainText, level.terrain_spacing || 4);
  world.ground = parseGround(level.groundText || '');
  world.level = { name: level.name, size, decals: [] };
  for (const b of level.buildings || []) {
    const text = level.buildingTexts[b.file];
    if (!text) throw new Error(`Building file not found: ${b.file}`);
    stampBuilding(world, text, b.x, b.z, b.turn || 0, !!b.mirror);
  }
  for (const p of level.props || []) stampProp(world, p);
  world.voxelVersion = 1;
}

/** Place a destructible block column (used by base building). Returns the piece id or 0. */
export function placeBlocks(world, x, z, type, height = 1) {
  const g = world.grid;
  const y0 = Math.max(0, Math.round(terrainHeight(world.terrain, x + 0.5, z + 0.5)));
  const cells = [];
  for (let y = y0; y < y0 + height; y++) {
    const cur = getV(g, x, y, z);
    if (cur !== V.AIR && cur !== V.RUBBLE) continue;
    clearCell(world, x, y, z, type);
    cells.push(gidx(g, x, y, z));
  }
  if (!cells.length) return 0;
  return addPiece(world, V_INFO[type].material, cells);
}

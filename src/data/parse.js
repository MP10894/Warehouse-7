// Pure parsing helpers (no Vite, no browser APIs) so tests can use them in Node too.

/**
 * Parse a CSV table into an array of objects keyed by the header row.
 * Copes with what Excel produces in different locales:
 *  - a byte-order mark at the start of the file
 *  - Windows line endings
 *  - semicolon separators with decimal commas (e.g. Hungarian or French Excel)
 * Numeric-looking cells become numbers; everything else stays text.
 */
export function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() !== '');
  if (!lines.length) return [];
  const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const header = lines[0].split(sep).map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = line.split(sep);
    const row = {};
    header.forEach((key, i) => {
      const v = (cells[i] ?? '').trim();
      const numeric = sep === ';' ? v.replace(',', '.') : v;
      row[key] = numeric !== '' && !Number.isNaN(Number(numeric)) ? Number(numeric) : v;
    });
    return row;
  });
}

/** Index rows by a column, e.g. byKey(rows, 'id') → { insurgent: {...} } */
export function byKey(rows, key) {
  const out = {};
  for (const r of rows) out[r[key]] = r;
  return out;
}

/**
 * Build the game's data object from raw file contents.
 * weaponsRows / enemiesRows: rows from the game-data workbook (see xlsx.js); enemiesRows
 * may be null, in which case data/enemies.csv is used.
 * levels: { [levelId]: { json, terrain, ground, buildings: { 'tower.txt': text, ... } } }
 */
// Used when no upgrades table is given (older test set-ups): walls only, as before.
export const DEFAULT_UPGRADES_CSV = 'id,name,needs,level,wall_height\nwalls,Walls,construction_crate,1,1\nwalls,Walls,construction_crate,2,2\n';

/**
 * Upgrades table → { walls: { id, name, needs, levels: [row for level 1, row for level 2, …] }, … }.
 * The number of rows an upgrade has is its number of levels.
 */
export function parseUpgrades(text) {
  const out = {};
  for (const r of parseCsv(text)) {
    if (!r.id) continue;
    const u = out[r.id] || (out[r.id] = { id: r.id, name: r.name || r.id, needs: r.needs, levels: [] });
    u.levels[Number(r.level) - 1] = r;
  }
  for (const u of Object.values(out)) u.levels = u.levels.filter(Boolean);
  return out;
}

export function buildData({ weaponsRows, enemiesRows = null, materialsCsv, enemiesCsv, wavesCsv, upgradesCsv = DEFAULT_UPGRADES_CSV, settings, levels }) {
  const weapons = byKey(weaponsRows, 'id');
  // Ammunition carried per calibre: the largest (max_total − magazine) among weapons of that calibre.
  const calibres = {};
  for (const w of Object.values(weapons)) {
    calibres[w.calibre] = Math.max(calibres[w.calibre] || 0, w.max_total - w.mag_size);
  }
  const parsedLevels = {};
  for (const [id, lv] of Object.entries(levels)) {
    parsedLevels[id] = {
      ...(typeof lv.json === 'string' ? JSON.parse(lv.json) : lv.json),
      terrainText: lv.terrain,
      groundText: lv.ground,
      buildingTexts: lv.buildings
    };
  }
  return {
    weapons,
    calibres,
    materials: byKey(parseCsv(materialsCsv), 'id'),
    enemies: enemiesRows && enemiesRows.length ? byKey(enemiesRows, 'id') : byKey(parseCsv(enemiesCsv), 'id'),
    waves: parseCsv(wavesCsv),
    upgrades: parseUpgrades(upgradesCsv),
    settings,
    levels: parsedLevels
  };
}

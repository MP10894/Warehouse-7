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
 * levels: { [levelId]: { json, terrain, ground, buildings: { 'tower.txt': text, ... } } }
 */
export function buildData({ weaponsCsv, materialsCsv, enemiesCsv, wavesCsv, settings, levels }) {
  const weapons = byKey(parseCsv(weaponsCsv), 'id');
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
    enemies: byKey(parseCsv(enemiesCsv), 'id'),
    waves: parseCsv(wavesCsv),
    settings,
    levels: parsedLevels
  };
}

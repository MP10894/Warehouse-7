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
      let v = (cells[i] ?? '').trim();
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

/** Build the game's data object from raw file contents. */
export function buildData({ enemiesCsv, weaponsCsv, pickupsCsv, settings, levels }) {
  const pickups = byKey(parseCsv(pickupsCsv), 'id');
  return {
    enemies: byKey(parseCsv(enemiesCsv), 'id'),
    weapons: byKey(parseCsv(weaponsCsv), 'id'),
    pickups,
    pickupsBySymbol: byKey(Object.values(pickups), 'map_symbol'),
    settings,
    levels
  };
}

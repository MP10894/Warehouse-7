// Reads the game-data workbook (data/Game Data.xlsx, or the older data/Weapons.xlsx) so
// Martial can keep editing his formatted Excel file. Runs at build time (Vite plugin)
// and in the tests, never in the browser.
// An .xlsx file is a zip of XML files; this reads the values of each tab. Cells with
// simple formulas (e.g. =374/2 or =+C4*6) are worked out here if Excel didn't store
// the result.
import { unzipSync, strFromU8 } from 'fflate';

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function colIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Evaluate a simple arithmetic formula with cell references. */
function evalFormula(f, getCell, where) {
  const tokens = f.replace(/\$/g, '').match(/[A-Z]+\d+|\d+(?:\.\d+)?|[-+*/()]/g) || [];
  let i = 0;
  const peek = () => tokens[i], next = () => tokens[i++];
  function factor() {
    const t = next();
    if (t === '+') return factor();
    if (t === '-') return -factor();
    if (t === '(') { const v = expr(); next(); return v; }
    if (/^[A-Z]+\d+$/.test(t)) {
      const v = getCell(t);
      if (typeof v !== 'number') throw new Error(`Weapons.xlsx: formula in ${where} uses ${t}, which isn't a number`);
      return v;
    }
    if (t !== undefined && /^\d/.test(t)) return Number(t);
    throw new Error(`Weapons.xlsx: can't work out the formula =${f} in ${where}. Use a plain number there, or open and save the file in Excel.`);
  }
  function term() { let v = factor(); while (peek() === '*' || peek() === '/') { v = next() === '*' ? v * factor() : v / factor(); } return v; }
  function expr() { let v = term(); while (peek() === '+' || peek() === '-') { v = next() === '+' ? v + term() : v - term(); } return v; }
  const v = expr();
  if (i < tokens.length) throw new Error(`Weapons.xlsx: can't work out the formula =${f} in ${where}.`);
  return v;
}

function parseSheet(sheet, shared, name) {
  const raw = {};
  for (const m of sheet.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, ref, attrs, inner = ''] = m;
    const type = (attrs.match(/t="([^"]+)"/) || [])[1];
    const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
    const f = (inner.match(/<f[^>]*>([\s\S]*?)<\/f>/) || [])[1];
    const is = (inner.match(/<is>([\s\S]*?)<\/is>/) || [])[1];
    if (type === 's' && v !== undefined) raw[ref] = shared[Number(v)];
    else if (type === 'inlineStr' && is) raw[ref] = decode(is.replace(/<[^>]+>/g, ''));
    else if (type === 'str' && v !== undefined) raw[ref] = decode(v);
    else if (type === 'b' && v !== undefined) raw[ref] = v === '1';
    else if (v !== undefined && v !== '') raw[ref] = Number(v);
    else if (f) raw[ref] = { formula: decode(f) };
  }
  const get = ref => {
    const v = raw[ref];
    if (v && typeof v === 'object') { raw[ref] = evalFormula(v.formula, get, `${name}!${ref}`); return raw[ref]; }
    return v;
  };
  for (const ref of Object.keys(raw)) get(ref);
  return raw;
}

/** Every tab of the workbook, in order: [{ name, cells: { 'B3': value, ... } }] */
export function readSheets(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const text = name => (files[name] ? strFromU8(files[name]) : '');
  const shared = [];
  for (const si of text('xl/sharedStrings.xml').match(/<si>[\s\S]*?<\/si>/g) || []) {
    shared.push(decode((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('')));
  }
  const wb = text('xl/workbook.xml'), rels = text('xl/_rels/workbook.xml.rels');
  const out = [];
  for (const m of wb.matchAll(/<sheet [^>]*?\/>/g)) {
    const tag = m[0];
    const name = decode((tag.match(/name="([^"]*)"/) || [])[1] || `Sheet${out.length + 1}`);
    const rid = (tag.match(/r:id="([^"]+)"/) || [])[1];
    let target = rid && (rels.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`)) || rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`)) || [])[1];
    target = target ? 'xl/' + target.replace(/^\/?xl\//, '') : `xl/worksheets/sheet${out.length + 1}.xml`;
    out.push({ name, cells: parseSheet(text(target), shared, name) });
  }
  return out;
}

const cellPos = r => { const m = r.match(/^([A-Z]+)(\d+)$/); return { r, col: colIndex(m[1]), row: Number(m[2]) }; };
const letter = c => { let s = ''; c++; while (c) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };

/** Find the header row (the row holding one of `titles`) and map columns to fields. */
function readTable(cells, titles, columns, required, label) {
  const refs = Object.keys(cells).map(cellPos);
  const head = refs.find(x => titles.includes(String(cells[x.r]).trim().toLowerCase()));
  if (!head) throw new Error(`${label}: no header cell called "${titles[0]}" found`);
  const map = {};
  for (const x of refs.filter(x => x.row === head.row).sort((a, b) => a.col - b.col)) {
    const h = String(cells[x.r]).trim().toLowerCase();
    const hit = columns.find(([key, test]) => !(key in map) && test(h));
    if (hit) map[hit[0]] = x.col;
  }
  const missing = required.filter(k => !(k in map));
  if (missing.length) throw new Error(`${label}: can't find columns for ${missing.join(', ')}`);
  const rows = [];
  for (let row = head.row + 1; ; row++) {
    const name = cells[letter(map.name) + row];
    if (name === undefined || name === '') break;
    const v = k => (k in map ? cells[letter(map[k]) + row] : undefined);
    rows.push({ name: String(name), v, num: (k, d) => { const x = v(k); return typeof x === 'number' ? x : d; } });
  }
  return rows;
}

// Which column means what. Matched on the header text, so columns can be reordered
// or renamed a little without breaking anything.
const COLUMNS = [
  ['name', h => h === 'weapon'],
  ['max_total', h => h.includes('total')],
  ['mag_size', h => h.includes('number of bullets') || h.includes('magazine')],
  ['reload_time', h => h.includes('reload')],
  ['damage_health', h => h.includes('health')],
  ['damage_armour', h => h.includes('armour') || h.includes('armor')],
  ['damage_environment', h => h.includes('environment')],
  ['area_of_effect', h => h.includes('area of effect')],
  ['fire_mode', h => h.includes('fire mode')],
  ['rate_of_fire', h => h.includes('rate of fire')],
  ['recoil', h => h.includes('recoil')],
  ['bloom', h => h.includes('bloom')],
  ['muzzle_velocity', h => h.includes('velocity')],
  ['calibre', h => h.includes('calibre') || h.includes('caliber')],
  ['projectile', h => h.includes('projectile')],
  ['ads_zoom', h => h.includes('zoom')],
  ['scope', h => h.includes('scope')]
];
const REQUIRED = ['name', 'mag_size', 'max_total', 'reload_time', 'damage_health', 'damage_armour', 'damage_environment', 'area_of_effect', 'fire_mode', 'rate_of_fire', 'recoil', 'bloom', 'muzzle_velocity', 'calibre'];

/** Weapon id used in other files: lower case, spaces become _, hyphens dropped ('RPG-7' → rpg7, 'Sig P320' → sig_p320). */
export const weaponId = name => String(name).toLowerCase().replace(/-/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const projectileKind = x => {
  const t = String(x || 'bullet').toLowerCase();
  return t.includes('rocket') ? 'rocket' : t.includes('grenade') ? 'grenade' : 'bullet';
};

/**
 * "Item drop" cell → pickups dropped on death, e.g. "Armour plate (15)" → [{ type: 'armour',
 * amount: 15 }]. Several can be listed with commas. "Grenade (1)" drops grenades.
 * "n/a" or empty: nothing.
 */
export function parseItemDrops(cell) {
  const out = [];
  for (const part of String(cell ?? '').split(/[,;\n]+/)) {
    const t = part.trim().toLowerCase();
    if (!t || t === 'n/a' || t === 'none') continue;
    const m = t.match(/\(?\s*(\d+(?:\.\d+)?)\s*\)?\s*$/);
    const amount = m ? Number(m[1]) : 1;
    const type = t.includes('armour') || t.includes('armor') ? 'armour' : t.includes('grenade') ? 'grenade'
      : t.includes('health') || t.includes('medic') ? 'health' : null;
    if (type) out.push({ type, amount });
  }
  return out;
}

/** Turn the Weapons tab into the rows the game uses. */
export function weaponsFromSheet(cells, label = 'Weapons tab') {
  return readTable(cells, ['weapon'], COLUMNS, REQUIRED, label).map(({ name, v, num }) => {
    const mode = String(v('fire_mode') || 'semi').toLowerCase();
    return {
      id: weaponId(name),
      name,
      calibre: String(v('calibre')),
      fire_mode: mode.startsWith('auto') ? 'auto' : 'semi',
      mag_size: num('mag_size', 1),
      max_total: num('max_total', 0),
      reload_time: num('reload_time', 2),
      rate_of_fire: num('rate_of_fire', 60),
      damage_health: num('damage_health', 0),
      damage_armour: num('damage_armour', 0),
      damage_environment: num('damage_environment', 0),
      area_of_effect: num('area_of_effect', 0),
      recoil: num('recoil', 0),
      bloom: num('bloom', 0),
      muzzle_velocity: num('muzzle_velocity', 300),
      projectile: projectileKind(v('projectile')),
      ads_zoom: num('ads_zoom', 0.7),
      // telescopic sight: magnification (e.g. 4 = 4×); 0 = iron sights
      scope: num('scope', 0)
    };
  });
}

// Enemies tab. Any column left out keeps the value from data/enemies.csv, so the tab can
// start small. Aim error is written in degrees in Excel (easier to picture) and
// converted here.
const both = h => h.includes('min') && h.includes('max');
const ENEMY_COLUMNS = [
  ['name', h => h === 'enemy' || h === 'name' || h === 'enemy type' || h === 'ally'],
  ['item_drop', h => h.includes('item') && h.includes('drop')],
  ['weapons', h => h.includes('weapon')],
  // one cell holding "min / max", e.g. "2 / 5"
  ['burst_pair', h => h.includes('burst') && !h.includes('pause') && both(h)],
  ['pause_pair', h => h.includes('pause') && both(h)],
  ['ammo_pair', h => h.includes('ammo') && both(h)],
  ['health', h => h.includes('health')],
  ['armour', h => h.includes('armour') || h.includes('armor')],
  ['move_speed', h => h.includes('speed')],
  ['sight_range', h => h.includes('sight') || h.includes('vision')],
  ['hearing_range', h => h.includes('hearing')],
  ['reaction_time', h => h.includes('reaction')],
  ['aim_error_per_10m_deg', h => h.includes('aim') && (h.includes('per') || h.includes('distance'))],
  ['aim_error_deg', h => h.includes('aim') || h.includes('accuracy')],
  ['burst_min', h => h.includes('burst') && !h.includes('pause') && h.includes('min')],
  ['burst_max', h => h.includes('burst') && !h.includes('pause') && h.includes('max')],
  ['burst_pause_min', h => h.includes('pause') && h.includes('min')],
  ['burst_pause_max', h => h.includes('pause') && h.includes('max')],
  ['preferred_range', h => h.includes('preferred') || h.includes('fighting distance')],
  ['ammo_drop_min', h => h.includes('ammo') && h.includes('min')],
  ['ammo_drop_max', h => h.includes('ammo') && h.includes('max')]
];
const DEG = Math.PI / 180;

export function enemiesFromSheet(cells, defaults = {}, label = 'Enemies tab') {
  return readTable(cells, ['enemy', 'name', 'enemy type', 'ally'], ENEMY_COLUMNS, ['name'], label).map(({ name, v, num: single }) => {
    const id = weaponId(name);
    const base = defaults[id] || Object.values(defaults)[0] || {};
    // "2 / 5" style cells: split into the two numbers
    const pair = k => {
      const x = v(k);
      if (typeof x === 'number') return [x, x];
      const m = String(x ?? '').replace(/,/g, '.').match(/(-?\d+(?:\.\d+)?)\s*[/\-–]\s*(-?\d+(?:\.\d+)?)/);
      return m ? [Number(m[1]), Number(m[2])] : null;
    };
    const pairs = { burst_min: ['burst_pair', 0], burst_max: ['burst_pair', 1], burst_pause_min: ['pause_pair', 0], burst_pause_max: ['pause_pair', 1], ammo_drop_min: ['ammo_pair', 0], ammo_drop_max: ['ammo_pair', 1] };
    const num = (k, d) => {
      const x = single(k);
      if (typeof x === 'number') return x;
      if (pairs[k]) { const p = pair(pairs[k][0]); if (p) return p[pairs[k][1]]; }
      return d;
    };
    const list = v('weapons');
    const allowed = list ? String(list).split(/[,;\n]+/).map(s => weaponId(s.trim())).filter(Boolean) : null;
    return {
      ...base,
      id, name,
      allowed_weapons: allowed && allowed.length ? allowed : null,
      drops: parseItemDrops(v('item_drop')),
      health: num('health', base.health ?? 100),
      armour: num('armour', base.armour ?? 0),
      move_speed: num('move_speed', base.move_speed ?? 3.2),
      sight_range: num('sight_range', base.sight_range ?? 45),
      hearing_range: num('hearing_range', base.hearing_range ?? 30),
      reaction_time: num('reaction_time', base.reaction_time ?? 0.6),
      aim_error_base: typeof num('aim_error_deg') === 'number' ? num('aim_error_deg') * DEG : base.aim_error_base ?? 0.02,
      aim_error_per_metre: typeof num('aim_error_per_10m_deg') === 'number' ? num('aim_error_per_10m_deg') * DEG / 10 : base.aim_error_per_metre ?? 0.0012,
      burst_min: num('burst_min', base.burst_min ?? 2),
      burst_max: num('burst_max', base.burst_max ?? 5),
      burst_pause_min: num('burst_pause_min', base.burst_pause_min ?? 0.6),
      burst_pause_max: num('burst_pause_max', base.burst_pause_max ?? 1.6),
      preferred_range: num('preferred_range', base.preferred_range ?? 18),
      ammo_drop_min: num('ammo_drop_min', base.ammo_drop_min ?? 10),
      ammo_drop_max: num('ammo_drop_max', base.ammo_drop_max ?? 30)
    };
  });
}

/**
 * Read the whole game-data workbook: the Weapons tab (or the first tab) and, if there are
 * ones, the Enemies tab and the Allies tab (friendly units such as the turret: the same
 * columns as the Enemies tab). Returns { weapons, enemies, allies } (null without a tab).
 */
export function gameDataFromXlsx(buffer, enemyDefaults = {}) {
  const sheets = readSheets(buffer);
  const weaponsTab = sheets.find(s => /weapon/i.test(s.name)) || sheets[0];
  const enemiesTab = sheets.find(s => /enem/i.test(s.name));
  const weapons = weaponsFromSheet(weaponsTab.cells, `Tab "${weaponsTab.name}"`);
  const enemies = enemiesTab ? enemiesFromSheet(enemiesTab.cells, enemyDefaults, `Tab "${enemiesTab.name}"`) : null;
  const alliesTab = sheets.find(s => /all(y|ies)/i.test(s.name));
  const allies = alliesTab ? enemiesFromSheet(alliesTab.cells, enemyDefaults, `Tab "${alliesTab.name}"`) : null;
  // weapon names in the Enemies / Allies tabs: spaces, hyphens and capitals don't matter
  // ("Mini-Uzi", "mini uzi" and "MiniUzi" all mean the Weapons tab's "Mini Uzi")
  const loose = id => String(id).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const e of [...(enemies || []), ...(allies || [])]) {
    e.allowed_weapons = e.allowed_weapons && e.allowed_weapons.map(w => {
      const hit = weapons.find(x => x.id === w) || weapons.find(x => loose(x.id) === loose(w));
      if (!hit) throw new Error(`Enemies tab: "${e.name}" lists a weapon that isn't on the Weapons tab (${w}). Use the weapon names as on the Weapons tab.`);
      return hit.id;
    });
  }
  return { weapons, enemies, allies };
}

/** Older name kept for the tests: weapons only. */
export const weaponsFromXlsx = buffer => gameDataFromXlsx(buffer).weapons;

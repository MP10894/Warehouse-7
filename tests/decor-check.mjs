// Checks the decoration plan (shop fronts, rooftops, wires, ground marks): it is the same every
// run, every piece hangs on a real wall, and none of it changes the game rules.
// Usage: node tests/decor-check.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { buildData, parseCsv, byKey } from '../src/data/parse.js';
import { gameDataFromXlsx } from '../src/data/xlsx.js';
import { createWorld } from '../src/sim/world.js';
import { V } from '../src/sim/grid.js';
import { planDecor } from '../src/render/decor.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const loadLevel = id => {
  const lv = `data/levels/${id}/`, buildings = {};
  for (const f of readdirSync(new URL('../' + lv + 'buildings', import.meta.url))) buildings[f] = read(lv + 'buildings/' + f);
  return { json: read(lv + 'level.json'), terrain: read(lv + 'terrain.txt'), ground: read(lv + 'ground.txt'), buildings };
};
const gameData = gameDataFromXlsx(readFileSync(new URL('../data/Game Data.xlsx', import.meta.url)), byKey(parseCsv(read('data/enemies.csv')), 'id'));
const data = buildData({
  weaponsRows: gameData.weapons, enemiesRows: gameData.enemies, materialsCsv: read('data/materials.csv'),
  enemiesCsv: read('data/enemies.csv'), wavesCsv: read('data/waves.csv'), upgradesCsv: read('data/upgrades.csv'),
  settings: JSON.parse(read('data/settings.json')), levels: { najaf: loadLevel('najaf') }
});
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${msg}`); if (!ok) failures++; };

const w = createWorld({ data, levelId: 'najaf', seed: 1 });
const before = w.grid.cells.slice();
const a = planDecor(w, 1), b = planDecor(createWorld({ data, levelId: 'najaf', seed: 99 }), 1);
const count = {};
for (const it of a.items) count[it.kind] = (count[it.kind] || 0) + 1;
check(JSON.stringify(a.items) === JSON.stringify(b.items), `the same decoration every run (${a.items.length} pieces)`);
const kinds = ['shutter', 'awning', 'frame', 'shutters', 'ac', 'streak', 'wire', 'tank', 'dish', 'aerial', 'washing', 'drift', 'mark'];
check(kinds.every(k => count[k] > 0), `every kind is used: ${kinds.map(k => `${k} ${count[k] || 0}`).join(', ')}`);
const bad = a.items.filter(it => it.anchors.some(i => w.grid.cells[i] !== V.WALL));
check(bad.length === 0, `every piece hangs on a wall block${bad.length ? ': ' + bad.slice(0, 3).map(i => i.kind).join(', ') : ''}`);
check(w.grid.cells.every((c, i) => c === before[i]), 'placing decoration changes nothing in the game world');
const half = planDecor(w, 0.5).items.length;
check(half < a.items.length * 0.75 && half > a.items.length * 0.25, `the decoration amount setting scales it (${half} at half)`);
process.exit(failures ? 1 : 0);

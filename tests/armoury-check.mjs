// Checks the armoury: a built ammunition supply hands out the MP5 (level 1), M4A1 (level 2)
// and Mk14-EBR (level 3); taking one fills an empty slot or replaces the weapon in your
// hands, which is left on the ground beside the locker.
// Usage: node tests/armoury-check.mjs
// Usage: node tests/decor-check.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { buildData, parseCsv, byKey } from '../src/data/parse.js';
import { gameDataFromXlsx } from '../src/data/xlsx.js';
import { createWorld } from '../src/sim/world.js';
import { V } from '../src/sim/grid.js';

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
import { stepWorld } from '../src/sim/step.js';
import { groundAt } from '../src/sim/body.js';
import { applyUpgrade, armouryWeapons, levelBases } from '../src/sim/base.js';
import { destroyPiece } from '../src/sim/damage.js';

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
const step = (w, cmd = {}, n = 1) => { for (let i = 0; i < n; i++) { stepWorld(w, { p1: cmd }, 1 / 60); w.events.length = 0; } };
const w = createWorld({ data, levelId: 'najaf', seed: 31 });
w.enemies = []; w.groups = []; w.waves.nextT = 1e9;
const b = levelBases(data.levels.najaf).find(x => x.id === 'police_station');
const spot = b.build_spots.find(s => s.upgrade === 'ammo');
const p = w.players[0];
const standAt = (x, z) => { p.x = x; p.z = z; p.y = groundAt(w, x, z, 30); };
standAt(b.build_spots[0].x + 0.5, b.build_spots[0].z + 0.5);
step(w, {}, 20);
check(w.base.claimed && armouryWeapons(w).length === 0, 'no armoury before the ammunition supply is built');
applyUpgrade(w, 'ammo', 1);
// stand next to the locker
const sx = spot.x + 0.5, sz = spot.z + 0.5;
let stand = null;
for (const [dx, dz] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) { standAt(sx + dx, sz + dz); step(w); if (p.context && p.context.kind === 'armoury') { stand = [p.x, p.z]; break; } }
check(!!stand && armouryWeapons(w).join() === 'mp5', `at the level 1 ammunition supply the use button opens the ARMOURY, offering: ${armouryWeapons(w).join(', ')}`);
step(w, { armoury: 'm4a1' });
check(!p.slots.some(s => s && s.w === 'm4a1'), 'the M4A1 needs locker level 2');
p.slots = [{ w: 'sig_p320', mag: 17 }, null]; p.active = 0;
const before = new Set(w.pickups.map(k => k.id));   // (the level already has weapons lying around)
step(w, { armoury: 'mp5' });
const mp5 = data.weapons.mp5;
check(p.slots[1] && p.slots[1].w === 'mp5' && p.slots[1].mag === mp5.mag_size && p.active === 1 && w.pickups.every(k => before.has(k.id)),
  'with an empty slot the MP5 goes into it, fully loaded, and nothing is dropped');
applyUpgrade(w, 'ammo', 2); applyUpgrade(w, 'ammo', 3);
check(armouryWeapons(w).join() === 'mp5,m4a1,mk14ebr', `level 3 offers ${armouryWeapons(w).join(', ')}`);
step(w, { armoury: 'mk14ebr' });
const mk = data.weapons.mk14ebr;
const dropped = w.pickups.find(k => k.type === 'weapon' && k.weapon === 'mp5' && !before.has(k.id));
check(p.slots[1].w === 'mk14ebr' && p.slots[1].mag === mk.mag_size && p.reserve[mk.calibre] >= mk.max_total - mk.mag_size - 1 && !!dropped,
  'with both slots full the Mk14-EBR replaces the weapon in your hands, with a full load; the MP5 is left on the ground');
const d = dropped ? Math.hypot(dropped.x - sx, dropped.z - sz) : 0;
check(d > data.settings.base.build_range, `the MP5 lies ${d.toFixed(1)} m from the locker, outside the armoury range`);
if (dropped) { standAt(dropped.x, dropped.z); step(w); }
check(p.context && p.context.kind === 'pickup' && /MP5/.test(p.context.label), `standing on it you can take it back (${p.context && p.context.label})`);
standAt(stand[0], stand[1]); step(w);
step(w, { armoury: 'mk14ebr' });
check(p.slots.filter(s => s && s.w === 'mk14ebr').length === 1, 'you cannot take a weapon you already carry');
destroyPiece(w, w.pieces[w.base.upgrades.ammo.piece - 1]);
step(w);
check(!p.context || p.context.kind !== 'armoury', 'a destroyed ammunition supply closes the armoury');
process.exit(failures ? 1 : 0);

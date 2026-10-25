// Checks Level 2, Kambala mine: it builds, everyone starts on open ground, the pit's bench
// walls can't be walked up (the haul road is the way down), and every base, crate, pickup and
// attack-wave entry can be reached on foot from the start.
// Usage: node tests/kambala-check.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { buildData, parseCsv, byKey } from '../src/data/parse.js';
import { gameDataFromXlsx } from '../src/data/xlsx.js';
import { createWorld } from '../src/sim/world.js';
import { buildNav, nodeAt, flowField } from '../src/sim/nav.js';
import { groundAt, blocked, moveBody } from '../src/sim/body.js';
import { levelBases } from '../src/sim/base.js';
import { terrainHeight } from '../src/sim/terrain.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const loadLevel = id => {
  const lv = `data/levels/${id}/`, buildings = {};
  for (const f of readdirSync(new URL('../' + lv + 'buildings', import.meta.url))) buildings[f] = read(lv + 'buildings/' + f);
  return { json: read(lv + 'level.json'), terrain: read(lv + 'terrain.txt'), ground: read(lv + 'ground.txt'), buildings };
};
const gameData = gameDataFromXlsx(readFileSync(new URL('../data/Game Data.xlsx', import.meta.url)), byKey(parseCsv(read('data/enemies.csv')), 'id'));
const data = buildData({
  weaponsRows: gameData.weapons, enemiesRows: gameData.enemies, alliesRows: gameData.allies, materialsCsv: read('data/materials.csv'),
  enemiesCsv: read('data/enemies.csv'), wavesCsv: read('data/waves.csv'), upgradesCsv: read('data/upgrades.csv'),
  settings: JSON.parse(read('data/settings.json')), levels: { kambala: loadLevel('kambala') }
});

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
const S = data.settings.player;

const t0 = performance.now();
const world = createWorld({ data, levelId: 'kambala', seed: 4 });
const tBuild = performance.now() - t0;
const nav = buildNav(world);
console.log(`build ${(tBuild).toFixed(0)} ms, nav ${(performance.now() - t0 - tBuild).toFixed(0)} ms, ${nav.count} nav points, ${world.enemies.length} enemies`);
const L = data.levels.kambala;

// the pit: 12 m deep, plateau at 13 m
const rim = terrainHeight(world.terrain, 128, 132), floor = groundAt(world, 196, 70, 3);
check(rim > 12 && rim < 15 && floor < 2, `the pit floor (${floor.toFixed(1)} m) lies about 12 m below the plateau (${rim.toFixed(1)} m)`);

// nobody starts inside a wall
const p = world.players[0];
check(!blocked(world, p.x, p.z, p.y, S.radius, S.height, S.step_height), 'the players start on open ground at the junction');
const stuck = world.enemies.filter(e => blocked(world, e.x, e.z, e.y, S.radius, S.height, S.step_height));
check(stuck.length === 0, `no enemy starts inside a wall (${stuck.map(e => `${e.group} at ${e.x.toFixed(0)},${e.z.toFixed(0)}`).join('; ') || 'none'})`);

// walking: from the start, can you reach …
const field = flowField(nav, [nodeAt(nav, p.x, p.y, p.z)]);
const reach = (x, z, maxY = 30) => { const y = groundAt(world, x, z, maxY); const n = nodeAt(nav, x, y, z); return n >= 0 && field[n] >= 0; };
for (const b of levelBases(L)) {
  const s = b.build_spots.filter(sp => !reach(sp.x + 0.5, sp.z + 0.5));
  check(s.length === 0, `base "${b.name}": every build spot can be walked to (${b.build_spots.length - s.length}/${b.build_spots.length})`);
}
const crates = world.pickups.filter(k => k.type === 'item');
check(crates.length === 5 && crates.every(k => reach(k.x, k.z, k.y + 0.6)), `all 5 crates can be walked to (${crates.filter(k => reach(k.x, k.z, k.y + 0.6)).length}/${crates.length})`);
const loose = world.pickups.filter(k => k.type !== 'item' && !reach(k.x, k.z, k.y + 0.6));
check(loose.length === 0, `every weapon, ammo, armour and grenade pickup can be walked to (${loose.map(k => `${k.type} ${k.x},${k.z}`).join('; ') || 'all'})`);
const waves = L.wave_spawns.filter(w => !reach(w.x + 0.5, w.z + 0.5));
check(L.wave_spawns.every(w => w.x < 8) && waves.length === 0, `all six attack waves come out of the forest on the west edge and can walk in (${L.wave_spawns.length - waves.length}/6)`);
const unreachable = world.enemies.filter(e => { const n = nodeAt(nav, e.x, e.y, e.z); return !(n >= 0 && field[n] >= 0); });
check(unreachable.length <= 1, `enemies stand where they can be reached (${unreachable.map(e => e.group).join(', ') || 'all'})`);
check(reach(204, 199, 7.5), 'the watch tower\'s lookout can be climbed to');

// the bench walls: walking straight at one from the pit floor gets you nowhere up
{
  const b = { x: 196.5, y: groundAt(world, 196.5, 50, 3), z: 50, vy: 0, onGround: true };
  const y0 = b.y;
  for (let i = 0; i < 120; i++) moveBody(world, b, 0, -0.08, 1 / 60);   // north, towards the wall
  check(b.y < y0 + 0.7, `the pit's bench walls can't be walked up (still at ${b.y.toFixed(1)} m after walking into one)`);
}
// the haul road: the floor connects to the rim
check(reach(176, 68, 3) && reach(200, 74, 3), 'the haul road leads from the rim down to the pit floor');

process.exit(failures ? 1 : 0);

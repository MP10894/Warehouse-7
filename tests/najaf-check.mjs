// Checks the Najaf level files: everything stands somewhere sensible and every floor is
// reachable on foot. Usage: node tests/najaf-check.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { buildData, parseCsv, byKey } from '../src/data/parse.js';
import { gameDataFromXlsx } from '../src/data/xlsx.js';
import { createWorld } from '../src/sim/world.js';
import { stepWorld } from '../src/sim/step.js';
import { buildNav, nodeAt, flowField, maintainNav } from '../src/sim/nav.js';
import { destroyPiece } from '../src/sim/damage.js';
import { V, getV, setV } from '../src/sim/grid.js';
import { moveBody } from '../src/sim/body.js';
import { parseBuilding, orientFloors } from '../src/sim/level.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const loadLevel = id => {
  const lv = `data/levels/${id}/`, buildings = {};
  for (const f of readdirSync(new URL('../' + lv + 'buildings', import.meta.url))) buildings[f] = read(lv + 'buildings/' + f);
  return { json: read(lv + 'level.json'), terrain: read(lv + 'terrain.txt'), ground: read(lv + 'ground.txt'), buildings };
};
const gameData = gameDataFromXlsx(readFileSync(new URL('../data/Game Data.xlsx', import.meta.url)), byKey(parseCsv(read('data/enemies.csv')), 'id'));
const data = buildData({
  weaponsRows: gameData.weapons, enemiesRows: gameData.enemies, materialsCsv: read('data/materials.csv'),
  enemiesCsv: read('data/enemies.csv'), wavesCsv: read('data/waves.csv'), settings: JSON.parse(read('data/settings.json')),
  levels: { najaf: loadLevel('najaf') }
});
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${msg}`); if (!ok) failures++; };

let t0 = performance.now();
const world = createWorld({ data, levelId: 'najaf', seed: 3 });
const tBuild = performance.now() - t0;
t0 = performance.now();
const nav = buildNav(world);
const tNav = performance.now() - t0;
console.log(`build ${tBuild.toFixed(0)} ms, nav ${tNav.toFixed(0)} ms, ${nav.count} nav points, ${world.pieces.length} breakable pieces, ${world.enemies.length} enemies`);

const p = world.players[0];
const field = flowField(nav, [nodeAt(nav, p.x, p.y, p.z)]);
const reach = (x, y, z) => { const n = nodeAt(nav, x, y, z); return n >= 0 && field[n] >= 0; };

const level = data.levels.najaf;
const lost = world.enemies.filter(e => !reach(e.x, e.y, e.z));
check(lost.length === 0, `every enemy stands where the player can walk to${lost.length ? ': ' + lost.map(e => `${e.group}@${e.x},${e.y.toFixed(1)},${e.z}`).join(' ') : ''}`);
const item = world.pickups.filter(k => !reach(k.x, k.y, k.z));
check(item.length === 0, `every pickup and crate can be reached${item.length ? ': ' + item.map(k => `${k.type}@${k.x},${k.y.toFixed(1)},${k.z}`).join(' ') : ''}`);
const guards = level.enemy_groups.flatMap(g => g.spawns.filter(s => s.y !== undefined).map(s => ({ g: g.id, s })));
const wrongFloor = guards.filter(({ s }) => { const e = world.enemies.find(e => Math.abs(e.x - s.x - 0.5) < 0.01 && Math.abs(e.z - s.z - 0.5) < 0.01); return !e || Math.abs(e.y - s.y) > 1.1; });
check(wrongFloor.length === 0, `guards start on the floor they were placed on${wrongFloor.length ? ': ' + wrongFloor.map(w => w.g + JSON.stringify(w.s)).join(' ') : ''}`);

// every floor of every building with stairs reachable (top storey or roof)
const bad = [];
for (const b of level.buildings) {
  let floors = parseBuilding(level.buildingTexts[b.file]);
  floors = orientFloors(floors, b.turn || 0, !!b.mirror);
  const hasStairs = floors.some(f => f.rows.some(r => /[<>^v]/.test(r)));
  if (!hasStairs) continue;
  const top = Math.max(...floors.map(f => f.floor));
  let ok = false;
  floors.find(f => f.floor === top).rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '.' && !ok) {
    for (let n = nav.colStart[(b.x + i) + (b.z + j) * nav.W]; n < nav.colStart[(b.x + i) + (b.z + j) * nav.W + 1]; n++) if (nav.y[n] >= top * 3 - 0.5 && field[n] >= 0) ok = true;
  } });
  if (!ok) bad.push(`${b.file}@${b.x},${b.z}${b.turn ? ' turn ' + b.turn : ''}`);
}
check(bad.length === 0, `the roof of every building with stairs can be reached${bad.length ? ': ' + bad.join(', ') : ''}`);

// breaking walls only re-works the area around them, and gives the same answer as a full rebuild
{
  world.cache.nav = buildNav(world); world.cache.navBuiltAt = world.time; world.cache.navDirty = false;
  const targets = world.pieces.filter(pc => pc.alive && pc.material === 'wall').filter((_, i) => i % 401 === 0).slice(0, 6);
  for (const pc of targets) destroyPiece(world, pc);
  world.time += 1;
  t0 = performance.now();
  maintainNav(world);
  const tPart = performance.now() - t0;
  const full = buildNav(world), part = world.cache.nav;
  const same = full.count === part.count && full.links.every((l, i) => l === part.links[i]) && full.y.every((y, i) => y === part.y[i]);
  check(same, `partial path-finding update after ${targets.length} walls broke matches a full rebuild`);
  check(tPart < tNav / 2, `partial update is quick (${tPart.toFixed(0)} ms vs ${tNav.toFixed(0)} ms for everything)`);
}

// enemy types and the new weapons are placed
{
  const types = new Set(world.enemies.map(e => e.type));
  const heavy = world.enemies.filter(e => e.type === 'heavy_insurgent');
  const weaponsHere = new Set(world.pickups.filter(k => k.type === 'weapon').map(k => k.weapon));
  check(types.has('militia') && heavy.length > 0 && heavy.every(e => e.armour >= 50) && weaponsHere.has('mk14ebr') && weaponsHere.has('mp5'),
    `Najaf has militia and armoured heavy insurgents, and MP5 and Mk14 pickups (${[...types].join(', ')})`);
  const { spawnWave } = await import('../src/sim/waves.js');
  const w = createWorld({ data, levelId: 'najaf', seed: 11 });
  w.enemies = [];
  w.waves.index = 0; spawnWave(w);
  const first = w.enemies.map(e => e.type);
  w.enemies = []; w.waves.index = 5; spawnWave(w);
  const sixth = w.enemies.map(e => e.type);
  check(first.includes('militia') && !first.includes('heavy_insurgent') && sixth.includes('heavy_insurgent') && !sixth.includes('militia'),
    `early waves bring militia, late waves heavy insurgents (wave 1: ${first.join(', ')}; wave 6: ${[...new Set(sixth)].join(', ')})`);
}

// the co-op partner sees each enemy's type (so heavy insurgents look heavy on both phones)
{
  const { createHostEncoder, createGuestDecoder } = await import('../src/net/snapshot.js');
  const host = createWorld({ data, levelId: 'najaf', seed: 21 });
  const guest = createWorld({ data, levelId: 'najaf', seed: 21, playerIds: ['p1', 'p2'] });
  const enc = createHostEncoder(data), dec = createGuestDecoder(data);
  enc.record(host, []);
  guest.enemies = [];   // the partner learns about the enemies only from the host's messages
  dec.apply(guest, enc.encode(host), 'p2');
  const want = host.enemies.filter(e => e.type === 'heavy_insurgent').map(e => e.id);
  const got = guest.enemies.filter(e => e.type === 'heavy_insurgent').map(e => e.id);
  check(want.length > 0 && want.every(id => got.includes(id)), `co-op partner gets each enemy's type (${got.length} heavy insurgents)`);
}

// rubble is decoration only: it never blocks or traps anyone (play-test bugs, 2026-10-22/23)
{
  const w = createWorld({ data, levelId: 'najaf', seed: 9 });
  const g = w.grid;
  // blow out a ground-floor wall that has a floor above it, then walk through the gap
  const pc = w.pieces.find(p => p.alive && p.material === 'wall' && p.cells.length === 2 && p.cells.every(i => {
    const x = i % g.w, z = ((i / g.w) | 0) % g.d;
    return getV(g, x, 2, z) === V.SLAB && getV(g, x - 1, 0, z) === V.AIR && getV(g, x + 1, 0, z) === V.AIR && getV(g, x - 1, 1, z) === V.AIR && getV(g, x + 1, 1, z) === V.AIR;
  }));
  const i0 = pc.cells[0], gx = i0 % g.w, gz = ((i0 / g.w) | 0) % g.d;
  destroyPiece(w, pc);
  check(g.cells[i0] === V.RUBBLE, 'a broken wall leaves rubble, even under a floor');
  const body = { x: gx - 1.5, y: 0, z: gz + 0.5, vy: 0, onGround: true };
  let maxY = 0;
  for (let k = 0; k < 120; k++) { moveBody(w, body, 3 / 60, 0, 1 / 60); maxY = Math.max(maxY, body.y); }
  check(body.x > gx + 1.2 && maxY < 0.01, `walked straight through the rubble and the hole in the wall (x ${body.x.toFixed(1)}, never climbed: ${maxY.toFixed(2)} m)`);
  // fall through a hole onto a rubble-covered floor: still free to walk out
  setV(g, gx + 3, 0, gz, V.RUBBLE); setV(g, gx + 4, 0, gz, V.RUBBLE);
  const b2 = { x: gx + 3.5, y: 0, z: gz + 0.5, vy: 0, onGround: true };
  let moved = 0;
  for (let k = 0; k < 60; k++) moved += moveBody(w, b2, -3 / 60, 0, 1 / 60);
  check(moved > 2, `standing in rubble you can walk away freely (moved ${moved.toFixed(1)} m)`);
}
// the building-site crate sits beside a stairwell: walking past its edge must not trap you
{
  const w = createWorld({ data, levelId: 'najaf', seed: 3 }); w.enemies = []; w.groups = [];
  const pl = w.players[0], crate = w.pickups.find(k => k.type === 'item');
  Object.assign(pl, { x: crate.x + 0.3, z: crate.z + 0.3, y: crate.y });
  const go = (x, y, s) => { const x0 = pl.x, z0 = pl.z; for (let i = 0; i < s * 60; i++) { stepWorld(w, { p1: { move: { x, y }, yaw: pl.yaw } }, 1 / 60); w.events.length = 0; } return Math.hypot(pl.x - x0, pl.z - z0); };
  go(0, 0, 0.3);
  const moves = [go(0, -1, 0.5), go(0, 1, 0.5), go(1, 0, 0.5), go(-1, 0, 0.5)];
  check(pl.carrying && moves.every(m => m > 0.4), `after picking up the site's crate you can walk in every direction (${moves.map(m => m.toFixed(1)).join(', ')} m)`);
}

// claiming the police station and building walls there
{
  const w = createWorld({ data, levelId: 'najaf', seed: 5 });
  w.waves.nextT = 1e9;
  const pl = w.players[0];
  w.enemies = w.enemies.filter(e => e.group !== 'police' && !(e.x >= 60 && e.x <= 80 && e.z >= 56 && e.z <= 76));
  Object.assign(pl, { x: 72.5, z: 70.5, y: 0 });
  for (let i = 0; i < 30; i++) { stepWorld(w, { p1: {} }, 1 / 60); w.events.length = 0; }
  check(w.base.claimed, 'police station becomes your base once cleared');
  const spot = w.base.buildSpots[0];
  pl.carrying = { item: 'construction_crate', origin: { x: 110.5, y: 3, z: 88.5 } };
  Object.assign(pl, { x: spot.x + 0.5, z: spot.z + 0.5 });
  let built = false;
  for (let i = 0; i < 60 && !built; i++) { stepWorld(w, { p1: { interact: i === 2 } }, 1 / 60); built = w.base.upgrades.walls.level > 0; w.events.length = 0; }
  check(built && w.base.upgrades.walls.pieces.length >= 15, `walls built around the courtyard (${w.base.upgrades.walls.pieces.length} sandbag blocks)`);
}

t0 = performance.now();
for (let i = 0; i < 600; i++) { stepWorld(world, { p1: {} }, 1 / 60); world.events.length = 0; }
const per = (performance.now() - t0) / 600;
check(per < 4, `simulation runs fast enough (${per.toFixed(2)} ms per step)`);
process.exit(failures ? 1 : 0);

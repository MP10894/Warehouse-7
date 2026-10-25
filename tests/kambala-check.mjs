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
import { levelBases, claimBase } from '../src/sim/base.js';
import { terrainHeight } from '../src/sim/terrain.js';
import { V, getV, isShrub } from '../src/sim/grid.js';
import { explode, damageActor } from '../src/sim/damage.js';
import { spawnWave } from '../src/sim/waves.js';
import { hiddenByShrubs, traceSegment } from '../src/sim/ballistics.js';
import { stepWorld } from '../src/sim/step.js';
import { spawnEnemy } from '../src/sim/enemies.js';
import { createHostEncoder, createGuestDecoder } from '../src/net/snapshot.js';
import { detonate } from '../src/sim/blasting.js';
import { stormAt } from '../src/sim/weather.js';

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
check(crates.length === 15 && crates.every(k => reach(k.x, k.z, k.y + 0.6)), `all 15 crates (five per base) can be walked to (${crates.filter(k => reach(k.x, k.z, k.y + 0.6)).length}/${crates.length})`);
// each base's crates are a short walk from it (no climbing out of the pit)
for (const b of levelBases(L)) {
  const a = b.area, cx = (a.x0 + a.x1) / 2, cz = (a.z0 + a.z1) / 2;
  const f = flowField(nav, [nodeAt(nav, cx, groundAt(world, cx, cz, 30), cz)]);
  const walk = crates.filter(k => k.base === b.id).map(k => f[nodeAt(nav, k.x, groundAt(world, k.x, k.z, k.y + 0.6), k.z)]);
  check(walk.length === 5 && walk.every(d => d >= 0 && d <= 90), `${b.name}: its 5 crates are within a short walk (${walk.join(', ')} m)`);
}
{
  const w2 = createWorld({ data, levelId: 'kambala', seed: 4 });
  claimBase(w2, levelBases(L).findIndex(b => b.id === 'logging_camp'), true);
  const left = w2.pickups.filter(k => k.type === 'item');
  check(left.length === 5 && left.every(k => k.base === 'logging_camp'), `claiming a base takes the other bases' crates away (${left.length} left)`);
}
const loose = world.pickups.filter(k => k.type !== 'item' && !reach(k.x, k.z, k.y + 0.6));
check(loose.length === 0, `every weapon, ammo, armour and grenade pickup can be walked to (${loose.map(k => `${k.type} ${k.x},${k.z}`).join('; ') || 'all'})`);
const waves = L.wave_spawns.filter(w => !reach(w.x + 0.5, w.z + 0.5));
check(L.wave_spawns.every(w => w.x < 8) && waves.length === 0, `all six attack waves come out of the forest on the west edge and can walk in (${L.wave_spawns.length - waves.length}/6)`);
const unreachable = world.enemies.filter(e => { const n = nodeAt(nav, e.x, e.y, e.z); return !(n >= 0 && field[n] >= 0); });
check(unreachable.length <= 1, `enemies stand where they can be reached (${unreachable.map(e => e.group).join(', ') || 'all'})`);
check(reach(204, 199, 7.5), 'the watch tower\'s lookout can be climbed to');

// nothing (trees, undergrowth, clutter) sits where a base's walls or lockers go
for (const b of levelBases(L)) {
  const cells = [...b.build_spots.map(sp => [sp.x, sp.z]), ...b.wall_plan.flatMap(r => Array.from({ length: r.w * r.d }, (_, i) => [r.x + (i % r.w), r.z + Math.floor(i / r.w)]))];
  const taken = cells.filter(([x, z]) => { const y = Math.round(terrainHeight(world.terrain, x + 0.5, z + 0.5)); return [V.TRUNK, V.WRECK].includes(getV(world.grid, x, y, z)) || isShrub(world.grid, x, y, z); });
  check(taken.length === 0, `base "${b.name}": its wall line and build spots are clear (${taken.map(c => c.join(',')).join('; ') || 'all clear'})`);
}

// the bench walls: walking straight at one from the pit floor gets you nowhere up
{
  const b = { x: 196.5, y: groundAt(world, 196.5, 50, 3), z: 50, vy: 0, onGround: true };
  const y0 = b.y;
  for (let i = 0; i < 120; i++) moveBody(world, b, 0, -0.08, 1 / 60);   // north, towards the wall
  check(b.y < y0 + 0.7, `the pit's bench walls can't be walked up (still at ${b.y.toFixed(1)} m after walking into one)`);
}
// the haul road: the floor connects to the rim
check(reach(176, 68, 3) && reach(200, 74, 3), 'the haul road leads from the rim down to the pit floor');

// trees: solid; an RPG brings one down, leaving its stump; its canopy is gone with it
{
  const trees = world.level.trees.filter(t => t.kind === 'broadleaf');
  check(trees.length > 500 && world.level.shrubs.length > 400, `a forest: ${trees.length} trees, ${world.level.shrubs.length} undergrowth patches`);
  const t = trees[Math.floor(trees.length / 2)];
  const b = { x: t.x - 1.5, y: groundAt(world, t.x - 1.5, t.z + 0.5, 30), z: t.z + 0.5, vy: 0, onGround: true };
  for (let i = 0; i < 60; i++) moveBody(world, b, 0.05, 0, 1 / 60);
  check(b.x < t.x, 'a tree trunk is solid: you can\'t walk through it');
  const hit = traceSegment(world, t.x - 5, t.y + 1.5, t.z + 0.5, t.x + 5, t.y + 1.5, t.z + 0.5);
  check(hit && hit.kind === 'block' && Math.floor(hit.x) === t.x, 'and it stops bullets');
  explode(world, t.x - 0.5, t.y + 1.5, t.z + 0.5, data.weapons.rpg7, null);
  explode(world, t.x - 0.5, t.y + 1.5, t.z + 0.5, data.weapons.rpg7, null);
  const piece = world.pieces[t.piece - 1];
  const left = t.stump - terrainHeight(world.terrain, t.x + 0.5, t.z + 0.5);
  check(!piece.alive && getV(world.grid, t.x, t.stump - 1, t.z) === V.TRUNK && getV(world.grid, t.x, t.stump, t.z) === V.AIR && left >= 0.9 && left <= 1.6,
    `rockets bring a tree down, leaving a stump ${left.toFixed(1)} m tall (low cover)`);
}

// undergrowth: walk and shoot through it, but it hides you (unless close)
{
  const s = world.level.shrubs.find(q => q.kind === 'fern' && q.h === 2 && getV(world.grid, q.x - 6, q.y, q.z) === V.AIR && isShrub(world.grid, q.x, q.y + 1, q.z) && !isShrub(world.grid, q.x - 6, q.y + 1, q.z) && !isShrub(world.grid, q.x + 4, q.y + 1, q.z));
  const b = { x: s.x - 1, y: groundAt(world, s.x - 1, s.z + 0.5, 30), z: s.z + 0.5, vy: 0, onGround: true };
  for (let i = 0; i < 40; i++) moveBody(world, b, 0.06, 0, 1 / 60);
  check(b.x > s.x + 0.8, 'you walk straight through undergrowth');
  const y = s.y + 1.5;
  check(!traceSegment(world, s.x - 0.6, y, s.z + 0.5, s.x + 1.6, y, s.z + 0.5), 'bullets pass through it');
  check(hiddenByShrubs(world, s.x - 8, y, s.z + 0.5, s.x + 3, y, s.z + 0.5), 'but someone behind it is hidden from an enemy 11 m away');
  check(!hiddenByShrubs(world, s.x - 1, y, s.z + 0.5, s.x + 1.5, y, s.z + 0.5), 'and seen again from 2.5 m away');
}

// blasting: DETONATE, a siren, then the charges bring rock down on the benches below
{
  const w = createWorld({ data, levelId: 'kambala', seed: 9, playerIds: ['p1', 'p2'] });
  const guest = createWorld({ data, levelId: 'kambala', seed: 9, playerIds: ['p1', 'p2'] });
  w.enemies = []; w.groups = []; w.waves.nextT = 1e9;
  const B = L.blasting, q = w.players[0], q2 = w.players[1];
  const step = (cmd = {}, n = 1) => { for (let i = 0; i < n; i++) { stepWorld(w, { p1: cmd, p2: {} }, 1 / 60); w.events.length = 0; } };
  const detonateNow = ww => { detonate(ww, ww.players[0]); ww.blast.sirenT = 0; stepWorld(ww, { p1: {}, p2: {} }, 1 / 60); ww.events.length = 0; };
  const place = (a, x, z) => { a.x = x; a.z = z; a.y = groundAt(w, x, z, 30); };
  check(B && B.charges.length >= 15 && B.unstable.length === 3, `the pit has a detonator, ${B.charges.length} charges on its bench walls and ${B.unstable.length} unstable faces`);
  place(q, B.detonator.x - 0.6, B.detonator.z + 0.5);
  place(q2, 130, 130);
  step();
  check(q.context && q.context.kind === 'detonate' && q.context.label === 'DETONATE', 'next to the detonator: DETONATE');
  // someone standing at a charge, and how much rock there is before
  const c = B.charges[Math.floor(B.charges.length / 2)];
  const e = spawnEnemy(w, { x: c.x + 0.5, y: c.y, z: c.z + 0.5, weapon: 'ak47', type: 'insurgent' });
  const rocks0 = w.pieces.length;
  const evs = [];
  stepWorld(w, { p1: { interact: true }, p2: {} }, 1 / 60); evs.push(...w.events); w.events.length = 0;
  check(w.blast.state === 'siren' && evs.some(v => v.type === 'siren'), 'pressing it sounds the siren');
  step({}, 60 * 4);
  check(w.pieces.length === rocks0 && e.alive, 'nothing happens for the first seconds (time to get clear)');
  step({}, 70);
  check(w.pieces.length > rocks0 + 10, `then the charges go off and rock comes down (${w.pieces.length - rocks0} slabs)`);
  check(!e.alive || e.hp < 40, `someone standing below a charge is killed or badly hurt (${e.alive ? Math.round(e.hp) + ' health' : 'killed'})`);
  step();
  check(q.context && q.context.kind === 'blastWait' && /DETONATOR \d+ s/.test(q.context.label), `then it recharges (${q.context && q.context.label})`);
  step({ interact: true }, 1);
  check(w.blast.state === 'idle', 'and can\'t be pressed again yet');
  step({}, 60 * 61);
  check(q.context && q.context.kind === 'detonate', 'a minute later it is ready again');
  // an RPG next to an unstable face brings it down
  const u = B.unstable[0], before = w.pieces.length;
  explode(w, u.x + 0.5, u.y - 1.5, u.z + 0.5, data.weapons.rpg7, q);
  check(w.blast.collapsed.includes(0) && w.pieces.length > before, `a rocket at an unstable face brings it down (${w.pieces.length - before} slabs)`);
  // ten blasts later, the haul road still leads down to the floor
  for (let n = 0; n < 10; n++) { w.blast.readyAt = 0; w.blast.state = 'idle'; detonateNow(w); }
  const nav2 = buildNav(w);
  const f2 = flowField(nav2, [nodeAt(nav2, 128, groundAt(w, 128, 134, 30), 134)]);
  const r2 = (x, z) => { const n = nodeAt(nav2, x, groundAt(w, x, z, 3), z); return n >= 0 && f2[n] >= 0; };
  check(r2(176, 68) && r2(196, 74), 'after ten blasts the haul road still leads down to the pit floor');
  // co-op: the partner's phone drops the same rocks
  const snap = createHostEncoder(data).encode(w);
  createGuestDecoder(data).apply(guest, snap, 'p2');
  const same = guest.pieces.length === w.pieces.length && w.pieces.slice(rocks0).every((p, i) => guest.pieces[rocks0 + i] && guest.pieces[rocks0 + i].cells.join() === p.cells.join());
  check(same, `co-op: the partner sees exactly the same fallen rock (${guest.pieces.length - rocks0} of ${w.pieces.length - rocks0} slabs)`);
}

// weather: downpours anywhere, mist banks in the forest
{
  const rain = world.weather.find(z => z.type === 'rain'), mist = world.weather.filter(z => z.type === 'mist');
  check(rain && mist.length === 2, 'Kambala has passing downpours and two mist zones');
  rain.active = true; rain.intensity = 1;
  check(stormAt(world, 20, 20) > 0.5 && stormAt(world, 230, 230) > 0.5 && stormAt(world, 20, 20) < 0.7, `a downpour covers the whole map and cuts sight less than a sandstorm (${stormAt(world, 20, 20).toFixed(2)})`);
  rain.active = false; rain.intensity = 0;
  for (const m of mist) { m.active = true; m.intensity = 1; }
  check(stormAt(world, 50, 60) > 0.7 && stormAt(world, 200, 200) === 0 && stormAt(world, 200, 60) === 0, 'mist settles in the forest, not on the mine or the village');
  for (const m of mist) { m.active = false; m.intensity = 0; }
}

// Kambala's own fighters: the groups and the attack waves use the four Kambala types
{
  const types = new Set(world.enemies.map(e => e.type));
  const want = ['kambala_militant', 'khat_addict', 'khat_berserker', 'kambala_mercenary'];
  check(want.every(t => types.has(t)) && types.size === 4, `the garrisons are Kambala militants, mercenaries and Khat addicts and berserkers (${[...types].join(', ')})`);
  check(world.enemies.filter(e => e.type === 'kambala_mercenary').every(e => e.armour >= 30), 'every Kambala mercenary wears at least 30 armour');
  check(world.enemies.filter(e => e.type === 'khat_berserker').every(e => e.weapon.w === 'machete'), 'Khat berserkers carry machetes');
  const w = createWorld({ data, levelId: 'kambala', seed: 11 });
  const before = w.enemies.length;
  for (let n = 0; n < 6; n++) spawnWave(w);
  const wave = w.enemies.slice(before), wt = new Set(wave.map(e => e.type));
  check(wave.length > 0 && [...wt].every(t => want.includes(t)), `the attack waves bring Kambala's fighters, not Najaf's (${[...wt].join(', ')})`);
  const badKit = wave.filter(e => (e.type === 'khat_berserker') !== (e.weapon.w === 'machete'));
  check(badKit.length === 0, `only berserkers come at you with machetes (${badKit.map(e => e.type + ':' + e.weapon.w).join('; ') || 'all right'})`);
}

// the machete: a berserker only cuts you within 1 m, and leaves no machete behind
{
  const w = createWorld({ data, levelId: 'kambala', seed: 12 });
  for (const e of w.enemies) e.alive = false;
  w.enemies.length = 0;
  w.waves.started = false;
  const p = w.players[0];
  const e = spawnEnemy(w, { x: p.x + 1.5, y: p.y, z: p.z, weapon: 'machete', type: 'khat_berserker' });
  e.alert = true; e.sees = true;
  const life = () => p.hp + p.armour;
  const hold = (dist, secs) => {
    for (let i = 0; i < secs * 60; i++) {
      e.x = p.x + dist; e.z = p.z; e.y = p.y;
      stepWorld(w, { [p.id]: {} }, 1 / 60); w.events.length = 0;
    }
  };
  const l0 = life();
  hold(1.5, 3);
  check(life() === l0, `a berserker 1.5 m away can't reach you (${l0} → ${life()})`);
  hold(0.8, 3);
  check(life() < l0, `a berserker within 1 m hacks you down (${l0} → ${life()})`);
  // a machete fighter never leaves a machete to pick up
  const pk0 = w.pickups.length;
  e.hp = 1; damageActor(w, e, 100, 0, p);
  check(!e.alive && !w.pickups.slice(pk0).some(k => k.weapon === 'machete' || k.type === 'weapon'), 'a dead berserker drops no machete');
  // and he runs at you from further away
  const w2 = createWorld({ data, levelId: 'kambala', seed: 13 });
  w2.enemies.length = 0; w2.waves.started = false;
  const p2 = w2.players[0];
  const e2 = spawnEnemy(w2, { x: p2.x + 5, y: p2.y, z: p2.z, weapon: 'machete', type: 'khat_berserker' });
  e2.alert = true;
  for (let i = 0; i < 60; i++) { stepWorld(w2, { [p2.id]: {} }, 1 / 60); w2.events.length = 0; }
  check(Math.hypot(e2.x - p2.x, e2.z - p2.z) < 2, `a berserker charges straight at you (5 m → ${Math.hypot(e2.x - p2.x, e2.z - p2.z).toFixed(1)} m away)`);
}

process.exit(failures ? 1 : 0);

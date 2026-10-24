// Checks for grenades, armour plates from heavy insurgents, and suicide bombers.
// Usage: node tests/combat-items.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { buildData, parseCsv, byKey } from '../src/data/parse.js';
import { gameDataFromXlsx } from '../src/data/xlsx.js';
import { createWorld } from '../src/sim/world.js';
import { stepWorld } from '../src/sim/step.js';
import { killActor, damageActor, dropPickup } from '../src/sim/damage.js';
import { spawnEnemy } from '../src/sim/enemies.js';
import { spawnWave } from '../src/sim/waves.js';
import { groundAt } from '../src/sim/body.js';

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
const S = data.settings, G = data.weapons.rgd5;
const allEvents = [];
const step = (w, cmd = {}, n = 1) => { for (let i = 0; i < n; i++) { stepWorld(w, { p1: cmd }, 1 / 60); allEvents.push(...w.events); w.events.length = 0; } };
// an empty, quiet patch of the crossroads to test on
const fresh = seed => {
  const w = createWorld({ data, levelId: 'najaf', seed });
  w.enemies = []; w.groups = []; w.waves.nextT = 1e9; w.pickups = [];
  const p = w.players[0];
  Object.assign(p, { x: 128.5, z: 150.5, yaw: 0, pitch: 0, hp: 100, armour: 0 });
  p.y = groundAt(w, p.x, p.z, 30);
  step(w, {}, 2);
  return w;
};

check(G && G.projectile === 'grenade' && G.max_total === 5, 'the RGD-5 is read from the workbook as a thrown weapon (carry up to 5)');
check(data.weapons.mk14ebr.scope === 4 && data.weapons.ak47.scope === 0, 'the Mk14 EBR has a 4× scope (Scope magnification column); other guns use iron sights');
{
  // carrying a crate no longer slows you down
  const w = fresh(9), p = w.players[0];
  const x0 = p.z; step(w, { move: { x: 0, y: -1 }, yaw: 0 }, 30); const free = x0 - p.z;
  p.carrying = { item: 'construction_crate', origin: { x: 0, y: 0, z: 0 } };
  const x1 = p.z; step(w, { move: { x: 0, y: -1 }, yaw: 0 }, 30); const loaded = x1 - p.z;
  check(Math.abs(free - loaded) < 0.01, `carrying a crate doesn't slow you down (${free.toFixed(2)} m vs ${loaded.toFixed(2)} m in half a second)`);
}
const PLATE = (data.enemies.heavy_insurgent.drops || []).find(d => d.type === 'armour')?.amount;
check(PLATE > 0, `heavy insurgents drop a ${PLATE}-point armour plate (Item drop column)`);

// armour plate
{
  const w = fresh(1), p = w.players[0];
  const e = spawnEnemy(w, { x: p.x + 4, z: p.z, weapon: 'ak47', type: 'heavy_insurgent' });
  killActor(w, e, p);
  const plate = w.pickups.find(k => k.type === 'armour');
  check(plate && plate.amount === PLATE, 'a dead heavy insurgent leaves an armour plate');
  p.x = plate.x; p.z = plate.z; step(w, {}, 2);
  check(p.armour === PLATE, `walking over it gives ${PLATE} armour (${p.armour})`);
}

// grenades: picking up, carrying, throwing
{
  const w = fresh(2), p = w.players[0];
  check(p.grenades === 0, 'you start without grenades');
  step(w, { grenade: true }, 1);
  check(!w.projectiles.some(x => x.kind === 'grenade'), 'no grenades: the grenade button does nothing');
  dropPickup(w, { type: 'grenade', amount: 2, x: p.x, y: p.y, z: p.z });
  step(w, {}, 2);
  check(p.grenades === 2, `a grenade pickup gives 2 (${p.grenades})`);
  for (let i = 0; i < 3; i++) dropPickup(w, { type: 'grenade', amount: 2, x: p.x, y: p.y, z: p.z });
  step(w, {}, 2);
  check(p.grenades === 5 && w.pickups.some(k => k.type === 'grenade'), 'at most 5 are carried; the rest stays on the ground');
  w.pickups = [];
  // an enemy 14 m ahead (north), standing still
  const target = spawnEnemy(w, { x: p.x, z: p.z - 14, weapon: 'ak47', type: 'militia' });
  target.hp = 1e4; target.alert = false;
  const mag = p.slots[0].mag;
  p.pitch = 0.1;
  allEvents.length = 0;
  step(w, { grenade: true, fire: true, yaw: 0, pitch: 0.1 }, 1);
  step(w, { fire: true, yaw: 0, pitch: 0.1 }, Math.round(S.grenades.throw_time * 60) - 2);
  check(p.grenades === 4 && p.slots[0].mag === mag, 'a toss uses one grenade, and you cannot fire while throwing');
  const gr = w.projectiles.find(x => x.kind === 'grenade');
  check(!!gr, 'the grenade leaves your hand during the toss');
  let boom = null, t = 0, minD = 99;
  while (!boom && t < 6) {
    step(w, {}, 1); t += 1 / 60;
    const g = w.projectiles.find(x => x.kind === 'grenade');
    if (g) minD = Math.min(minD, Math.hypot(g.x - target.x, g.z - target.z));
    boom = allEvents.find(e => e.type === 'explosion');
  }
  const fuse = S.grenades.fuse;
  check(boom && Math.abs(t + S.grenades.throw_time - 2 / 60 - (fuse - S.grenades.release_at) - S.grenades.release_at) < 0.5 + S.grenades.throw_time,
    `it goes off on its fuse, ${fuse} s after the throw (went off after ${(t + S.grenades.throw_time).toFixed(1)} s)`);
  check(allEvents.some(e => e.type === 'bounce'), 'it bounced on the way');
  const dist = Math.hypot(boom.x - p.x, boom.z - p.z);
  check(dist > 8 && dist < 40, `thrown a sensible distance (${dist.toFixed(1)} m)`);
  // a fresh enemy right at the blast point takes grenade damage
  const w2 = fresh(3), q = w2.players[0];
  const near = spawnEnemy(w2, { x: q.x + 1, z: q.z - 10, weapon: 'ak47', type: 'militia' });
  w2.projectiles.push({ id: w2.nextId++, owner: q.id, team: 'player', weapon: 'rgd5', kind: 'grenade', x: near.x, y: near.y + 0.3, z: near.z + 1, vx: 0, vy: 0, vz: 0, life: 0.1, rest: true });
  step(w2, {}, 10);
  check(!near.alive || near.hp < 100, `the blast hurts an enemy next to it (health ${Math.max(0, Math.round(near.hp))})`);
}

// resupply and enemy drops
{
  const w = fresh(4), p = w.players[0];
  dropPickup(w, { type: 'resupply', amount: 30, x: p.x, y: p.y, z: p.z });
  step(w, {}, 2);
  check(p.grenades === S.grenades.supply_gives, `the ammunition supply's box also gives ${S.grenades.supply_gives} grenade`);
  let drops = 0;
  for (let i = 0; i < 60; i++) {
    const e = spawnEnemy(w, { x: p.x + 30, z: p.z, weapon: 'ak47', type: i % 2 ? 'insurgent' : 'heavy_insurgent' });
    killActor(w, e, p);
  }
  drops = w.pickups.filter(k => k.type === 'grenade').length;
  const expect = 30 * (S.grenades.drop_chance.insurgent + S.grenades.drop_chance.heavy_insurgent);
  check(drops > expect * 0.4 && drops < expect * 1.8, `insurgents and heavy insurgents sometimes drop a grenade (${drops} from 60, about ${Math.round(expect)} expected)`);
  const m = spawnEnemy(w, { x: p.x + 30, z: p.z, weapon: 'ak47', type: 'militia' });
  const before = w.pickups.filter(k => k.type === 'grenade').length;
  killActor(w, m, p);
  check(w.pickups.filter(k => k.type === 'grenade').length === before, 'militia never drop grenades');
}

// suicide bombers
{
  const w = fresh(5), p = w.players[0];
  p.hp = 100; p.armour = 0;
  const b = spawnEnemy(w, { x: p.x, z: p.z - 18, weapon: 'rgd5', type: 'suicide_bomber' });
  allEvents.length = 0;
  let t = 0;
  while (b.alive && t < 15) { step(w, { yaw: 0 }, 1); t += 1 / 60; }
  const blast = allEvents.find(e => e.type === 'explosion');
  check(!b.alive && blast && Math.hypot(blast.x - p.x, blast.z - p.z) < 1.6, `a bomber runs at you and blows himself up within about 1 m (after ${t.toFixed(1)} s)`);
  check(p.hp < 100 - G.damage_health * 0.5 + 1, `you take grenade damage (health ${Math.round(p.hp)})`);
  check(!w.pickups.some(k => k.type === 'weapon' || k.type === 'ammo'), 'he drops nothing');
  check(allEvents.some(e => e.type === 'beep'), 'he beeps as he closes in');
  // shot before he gets there: his vest goes off where he falls, hurting those nearby
  const w2 = fresh(6), q = w2.players[0];
  const b2 = spawnEnemy(w2, { x: q.x, z: q.z - 20, weapon: 'rgd5', type: 'suicide_bomber' });
  const mate = spawnEnemy(w2, { x: q.x + 1.2, z: q.z - 20, weapon: 'ak47', type: 'militia' });
  allEvents.length = 0;
  damageActor(w2, b2, 500, 500, q);
  step(w2, {}, 1);
  check(!b2.alive && allEvents.some(e => e.type === 'explosion') && (!mate.alive || mate.hp < 100) && q.hp === 100,
    'shot dead, his vest explodes where he falls (hurting the enemy beside him, not you 20 m away)');
}

// waves bring suicide bombers from wave 2
{
  const w = fresh(7);
  w.base.claimed = true; w.waves.started = true;
  const types = [];
  for (let i = 0; i < 6; i++) { w.waves.queue = []; spawnWave(w); types.push(...w.enemies.filter(e => e.wave).map(e => e.type), ...w.waves.queue.map(a => a.type)); w.enemies = []; }
  const first = (() => { const v = createWorld({ data, levelId: 'najaf', seed: 8 }); v.enemies = []; v.base.claimed = true; v.waves.started = true; spawnWave(v); return [...v.enemies.map(e => e.type), ...v.waves.queue.map(a => a.type)]; })();
  check(types.includes('suicide_bomber') && !first.includes('suicide_bomber'), `attack waves bring suicide bombers, but not the first wave (${types.filter(t => t === 'suicide_bomber').length} in 6 waves)`);
}

process.exit(failures ? 1 : 0);

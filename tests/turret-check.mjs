// Checks the automatic turret: the level 3 ammunition supply hands one out per player; you
// carry it (no shooting), DROP it on a good spot, PICK it UP again; it shoots enemies it sees,
// enemies shoot it, and once destroyed it drops nothing and the armoury hands out a new one.
// Usage: node tests/turret-check.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { buildData, parseCsv, byKey } from '../src/data/parse.js';
import { gameDataFromXlsx } from '../src/data/xlsx.js';
import { createWorld } from '../src/sim/world.js';
import { stepWorld } from '../src/sim/step.js';
import { groundAt } from '../src/sim/body.js';
import { applyUpgrade, armouryWeapons, levelBases } from '../src/sim/base.js';
import { damageActor, killActor } from '../src/sim/damage.js';
import { spawnEnemy } from '../src/sim/enemies.js';
import { placementFor, placeTurret, turretOut } from '../src/sim/turrets.js';
import { lineOfSight } from '../src/sim/ballistics.js';
import { createHostEncoder, createGuestDecoder } from '../src/net/snapshot.js';

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
  settings: JSON.parse(read('data/settings.json')), levels: { najaf: loadLevel('najaf') }
});

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${msg}`); if (!ok) failures++; };

const T = data.allies.turret, G = data.weapons.turret;
check(T && T.health === 100 && T.armour === 300 && T.move_speed === 0 && T.sight_range === 50 && T.burst_min === 5 && T.burst_max === 10,
  `Allies tab read: the turret has ${T && T.health} health, ${T && T.armour} armour, sight ${T && T.sight_range} m, bursts ${T && T.burst_min}–${T && T.burst_max}`);
check(G && G.rate_of_fire === 1200 && G.calibre === '5.56mm' && G.damage_health === 20 && G.damage_armour === 20,
  `its gun (Weapons tab "Turret"): ${G && G.rate_of_fire} rounds a minute, ${G && G.calibre}, ${G && G.damage_health}/${G && G.damage_armour} damage`);

const w = createWorld({ data, levelId: 'najaf', seed: 31 });
w.enemies = []; w.groups = []; w.waves.nextT = 1e9;
const events = [];
const step = (cmd = {}, n = 1) => { for (let i = 0; i < n; i++) { stepWorld(w, { p1: cmd }, 1 / 60); events.push(...w.events); w.events.length = 0; } };
const b = levelBases(data.levels.najaf).find(x => x.id === 'police_station');
const spot = b.build_spots.find(s => s.upgrade === 'ammo');
const p = w.players[0];
const standAt = (x, z, yaw = p.yaw) => { p.x = x; p.z = z; p.y = groundAt(w, x, z, 30); p.yaw = yaw; };
standAt(b.build_spots[0].x + 0.5, b.build_spots[0].z + 0.5);
step({}, 20);
applyUpgrade(w, 'ammo', 1); applyUpgrade(w, 'ammo', 2);
check(!armouryWeapons(w).includes('turret'), 'no turret from a level 2 ammunition supply');
applyUpgrade(w, 'ammo', 3);
check(armouryWeapons(w).includes('turret'), 'the level 3 ammunition supply offers the turret');

// at the locker
const sx = spot.x + 0.5, sz = spot.z + 0.5;
for (const [dx, dz] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) { standAt(sx + dx, sz + dz); step(); if (p.context && p.context.kind === 'armoury') break; }
const slotsBefore = JSON.stringify(p.slots);
step({ armoury: 'turret' });
check(p.carrying && p.carrying.turret === 'turret' && JSON.stringify(p.slots) === slotsBefore, 'taking it puts the turret in your hands (your guns stay as they were)');
const shots = p.stats.shots;
p.slots[p.active].mag = 5;
step({ fire: true }, 20);
check(p.stats.shots === shots, 'no shooting while carrying it');

// find open ground nearby and face it
let found = false;
for (let r = 3; r < 14 && !found; r += 1.5) for (let a = 0; a < 16 && !found; a++) {
  standAt(sx + Math.cos(a) * r, sz + Math.sin(a) * r);
  for (let k = 0; k < 8; k++) { p.yaw = k * Math.PI / 4; step(); if (p.place && p.place.ok && p.context && p.context.kind === 'dropTurret') { found = true; break; } }
}
check(found && p.context.label === 'DROP', 'carrying it to open ground shows where it goes, and a DROP button');
const at = { ...p.place };
step({ interact: true });
const t = w.turrets[0];
check(t && t.alive && !p.carrying && Math.hypot(t.x - at.x, t.z - at.z) < 0.01 && t.owner === 'p1', 'DROP sets it down exactly where it was shown');

// a second turret? not while this one stands
for (const [dx, dz] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) { standAt(sx + dx, sz + dz); step(); if (p.context && p.context.kind === 'armoury') break; }
step({ armoury: 'turret' });
check(!p.carrying && turretOut(w, p) === 'placed', 'one turret per player: the armoury gives no second one while yours stands');

// bad spots: inside a wall, on top of another turret
let wallBlocked = false;
for (let a = 0; a < 64 && !wallBlocked; a++) {
  const r = 2 + (a % 8);
  standAt(sx + Math.cos(a * 0.7) * r, sz + Math.sin(a * 0.7) * r);
  for (let k = 0; k < 8; k++) {
    p.yaw = k * Math.PI / 4;
    const pl = placementFor(w, p);
    const tx = Math.floor(pl.x), tz = Math.floor(pl.z), ty = Math.floor(pl.y + 0.5);
    if (!pl.ok && w.grid.cells[tx + w.grid.w * (ty + w.grid.h * tz)] && Math.abs(groundAt(w, pl.x, pl.z, p.y + 1.2) - p.y) < 0.3) { wallBlocked = true; break; }
  }
}
check(wallBlocked, 'it can\'t be dropped into a wall');
standAt(t.x + Math.sin(0) * 1.6, t.z + Math.cos(0) * 1.6, 0);   // looking straight at the turret
check(!placementFor(w, p).ok, 'it can\'t be dropped on top of another turret');

// pick it up again (keeps its damage)
standAt(t.x + 1.2, t.z);
t.hp = 70;
step();
check(p.context && p.context.kind === 'pickupTurret' && p.context.label === 'PICK UP TURRET', 'next to your turret: PICK UP TURRET');
step({ interact: true });
check(p.carrying && p.carrying.turret && p.carrying.hp === 70 && !w.turrets.some(x => x.alive), 'picking it up puts it back in your hands, damage and all');

// set it down facing an enemy in the open and see it fight
const t2 = placeTurret(w, p, p.carrying, at.x, at.y, at.z, 0); p.carrying = null;
standAt(t2.x + 40, t2.z + 40);   // the player is out of the way
let ex = null;
for (let a = 0; a < 32 && !ex; a++) {
  const ang = a * Math.PI / 16, d = 10;
  const x = t2.x - Math.sin(ang) * d, z = t2.z - Math.cos(ang) * d, y = groundAt(w, x, z, 30);
  // a clear line both ways: from the gun to the enemy's chest, and from his eyes to the turret
  if (lineOfSight(w, t2.x, t2.y + 1.1, t2.z, x, y + 1.15, z) && lineOfSight(w, x, y + 1.55, z, t2.x, t2.y + 0.95, t2.z) && Math.abs(y - t2.y) < 2) ex = { x, y, z, ang };
}
const e = spawnEnemy(w, { x: ex.x, y: ex.y, z: ex.z, weapon: 'ak47', type: 'insurgent' });
e.yaw = Math.atan2(-(t2.x - e.x), -(t2.z - e.z));
t2.yaw = t2.home = ex.ang;
const hp0 = e.hp + e.armour;
events.length = 0;
const hold = (who, n) => { for (let i = 0; i < n; i++) { step(); if (who.alive) { who.x = ex.x; who.z = ex.z; } } };   // he stays put
hold(e, 60 * 4);
const turretShots = events.filter(v => v.type === 'shot' && v.team === 'turret').length;
check(turretShots >= 5, `the turret fires bursts at an enemy it sees (${turretShots} shots in 4 s)`);
check(!e.alive || e.hp + e.armour < hp0, `and hits him (${e.alive ? `health ${Math.round(e.hp)}` : 'killed'})`);
check(!e.alive ? p.stats.kills >= 1 : true, 'its kills count for the player who set it down');

// enemies treat it like a player: they target it and shoot it
const hpT = t2.hp + t2.armour;
const e2 = spawnEnemy(w, { x: ex.x, y: ex.y, z: ex.z, weapon: 'ak47', type: 'insurgent', wave: true });
e2.armour = 10000; e2.hp = 10000;   // tough enough to survive the turret meanwhile
e2.yaw = Math.atan2(-(t2.x - e2.x), -(t2.z - e2.z));
hold(e2, 60 * 12);
check(e2.targetId === t2.id, 'an enemy who sees the turret takes it as his target');
check(t2.hp + t2.armour < hpT, `and shoots it (health and armour ${Math.round(hpT)} → ${Math.round(t2.hp + t2.armour)})`);

// destroyed: gone, no drops, a new one from the armoury
const pickups = w.pickups.length;
damageActor(w, t2, 1e6, 1e6, e2);
check(!t2.alive && w.pickups.length === pickups, 'a destroyed turret is gone and drops nothing');
check(turretOut(w, p) === null, 'and the ammunition supply will hand out a new one');
for (const [dx, dz] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) { standAt(sx + dx, sz + dz); step(); if (p.context && p.context.kind === 'armoury') break; }
step({ armoury: 'turret' });
check(p.carrying && p.carrying.turret === 'turret', 'taking the new one works');

// falling while carrying it: it is set down where you fall
killActor(w, p, null);
check(!p.carrying && w.turrets.some(x => x.alive && x.owner === 'p1'), 'going down while carrying it sets it down at your feet');

// co-op: the partner's phone gets the turrets
{
  const host = createWorld({ data, levelId: 'najaf', seed: 5, playerIds: ['p1', 'p2'] });
  const guest = createWorld({ data, levelId: 'najaf', seed: 5, playerIds: ['p1', 'p2'] });
  const q = host.players[0];
  placeTurret(host, q, { turret: 'turret', hp: 100, armour: 300 }, q.x + 2, q.y, q.z, 1);
  host.players[1].carrying = { item: 'turret', turret: 'turret', hp: 100, armour: 300 };
  const snap = createHostEncoder(data).encode(host);
  createGuestDecoder(data).apply(guest, snap, 'p2');
  const gt = guest.turrets[0];
  check(gt && gt.alive && gt.owner === 'p1' && Math.abs(gt.x - (q.x + 2)) < 0.02 && guest.players[1].carrying && guest.players[1].carrying.turret === 'turret',
    'co-op: the partner sees the turret where it stands, and who is carrying one');
}

process.exit(failures ? 1 : 0);

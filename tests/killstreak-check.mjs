// Checks kill streaks and the mortar strike: 10 kills (not the turret's) make it available,
// the count keeps climbing, going down loses it; the button puts the laser designator in your
// hands (no shooting), SWAP puts it away and keeps the strike; calling it in counts down 5 s,
// then 5 shells land over 3 s within 8 m of the laser spot, on a roof if the spot is a building;
// they hurt players too, their kills count, and the partner's phone sees it all.
// Usage: node tests/killstreak-check.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { buildData, parseCsv, byKey } from '../src/data/parse.js';
import { gameDataFromXlsx } from '../src/data/xlsx.js';
import { createWorld } from '../src/sim/world.js';
import { stepWorld } from '../src/sim/step.js';
import { groundAt } from '../src/sim/body.js';
import { killActor, damageActor } from '../src/sim/damage.js';
import { spawnEnemy } from '../src/sim/enemies.js';
import { strikeFor, laserPoint, streakProgress } from '../src/sim/killstreaks.js';
import { gunshipPos, startGunship } from '../src/sim/gunship.js';
import { createHostEncoder, createGuestDecoder } from '../src/net/snapshot.js';
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
  killstreaksCsv: read('data/killstreaks.csv'),
  settings: JSON.parse(read('data/settings.json')), levels: { najaf: loadLevel('najaf') }
});

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${msg}`); if (!ok) failures++; };

const M = data.weapons.mortar, K = data.killstreaks.find(k => k.id === 'mortar');
check(M && M.projectile === 'mortar' && M.damage_health === 100 && M.area_of_effect === 40, `Weapons tab "Mortar": ${M && M.damage_health}/${M && M.damage_armour} damage, blast ${M && M.area_of_effect}, projectile ${M && M.projectile}`);
check(K && K.kills === 10 && K.rounds === 5 && K.duration === 3 && K.scatter === 8 && K.countdown === 5 && K.range === 150,
  `killstreaks.csv: mortar strike at ${K && K.kills} kills, ${K && K.rounds} rounds over ${K && K.duration} s within ${K && K.scatter} m, ${K && K.countdown} s countdown, ${K && K.range} m range`);

const fresh = (ids = ['p1']) => {
  const w = createWorld({ data, levelId: 'najaf', seed: 7, playerIds: ids });
  for (const e of w.enemies) e.alive = false;
  w.enemies = []; w.groups = []; w.waves.nextT = 1e9;
  return w;
};
const tick = (w, cmds = {}, n = 1, evs = null) => {
  for (let i = 0; i < n; i++) {
    stepWorld(w, Object.fromEntries(w.players.map(p => [p.id, cmds[p.id] || {}])), 1 / 60);
    if (evs) evs.push(...w.events);
    w.events.length = 0;
  }
};
const killOne = (w, source) => {
  const p = w.players[0];
  const e = spawnEnemy(w, { x: p.x + 30, z: p.z, weapon: 'ak47' });
  killActor(w, e, source);
};

// ---- counting
{
  const w = fresh(), p = w.players[0];
  for (let i = 0; i < 9; i++) killOne(w, p);
  check(p.streak === 9 && !strikeFor(w, p), 'nine kills: no strike yet');
  w.events.length = 0;
  killOne(w, p);
  check(!!strikeFor(w, p) && w.events.some(e => e.type === 'message' && e.text === 'MORTAR STRIKE AVAILABLE!' && e.playerId === p.id),
    'the tenth kill makes the mortar strike available ("MORTAR STRIKE AVAILABLE!")');
  const turret = { kind: 'turret', owner: p.id, x: p.x, y: p.y, z: p.z };
  killOne(w, turret);
  check(p.streak === 10, 'kills by your turret do not count');
  killOne(w, p); killOne(w, p);
  check(p.streak === 12 && strikeFor(w, p).id === 'mortar', 'the count keeps climbing past 10 (strikes don\'t stack: still one mortar strike)');
  const pr = streakProgress(w, p);
  check(pr && !pr.top && pr.from === 10 && pr.need === 20, `the HUD bar fills from 10 towards the gunship at 20 (${pr && pr.from} → ${pr && pr.need})`);
}

// ---- the designator
{
  const w = fresh(), p = w.players[0];
  for (let i = 0; i < 10; i++) killOne(w, p);
  tick(w, {}, 30);
  const mag = p.slots[p.active].mag, active = p.active;
  tick(w, { p1: { strike: true } });
  check(p.designating, 'the streak button puts the laser designator in your hands');
  tick(w, { p1: { fire: false } }); tick(w, { p1: { reload: true } });
  check(p.slots[p.active].mag === mag && p.reloadT === 0, 'with the designator: no reloading, the gun is put away');
  tick(w, { p1: { swap: true } });
  check(!p.designating && p.active === active && !!strikeFor(w, p), 'SWAP puts it away: the same gun is back and the strike is still on offer');
  // the trigger with nothing aimed at (the sky): out of range, keep trying
  tick(w, { p1: { strike: true } });
  const evs = [];
  tick(w, { p1: { strike: true, pitch: 1.2 } }, 1, evs);
  check(p.designating && evs.some(e => e.type === 'message' && e.text === 'OUT OF RANGE'), 'pointing at the sky: OUT OF RANGE, the designator stays up');
  // going down loses it all
  const w2 = fresh(['p1', 'p2']), a = w2.players[0];
  for (let i = 0; i < 12; i++) killOne(w2, a);
  tick(w2, { p1: { strike: true } });
  damageActor(w2, a, 1000, 1000, null);
  check(a.downed && a.streak === 0 && !a.designating && !strikeFor(w2, a), 'going down: the count goes back to 0 and the strike is lost');
}

// ---- the strike
{
  const w = fresh(['p1', 'p2']), p = w.players[0], q = w.players[1];
  for (let i = 0; i < 10; i++) killOne(w, p);
  // look down at the open ground about 35 m ahead
  p.pitch = -Math.atan2(p.y + 1.6 - groundAt(w, p.x, p.z - 35, 30), 35) - 0.02;
  const cmd = { yaw: p.yaw, pitch: p.pitch };
  tick(w, { p1: { ...cmd } }, 2);
  const at = laserPoint(w, p);
  check(!!at && Math.hypot(at.x - p.x, at.z - p.z) < 150, `the laser marks a spot ${at && Math.hypot(at.x - p.x, at.z - p.z).toFixed(0)} m away`);
  // the partner and an enemy stand on the spot; the enemy should die and count
  q.x = at.x + 1; q.z = at.z; q.y = groundAt(w, q.x, q.z, 30); q.hp = 1000; q.armour = 0;
  const e = spawnEnemy(w, { x: at.x - 1, z: at.z, weapon: 'ak47' }); e.alert = false; e.sees = false; e.seeT = 1e9;
  const evs = [];
  tick(w, { p1: { ...cmd, strike: true } }, 1, evs);
  tick(w, { p1: { ...cmd, fire: true } }, 1, evs);
  const called = evs.find(v => v.type === 'strikeCalled');
  // (the blast is 4 m across a scatter of 8 m: put the enemy where the second shell will land)
  const r2 = w.strikes[0] && w.strikes[0].rounds[1];
  if (r2) { e.x = r2.x; e.z = r2.z; e.y = groundAt(w, e.x, e.z, 30); e.home = { x: e.x, y: e.y, z: e.z }; }
  check(!!called && !p.designating && p.streak === 0 && !strikeFor(w, p), 'pulling the trigger calls it in: designator away, count back to 0');
  const t0 = w.time;
  const booms = [];
  for (let i = 0; i < 60 * 10; i++) {
    const ev = [];
    tick(w, { p1: cmd }, 1, ev);
    for (const v of ev) {
      if (v.type === 'explosion') { booms.push({ t: w.time - t0, x: v.x, y: v.y, z: v.z }); }
      if (v.type === 'message') evs.push({ ...v, t: w.time - t0 });
      if (v.type === 'shellIncoming') evs.push({ ...v, t: w.time - t0 });
    }
  }
  const msgs = evs.filter(v => v.type === 'message' && /^INCOMING/.test(v.text)).map(v => v.text);
  check(msgs[0] === 'INCOMING! 5 s' && msgs.includes('INCOMING! 1 s'), `countdown on the HUD: ${msgs.join(', ')}`);
  check(booms.length === 5, `${booms.length} shells land`);
  const ts = booms.map(b => b.t);
  check(ts[0] > 4.8 && ts[0] < 5.3 && ts[4] - ts[0] > 2.6 && ts[4] - ts[0] < 3.4, `first at ${ts[0].toFixed(2)} s, the last ${(ts[4] - ts[0]).toFixed(2)} s later`);
  const far = Math.max(...booms.map(b => Math.hypot(b.x - called.x, b.z - called.z)));
  check(far <= 8.5, `all within 8 m of the spot (furthest ${far.toFixed(1)} m)`);
  check(evs.filter(v => v.type === 'shellIncoming').length === 5, 'each shell whistles in first');
  check(q.hp < 1000, `danger close: the partner standing there is hurt (${1000 - Math.round(q.hp)} damage)`);
  check(!e.alive && p.streak >= 1, `the strike's kills count towards the next streak (count ${p.streak}; enemy alive ${e.alive}, hp ${Math.round(e.hp)}, armour ${Math.round(e.armour)}, at ${(Math.hypot(e.x - called.x, e.z - called.z)).toFixed(1)} m)`);
}

// ---- into a building: onto the roof
{
  const w = fresh(), p = w.players[0];
  for (let i = 0; i < 10; i++) killOne(w, p);
  // find a roofed spot: highest solid block well above the ground
  const g = w.grid;
  let spot = null;
  for (let z = 40; z < 200 && !spot; z += 3) for (let x = 40; x < 200 && !spot; x += 3) {
    let top = -1;
    for (let y = g.h - 1; y >= 0; y--) if (g.cells[x + z * g.w + y * g.w * g.d]) { top = y + 1; break; }
    const ground = terrainHeight(w.terrain, x + 0.5, z + 0.5);
    let solidAll = true;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      let t = -1; for (let y = g.h - 1; y >= 0; y--) if (g.cells[(x + dx) + (z + dz) * g.w + y * g.w * g.d]) { t = y + 1; break; }
      if (t !== top) solidAll = false;
    }
    if (top > ground + 5 && solidAll) spot = { x: x + 0.5, z: z + 0.5, top };
  }
  // call it straight onto that spot from above
  p.x = spot.x; p.z = spot.z - 10; p.y = spot.top + 30;
  const yaw = 0, pitch = -Math.atan2(30, 10);
  w.strikes.push({ id: 999, owner: p.id, weapon: 'mortar', x: spot.x, z: spot.z, t: 0, shown: 0, rounds: [{ t: 2, x: spot.x, z: spot.z, out: false }] });
  const evs = [];
  tick(w, { p1: { yaw, pitch } }, 60 * 4, evs);
  const b = evs.find(v => v.type === 'explosion');
  check(b && b.y > spot.top - 1.5 && b.y < spot.top + 1, `a shell aimed into a building lands on its roof (bursts at ${b && b.y.toFixed(1)} m, roof at ${spot.top} m)`);
}

// ---- co-op: the partner sees the count, the designator and the shells
{
  const w = fresh(['p1', 'p2']), guest = fresh(['p1', 'p2']), p = w.players[0];
  for (let i = 0; i < 11; i++) killOne(w, p);
  tick(w, { p1: { strike: true } });
  w.projectiles.push({ id: 5001, owner: p.id, team: 'player', weapon: 'mortar', kind: 'mortar', x: 50, y: 60, z: 50, vx: 0, vy: -45, vz: 0, life: 3 });
  // (the first, full snapshot of a level is big and drops flying things to fit; the next ones carry them)
  w.enemies = []; w.events.length = 0;   // (the dead from the set-up would fill the message)
  const enc = createHostEncoder(data), dec = createGuestDecoder(data);
  dec.apply(guest, enc.encode(w), 'p2');
  w.tick++;
  dec.apply(guest, enc.encode(w), 'p2');
  const gp = guest.players[0];
  check(gp.streak === 11 && gp.designating && guest.projectiles.some(r => r.kind === 'mortar'), `co-op: the partner's phone has the count, the designator and the falling shells (${gp.streak}, ${gp.designating}, ${guest.projectiles.map(r => r.kind)})`);
}

// ---- the gunship
{
  const GG = data.weapons.gunship_gun, KG = data.killstreaks.find(k => k.id === 'gunship');
  check(GG && GG.rate_of_fire === 1200 && GG.calibre === '7.62x51mm' && GG.damage_health === data.weapons.fal.damage_health && GG.damage_armour === data.weapons.fal.damage_armour,
    `Weapons tab "Gunship gun": ${GG && GG.rate_of_fire} rounds a minute, ${GG && GG.calibre}, ${GG && GG.damage_health}/${GG && GG.damage_armour} damage (the FAL's)`);
  check(KG && KG.kills === 20 && KG.rounds === 600 && KG.duration === 30 && KG.secondary === 'rpg7' && KG.secondary_rounds === 4,
    `killstreaks.csv: gunship at ${KG && KG.kills} kills, ${KG && KG.rounds} rounds, ${KG && KG.duration} s, ${KG && KG.secondary_rounds} × ${KG && KG.secondary}`);
  const aimAt = (w, p, x, y, z) => { const [gx, gy, gz] = gunshipPos(w, p.gunship); const dx = x - gx, dy = y - gy, dz = z - gz; return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }; };

  const w = fresh(['p1', 'p2']), p = w.players[0], q = w.players[1];
  for (let i = 0; i < 20; i++) killOne(w, p);
  check(strikeFor(w, p).id === 'gunship', '20 kills: the gunship replaces the mortar strike on offer');
  const body = [p.x, p.z, p.yaw];
  tick(w, { p1: { strike: true } });
  check(!!p.gunship && p.streak === 0 && p.gunship.ammo === 600 && p.gunship.rockets === 4, 'the streak button sends you up: 600 rounds and 4 rockets, count back to 0');
  const [gx, gy, gz] = gunshipPos(w, p.gunship);
  const gs0 = p.gunship;
  check(gy - p.y > 149 && Math.abs(Math.hypot(gx - gs0.cx, gz - gs0.cz) - 90) < 0.5 && Math.abs(Math.hypot(gs0.cx - p.x, gs0.cz - p.z) - 30) < 0.5,
    `the gunship circles ${Math.round(gy - p.y)} m up, 90 m round a spot ${Math.round(Math.hypot(gs0.cx - p.x, gs0.cz - p.z))} m ahead of you`);
  // an enemy 25 m away: the gun cuts him down (and it counts)
  q.x = p.x + 200; q.z = p.z + 200; q.y = groundAt(w, q.x, q.z, 30);   // partner well away for now
  const e = spawnEnemy(w, { x: p.x + 25, z: p.z, weapon: 'ak47' }); e.seeT = 1e9; e.alert = false;
  for (let i = 0; i < 60 && e.alive; i++) { const a = aimAt(w, p, e.x, e.y + 1, e.z); tick(w, { p1: { ...a, fire: true, move: { x: 1, y: -1 } } }); }
  check(!e.alive && p.streak === 1, `the gun kills an enemy below (${600 - p.gunship.ammo} rounds), and it counts (count ${p.streak})`);
  check(p.x === body[0] && p.z === body[1] && p.yaw === body[2], 'meanwhile your body stays exactly where it was');
  tick(w, { p1: { fire: false } }, 2);
  // the gun at 1,200 a minute: half a second is about 10 rounds
  const a0 = p.gunship.ammo;
  tick(w, { p1: { ...aimAt(w, p, p.x + 30, p.y, p.z), fire: true } }, 30);
  check(Math.abs(a0 - p.gunship.ammo - 10) <= 1, `half a second of fire: ${a0 - p.gunship.ammo} rounds`);
  tick(w, { p1: { fire: false } }, 2);
  // SWAP: rockets, one per press
  tick(w, { p1: { swap: true } }); tick(w, {}, 20);
  check(p.gunship.sel === 1, 'SWAP changes to the rockets');
  const evs = [];
  for (let i = 0; i < 4; i++) { tick(w, { p1: { ...aimAt(w, p, p.x + 30 + i * 3, p.y, p.z + 20), fire: true } }, 1, evs); tick(w, { p1: { fire: false } }, 40, evs); }
  tick(w, {}, 120, evs);
  check(p.gunship.rockets === 0 && evs.filter(v => v.type === "explosion").length >= 4, `4 rockets fired and burst (${evs.filter(v => v.type === "explosion").length} explosions, ${p.gunship.rockets} left, shots ${evs.filter(v => v.type === "gunshipShot").length})`);
  check(p.gunship.sel === 0, 'out of rockets: back to the gun by itself');
  // friendly fire: the partner below gets hit
  q.x = p.x - 20; q.z = p.z; q.y = groundAt(w, q.x, q.z, 30); q.hp = 1e5;
  const ffe = [];
  for (let i = 0; i < 40; i++) tick(w, { p1: { ...aimAt(w, p, q.x, q.y + 1, q.z), fire: true } }, 1, ffe);   // (the gunship moves: keep the aim on him)
  tick(w, { p1: { fire: false } }, 40, ffe);
  check(q.hp < 1e5, `friendly fire: the partner on the ground is hit (${Math.round(1e5 - q.hp)} damage)`);
  // time: 30 s and it's over
  const ev2 = [];
  tick(w, {}, 60 * 31, ev2);
  check(!p.gunship && ev2.some(v => v.type === 'message' && v.text === 'GUNSHIP LEAVING'), 'after 30 seconds the gunship leaves and you are back on the ground');

  // out of both: over at once
  const w2 = fresh(), a = w2.players[0];
  startGunship(w2, a, data.killstreaks.find(k => k.id === 'gunship'), true);
  a.gunship.ammo = 3; a.gunship.rockets = 1;
  tick(w2, { p1: { ...aimAt(w2, a, a.x + 20, a.y, a.z), fire: true } }, 20);
  tick(w2, { p1: { swap: true } }); tick(w2, {}, 20);
  tick(w2, { p1: { ...aimAt(w2, a, a.x + 20, a.y, a.z), fire: true } }, 2);
  check(!a.gunship, 'out of rounds and rockets: the gunship leaves straight away');

  // your body goes down: the gunship is lost
  const w3 = fresh(['p1', 'p2']), b = w3.players[0];
  for (let i = 0; i < 20; i++) killOne(w3, b);
  tick(w3, { p1: { strike: true } });
  damageActor(w3, b, 1e4, 1e4, null);
  check(b.downed && !b.gunship && b.streak === 0, 'your body goes down while you are up there: the gunship is lost at once');

  // co-op: the partner's phone knows your gunship
  const w4 = fresh(['p1', 'p2']), guest = fresh(['p1', 'p2']);
  startGunship(w4, w4.players[0], data.killstreaks.find(k => k.id === 'gunship'), true);
  w4.enemies = []; w4.events.length = 0;
  const enc = createHostEncoder(data), dec = createGuestDecoder(data);
  dec.apply(guest, enc.encode(w4), 'p2'); w4.tick++; dec.apply(guest, enc.encode(w4), 'p2');
  const gg = guest.players[0].gunship;
  check(gg && gg.ammo === 600 && gg.rockets === 4 && Math.abs(gg.cx - w4.players[0].gunship.cx) < 0.02, 'co-op: the gunship (ammunition, where it circles) reaches the partner\'s phone');
}

process.exit(failures ? 1 : 0);

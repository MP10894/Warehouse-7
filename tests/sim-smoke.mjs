// Runs the game rules without any graphics, to catch broken logic quickly.
// Usage: npm run test:sim
import { readFileSync, readdirSync } from 'node:fs';
import { buildData } from '../src/data/parse.js';
import { existsSync } from 'node:fs';
import { gameDataFromXlsx, readSheets } from '../src/data/xlsx.js';
import { parseCsv, byKey } from '../src/data/parse.js';
import { createWorld } from '../src/sim/world.js';
import { stepWorld } from '../src/sim/step.js';
import { groundAt } from '../src/sim/body.js';
import { applyHit } from '../src/sim/damage.js';
import { getV, V } from '../src/sim/grid.js';
import { buildNav, nodeAt, flowField } from '../src/sim/nav.js';
import { createRecoil } from '../src/input/recoil.js';
import { createAimAssist, anglesTo } from '../src/input/aim-assist.js';
import { setV } from '../src/sim/grid.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const lv = 'data/levels/slice/';
const buildings = {};
for (const f of readdirSync(new URL('../' + lv + 'buildings', import.meta.url))) buildings[f] = read(lv + 'buildings/' + f);
const workbook = ['Game Data.xlsx'].map(f => new URL('../data/' + f, import.meta.url)).find(u => existsSync(u));
const gameData = gameDataFromXlsx(readFileSync(workbook), byKey(parseCsv(read('data/enemies.csv')), 'id'));
const data = buildData({
  weaponsRows: gameData.weapons, enemiesRows: gameData.enemies, materialsCsv: read('data/materials.csv'),
  enemiesCsv: read('data/enemies.csv'), wavesCsv: read('data/waves.csv'),
  settings: JSON.parse(read('data/settings.json')),
  levels: { slice: { json: read(lv + 'level.json'), terrain: read(lv + 'terrain.txt'), ground: read(lv + 'ground.txt'), buildings } }
});

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
const dt = 1 / 60;
const run = (world, seconds, cmdFor) => {
  const events = [];
  for (let i = 0; i < seconds / dt && world.status === 'playing'; i++) {
    const cmds = {};
    for (const p of world.players) cmds[p.id] = cmdFor ? cmdFor(p, i) : {};
    stepWorld(world, cmds, dt);
    events.push(...world.events.splice(0));
  }
  return events;
};
const fresh = (opts = {}) => createWorld({ data, levelId: 'slice', ...opts });
const spawnEnemyAt = (w, x, z) => { w.enemies.push({ id: 9000 + w.enemies.length, kind: 'enemy', type: 'insurgent', alive: true, x, z, y: groundAt(w, x, z, 5), hp: 100, armour: 0 }); };
const noEnemies = w => { w.enemies = []; w.groups = []; w.waves.nextT = 1e9; };

// --- data
check(data.weapons.rpg7.calibre === '40mm' && data.calibres['5.56mm'] === data.weapons.m4a1.max_total - data.weapons.m4a1.mag_size, 'weapons loaded from the workbook, ammo caps per calibre');
const semi = buildData({ weaponsRows: [], materialsCsv: '\uFEFFid;health;armour\r\nx;60;2,5\r\n', enemiesCsv: 'id\n', wavesCsv: 'wave\n', settings: {}, levels: {} });
check(semi.materials.x.armour === 2.5, 'reads semicolon CSV with decimal commas (Hungarian Excel)');
check(data.weapons.sig_p320.max_total === 102 && data.weapons.sig_p320.muzzle_velocity === 187, 'Weapons.xlsx formulas worked out (=+C4*6, =374/2)');

check(gameData.enemies && data.enemies.insurgent.reaction_time > 0 && data.enemies.insurgent.burst_max === 5 && data.enemies.insurgent.ammo_drop_max === 30, 'Enemies tab read, including "2 / 5" style min / max cells');
{
  const w = fresh();
  const allowed = data.enemies.insurgent.allowed_weapons || [];
  check(allowed.length > 0 && w.enemies.every(e => allowed.includes(e.weapon.w)), `enemies only carry their possible weapons (${allowed.join(', ')})`);
}

// --- enemy types from the Enemies tab
if (data.enemies.heavy_insurgent) {
  const w = fresh();
  const { spawnEnemy, rollLoadout } = await import('../src/sim/enemies.js');
  const e = spawnEnemy(w, { x: 50, z: 50, weapon: 'ak47', type: 'heavy_insurgent' }) || w.enemies[w.enemies.length - 1];
  const picks = new Set(Array.from({ length: 60 }, () => rollLoadout(w, { ak47: 3, rpg7: 1 }, 0, 0, 'heavy_insurgent').weapon));
  check(e.type === 'heavy_insurgent' && e.armour >= data.enemies.heavy_insurgent.armour && data.enemies.heavy_insurgent.armour > 0 && picks.has('rpk') && !picks.has('rpg7'),
    `enemy types: heavy insurgent wears its armour (${e.armour}) and carries only its own weapons (${[...picks].join(', ')})`);
}

// --- damage rule from DESIGN.md
{
  const t = { hp: 100, armour: 10 };
  applyHit(t, 40, 50);
  check(t.armour === 0 && Math.abs(t.hp - 68) < 1e-9, `armour spill-over: 10 armour, hit 40/50 → health ${t.hp}`);
  const u = { hp: 100, armour: 100 }; applyHit(u, 35, 35);
  check(u.armour === 65 && u.hp === 100, 'armour soaks the whole hit while it lasts');
}

// --- level
const w0 = fresh();
check(w0.players.length === 1 && w0.enemies.length >= 10, `level built: ${w0.enemies.length} enemies, ${w0.pieces.length} destructible pieces, ${w0.pickups.length} pickups`);
{
  // tower at (12,12): roof slab at layer 8, stairs on floor 0 at local (1..3, 1)
  check(getV(w0.grid, 12 + 5, 0, 12 + 1) === V.RAMP_E && getV(w0.grid, 12 + 7, 2, 12 + 1) === V.RAMP_E, 'tower stairs placed, one metre higher per step');
  check(getV(w0.grid, 12 + 5, 2, 12 + 1) === V.AIR, 'stairwell hole cut in the floor above');
  check(Math.abs(groundAt(w0, 18.5, 16.5, 9.6) - 9) < 1e-6, 'roof walkable at 9 m');
}

// --- walking up all the stairs to the roof (follow the path-finding to the crate)
{
  const w = fresh(); noEnemies(w);
  const p = w.players[0];
  p.x = 17.5; p.z = 19.5; p.y = groundAt(w, p.x, p.z, 1);
  const nav = buildNav(w);
  const goal = nodeAt(nav, 18.5, 9, 16.5);
  const field = flowField(nav, [goal]);
  check(goal >= 0 && field[nodeAt(nav, p.x, p.y, p.z)] > 0, `roof reachable on foot (${field[nodeAt(nav, p.x, p.y, p.z)]} steps)`);
  let maxY = 0;
  for (let i = 0; i < 60 * 60; i++) {
    const n = nodeAt(nav, p.x, p.y, p.z);
    if (n < 0 || field[n] === 0) break;
    let best = -1, bd = field[n];
    for (let d = 0; d < 8; d++) { const m = nav.links[n * 8 + d]; if (m >= 0 && field[m] >= 0 && field[m] < bd) { bd = field[m]; best = m; } }
    if (best < 0) break;
    const tx = nav.x[best] + 0.5, tz = nav.z[best] + 0.5;
    p.yaw = Math.atan2(-(tx - p.x), -(tz - p.z));
    stepWorld(w, { p1: { move: { x: 0, y: -1 }, yaw: p.yaw, pitch: 0 } }, dt);
    w.events.length = 0;
    maxY = Math.max(maxY, p.y);
  }
  check(maxY >= 8.9, `player walked up three flights of stairs (reached ${maxY.toFixed(2)} m)`);
  check(p.carrying && p.carrying.item === 'construction_crate', 'picked up the construction crate on the roof');
}

// --- and back down again, carrying the crate (play-test bug 2026-10-23: stuck by a stairwell)
{
  const w = fresh(); noEnemies(w);
  const p = w.players[0];
  p.x = 18.5; p.z = 16.5; p.y = 9;
  p.carrying = { item: 'construction_crate', origin: { x: 18.5, y: 9, z: 16.5 } };
  const nav = buildNav(w);
  const field = flowField(nav, [nodeAt(nav, 17.5, groundAt(w, 17.5, 19.5, 1), 19.5)]);
  let minY = 99;
  for (let i = 0; i < 60 * 90; i++) {
    const n = nodeAt(nav, p.x, p.y, p.z);
    if (n < 0 || field[n] === 0) break;
    let best = -1, bd = field[n];
    for (let d = 0; d < 8; d++) { const m = nav.links[n * 8 + d]; if (m >= 0 && field[m] >= 0 && field[m] < bd) { bd = field[m]; best = m; } }
    if (best < 0) break;
    p.yaw = Math.atan2(-(nav.x[best] + 0.5 - p.x), -(nav.z[best] + 0.5 - p.z));
    stepWorld(w, { p1: { move: { x: 0, y: -1 }, yaw: p.yaw, pitch: 0 } }, dt);
    w.events.length = 0;
    minY = Math.min(minY, p.y);
  }
  check(minY < 0.6, `carried the crate back down all three flights (got down to ${minY.toFixed(2)} m)`);
  // a body overlapping a wall gets pushed free instead of being stuck
  const q = fresh(); noEnemies(q);
  const b = { x: 12.15, y: 0, z: 14.5, vy: 0, onGround: true };  // half inside the tower's west wall
  b.y = groundAt(q, b.x, b.z, 1);
  const { moveBody } = await import('../src/sim/body.js');
  let moved = 0;
  for (let i = 0; i < 30; i++) moved += moveBody(q, b, 0, 2 / 60, 1 / 60);
  check(moved > 0.5, `someone overlapping a wall is pushed free and can walk again (moved ${moved.toFixed(2)} m)`);
}

// --- shooting: bullets travel and drop
{
  const w = fresh(); noEnemies(w);
  const p = w.players[0];
  const ev = run(w, 0.6, (pl, i) => ({ yaw: pl.yaw, pitch: 0.05, fire: i % 25 === 0 }));
  check(ev.filter(e => e.type === 'shot').length >= 2, 'pistol fires one shot per tap (semi-automatic)');
  check(w.players[0].slots[0].mag < 17, 'magazine counts down');
  const w2 = fresh(); noEnemies(w2);
  stepWorld(w2, { p1: { yaw: 0, pitch: 0, fire: true } }, dt);
  const pr = w2.projectiles[0];
  const y0 = pr.y; stepWorld(w2, { p1: { yaw: 0, pitch: 0 } }, dt);
  check(pr && pr.vy < 0 && Math.abs(Math.hypot(pr.vx, pr.vz) - 187) < 1, 'pistol bullet flies at 187 m/s and starts to drop');
}

// --- reload and swap
{
  const w = fresh(); noEnemies(w);
  const p = w.players[0];
  p.slots[0].mag = 0;
  run(w, 2.2, pl => ({ yaw: pl.yaw, pitch: 0, reload: true }));
  check(p.slots[0].mag === 17 && p.reserve['9mm'] === 85 - 17, 'reload takes 2 s and draws from the 9mm reserve');
  p.slots[1] = { w: 'm4a1', mag: 30 }; p.reserve['5.56mm'] = 0;
  stepWorld(w, { p1: { yaw: p.yaw, pitch: 0, swap: true } }, dt);
  check(p.active === 1, 'swap to second weapon');
}

// --- enemies fight back, armour and drops
{
  const w = fresh();
  const p = w.players[0];
  const e = w.enemies.find(x => x.group === 'city');
  p.x = e.x; p.z = e.z + 8; p.y = groundAt(w, p.x, p.z, 5);
  e.yaw = Math.PI; // face south towards the player
  const ev = run(w, 8, pl => ({ yaw: 0, pitch: 0 }));
  check(ev.some(x => x.type === 'shot' && x.team === 'enemy'), 'enemy spots the player and fires');
  check(ev.some(x => x.type === 'hurt' && x.team === 'player'), 'enemy bullets hit the player');
}
{
  const w = fresh();
  const p = w.players[0];
  const e = w.enemies.find(x => x.group === 'city');
  e.alert = false; e.reactT = 99; e.seeT = 99;
  p.x = e.x; p.z = e.z + 6; p.y = groundAt(w, p.x, p.z, 5);
  p.slots[0] = { w: 'ak47', mag: 30 }; p.reserve['7.62x39mm'] = 0;
  const yaw = 0, pitch = Math.atan2((e.y + 1.62) - (p.y + 1.6), 6);
  const ev = run(w, 1.5, () => ({ yaw, pitch, fire: true }));
  check(!e.alive, 'player can kill an enemy (headshots with the AK)');
  check(w.pickups.some(k => k.type === 'weapon' && Math.hypot(k.x - e.x, k.z - e.z) < 1), 'dead enemy drops its weapon');
  check(ev.some(x => x.type === 'hurt' && x.head), 'headshots register');
}

// --- RPG breaks a wall into rubble
{
  const w = fresh(); noEnemies(w);
  const p = w.players[0];
  // stand west of the city house at (28,28) and fire east at its west wall (x = 28)
  p.x = 22.5; p.z = 31.5; p.y = groundAt(w, p.x, p.z, 3);
  p.slots[1] = { w: 'rpg7', mag: 1 }; p.active = 1;
  const before = w.pieces.filter(x => x.alive).length;
  const ev = run(w, 1.5, () => ({ yaw: -Math.PI / 2, pitch: 0.0, fire: true }));
  check(ev.some(x => x.type === 'explosion'), 'RPG rocket explodes on impact');
  check(w.pieces.filter(x => x.alive).length < before, 'explosion destroys a wall section');
  check(getV(w.grid, 28, 0, 31) === V.RUBBLE || getV(w.grid, 28, 0, 31) === V.AIR, 'destroyed wall leaves rubble');
}

// --- base: claim, carry crate, build
{
  const w = fresh();
  const p = w.players[0];
  for (const e of w.enemies) if (e.group === 'compound') e.alive = false;
  w.groups = []; w.waves.nextT = 1e9;
  p.x = 72; p.z = 78; p.y = groundAt(w, p.x, p.z, 3);
  run(w, 0.2, () => ({}));
  check(w.base.claimed, 'base claimed once its defenders are dead and a player is inside');
  p.carrying = { item: 'construction_crate', origin: { x: 18.5, y: 9, z: 16.5 } };
  p.x = 72; p.z = 84;
  const nextBefore = w.waves.nextT = w.time + 40;
  run(w, 0.1, () => ({ interact: true }));
  check(w.base.upgrades.walls.level === 1 && !p.carrying, 'build walls with the construction crate');
  check(w.waves.nextT < nextBefore, 'building brings the next wave sooner');
  check(getV(w.grid, 65, 0, 67) === V.SANDBAG, 'sandbag walls placed');
}

// --- waves and the timer
{
  const w = fresh();
  const p = w.players[0];
  p.hp = 1e9; // can't die for this test
  const before = run(w, 70, () => ({}));
  check(!before.some(x => x.type === 'wave') && w.timeLeft === w.data.levels.slice.time_limit, 'no base yet: no waves and the clock does not run');
  // secure the base: clear its defenders and step inside
  const holders = w.data.levels.slice.enemy_groups.filter(g => g.holds_base).map(g => g.id);
  w.enemies = w.enemies.filter(e => !holders.includes(e.group));
  for (const g of w.groups) if (holders.includes(g.id)) g.respawnT = 1e9;
  const a = w.base.area;
  Object.assign(p, { x: (a.x0 + a.x1) / 2, z: (a.z0 + a.z1) / 2, y: 0 });
  w.enemies = w.enemies.filter(e => !(e.x >= a.x0 && e.x <= a.x1 && e.z >= a.z0 && e.z <= a.z1));
  const ev = run(w, 70, () => ({}));
  check(w.base.claimed && ev.some(x => x.type === 'wave') && w.timeLeft < w.data.levels.slice.time_limit, 'securing the base starts the clock, and the first wave arrives');
  const w2 = fresh(); noEnemies(w2); w2.players[0].hp = 1e9;
  run(w2, 400, () => ({}));
  check(w2.status === 'playing', 'without a base the game goes on past the time limit');
  w2.base.claimed = true;
  run(w2, 303, () => ({}));
  check(w2.status === 'won', `holding the base until the timer ends wins the level (status: ${w2.status})`);
}

// --- wave rhythm: beat a wave, short break, next wave; never too many attackers at once
{
  const { spawnWave, attackersAlive, attackersLeft } = await import('../src/sim/waves.js');
  const w = fresh(); noEnemies(w);
  w.players[0].hp = 1e9; w.base.claimed = true; w.waves.started = true; w.waves.nextT = null;
  const S = w.data.settings.waves;
  spawnWave(w);
  run(w, 60, () => ({}));
  const stillFighting = w.waves.number === 1 && w.waves.nextT === null;
  for (const e of w.enemies) if (e.wave) e.alive = false;
  run(w, 1, () => ({}));
  const breakSet = w.waves.nextT !== null && Math.abs(w.waves.nextT - w.time - (S.break_after_wave - 1)) < 1.05;
  run(w, S.break_after_wave + 1, () => ({}));
  check(stillFighting && breakSet && w.waves.number === 2, `the next wave waits until the last one is beaten, then comes after a ${S.break_after_wave} s break`);

  const big = fresh(); noEnemies(big); big.players[0].hp = 1e9; big.base.claimed = true; big.waves.started = true;
  big.waves.index = 29; spawnWave(big);   // a 30th wave: far more attackers than the cap
  const total = attackersLeft(big), onMap = attackersAlive(big);
  for (const e of big.enemies.filter(e => e.wave).slice(0, 5)) e.alive = false;
  run(big, 5, () => ({}));
  check(total > S.max_attackers_alive && onMap === S.max_attackers_alive && attackersAlive(big) === S.max_attackers_alive && attackersLeft(big) === total - 5 && big.waves.nextT === null,
    `at most ${S.max_attackers_alive} attackers on the map at once; the rest of a ${total}-strong wave come in as others fall`);
}

// --- health regeneration: after 7 s without damage, back up to 50 over 3 s
{
  const w = fresh(); noEnemies(w);
  const p = w.players[0];
  run(w, 1, () => ({}));
  const { damageActor } = await import('../src/sim/damage.js');
  damageActor(w, p, 90, 0, null);
  run(w, 6.9, () => ({}));
  const waited = p.hp;
  run(w, 1.6, () => ({}));
  const half = p.hp;
  run(w, 2, () => ({}));
  check(waited === 10 && half > 10 && half < 50 && Math.abs(p.hp - 50) < 1e-6, `health regenerates after 7 s (10 → ${half.toFixed(0)} → ${p.hp.toFixed(0)}), capped at 50`);
  p.hp = 80; run(w, 10, () => ({}));
  check(p.hp === 80, 'no regeneration above 50');
}

// --- co-op ready: downed and revive
{
  const w = fresh({ playerIds: ['p1', 'p2'] }); noEnemies(w);
  const [a, b] = w.players;
  b.x = a.x + 1; b.z = a.z; b.y = a.y;
  a.hp = 1; a.armour = 0;
  w.enemies = [];
  // hurt a directly
  w.events.length = 0;
  const { damageActor } = await import('../src/sim/damage.js');
  damageActor(w, a, 50, 50, null);
  check(a.downed && a.alive, 'in co-op a killed player is downed, not dead');
  run(w, 0.1, pl => pl === b ? { interact: true } : {});
  check(!a.downed && a.hp === 30, 'partner revives them');
}

// --- co-op snapshots: a guest copy of the world follows the host and stays under 4 KB
{
  const { createHostEncoder, createGuestDecoder } = await import('../src/net/snapshot.js');
  const host = fresh({ seed: 9, playerIds: ['p1', 'p2'] });
  const guest = fresh({ seed: 9, playerIds: ['p1', 'p2'] });
  const enc = createHostEncoder(data), dec = createGuestDecoder(data);
  const [h1, h2] = host.players;
  h1.slots[1] = { w: 'rpg7', mag: 1 }; h1.reserve['40mm'] = 3; h1.active = 1;
  h1.x = 22.5; h1.z = 31.5;
  let maxSize = 0, replayed = 0, merged = {};
  for (let i = 0; i < 60 * 8; i++) {
    stepWorld(host, { p1: { yaw: -Math.PI / 2, pitch: 0, fire: i % 90 === 0 }, p2: { pos: [h2.x + 0.01, h2.y, h2.z], moving: true, yaw: 0, pitch: 0 } }, 1 / 60);
    enc.record(host, host.events);
    host.events.length = 0;
    // the room keeps the latest value of every field (like the platform's presence)
    merged = { ...merged, ...enc.encode(host) };
    maxSize = Math.max(maxSize, JSON.stringify(merged).length);
    // simulate dropped updates: only every third one arrives
    if (i % 3 === 0) { replayed += dec.apply(guest, merged, 'p2').length; guest.events.length = 0; }
  }
  merged = { ...merged, ...enc.encode(host) }; dec.apply(guest, merged, 'p2');
  const brokenHost = host.pieces.filter(p => !p.alive).length, brokenGuest = guest.pieces.filter(p => !p.alive).length;
  check(maxSize < 4000, `snapshots stay under 4 KB (largest ${maxSize} bytes)`);
  check(brokenHost > 0 && brokenHost === brokenGuest, `broken walls match on the guest (${brokenGuest} of ${brokenHost})`);
  check(Math.abs(guest.players[0].x - h1.x) < 0.01 && guest.enemies.length === host.enemies.filter(e => e.alive || e.deadT < 12).length, 'guest sees the host player and every enemy where the host has them');
  check(replayed > 0 && Math.abs(guest.timeLeft - host.timeLeft) < 0.02, `guest replays events (${replayed}) and follows the clock`);
  check(guest.players[0].slots[1].w === 'rpg7', 'guest sees the host\'s weapons');
}

// --- weather
{
  const w = fresh(); noEnemies(w);
  w.weather[0].chance_per_minute = 600;
  const ev = run(w, 3, () => ({}));
  check(ev.some(x => x.type === 'weather' && x.on), 'sandstorm can start');
}

// --- deterministic
{
  const a = fresh({ seed: 42 }), b = fresh({ seed: 42 });
  const cmd = (p, i) => ({ move: { x: Math.sin(i / 30), y: -0.6 }, yaw: p.yaw + 0.002, pitch: 0, fire: i % 7 === 0 });
  run(a, 10, cmd); run(b, 10, cmd);
  const snap = w => JSON.stringify({ p: w.players, e: w.enemies, t: w.tick, r: w.rng, pr: w.projectiles });
  check(snap(a) === snap(b), 'simulation is deterministic');
}

// --- recoil comes back to where you were aiming (play-test feedback, 2026-10-22)
{
  const b = data.settings.ballistics, frame = 1 / 60;
  const shoot = (r, aim, k) => { aim.pitch += k; aim.yaw += k / 3; r.kick(k, k / 3, b.recoil_return); };
  const settle = (r, aim, s) => { for (let t = 0; t < s; t += frame) r.update(aim, frame, b); };
  let r = createRecoil(), aim = { pitch: 0.1, yaw: 1 };
  r.update(aim, frame, b);
  for (let i = 0; i < 3; i++) { shoot(r, aim, 0.03); settle(r, aim, 0.12); }
  const peak = aim.pitch;
  settle(r, aim, 1);
  check(peak > 0.13 && Math.abs(aim.pitch - 0.1) < 0.002 && Math.abs(aim.yaw - 1) < 0.002, `after a burst the aim climbs (${peak.toFixed(3)}) then returns to where it was (${aim.pitch.toFixed(3)})`);
  r = createRecoil(); aim = { pitch: 0.1, yaw: 1 };
  r.update(aim, frame, b);
  shoot(r, aim, 0.03); settle(r, aim, 0.6); shoot(r, aim, 0.03);
  const before = aim.pitch - 0.03; settle(r, aim, 0.6);
  check(Math.abs(before - 0.1) < 0.002 && Math.abs(aim.pitch - 0.1) < 0.002, 'well-timed single shots keep the point of aim');
  r = createRecoil(); aim = { pitch: 0.1, yaw: 1 };
  r.update(aim, frame, b);
  shoot(r, aim, 0.06); r.update(aim, frame, b);
  aim.pitch -= 0.05; // the player pulls down while it's kicked up
  settle(r, aim, 1);
  check(Math.abs(aim.pitch - 0.1) < 0.002, `pulling down yourself doesn't make it overshoot below the target (${aim.pitch.toFixed(3)})`);
}

// --- aim assist when aiming down sights (play-test feedback, 2026-10-23)
{
  const setup = () => {
    const w = fresh(); noEnemies(w);
    const p = w.players[0];
    Object.assign(p, { x: 10.5, z: 92.5, y: groundAt(w, 10.5, 92.5, 5) });
    spawnEnemyAt(w, 10.5, 74.5);
    const e = w.enemies[0];
    const t = anglesTo(p.x, p.y + 1.6, p.z, e.x, e.y + 1.25, e.z);
    return { w, p, e, t, aim: { yaw: t.yaw + 0.05, pitch: t.pitch + 0.02 } };  // about 3° off
  };
  const err = (a, t) => Math.hypot(a.yaw - t.yaw, a.pitch - t.pitch);
  const settle = (w, p, aim, s) => { const a = createAimAssist(); for (let i = 0; i < s * 60; i++) a.update(aim, 1 / 60, w, p, w.data.settings); };
  let { w, p, t, aim } = setup();
  p.ads = true; settle(w, p, aim, 0.6);
  check(err(aim, t) < 0.01, `aiming down sights near an enemy draws the crosshair onto them (${(err(aim, t) * 57.3).toFixed(2)}° off, from 3°)`);
  ({ w, p, t, aim } = setup()); p.ads = false; settle(w, p, aim, 0.6);
  check(Math.abs(err(aim, t) - Math.hypot(0.05, 0.02)) < 1e-9, 'no aim assist from the hip');
  ({ w, p, t, aim } = setup()); p.ads = true;
  for (let y = 0; y < 4; y++) setV(w.grid, 10, Math.floor(p.y) + y, 84, V.WALL);
  settle(w, p, aim, 0.6);
  check(Math.abs(err(aim, t) - Math.hypot(0.05, 0.02)) < 1e-9, 'no aim assist onto an enemy behind a wall');
  ({ w, p, t, aim } = setup()); p.ads = true; aim.yaw += 0.2; settle(w, p, aim, 0.6);
  check(Math.abs(aim.yaw - t.yaw - 0.25) < 1e-9, 'enemies far from the crosshair are left alone');
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

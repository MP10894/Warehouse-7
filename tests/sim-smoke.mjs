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

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const lv = 'data/levels/slice/';
const buildings = {};
for (const f of readdirSync(new URL('../' + lv + 'buildings', import.meta.url))) buildings[f] = read(lv + 'buildings/' + f);
const workbook = ['Game Data.xlsx', 'Weapons.xlsx'].map(f => new URL('../data/' + f, import.meta.url)).find(u => existsSync(u));
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
const noEnemies = w => { w.enemies = []; w.groups = []; w.waves.nextT = 1e9; };

// --- data
check(data.weapons.rpg7.calibre === '40mm' && data.calibres['5.56mm'] === 270, 'weapons loaded from Weapons.xlsx, ammo caps per calibre');
const semi = buildData({ weaponsRows: [], materialsCsv: '\uFEFFid;health;armour\r\nx;60;2,5\r\n', enemiesCsv: 'id\n', wavesCsv: 'wave\n', settings: {}, levels: {} });
check(semi.materials.x.armour === 2.5, 'reads semicolon CSV with decimal commas (Hungarian Excel)');
check(data.weapons.sig_p320.max_total === 102 && data.weapons.sig_p320.muzzle_velocity === 187, 'Weapons.xlsx formulas worked out (=+C4*6, =374/2)');

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
  const ev = run(w, 70, () => ({}));
  check(ev.some(x => x.type === 'wave'), 'first attack wave arrives');
  const w2 = fresh(); noEnemies(w2); w2.players[0].hp = 1e9;
  run(w2, 303, () => ({}));
  check(w2.status === 'won', `surviving the 5-minute timer wins the level (status: ${w2.status})`);
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

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

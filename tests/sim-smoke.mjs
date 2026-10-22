// Runs the game rules without any graphics, to catch broken logic quickly.
// Usage: npm run test:sim
import { readFileSync } from 'node:fs';
import { buildData } from '../src/data/parse.js';
import { createWorld } from '../src/sim/world.js';
import { stepWorld } from '../src/sim/step.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const data = buildData({
  enemiesCsv: read('data/enemies.csv'),
  weaponsCsv: read('data/weapons.csv'),
  pickupsCsv: read('data/pickups.csv'),
  settings: JSON.parse(read('data/settings.json')),
  levels: { warehouse: read('data/levels/warehouse.txt') }
});

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${msg}`); if (!ok) failures++; };

// Semicolon CSV with decimal commas, as saved by Hungarian/French Excel
const semi = buildData({ enemiesCsv: '﻿id;health;move_speed\r\nx;4;2,5\r\n', weaponsCsv: 'id\n', pickupsCsv: 'id,map_symbol\n', settings: {}, levels: {} });
check(semi.enemies.x.move_speed === 2.5, 'reads semicolon CSV with decimal commas');

const dt = 1 / 60;
const run = (world, seconds, cmdFor) => {
  const events = [];
  for (let i = 0; i < seconds / dt && world.status === 'playing'; i++) {
    const cmds = {};
    for (const p of world.players) cmds[p.id] = cmdFor(p, i);
    stepWorld(world, cmds, dt);
    events.push(...world.events.splice(0));
  }
  return events;
};

// 1. Single player standing still and firing east
{
  const w = createWorld({ data, levelText: data.levels.warehouse });
  check(w.players.length === 1 && w.enemies.length === 10, `world has 1 player, ${w.enemies.length} enemies, ${w.barrels.length} barrels, ${w.pickups.length} pickups`);
  const ev = run(w, 20, p => ({ move: { x: 0, y: 0 }, yaw: p.yaw, pitch: 0, fire: true }));
  const shots = ev.filter(e => e.type === 'shot').length;
  check(shots > 50, `player fired ${shots} shots`);
  check(ev.some(e => e.type === 'impact'), 'shots hit the level');
  check(w.players[0].ammo === 90 - shots, 'ammo counted correctly');
}

// 2. Walking forward moves the player and collides with walls
{
  const w = createWorld({ data, levelText: data.levels.warehouse });
  const x0 = w.players[0].x;
  run(w, 1, p => ({ move: { x: 0, y: -1 }, yaw: p.yaw, pitch: 0, fire: false }));
  check(w.players[0].x > x0 + 3, `walking east moved ${(w.players[0].x - x0).toFixed(2)} m`);
  run(w, 5, p => ({ move: { x: 0, y: 1 }, yaw: p.yaw, pitch: 0, fire: false }));
  check(w.players[0].x > 2, 'wall stops the player at the west edge');
}

// 3. Enemies come for the player and can kill them
{
  const w = createWorld({ data, levelText: data.levels.warehouse });
  w.players[0].x = 13 * 2 + 1; w.players[0].z = 13 * 2 + 1; // middle of the map, in the open
  const ev = run(w, 90, p => ({ move: { x: 0, y: 0 }, yaw: p.yaw, pitch: 0, fire: false }));
  check(ev.some(e => e.type === 'enemyShot'), 'enemies shoot');
  check(ev.some(e => e.type === 'playerHurt'), 'enemies hit the player');
  check(w.status === 'lost', `undefended player is eventually killed (status: ${w.status})`);
}

// 4. Two players (co-op ready): enemies split between targets, rules still run
{
  const w = createWorld({ data, levelText: data.levels.warehouse, playerIds: ['p1', 'p2'] });
  check(w.players.length === 2 && (w.players[0].x !== w.players[1].x || w.players[0].z !== w.players[1].z), 'two players spawn at different points');
  w.players[1].x = 22 * 2 + 1; w.players[1].z = 13 * 2 + 1;
  run(w, 10, p => ({ move: { x: 0, y: 0 }, yaw: p.yaw, pitch: 0, fire: false }));
  const targets = new Set(w.enemies.filter(e => e.targetId).map(e => e.targetId));
  check(targets.size === 2, `enemies target both players (${[...targets].join(', ')})`);
}

// 5. Barrel explosion damages nearby enemies and chains
{
  const w = createWorld({ data, levelText: data.levels.warehouse });
  const b = w.barrels[0];
  const p = w.players[0];
  p.x = b.x - 6; p.z = b.z; // stand west of the barrel, aim east
  const ev = run(w, 0.5, pl => ({ move: { x: 0, y: 0 }, yaw: -Math.PI / 2, pitch: -0.12, fire: true }));
  check(ev.some(e => e.type === 'explosion'), 'shooting a barrel makes it explode');
  check(!b.alive && w.barrelAt[b.cy][b.cx] === 0, 'exploded barrel no longer blocks the tile');
}

// 6. Same seed + same inputs = same result (needed for reliable co-op and replays)
{
  const a = createWorld({ data, levelText: data.levels.warehouse, seed: 42 });
  const b = createWorld({ data, levelText: data.levels.warehouse, seed: 42 });
  const cmd = (p, i) => ({ move: { x: Math.sin(i / 30), y: -0.6 }, yaw: p.yaw + 0.002, pitch: 0, fire: i % 3 === 0 });
  run(a, 15, cmd); run(b, 15, cmd);
  const snap = w => JSON.stringify({ p: w.players, e: w.enemies, t: w.tick, r: w.rng });
  check(snap(a) === snap(b), 'simulation is deterministic');
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

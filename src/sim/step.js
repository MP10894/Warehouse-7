// One tick of the game rules. Input arrives as plain "commands", one per player:
//   { move: { x, y }, yaw, pitch, fire, ads, reload, swap, interact }
// For co-op the host collects both players' commands and calls stepWorld; nothing in
// here cares whether a command came from this device or over the internet.
import { maintainNav } from './nav.js';
import { updatePlayer } from './players.js';
import { updateProjectiles } from './weapons.js';
import { updateEnemy, updateGroups } from './enemies.js';
import { updateTurrets } from './turrets.js';
import { updateBase, respawnItem } from './base.js';
import { updateWaves } from './waves.js';
import { updateWeather } from './weather.js';
import { groundAt } from './body.js';
import { emit } from './damage.js';

function runPending(world, dt) {
  for (const job of world.pending) job.t -= dt;
  const due = world.pending.filter(j => j.t <= 0);
  world.pending = world.pending.filter(j => j.t > 0);
  for (const job of due) if (job.kind === 'respawnItem') respawnItem(world, job);
}

function settlePickups(world) {
  if (world.cache.pickupVersion === world.voxelVersion) return;
  world.cache.pickupVersion = world.voxelVersion;
  for (const pk of world.pickups) pk.y = groundAt(world, pk.x, pk.z, pk.y + 0.3);
}

function checkOutcome(world, dt) {
  if (!world.outcome) {
    const up = world.players.some(p => p.alive && !p.downed);
    const downedWaiting = world.players.some(p => p.downed);
    if (world.timeLeft <= 0) world.outcome = 'won';
    else if (!up && !downedWaiting) world.outcome = 'lost';
    else if (!up && downedWaiting && world.players.every(p => !p.alive || p.downed)) world.outcome = 'lost';
    if (world.outcome) world.endT = world.data.settings.world.end_delay;
    return;
  }
  world.endT -= dt;
  if (world.endT <= 0) {
    world.status = world.outcome;
    emit(world, { type: 'status', status: world.status });
  }
}

/** Advance the world by dt seconds. commands: { [playerId]: command } */
export function stepWorld(world, commands, dt) {
  if (world.status !== 'playing') return;
  world.tick++;
  world.time += dt;
  // the clock only runs once a base has been secured (no base yet: no time limit)
  if (!world.outcome && world.base.claimed) world.timeLeft = Math.max(0, world.timeLeft - dt);
  maintainNav(world);
  for (const p of world.players) updatePlayer(world, p, commands[p.id], dt);
  updateProjectiles(world, dt);
  if (!world.outcome) {
    updateGroups(world, dt);
    updateWaves(world);
  }
  for (const e of world.enemies) updateEnemy(world, e, dt);
  updateTurrets(world, dt);
  // forget long-dead bodies so the world doesn't fill up
  if (world.tick % 60 === 0) world.enemies = world.enemies.filter(e => e.alive || e.deadT < 30);
  updateBase(world);
  updateWeather(world, dt);
  runPending(world, dt);
  settlePickups(world);
  checkOutcome(world, dt);
}

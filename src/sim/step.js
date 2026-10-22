// One tick of the game rules. Input arrives as plain "commands", one per player:
//   { move: { x, y }, yaw, pitch, fire }
// For co-op, the host would collect commands from both players and call stepWorld;
// nothing in here cares whether a command came from this device or over the internet.
import { moveBody } from './physics.js';
import { updateFlowField } from './navigation.js';
import { updateEnemy } from './enemies.js';
import { emit, fireWeapon, explodeBarrel } from './combat.js';

function applyPlayer(world, p, cmd, dt) {
  const s = world.data.settings;
  p.fireCd -= dt;
  if (!cmd || !p.alive) { p.moving = false; return; }
  p.yaw = cmd.yaw;
  p.pitch = Math.max(-s.controls.max_pitch, Math.min(s.controls.max_pitch, cmd.pitch));
  let f = -(cmd.move?.y || 0), r = cmd.move?.x || 0;
  const len = Math.hypot(f, r);
  if (len > 1) { f /= len; r /= len; }
  p.moving = len > 0.15;
  if (len > 0.05) {
    const speed = s.player.move_speed * dt, sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    moveBody(world, p, (-sy * f + cy * r) * speed, (-cy * f - sy * r) * speed, s.player.radius);
  }
  if (cmd.fire) fireWeapon(world, p);
}

function collectPickups(world) {
  const maxHp = world.data.settings.player.max_health;
  for (const pk of world.pickups) {
    if (pk.taken) continue;
    for (const p of world.players) {
      if (!p.alive || Math.hypot(pk.x - p.x, pk.z - p.z) > 0.9) continue;
      const def = world.data.pickups[pk.type];
      if (def.gives === 'health') {
        if (p.hp >= maxHp) continue;
        p.hp = Math.min(maxHp, p.hp + def.amount);
      } else if (def.gives === 'ammo') {
        p.ammo += def.amount;
      } else continue;
      pk.taken = true;
      emit(world, { type: 'pickup', playerId: p.id, kind: pk.type, id: pk.id });
      emit(world, { type: 'message', text: `+${def.amount} ${def.gives.toUpperCase()}`, playerId: p.id });
      break;
    }
  }
}

function runPending(world, dt) {
  for (const job of world.pending) job.t -= dt;
  const due = world.pending.filter(j => j.t <= 0);
  world.pending = world.pending.filter(j => j.t > 0);
  for (const job of due) {
    if (job.kind === 'explode') {
      const b = world.barrels.find(x => x.id === job.id);
      if (b) explodeBarrel(world, b);
    }
  }
}

function checkOutcome(world, dt) {
  if (world.status !== 'playing') return;
  if (!world.outcome) {
    if (world.total > 0 && world.kills >= world.total) world.outcome = 'won';
    else if (world.players.every(p => !p.alive)) world.outcome = 'lost';
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
  if (!world.outcome) world.time += dt;
  for (const p of world.players) applyPlayer(world, p, commands[p.id], dt);
  runPending(world, dt);
  updateFlowField(world);
  for (const e of world.enemies) updateEnemy(world, e, dt);
  collectPickups(world);
  checkOutcome(world, dt);
}

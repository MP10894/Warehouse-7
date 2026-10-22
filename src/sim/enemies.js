// Enemy behaviour. Each enemy picks the nearest living player as its target, so the
// same code works for one player or several.
import { sightClear } from './map.js';
import { moveBody } from './physics.js';
import { flowStep } from './navigation.js';
import { rand } from './rng.js';
import { emit, wakeEnemy, hurtPlayer } from './combat.js';

const ENEMY_RADIUS = 0.35;
const MIN_PLAYER_GAP = 1.3;

function nearestPlayer(world, e) {
  let best = null, bd = Infinity;
  for (const p of world.players) {
    if (!p.alive) continue;
    const d = Math.hypot(p.x - e.x, p.z - e.z);
    if (d < bd) { bd = d; best = p; }
  }
  return [best, bd];
}

function enemyFire(world, e, target, d) {
  const def = world.data.enemies[e.type];
  emit(world, { type: 'enemyShot', id: e.id, x: e.x, z: e.z });
  if (!target.alive || !sightClear(world.map, e.x, e.z, target.x, target.z)) return;
  const chance = Math.max(def.accuracy_min, Math.min(def.accuracy_max, def.accuracy_base - d * def.accuracy_falloff))
    * (target.moving ? def.moving_target_factor : 1);
  if (rand(world) < chance) {
    hurtPlayer(world, target, def.damage_min + Math.round(rand(world) * (def.damage_max - def.damage_min)));
  }
}

export function updateEnemy(world, e, dt) {
  if (e.state === 'dead') return;
  const def = world.data.enemies[e.type];
  e.t -= dt; e.fireCd -= dt; e.seeT -= dt; e.moving = false;

  const [target, d] = nearestPlayer(world, e);
  e.targetId = target ? target.id : null;
  if (!target) { if (e.state !== 'pain') e.state = e.awake ? 'chase' : 'idle'; return; }
  const dx = target.x - e.x, dz = target.z - e.z;

  if (e.seeT <= 0) {
    e.seeT = rand(world, 0.2, 0.3);
    e.los = d < def.sight_range && sightClear(world.map, e.x, e.z, target.x, target.z);
    if (e.los && d < def.wake_range) wakeEnemy(world, e);
  }

  if (e.state === 'pain') {
    if (e.t <= 0) e.state = 'chase';
  } else if (e.state === 'aim') {
    if (e.t <= 0) { e.state = 'fire'; e.t = 0.14; enemyFire(world, e, target, d); }
  } else if (e.state === 'fire') {
    if (e.t <= 0) { e.state = 'chase'; e.fireCd = rand(world, def.fire_cooldown_min, def.fire_cooldown_max); }
  } else if (e.awake) {
    e.state = 'chase';
    if (e.los && e.fireCd <= 0 && d < def.attack_range) {
      e.state = 'aim';
      e.t = rand(world, def.aim_time_min, def.aim_time_max);
    } else {
      let tx, tz, speed = def.move_speed;
      if (e.los && d < def.keep_distance) {
        // close enough: side-step instead of walking into the player
        e.strafeT -= dt;
        if (e.strafeT <= 0) { e.strafe *= -1; e.strafeT = rand(world, 0.6, 1.6); }
        tx = e.x - dz / d * e.strafe;
        tz = e.z + dx / d * e.strafe;
        speed = def.strafe_speed;
      } else {
        [tx, tz] = flowStep(world, e, target.x, target.z);
      }
      const mx = tx - e.x, mz = tz - e.z, ml = Math.hypot(mx, mz);
      if (ml > 0.05 && d > MIN_PLAYER_GAP) {
        const ox = e.x, oz = e.z;
        moveBody(world, e, mx / ml * speed * dt, mz / ml * speed * dt, ENEMY_RADIUS);
        e.moving = Math.hypot(e.x - ox, e.z - oz) > 0.001;
        if (e.moving) e.animT += dt;
      }
    }
  }

  // keep enemies from standing inside each other
  for (const o of world.enemies) {
    if (o === e || o.state === 'dead') continue;
    const sx = e.x - o.x, sz = e.z - o.z, sd = Math.hypot(sx, sz);
    if (sd > 0 && sd < 0.75) moveBody(world, e, sx / sd * (0.75 - sd) * 0.5, sz / sd * (0.75 - sd) * 0.5, ENEMY_RADIUS);
  }
}

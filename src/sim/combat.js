// Shooting, damage, explosions. Every visible or audible result is reported as an event
// in world.events; graphics, sound and the HUD react to those events and never reach
// into the rules directly.
import { rand } from './rng.js';
import { raycast } from './physics.js';
import { spawnPickup } from './world.js';

export const emit = (world, ev) => world.events.push(ev);

export function wakeEnemy(world, e) {
  if (e.awake || e.state === 'dead') return;
  e.awake = true;
  const r = world.data.settings.enemy_alerting.alert_radius;
  for (const o of world.enemies) {
    if (o !== e && !o.awake && o.state !== 'dead' && Math.hypot(o.x - e.x, o.z - e.z) < r) o.awake = true;
  }
}

export function damageEnemy(world, e, dmg, byPlayer = null) {
  if (e.state === 'dead') return;
  const def = world.data.enemies[e.type];
  e.hp -= dmg;
  wakeEnemy(world, e);
  if (e.hp <= 0) {
    e.state = 'dead';
    world.kills++;
    if (byPlayer) byPlayer.stats.kills++;
    emit(world, { type: 'enemyDie', id: e.id, x: e.x, z: e.z });
    emit(world, { type: 'message', text: 'HOSTILE DOWN' });
    if (rand(world) < def.ammo_drop_chance) {
      spawnPickup(world, 'ammo', e.x + rand(world, -0.3, 0.3), e.z + rand(world, -0.3, 0.3));
    }
  } else {
    emit(world, { type: 'enemyHurt', id: e.id });
    if (rand(world) < def.pain_chance) { e.state = 'pain'; e.t = 0.22; }
  }
}

export function hurtPlayer(world, p, amount) {
  if (!p.alive) return;
  p.hp = Math.max(0, p.hp - amount);
  emit(world, { type: 'playerHurt', playerId: p.id, amount });
  if (p.hp <= 0) {
    p.alive = false;
    emit(world, { type: 'playerDown', playerId: p.id });
  }
}

export function explodeBarrel(world, b) {
  if (!b.alive) return;
  const s = world.data.settings.barrel;
  b.alive = false;
  world.barrelAt[b.cy][b.cx] = 0;
  world.barrelVersion++;
  emit(world, { type: 'explosion', x: b.x, z: b.z });
  for (const e of world.enemies) {
    const d = Math.hypot(e.x - b.x, e.z - b.z);
    if (d < s.blast_radius) damageEnemy(world, e, s.enemy_damage);
    else if (d < 14) wakeEnemy(world, e);
  }
  for (const p of world.players) {
    const d = Math.hypot(p.x - b.x, p.z - b.z);
    if (d < s.blast_radius) hurtPlayer(world, p, Math.round(s.player_damage_max * (1 - d / s.blast_radius)) + 5);
  }
  for (const o of world.barrels) {
    if (o.alive && Math.hypot(o.x - b.x, o.z - b.z) < s.chain_radius && !world.pending.some(q => q.id === o.id)) {
      world.pending.push({ kind: 'explode', id: o.id, t: s.chain_delay });
    }
  }
}

/** Direction a player is looking, as a unit vector (matches the camera). */
export function aimVector(yaw, pitch) {
  return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
}

export function fireWeapon(world, p) {
  if (p.fireCd > 0 || !p.alive) return;
  const w = world.data.weapons[p.weapon];
  if (p.ammo <= 0) {
    p.fireCd = 0.25;
    emit(world, { type: 'empty', playerId: p.id });
    emit(world, { type: 'message', text: 'OUT OF AMMO', playerId: p.id });
    return;
  }
  p.fireCd = w.fire_interval;
  p.ammo--;
  p.stats.shots++;
  emit(world, { type: 'shot', playerId: p.id, x: p.x, z: p.z });

  const spread = p.moving ? w.moving_spread : w.spread;
  const d = aimVector(p.yaw + rand(world, -spread, spread), p.pitch + rand(world, -spread, spread));
  const o = { x: p.x, y: world.data.settings.player.eye_height, z: p.z };
  const hit = raycast(world, o, d, w.range);

  if (hit.kind === 'enemy') {
    p.stats.hits++;
    emit(world, { type: 'hitConfirm', playerId: p.id, head: hit.head });
    emit(world, { type: 'impact', kind: 'flesh', ...hit.point });
    damageEnemy(world, hit.target, hit.head ? w.headshot_damage : w.damage, p);
  } else if (hit.kind === 'barrel') {
    p.stats.hits++;
    explodeBarrel(world, hit.target);
  } else if (hit.kind === 'level') {
    emit(world, { type: 'impact', kind: 'wall', ...hit.point, nx: hit.normal.x, ny: hit.normal.y, nz: hit.normal.z });
  }

  const hearing = world.data.settings.enemy_alerting.hearing_range;
  for (const e of world.enemies) {
    if (!e.awake && Math.hypot(e.x - p.x, e.z - p.z) < hearing) wakeEnemy(world, e);
  }
}

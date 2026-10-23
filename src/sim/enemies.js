// Enemy soldiers: spawning, perception, movement and shooting.
// Every enemy targets the nearest living player, so this works unchanged in co-op.
import { rand, weightedPick } from './rng.js';
import { moveBody, groundAt } from './body.js';
import { lineOfSight } from './ballistics.js';
import { flowNext, nodeAt } from './nav.js';
import { aimVector, spreadDir, spawnProjectile } from './weapons.js';
import { emit } from './damage.js';
import { stormAt } from './weather.js';
import { holdsBase, levelBases } from './base.js';

const EYE = 1.55;

export function spawnEnemy(world, { x, y, z, weapon, armour = 0, group = null, wave = false, behaviour = 'guard', radius = 0, type = 'insurgent' }) {
  if (!world.data.enemies[type]) type = 'insurgent';
  const def = world.data.enemies[type];
  // the Enemies tab's Armour column is the least this type wears
  armour = Math.max(armour, def.armour || 0);
  const wdef = world.data.weapons[weapon];
  const gy = groundAt(world, x, z, (y ?? 30) + 0.6);
  const e = {
    id: world.nextId++, kind: 'enemy', type, group, wave, behaviour, radius,
    x, y: gy, z, vy: 0, onGround: true, yaw: rand(world, 0, Math.PI * 2), pitch: 0,
    hp: def.health, armour, alive: true, state: 'idle',
    weapon: { w: weapon, mag: wdef.mag_size }, reloadT: 0, fireCd: 0,
    alert: wave, lastSeen: null, lostT: 0, targetId: null, seeT: rand(world, 0, 0.25), sees: false,
    reactT: 0, burstLeft: 0, pauseT: 0, home: { x, y: gy, z }, wander: null, wanderT: 0,
    strafe: rand(world) < 0.5 ? 1 : -1, strafeT: 0, stuckT: 0, moving: false, aiming: false, animT: rand(world), deadT: 0
  };
  world.enemies.push(e);
  return e;
}

/**
 * Choose an enemy's weapon from { weaponId: weight }. If the enemy type has a
 * "Possible Weapons Equipped" list (Enemies tab), only those weapons can be chosen.
 */
export function pickEnemyWeapon(world, weights, type = 'insurgent') {
  const allowed = world.data.enemies[type] && world.data.enemies[type].allowed_weapons;
  if (allowed && allowed.length) {
    const w = {};
    // a weapon the group or wave doesn't mention still turns up now and then (weight 1);
    // a weight of 0 rules it out
    for (const id of allowed) w[id] = weights[id] ?? 1;
    return weightedPick(world, w) || allowed[Math.floor(rand(world, 0, allowed.length))];
  }
  return weightedPick(world, weights) || 'ak47';
}

export function rollLoadout(world, weights, armourChance, armourAmount, type = 'insurgent') {
  return { weapon: pickEnemyWeapon(world, weights, type), armour: rand(world) < armourChance ? armourAmount : 0 };
}

function sightRange(world, e, p) {
  const def = world.data.enemies[e.type];
  const storm = Math.max(stormAt(world, e.x, e.z), stormAt(world, p.x, p.z));
  return def.sight_range * world.data.settings.difficulty.enemy_sight_factor * (1 - world.data.settings.weather.sight_reduction * storm);
}

function perceive(world, e) {
  let best = null, bd = Infinity;
  for (const p of world.players) {
    if (!p.alive || p.downed) continue;
    const d = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
    if (d > sightRange(world, e, p) || d >= bd) continue;
    // must be roughly facing them unless already alert
    if (!e.alert) {
      let a = Math.atan2(-(p.x - e.x), -(p.z - e.z)) - e.yaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) > 1.4 && d > 6) continue;
    }
    if (!lineOfSight(world, e.x, e.y + EYE, e.z, p.x, p.y + 1.5, p.z)) continue;
    best = p; bd = d;
  }
  return best;
}

function fireAt(world, e, target, d) {
  const def = world.data.enemies[e.type];
  const wdef = world.data.weapons[e.weapon.w];
  const s = world.data.settings;
  const v = wdef.muzzle_velocity * s.ballistics.bullet_speed_factor;
  const tx = target.x, ty = target.y + 1.25, tz = target.z;
  const ox = e.x, oy = e.y + EYE, oz = e.z;
  const t = d / v;
  const dy = ty + 0.5 * s.ballistics.gravity * (wdef.projectile === 'rocket' ? 0.15 : 1) * t * t - oy;
  const dx = tx - ox, dz = tz - oz, l = Math.hypot(dx, dy, dz);
  let err = (def.aim_error_base + def.aim_error_per_metre * d) * (target.moving ? 1.4 : 1) * s.difficulty.enemy_aim_factor;
  if (Math.max(stormAt(world, e.x, e.z), stormAt(world, tx, tz)) > 0.3) err *= s.weather.aim_error_factor;
  const dir = spreadDir(world, [dx / l, dy / l, dz / l], err);
  spawnProjectile(world, e, wdef, ox + dir[0] * 0.4, oy + dir[1] * 0.4, oz + dir[2] * 0.4, dir);
  e.weapon.mag--;
  e.fireCd = 60 / wdef.rate_of_fire;
  emit(world, { type: 'shot', actorId: e.id, team: 'enemy', weapon: wdef.id, x: ox, y: oy, z: oz });
  if (e.weapon.mag <= 0) e.reloadT = wdef.reload_time;
}

function walkTowards(world, e, tx, tz, speed, dt) {
  const dx = tx - e.x, dz = tz - e.z, l = Math.hypot(dx, dz);
  if (l < 0.05) return 0;
  const step = Math.min(l, speed * dt);
  const moved = moveBody(world, e, dx / l * step, dz / l * step, dt);
  if (!e.aiming) e.yaw = Math.atan2(-dx, -dz);
  return moved;
}

function goalField(world, e) {
  const c = world.cache;
  if (e.wave && world.base.claimed && !e.sees) {
    // head for the base unless a player is close
    const near = world.players.some(p => p.alive && !p.downed && Math.hypot(p.x - e.x, p.z - e.z) < 20);
    if (!near) return c.baseField;
  }
  return c.playerField;
}

export function updateEnemy(world, e, dt) {
  if (!e.alive) { e.deadT += dt; return; }
  const def = world.data.enemies[e.type];
  const wdef = world.data.weapons[e.weapon.w];
  const nav = world.cache.nav;
  e.fireCd -= dt; e.seeT -= dt; e.moving = false;
  if (e.reloadT > 0) { e.reloadT -= dt; if (e.reloadT <= 0) e.weapon.mag = wdef.mag_size; }

  if (e.seeT <= 0) {
    e.seeT = 0.25;
    const p = perceive(world, e);
    if (p) {
      if (!e.sees) e.reactT = def.reaction_time * world.data.settings.difficulty.enemy_reaction_factor * rand(world, 0.7, 1.3);
      e.sees = true; e.targetId = p.id; e.alert = true;
      e.lastSeen = { x: p.x, y: p.y, z: p.z }; e.lostT = 0;
    } else {
      e.sees = false;
    }
  }
  if (!e.sees) e.lostT += dt;
  const target = e.sees ? world.players.find(p => p.id === e.targetId) : null;
  e.aiming = !!(target && target.alive && !target.downed);

  if (e.aiming) {
    const d = Math.hypot(target.x - e.x, target.y - e.y, target.z - e.z);
    e.yaw = Math.atan2(-(target.x - e.x), -(target.z - e.z));
    e.pitch = Math.atan2(target.y + 1.2 - (e.y + EYE), Math.hypot(target.x - e.x, target.z - e.z));
    e.reactT -= dt;
    if (e.reactT <= 0 && e.reloadT <= 0) {
      if (e.burstLeft > 0) {
        if (e.fireCd <= 0) { fireAt(world, e, target, d); e.burstLeft--; if (e.burstLeft === 0) e.pauseT = rand(world, def.burst_pause_min, def.burst_pause_max); }
      } else {
        e.pauseT -= dt;
        if (e.pauseT <= 0) e.burstLeft = wdef.fire_mode === 'auto' ? Math.round(rand(world, def.burst_min, def.burst_max)) : Math.round(rand(world, 1, 3));
      }
    }
    // keep a sensible distance: close in if far, side-step otherwise
    const pref = wdef.projectile === 'rocket' ? def.preferred_range * 1.5 : def.preferred_range * (wdef.id === 'sig_p320' ? 0.6 : 1);
    if (d > pref * 1.3 && nav) {
      const nxt = flowNext(nav, world.cache.playerField, e.x, e.y, e.z);
      if (nxt) e.moving = walkTowards(world, e, nxt[0], nxt[2], def.move_speed * 0.6, dt) > 0;
    } else {
      e.strafeT -= dt;
      if (e.strafeT <= 0) { e.strafe = rand(world) < 0.5 ? 1 : -1; e.strafeT = rand(world, 0.8, 2.2); }
      const sx = Math.cos(e.yaw) * e.strafe, sz = -Math.sin(e.yaw) * e.strafe;
      e.moving = moveBody(world, e, sx * def.move_speed * 0.35 * dt, sz * def.move_speed * 0.35 * dt, dt) > 0;
    }
  } else if (e.alert && nav) {
    // hunt: follow the flow field towards the players (or the base, for attack waves)
    const field = goalField(world, e);
    const nxt = field ? flowNext(nav, field, e.x, e.y, e.z) : null;
    if (nxt) e.moving = walkTowards(world, e, nxt[0], nxt[2], def.move_speed, dt) > 0;
    else if (e.lastSeen) e.moving = walkTowards(world, e, e.lastSeen.x, e.lastSeen.z, def.move_speed, dt) > 0;
    if (!e.wave && e.lostT > world.data.settings.enemy_ai.give_up_after) { e.alert = false; e.lastSeen = null; }
  } else {
    // idle: guards hold their post, roamers wander around their area
    if (e.behaviour === 'roam') {
      e.wanderT -= dt;
      if (!e.wander || e.wanderT <= 0) {
        const r = e.radius || 12;
        e.wander = { x: e.home.x + rand(world, -r, r), z: e.home.z + rand(world, -r, r) };
        e.wanderT = rand(world, 6, 12);
      }
      const moved = walkTowards(world, e, e.wander.x, e.wander.z, def.move_speed * 0.45, dt);
      e.moving = moved > 0.001;
      if (Math.hypot(e.wander.x - e.x, e.wander.z - e.z) < 0.6 || !e.moving) e.wanderT = Math.min(e.wanderT, rand(world, 0.5, 2));
    } else {
      if (Math.hypot(e.home.x - e.x, e.home.z - e.z) > 1) e.moving = walkTowards(world, e, e.home.x, e.home.z, def.move_speed * 0.5, dt) > 0;
      else { e.wanderT -= dt; if (e.wanderT <= 0) { e.yaw += rand(world, -1.2, 1.2); e.wanderT = rand(world, 2, 5); } }
    }
  }
  if (e.moving) e.animT += dt;

  // don't stand inside each other
  for (const o of world.enemies) {
    if (o === e || !o.alive) continue;
    const sx = e.x - o.x, sz = e.z - o.z, sd = Math.hypot(sx, sz);
    if (sd > 0 && sd < 0.7 && Math.abs(o.y - e.y) < 1) moveBody(world, e, sx / sd * (0.7 - sd) * 0.5, sz / sd * (0.7 - sd) * 0.5, 0);
  }
  if (nav && nodeAt(nav, e.x, e.y, e.z) < 0 && e.y < -1) e.alive = false;
}

/** Keep each enemy group topped up (except inside a claimed base). */
export function updateGroups(world, dt) {
  const s = world.data.settings.enemy_ai;
  const level = world.data.levels[world.levelId];
  for (const gstate of world.groups) {
    const gdef = level.enemy_groups.find(g => g.id === gstate.id);
    const alive = world.enemies.filter(e => e.alive && e.group === gstate.id).length;
    if (alive >= gdef.spawns.length || !gdef.respawn) continue;
    // defenders of the claimed base stop coming back; other bases stay enemy territory
    if (world.base.claimed && holdsBase(gdef, { id: world.base.id, index: world.base.index }, levelBases(level).length)) continue;
    gstate.respawnT -= dt;
    if (gstate.respawnT > 0) continue;
    gstate.respawnT = gdef.respawn;
    const sp = gdef.spawns[Math.floor(rand(world, 0, gdef.spawns.length))];
    const a = world.base.area;
    if (world.base.claimed && sp.x >= a.x0 && sp.x <= a.x1 && sp.z >= a.z0 && sp.z <= a.z1) continue;
    if (world.players.some(p => p.alive && Math.hypot(p.x - sp.x, p.z - sp.z) < s.respawn_min_player_distance)) continue;
    const lo = rollLoadout(world, gdef.weapons, gdef.armour_chance || 0, gdef.armour || 0, gdef.type);
    spawnEnemy(world, { x: sp.x + 0.5, y: sp.y, z: sp.z + 0.5, weapon: lo.weapon, armour: lo.armour, group: gstate.id, behaviour: gdef.behaviour, radius: gdef.radius, type: gdef.type });
  }
}

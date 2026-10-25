// The automatic turret: a friendly sentry gun the players set down themselves.
//
// - A level 3 ammunition supply hands one out (upgrades.csv → `unlocks` lists "turret"),
//   one per player: while yours is carried or standing, the armoury won't give another.
// - You carry it in both hands (no shooting) and see where it would go: DROP puts it there.
//   Standing next to your own turret, PICK UP TURRET takes it back (damage and all).
// - It never moves. It turns to face enemies it sees or hears and fires bursts at them
//   (the Allies tab's "Turret" row: health, armour, sight, hearing, reaction, aim error,
//   bursts; its gun is the Weapons tab's "Turret" row; ammunition is unlimited).
// - Enemies treat it like a player: they see it, shoot it and run their bombs at it.
// - Destroyed, it is gone, drops nothing, and the armoury hands out a new one.
import { rand } from './rng.js';
import { groundAt, blocked } from './body.js';
import { lineOfSight } from './ballistics.js';
import { spreadDir, spawnProjectile } from './weapons.js';
import { emit, alertEnemy } from './damage.js';
import { stormAt } from './weather.js';

export const TURRET_GUN_Y = 1.1;    // height of the gun above the turret's feet (m): clears a 1 m low wall
const AIM_Y = 1.15;                 // where on an enemy it aims (m above his feet)
export const TURRET_RADIUS = 0.45;  // hit volume and the room it needs (m)
export const TURRET_TOP = 1.3;

const setting = (world, k, d) => (world.data.settings.turret || {})[k] ?? d;

/** Is this id a deployable unit (a row on the Allies tab) rather than a gun? */
export const isAlly = (world, id) => !!(world.data.allies && world.data.allies[id]);

/** The player's turret of this type, carried or standing (null if they have none out). */
export function turretOut(world, p, type = 'turret') {
  if (p.carrying && p.carrying.turret === type) return 'carried';
  return world.turrets.some(t => t.alive && t.owner === p.id && t.type === type) ? 'placed' : null;
}

/** Take a turret from the armoury: it goes into your hands. */
export function takeTurret(world, p, type) {
  const def = world.data.allies[type];
  if (!def || p.carrying || turretOut(world, p, type)) return false;
  p.carrying = { item: 'turret', turret: type, hp: def.health, armour: def.armour };
  p.ads = false;
  emit(world, { type: 'pickup', playerId: p.id, what: 'turret' });
  emit(world, { type: 'message', text: `${def.name.toUpperCase()} — FIND A SPOT AND DROP IT`, playerId: p.id });
  return true;
}

/**
 * Where a carried turret would go: on the ground a little in front of you. ok is false if
 * that spot is inside a wall, too far up or down, too steep, or too close to someone or to
 * another turret.
 */
export function placementFor(world, p) {
  const dist = setting(world, 'place_distance', 1.6);
  const x = p.x - Math.sin(p.yaw) * dist, z = p.z - Math.cos(p.yaw) * dist;
  const y = groundAt(world, x, z, p.y + 1.2);
  let ok = Math.abs(y - p.y) < 1.2 && !blocked(world, x, z, y, TURRET_RADIUS, TURRET_TOP, 0.2);
  if (ok) {
    // the tripod needs fairly flat ground under all of it
    const r = TURRET_RADIUS;
    for (const [ox, oz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      if (Math.abs(groundAt(world, x + ox, z + oz, y + 0.6) - y) > 0.45) { ok = false; break; }
    }
  }
  if (ok) {
    const people = [...world.players, ...world.enemies].filter(a => a.alive && a !== p);
    if (people.some(a => Math.hypot(a.x - x, a.z - z) < 0.8 && Math.abs(a.y - y) < 1.8)) ok = false;
    if (world.turrets.some(t => t.alive && Math.hypot(t.x - x, t.z - z) < 1.2)) ok = false;
    // and you must be able to see the spot (no dropping it through a wall)
    if (!lineOfSight(world, p.x, p.y + 1.2, p.z, x, y + 0.6, z)) ok = false;
  }
  return { x, y, z, ok };
}

/** Put a turret down. carried: what the player was holding (health and armour carry over). */
export function placeTurret(world, owner, carried, x, y, z, yaw) {
  const def = world.data.allies[carried.turret];
  const t = {
    id: world.nextId++, kind: 'turret', type: carried.turret, owner: owner ? owner.id : null,
    x, y, z, yaw, pitch: 0, home: yaw,
    hp: carried.hp ?? def.health, armour: carried.armour ?? def.armour, alive: true, downed: false,
    targetId: null, sees: false, alertT: 0, seeT: 0, reactT: 0, burstLeft: 0, pauseT: 0, fireCd: 0,
    sweep: 1, lastHurtAt: 0, deadT: 0
  };
  world.turrets.push(t);
  emit(world, { type: 'turret', what: 'placed', id: t.id, playerId: t.owner, x, y, z });
  return t;
}

/** DROP: set the carried turret down where the player is looking, if the spot is good. */
export function dropTurret(world, p) {
  if (!p.carrying || !p.carrying.turret) return false;
  const spot = placementFor(world, p);
  if (!spot.ok) return false;
  placeTurret(world, p, p.carrying, spot.x, spot.y, spot.z, p.yaw);
  p.carrying = null;
  emit(world, { type: 'message', text: 'TURRET IN PLACE', playerId: p.id });
  return true;
}

/** Going down while carrying it: it is set down at your feet (it isn't lost). */
export function dropTurretAtFeet(world, p) {
  if (!p.carrying || !p.carrying.turret) return;
  placeTurret(world, p, p.carrying, p.x, p.y, p.z, p.yaw);
  p.carrying = null;
}

/** Your own standing turret within reach (for PICK UP), or null. */
export function turretToPickUp(world, p) {
  if (p.carrying) return null;
  const r = setting(world, 'pickup_range', 1.8);
  return world.turrets.find(t => t.alive && t.owner === p.id && Math.hypot(t.x - p.x, t.z - p.z) <= r && Math.abs(t.y - p.y) < 1.6) || null;
}

/** PICK UP TURRET: back into your hands, keeping its damage. */
export function pickUpTurret(world, p, id) {
  const t = world.turrets.find(x => x.id === id);
  if (!t || !t.alive || t.owner !== p.id || p.carrying) return false;
  world.turrets = world.turrets.filter(x => x !== t);
  p.carrying = { item: 'turret', turret: t.type, hp: t.hp, armour: t.armour };
  p.ads = false;
  emit(world, { type: 'turret', what: 'picked', id: t.id, playerId: p.id });
  emit(world, { type: 'message', text: 'TURRET PICKED UP', playerId: p.id });
  return true;
}

/** Destroyed: it is gone (a wreck stays a moment for the graphics), and drops nothing. */
export function destroyTurret(world, t) {
  t.alive = false; t.hp = 0; t.deadT = 0;
  emit(world, { type: 'death', actorId: t.id, team: 'turret', x: t.x, y: t.y, z: t.z });
  emit(world, { type: 'explosion', x: t.x, y: t.y + 0.7, z: t.z, r: 1.2 });
  if (t.owner) emit(world, { type: 'message', text: 'YOUR TURRET WAS DESTROYED — GET A NEW ONE AT THE AMMUNITION SUPPLY', playerId: t.owner });
}

// ---- the turret's own fighting -------------------------------------------------------------

function sightRange(world, t, e) {
  const def = world.data.allies[t.type];
  const storm = Math.max(stormAt(world, t.x, t.z), stormAt(world, e.x, e.z));
  return def.sight_range * (1 - world.data.settings.weather.sight_reduction * storm);
}

/** The nearest enemy it can see: in front of it, or all round once it has been alerted. */
function perceive(world, t) {
  const fov = setting(world, 'field_of_view_deg', 120) * Math.PI / 360;
  let best = null, bd = Infinity;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - t.x, e.y - t.y, e.z - t.z);
    if (d > sightRange(world, t, e) || d >= bd) continue;
    if (t.alertT <= 0) {
      let a = Math.atan2(-(e.x - t.x), -(e.z - t.z)) - t.yaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) > fov && d > 4) continue;
    }
    // only someone its bullets can reach: the line from the gun to where it aims must be clear
    if (!lineOfSight(world, t.x, t.y + TURRET_GUN_Y, t.z, e.x, e.y + AIM_Y, e.z)) continue;
    best = e; bd = d;
  }
  return best;
}

/** Heard a shot or was hit: look all round for a while (Allies tab "hearing range"). */
export function turretsHear(world, x, z) {
  for (const t of world.turrets) {
    if (!t.alive) continue;
    const def = world.data.allies[t.type];
    if (Math.hypot(t.x - x, t.z - z) <= def.hearing_range) t.alertT = setting(world, 'alert_time', 6);
  }
}

function fire(world, t, e, d) {
  const def = world.data.allies[t.type];
  const wid = (def.allowed_weapons && def.allowed_weapons[0]) || t.type;
  const wdef = world.data.weapons[wid];
  const s = world.data.settings;
  const v = wdef.muzzle_velocity * s.ballistics.bullet_speed_factor;
  const ox = t.x, oy = t.y + TURRET_GUN_Y, oz = t.z;
  const tx = e.x, ty = e.y + AIM_Y, tz = e.z;
  const tt = d / v;
  const dy = ty + 0.5 * s.ballistics.gravity * tt * tt - oy;
  const dx = tx - ox, dz = tz - oz, l = Math.hypot(dx, dy, dz);
  let err = (def.aim_error_base + def.aim_error_per_metre * d) * (e.moving ? 1.25 : 1);
  if (Math.max(stormAt(world, ox, oz), stormAt(world, tx, tz)) > 0.3) err *= s.weather.aim_error_factor;
  const dir = spreadDir(world, [dx / l, dy / l, dz / l], err);
  // its bullets are the players' side: they hit enemies, never players
  spawnProjectile(world, t, wdef, ox + dir[0] * 0.6, oy + dir[1] * 0.6, oz + dir[2] * 0.6, dir);
  t.fireCd = 60 / wdef.rate_of_fire;
  emit(world, { type: 'shot', actorId: t.id, team: 'turret', weapon: wdef.id, x: ox, y: oy, z: oz });
  // enemies hear it like a player's gun
  const hear = world.data.enemies.insurgent ? world.data.enemies.insurgent.hearing_range : 30;
  for (const o of world.enemies) if (o.alive && !o.alert && Math.hypot(o.x - ox, o.z - oz) < hear) alertEnemy(world, o, ox, oy, oz);
}

export function updateTurret(world, t, dt) {
  if (!t.alive) { t.deadT += dt; return; }
  const def = world.data.allies[t.type];
  t.fireCd -= dt; t.seeT -= dt; t.alertT -= dt;
  if (world.time - t.lastHurtAt < 0.1) t.alertT = setting(world, 'alert_time', 6);
  if (t.seeT <= 0) {
    t.seeT = 0.2;
    const e = perceive(world, t);
    if (e) {
      if (!t.sees || t.targetId !== e.id) t.reactT = def.reaction_time * rand(world, 0.8, 1.2);
      t.sees = true; t.targetId = e.id; t.alertT = setting(world, 'alert_time', 6);
    } else {
      t.sees = false; t.targetId = null;
    }
  }
  const e = t.sees ? world.enemies.find(x => x.id === t.targetId && x.alive) : null;
  if (!e) {
    // nothing in sight: sweep slowly either side of the way it was set down
    const span = setting(world, 'sweep_deg', 50) * Math.PI / 180;
    let off = Math.atan2(Math.sin(t.yaw - t.home), Math.cos(t.yaw - t.home));
    off += t.sweep * setting(world, 'sweep_speed_deg', 25) * Math.PI / 180 * dt;
    if (Math.abs(off) > span) { off = Math.sign(off) * span; t.sweep = -t.sweep; }
    t.yaw = t.home + off;
    t.pitch *= Math.max(0, 1 - dt * 3);
    t.burstLeft = 0;
    return;
  }
  const d = Math.hypot(e.x - t.x, e.y - t.y, e.z - t.z);
  // turn towards the target (fast, but not instantly)
  const want = Math.atan2(-(e.x - t.x), -(e.z - t.z));
  const diff = Math.atan2(Math.sin(want - t.yaw), Math.cos(want - t.yaw));
  const turn = setting(world, 'turn_speed_deg', 240) * Math.PI / 180 * dt;
  t.yaw += Math.max(-turn, Math.min(turn, diff));
  t.pitch = Math.atan2(e.y + AIM_Y - (t.y + TURRET_GUN_Y), Math.hypot(e.x - t.x, e.z - t.z));
  t.reactT -= dt;
  if (t.reactT > 0 || Math.abs(diff) > 0.15) return;
  if (t.burstLeft > 0) {
    if (t.fireCd <= 0) { fire(world, t, e, d); t.burstLeft--; if (t.burstLeft === 0) t.pauseT = rand(world, def.burst_pause_min, def.burst_pause_max); }
  } else {
    t.pauseT -= dt;
    if (t.pauseT <= 0) t.burstLeft = Math.round(rand(world, def.burst_min, def.burst_max));
  }
}

/** Every tick: run the turrets, and clear away wrecks after a while. */
export function updateTurrets(world, dt) {
  for (const t of world.turrets) updateTurret(world, t, dt);
  if (world.tick % 60 === 0) world.turrets = world.turrets.filter(t => t.alive || t.deadT < 8);
}

/** What enemies can fight: players still standing, and turrets. */
export function hostileTargets(world) {
  const out = [];
  for (const p of world.players) if (p.alive && !p.downed) out.push(p);
  for (const t of world.turrets) if (t.alive) out.push(t);
  return out;
}

/** Height on a target that enemies aim at, and look at (m above its feet). */
export const aimHeight = a => (a.kind === 'turret' ? 0.95 : 1.25);
export const lookHeight = a => (a.kind === 'turret' ? 0.95 : 1.5);

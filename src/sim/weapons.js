// Firing, reloading, swapping, recoil and bloom; flying projectiles and what they hit.
import { rand, randomInDisc } from './rng.js';
import { traceSegment } from './ballistics.js';
import { emit, damageActor, damagePiece, explode, findActor, alertEnemy } from './damage.js';
import { turretsHear } from './turrets.js';

/** Unit vector for a look direction (matches the camera: yaw 0 looks north, −z). */
export function aimVector(yaw, pitch) {
  return [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
}

/** Tilt a direction by a random angle up to `spread` radians. */
export function spreadDir(world, d, spread) {
  if (spread <= 0) return d;
  const [ox, oy] = randomInDisc(world, spread);
  // two axes perpendicular to d
  let ux = -d[2], uy = 0, uz = d[0];
  let ul = Math.hypot(ux, uz);
  if (ul < 1e-6) { ux = 1; uz = 0; ul = 1; }
  ux /= ul; uz /= ul;
  const vx = d[1] * uz - d[2] * uy, vy = d[2] * ux - d[0] * uz, vz = d[0] * uy - d[1] * ux;
  const nx = d[0] + ux * ox + vx * oy, ny = d[1] + uy * ox + vy * oy, nz = d[2] + uz * ox + vz * oy;
  const l = Math.hypot(nx, ny, nz);
  return [nx / l, ny / l, nz / l];
}

export function spawnProjectile(world, owner, wdef, x, y, z, dir) {
  const v = wdef.muzzle_velocity * world.data.settings.ballistics.bullet_speed_factor;
  world.projectiles.push({
    id: world.nextId++, owner: owner.id, team: owner.kind, weapon: wdef.id, kind: wdef.projectile || 'bullet',
    x, y, z, vx: dir[0] * v, vy: dir[1] * v, vz: dir[2] * v,
    life: world.data.settings.ballistics.max_flight_time
  });
}

export const activeWeapon = p => p.slots[p.active];

/** The thrown weapon (the RGD-5): the first weapon whose projectile is "grenade". */
export const grenadeDef = world => Object.values(world.data.weapons).find(w => w.projectile === 'grenade') || null;
/** How many grenades a player can carry (its "maximum total" on the Weapons tab). */
export const grenadeMax = world => { const g = grenadeDef(world); return g ? g.max_total : 0; };

/** Can the player toss a grenade right now? */
export function canThrow(world, p) {
  return !!grenadeDef(world) && p.alive && !p.downed && (p.grenades || 0) > 0 && !(p.throwT > 0) && !(p.reloadT > 0) && !(p.swapT > 0) && !(p.carrying && p.carrying.turret);
}

/**
 * Grenades are a quick-use item: a toss takes `throw_time` seconds (no shooting meanwhile),
 * and the grenade leaves the hand `release_at` seconds in, thrown along your aim tipped up
 * a little, at the Weapons tab's muzzle velocity (= throwing speed).
 */
function updateThrow(world, p, cmd, dt) {
  const gs = world.data.settings.grenades || {};
  if (p.throwT > 0) {
    p.throwT -= dt;
    p.ads = false;   // no aiming down the sights mid-throw
    if (p.releaseT > 0) {
      p.releaseT -= dt;
      if (p.releaseT <= 0) {
        const g = grenadeDef(world), s = world.data.settings;
        const dir = aimVector(p.yaw, Math.min(1.3, p.pitch + (gs.throw_up_deg ?? 12) * Math.PI / 180));
        const eye = p.y + s.player.eye_height;
        world.projectiles.push({
          id: world.nextId++, owner: p.id, team: 'player', weapon: g.id, kind: 'grenade',
          x: p.x + dir[0] * 0.4, y: eye - 0.1 + dir[1] * 0.4, z: p.z + dir[2] * 0.4,
          vx: dir[0] * g.muzzle_velocity, vy: dir[1] * g.muzzle_velocity, vz: dir[2] * g.muzzle_velocity,
          life: Math.max(0.2, (gs.fuse ?? 3.5) - (gs.release_at ?? 0.3)), rest: false
        });
      }
    }
  }
  if (cmd.grenade && canThrow(world, p)) {
    p.grenades--;
    p.throwT = gs.throw_time ?? 0.7;
    p.releaseT = gs.release_at ?? 0.3;
    p.ads = false;
    emit(world, { type: 'throw', actorId: p.id, time: p.throwT, release: p.releaseT });
  }
}

export function startReload(world, p) {
  const slot = activeWeapon(p);
  if (!slot || p.reloadT > 0 || p.swapT > 0) return;
  const def = world.data.weapons[slot.w];
  if (slot.mag >= def.mag_size || (p.reserve[def.calibre] || 0) <= 0) return;
  p.reloadT = def.reload_time;
  emit(world, { type: 'reload', actorId: p.id, weapon: slot.w, time: def.reload_time, empty: slot.mag === 0 });
}

export function swapWeapon(world, p) {
  const other = 1 - p.active;
  if (!p.slots[other]) return;
  p.active = other;
  p.reloadT = 0;
  p.swapT = world.data.settings.player.swap_time;
  p.bloom = 0;
  emit(world, { type: 'swap', actorId: p.id, weapon: p.slots[other].w });
}

function hearShot(world, shooter, range) {
  for (const e of world.enemies) {
    if (e.alive && !e.alert && Math.hypot(e.x - shooter.x, e.z - shooter.z) < range) alertEnemy(world, e, shooter.x, shooter.y, shooter.z);
  }
}

/** Per tick: trigger, reload, swap, bloom and recoil for one player. */
export function updatePlayerWeapon(world, p, cmd, dt) {
  const s = world.data.settings, b = s.ballistics;
  p.fireCd -= dt;
  p.bloom = Math.max(0, p.bloom - b.bloom_recovery_per_second * dt);
  if (p.swapT > 0) p.swapT -= dt;
  updateThrow(world, p, cmd, dt);
  const slot = activeWeapon(p);
  if (!slot) return;
  const def = world.data.weapons[slot.w];
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      p.reloadT = 0;
      const take = Math.min(def.mag_size - slot.mag, p.reserve[def.calibre] || 0);
      slot.mag += take;
      p.reserve[def.calibre] -= take;
    }
  }
  const throwing = p.throwT > 0;
  if (cmd.reload && !throwing) startReload(world, p);
  if (cmd.swap && !throwing) swapWeapon(world, p);

  const pressed = !!cmd.fire && !p.trigger;
  p.trigger = !!cmd.fire;
  if (p.carrying && p.carrying.turret) return;   // both hands on the turret: no shooting
  const want = def.fire_mode === 'auto' ? !!cmd.fire : pressed;
  if (!want || p.reloadT > 0 || p.swapT > 0 || throwing) return;
  if (slot.mag <= 0) {
    if ((p.reserve[def.calibre] || 0) > 0) startReload(world, p);
    else if (pressed) { emit(world, { type: 'empty', playerId: p.id }); emit(world, { type: 'message', text: 'NO AMMO', playerId: p.id }); }
    return;
  }
  if (p.fireCd > 0) return;

  slot.mag--;
  p.fireCd = 60 / def.rate_of_fire;
  p.stats.shots++;
  const B = def.bloom / 100;
  let spread = b.spread_min + p.bloom + (p.moving ? b.bloom_moving_at_100 * B : 0);
  if (p.ads) spread *= b.ads_spread_factor;
  const dir = spreadDir(world, aimVector(p.yaw, p.pitch), spread);
  const eye = p.y + s.player.eye_height;
  spawnProjectile(world, p, def, p.x + dir[0] * 0.3, eye + dir[1] * 0.3 - 0.05, p.z + dir[2] * 0.3, dir);
  p.bloom = Math.min(b.bloom_max_at_100 * B, p.bloom + b.bloom_per_shot_at_100 * B);
  const R = def.recoil / 100;
  emit(world, {
    type: 'shot', actorId: p.id, team: 'player', weapon: def.id, x: p.x, y: eye, z: p.z,
    kick: b.recoil_kick_at_100 * R, side: rand(world, -1, 1) * b.recoil_side_at_100 * R
  });
  hearShot(world, p, world.data.enemies.insurgent ? world.data.enemies.insurgent.hearing_range : 30);
  turretsHear(world, p.x, p.z);
  if (slot.mag <= 0 && (p.reserve[def.calibre] || 0) > 0) startReload(world, p);
}

/**
 * A thrown grenade: flies under gravity, bounces off walls and the ground (losing speed),
 * rolls to a stop, and goes off when its fuse runs out. Returns false once it has exploded.
 */
function moveGrenade(world, pr, dt) {
  const s = world.data.settings, gs = s.grenades || {};
  pr.life -= dt;
  if (pr.life <= 0) {
    explode(world, pr.x, pr.y + 0.15, pr.z, world.data.weapons[pr.weapon], findActor(world, pr.owner));
    return false;
  }
  if (pr.rest) return true;
  pr.vy -= s.ballistics.gravity * dt;
  const ox = pr.x, oy = pr.y, oz = pr.z;
  const nx = ox + pr.vx * dt, ny = oy + pr.vy * dt, nz = oz + pr.vz * dt;
  const hit = traceSegment(world, ox, oy, oz, nx, ny, nz);
  if (!hit) { pr.x = nx; pr.y = ny; pr.z = nz; return true; }
  // bounce: reflect off the surface, keep a share of the speed
  const e = gs.bounce ?? 0.35, f = gs.friction ?? 0.55;
  const back = Math.max(0, hit.dist - 0.05) / Math.max(1e-6, Math.hypot(nx - ox, ny - oy, nz - oz));
  pr.x = ox + (nx - ox) * back; pr.y = oy + (ny - oy) * back; pr.z = oz + (nz - oz) * back;
  const dot = pr.vx * hit.nx + pr.vy * hit.ny + pr.vz * hit.nz;
  let vx = pr.vx - (1 + e) * dot * hit.nx, vy = pr.vy - (1 + e) * dot * hit.ny, vz = pr.vz - (1 + e) * dot * hit.nz;
  if (hit.ny > 0.5) { vx *= f; vz *= f; }   // scraping along the ground slows it down
  pr.vx = vx; pr.vy = vy; pr.vz = vz;
  if (Math.abs(dot) > 2) emit(world, { type: 'bounce', x: pr.x, y: pr.y, z: pr.z });
  if (hit.ny > 0.5 && Math.hypot(vx, vy, vz) < 0.8) { pr.rest = true; pr.vx = pr.vy = pr.vz = 0; }
  return true;
}

/** Move every bullet and rocket; resolve hits. */
export function updateProjectiles(world, dt) {
  const g = world.data.settings.ballistics.gravity;
  const keep = [];
  for (const pr of world.projectiles) {
    if (pr.kind === 'grenade') { if (moveGrenade(world, pr, dt)) keep.push(pr); continue; }
    pr.life -= dt;
    const ox = pr.x, oy = pr.y, oz = pr.z;
    if (pr.kind !== 'rocket') pr.vy -= g * dt;
    else pr.vy -= g * 0.15 * dt; // rockets are powered, they barely drop
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.z += pr.vz * dt;
    // players' and turrets' bullets hit enemies; enemies' bullets hit players and turrets
    const targets = pr.team === 'player' || pr.team === 'turret' ? world.enemies : [...world.players, ...world.turrets];
    const hit = traceSegment(world, ox, oy, oz, pr.x, pr.y, pr.z, { actors: targets.filter(a => !a.downed), ignore: pr.owner });
    if (!hit) {
      if (pr.life > 0 && pr.y > -5) keep.push(pr);
      else if (pr.kind === 'rocket') explode(world, pr.x, pr.y, pr.z, world.data.weapons[pr.weapon], findActor(world, pr.owner));
      continue;
    }
    const wdef = world.data.weapons[pr.weapon];
    const owner = findActor(world, pr.owner);
    if (hit.kind === 'actor') {
      if (owner && owner.kind === 'player') {
        owner.stats.hits++;
        emit(world, { type: 'hitConfirm', playerId: owner.id, head: hit.head });
      }
      emit(world, { type: 'impact', kind: 'flesh', x: hit.x, y: hit.y, z: hit.z, nx: hit.nx, ny: hit.ny, nz: hit.nz });
      const k = pr.team === 'enemy' ? world.data.settings.difficulty.enemy_damage_factor : 1;
      damageActor(world, hit.actor, wdef.damage_health * k, wdef.damage_armour * k, owner, hit.head);
    } else {
      const pid = hit.kind === 'block' ? world.pieceOf[hit.cell] : 0;
      const piece = pid ? world.pieces[pid - 1] : null;
      emit(world, { type: 'impact', kind: hit.kind, material: piece ? piece.material : (hit.kind === 'block' ? 'concrete' : 'ground'), x: hit.x, y: hit.y, z: hit.z, nx: hit.nx, ny: hit.ny, nz: hit.nz });
      const explosive = pr.kind === 'rocket' || wdef.area_of_effect > 0;
      if (pid && wdef.damage_environment > 0 && !explosive) damagePiece(world, pid, wdef.damage_environment);
    }
    if (pr.kind === 'rocket' || wdef.area_of_effect > 0) {
      explode(world, hit.x - (pr.vx * 0.002), hit.y - (pr.vy * 0.002), hit.z - (pr.vz * 0.002), wdef, owner);
    }
  }
  world.projectiles = keep;
}

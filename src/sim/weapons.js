// Firing, reloading, swapping, recoil and bloom; flying projectiles and what they hit.
import { rand, randomInDisc } from './rng.js';
import { traceSegment } from './ballistics.js';
import { emit, damageActor, damagePiece, explode, findActor, alertEnemy } from './damage.js';

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

export function startReload(world, p) {
  const slot = activeWeapon(p);
  if (!slot || p.reloadT > 0 || p.swapT > 0) return;
  const def = world.data.weapons[slot.w];
  if (slot.mag >= def.mag_size || (p.reserve[def.calibre] || 0) <= 0) return;
  p.reloadT = def.reload_time;
  emit(world, { type: 'reload', actorId: p.id, weapon: slot.w, time: def.reload_time });
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
  if (cmd.reload) startReload(world, p);
  if (cmd.swap) swapWeapon(world, p);

  const pressed = !!cmd.fire && !p.trigger;
  p.trigger = !!cmd.fire;
  const want = def.fire_mode === 'auto' ? !!cmd.fire : pressed;
  if (!want || p.reloadT > 0 || p.swapT > 0) return;
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
  if (slot.mag <= 0 && (p.reserve[def.calibre] || 0) > 0) startReload(world, p);
}

/** Move every bullet and rocket; resolve hits. */
export function updateProjectiles(world, dt) {
  const g = world.data.settings.ballistics.gravity;
  const keep = [];
  for (const pr of world.projectiles) {
    pr.life -= dt;
    const ox = pr.x, oy = pr.y, oz = pr.z;
    if (pr.kind !== 'rocket') pr.vy -= g * dt;
    else pr.vy -= g * 0.15 * dt; // rockets are powered, they barely drop
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.z += pr.vz * dt;
    const targets = pr.team === 'player' ? world.enemies : world.players;
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

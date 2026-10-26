// The gunship kill streak (data/killstreaks.csv → "gunship"): the player who calls it in fights
// from a gunship circling `altitude` metres above where they stood (settings.json →
// killstreaks.gunship), for `duration` seconds or until both guns are empty.
//  - Its main gun is the Weapons tab's "Gunship gun" (`weapon`, `rounds` of it); SWAP changes to
//    the rockets (`secondary`: the RPG-7's profile, `secondary_rounds` of them). Nothing refills.
//  - Its fire hurts everyone: enemies, your partner, your own body (friendly fire).
//  - Your body stays on the ground, standing still, and can be shot. Going down or dying ends
//    the gunship at once (killstreaks.js → loseStreak).
// The command's yaw / pitch are where the gunship's camera looks while it is up.
import { rand } from './rng.js';
import { emit } from './damage.js';
import { aimVector, spreadDir } from './weapons.js';

const conf = world => (world.data.settings.killstreaks && world.data.settings.killstreaks.gunship) || {};

/** Where the gunship is now (its gun), circling the spot it was called to. */
export function gunshipPos(world, gs) {
  const c = conf(world), R = c.orbit_radius ?? 90, ALT = c.altitude ?? 150;
  return [gs.cx + Math.cos(gs.ang) * R, gs.gy + ALT, gs.cz + Math.sin(gs.ang) * R];
}

/** Up into the gunship. test: from the GUNSHIP TEST button (the kill count is left alone). */
export function startGunship(world, p, k, test = false) {
  if (!k || p.gunship || !p.alive || p.downed) return false;
  if (p.carrying && p.carrying.turret) return false;   // both hands on the turret
  p.gunship = {
    streak: k.id, t: Number(k.duration) || 30,
    primary: k.weapon, ammo: Math.round(Number(k.rounds) || 0),
    secondary: k.secondary || null, rockets: Math.round(Number(k.secondary_rounds) || 0),
    sel: 0, fireCd: 0, trigger: false,
    // it circles a spot a little ahead of where you were facing (so the sight doesn't start on you)
    cx: p.x - Math.sin(p.yaw) * (conf(world).ahead ?? 30), cz: p.z - Math.cos(p.yaw) * (conf(world).ahead ?? 30), gy: p.y, ang: rand(world, 0, Math.PI * 2),
    yaw: p.yaw, pitch: -1
  };
  if (!test) p.streak = 0;
  p.designating = false; p.ads = false; p.reloadT = 0; p.moving = false; p.trigger = false;
  emit(world, { type: 'gunship', on: true, playerId: p.id });
  emit(world, { type: 'message', text: 'GUNSHIP ON STATION', playerId: p.id });
  return true;
}

export function endGunship(world, p, why = '') {
  if (!p.gunship) return;
  p.gunship = null;
  emit(world, { type: 'gunship', on: false, playerId: p.id });
  if (why) emit(world, { type: 'message', text: why, playerId: p.id });
}

const left = gs => [gs.ammo, gs.rockets];

/** One tick up in the gunship: circle, aim, swap, shoot, and come down when it's over. */
export function updateGunship(world, p, cmd, dt) {
  const gs = p.gunship, c = conf(world);
  gs.t -= dt;
  gs.ang += dt * Math.PI * 2 / (c.orbit_seconds ?? 45);
  if (cmd.yaw !== undefined) gs.yaw = cmd.yaw;
  if (cmd.pitch !== undefined) gs.pitch = Math.max(-1.55, Math.min(0, cmd.pitch));
  gs.fireCd -= dt;
  // SWAP: gun ⇄ rockets (only to one that still has some); an empty one changes over by itself
  const other = 1 - gs.sel;
  if ((cmd.swap || left(gs)[gs.sel] <= 0) && left(gs)[other] > 0 && (other === 0 || gs.secondary)) {
    gs.sel = other; gs.fireCd = Math.max(gs.fireCd, 0.25);
    emit(world, { type: 'message', text: gs.sel ? 'ROCKETS' : 'GUN', playerId: p.id });
  }
  const pressed = !!cmd.fire && !gs.trigger;
  gs.trigger = !!cmd.fire;
  const wid = gs.sel ? gs.secondary : gs.primary, wdef = wid && world.data.weapons[wid];
  // (a rocket asked for while the next is still being readied goes as soon as it's ready)
  const want = wdef && (wdef.fire_mode === 'auto' ? !!cmd.fire : pressed || gs.queued);
  gs.queued = !!(want && wdef.fire_mode !== 'auto' && gs.fireCd > 0);
  if (!want) gs.fireCd = Math.max(gs.fireCd, 0);
  // the gun: 1,200 a minute is 20 a second, more than one per tick now and then
  const every = gs.sel ? (c.rocket_interval ?? 0.6) : 60 / (Number(wdef && wdef.rate_of_fire) || 1200);
  while (want && gs.fireCd <= 0 && left(gs)[gs.sel] > 0) {
    if (gs.sel) gs.rockets--; else gs.ammo--;
    gs.fireCd += every;
    const [x, y, z] = gunshipPos(world, gs);
    const dir = spreadDir(world, aimVector(gs.yaw, gs.pitch), gs.sel ? (c.rocket_spread ?? 0.004) : (c.gun_spread ?? 0.003));
    const v = (Number(wdef.muzzle_velocity) || 400) * world.data.settings.ballistics.bullet_speed_factor;
    world.projectiles.push({
      id: world.nextId++, owner: p.id, team: 'player', weapon: wdef.id, kind: wdef.projectile || 'bullet',
      x: x + dir[0] * 2, y: y + dir[1] * 2, z: z + dir[2] * 2, vx: dir[0] * v, vy: dir[1] * v, vz: dir[2] * v,
      life: Math.max(world.data.settings.ballistics.max_flight_time, 4),
      ff: true,            // friendly fire: hits players too
      nograv: !gs.sel      // the gun's rounds fly straight to where you aim
    });
    p.stats.shots++;
    emit(world, { type: 'gunshipShot', playerId: p.id, weapon: wdef.id, x, y, z });
    if (gs.sel) break;   // rockets: one per press
  }
  if (gs.t <= 0) endGunship(world, p, 'GUNSHIP LEAVING');
  else if (gs.ammo <= 0 && gs.rockets <= 0) endGunship(world, p, 'GUNSHIP OUT OF AMMUNITION');
}

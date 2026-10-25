// Aim assist, while aiming down sights only. Small phone screens make fine aiming hard,
// so when the crosshair is near a visible enemy the view is gently drawn onto them and
// follows them a little as they move. It changes where you look, never the rules: the
// shot still goes where the crosshair is, with normal spread.
//
// Settings (data/settings.json → controls):
//   aim_assist            strength, 0 = off, 1 = full
//   aim_assist_angle_deg  how far from the crosshair (degrees) an enemy can be to count
//   aim_assist_range      metres; enemies further away are ignored
import { lineOfSight } from '../sim/ballistics.js';

const CHEST = 1.25;          // aim at the chest: forgiving, and the body is the bigger target
const PULL_PER_S = 7;        // how quickly the view is drawn in at full strength
const FOLLOW = 0.6;          // share of a locked target's sideways movement the view follows

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/** Yaw and pitch that look from (x, y, z) at (tx, ty, tz), in the game's convention. */
export function anglesTo(x, y, z, tx, ty, tz) {
  const dx = tx - x, dy = ty - y, dz = tz - z;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

export function createAimAssist() {
  let lockId = null, lastYaw = 0, lastPitch = 0;
  return {
    reset() { lockId = null; },
    /** Once per frame, after look input and recoil. Returns the enemy it is helping with, or null. */
    update(aim, dt, world, player, settings) {
      const c = settings.controls;
      const strength = c.aim_assist ?? 0.5;
      if (!player || !player.alive || player.downed || !player.ads || strength <= 0) { lockId = null; return null; }
      const eyeY = player.y + settings.player.eye_height;
      const cone = (c.aim_assist_angle_deg ?? 5) * Math.PI / 180;
      const range = c.aim_assist_range ?? 60;
      // the enemy nearest the crosshair (by angle) that you can actually see
      let best = null, bestErr = Infinity, bestA = null;
      for (const e of world.enemies) {
        if (!e.alive) continue;
        const dist = Math.hypot(e.x - player.x, e.z - player.z);
        if (dist > range || dist < 1) continue;
        const a = anglesTo(player.x, eyeY, player.z, e.x, e.y + CHEST, e.z);
        const dy = wrap(a.yaw - aim.yaw), dp = a.pitch - aim.pitch;
        // close enemies fill more of the screen, so they get a slightly wider cone
        const reach = Math.max(cone, Math.atan2(0.45, dist));
        const err = Math.hypot(dy, dp);
        if (err > reach || err >= bestErr) continue;
        if (!lineOfSight(world, player.x, eyeY, player.z, e.x, e.y + CHEST, e.z)) continue;
        best = e; bestErr = err; bestA = a;
      }
      if (!best) { lockId = null; return null; }
      // follow a locked target's movement since last frame
      if (lockId === best.id) {
        aim.yaw += wrap(bestA.yaw - lastYaw) * FOLLOW * strength;
        aim.pitch += (bestA.pitch - lastPitch) * FOLLOW * strength;
      }
      // and draw the view in, gently at the edge of the cone, more firmly near the centre
      const k = (1 - Math.exp(-PULL_PER_S * strength * dt)) * (1 - 0.5 * bestErr / Math.max(cone, 1e-6));
      aim.yaw += wrap(bestA.yaw - aim.yaw) * Math.max(0, k);
      aim.pitch += (bestA.pitch - aim.pitch) * Math.max(0, k);
      aim.pitch = Math.max(-c.max_pitch, Math.min(c.max_pitch, aim.pitch));
      lockId = best.id; lastYaw = bestA.yaw; lastPitch = bestA.pitch;
      return best;
    }
  };
}

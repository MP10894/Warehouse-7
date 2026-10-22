// Recoil kicks the view up (and a little sideways) with each shot, then brings it back to
// where you were aiming once you stop firing. So sustained fire climbs and gets less
// accurate, but well-timed single shots keep your point of aim. If you pull the view down
// yourself while it's kicked up, that counts towards the return, so you never end up
// aiming lower than where you started.
//
// Settings (data/settings.json → ballistics):
//   recoil_return          share of the kick that comes back (1 = all of it, 0 = none)
//   recoil_return_delay    seconds after a shot before the view starts coming back
//   recoil_return_speed    how quickly it comes back (higher = faster; 10 ≈ 90% in 0.23 s)

export function createRecoil() {
  const st = { pitch: 0, yaw: 0, since: 99, lastPitch: null, lastYaw: null, kickedP: 0, kickedY: 0 };
  return {
    reset() { st.pitch = st.yaw = 0; st.since = 99; st.lastPitch = st.lastYaw = null; st.kickedP = st.kickedY = 0; },
    /** A shot moved the aim up by `dp` and sideways by `dy` (radians). */
    kick(dp, dy, share = 1) {
      st.pitch += dp * share; st.yaw += dy * share;
      st.kickedP += dp; st.kickedY += dy;
      st.since = 0;
    },
    /** Once per frame, after shots and look input have been applied to `aim`. */
    update(aim, dt, b) {
      if (st.lastPitch !== null) {
        // the player's own look movement this frame (everything except the kicks)
        const dp = aim.pitch - st.lastPitch - st.kickedP;
        const dy = aim.yaw - st.lastYaw - st.kickedY;
        if (dp < 0 && st.pitch > 0) st.pitch = Math.max(0, st.pitch + dp);
        if (dy * st.yaw < 0) st.yaw = Math.abs(dy) >= Math.abs(st.yaw) ? 0 : st.yaw + dy;
      }
      st.since += dt;
      if (st.since > (b.recoil_return_delay ?? 0.1)) {
        const k = 1 - Math.exp(-(b.recoil_return_speed ?? 10) * dt);
        const bp = st.pitch * k, by = st.yaw * k;
        aim.pitch -= bp; aim.yaw -= by;
        st.pitch -= bp; st.yaw -= by;
        if (Math.abs(st.pitch) < 1e-5) st.pitch = 0;
        if (Math.abs(st.yaw) < 1e-5) st.yaw = 0;
      }
      st.lastPitch = aim.pitch; st.lastYaw = aim.yaw;
      st.kickedP = st.kickedY = 0;
    },
    get pending() { return { pitch: st.pitch, yaw: st.yaw }; }
  };
}

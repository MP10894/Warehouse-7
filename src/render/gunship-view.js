// PROTOTYPE of the gunship kill streak's camera (looks only, no shooting yet): lifts your view
// to a gunship circling 150 m above where you stand, through a zoomed thermal camera (grey-
// green picture, people glowing white), with a red square over every enemy and a blinking
// marker over friendlies (you, your partner, turrets). Look around within the camera's reach;
// AIM zooms in further. After 30 s you are back on the ground. Your body stays where it was.
//
// It's here to check two things on a phone before the real streak is built: the frame rate
// with the whole map in view, and whether enemies can be picked out from that height.
// Numbers: settings.json → killstreaks.gunship.
import * as THREE from 'three';

export function createGunshipView({ view, settings, canvas }) {
  const g = () => (settings.killstreaks && settings.killstreaks.gunship) || {};
  const st = { on: false, t: 0, cx: 0, cz: 0, gy: 0, ang: 0, offYaw: 0, offPitch: 0, ads: false, fov: 24 };
  const saved = { far: 0 };
  const v = new THREE.Vector3();

  function apply() {
    const c = g(), cam = view.camera, scene = view.scene;
    const R = c.orbit_radius ?? 90, ALT = c.altitude ?? 150;
    const x = st.cx + Math.cos(st.ang) * R, z = st.cz + Math.sin(st.ang) * R, y = st.gy + ALT;
    cam.position.set(x, y, z);
    // looking at the middle of the circle, plus how far you have looked away from it
    const yaw0 = Math.atan2(-(st.cx - x), -(st.cz - z)), pitch0 = -Math.atan2(ALT, R);
    cam.rotation.set(pitch0 + st.offPitch, yaw0 + st.offYaw, 0);
    const want = st.ads ? (c.zoom_fov ?? 10) : (c.fov ?? 24);
    st.fov += (want - st.fov) * 0.2;
    cam.fov = st.fov; cam.far = 700; cam.updateProjectionMatrix();
    // a thermal camera sees through haze, rain and mist
    scene.fog.near = 400; scene.fog.far = 650;
  }

  return {
    get active() { return st.on; },
    get timeLeft() { return st.t; },
    start(world, player) {
      if (st.on) return;
      const c = g();
      st.on = true; st.t = c.duration ?? 30;
      st.cx = player.x; st.cz = player.z; st.gy = player.y;
      st.ang = Math.atan2(player.z - st.cz, player.x - st.cx) + Math.PI / 2;
      st.offYaw = 0; st.offPitch = 0; st.fov = c.fov ?? 24;
      saved.far = view.camera.far;
      canvas.classList.add('thermal');
    },
    stop() {
      if (!st.on) return;
      st.on = false;
      canvas.classList.remove('thermal');
      view.camera.far = saved.far; view.camera.updateProjectionMatrix();
      view.scene.fog.near = settings.world.fog_near; view.scene.fog.far = settings.world.fog_far;
    },
    /** Look input (the same drags as on the ground), moved round within the camera's reach. */
    look(lookX, lookY, ads) {
      if (!st.on) return;
      st.ads = !!ads;
      const k = st.fov / 72;   // zoomed in: slower
      st.offYaw = Math.max(-0.6, Math.min(0.6, st.offYaw - lookX * k));
      st.offPitch = Math.max(-0.5, Math.min(0.5, st.offPitch - lookY * k));
    },
    /** Each frame, after the normal camera: circle, place the camera. Returns false when time is up. */
    update(dt) {
      if (!st.on) return false;
      st.t -= dt;
      if (st.t <= 0) { this.stop(); return false; }
      st.ang += dt * Math.PI * 2 / (g().orbit_seconds ?? 45);
      apply();
      return true;
    },
    /** The markers and readouts, on the HUD canvas. */
    draw(ctx, W, H, world, localId, time) {
      if (!st.on) return;
      ctx.clearRect(0, 0, W, H);
      const cam = view.camera;
      const at = (x, y, z) => { v.set(x, y, z).project(cam); return v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 ? [Math.round((v.x + 1) / 2 * W), Math.round((1 - v.y) / 2 * H)] : null; };
      const s = Math.max(3, Math.round(H / 40));
      // enemies: a red square round each
      ctx.strokeStyle = 'rgba(255,40,30,0.95)'; ctx.lineWidth = 1;
      for (const e of world.enemies) {
        if (!e.alive) continue;
        const q = at(e.x, e.y + 0.9, e.z);
        if (q) ctx.strokeRect(q[0] - s + 0.5, q[1] - s + 0.5, s * 2, s * 2);
      }
      // friendlies: a blinking marker above them (you, your partner, turrets)
      const blink = Math.floor(time * 3) % 2 === 0;
      if (blink) {
        ctx.fillStyle = 'rgba(80,255,120,0.95)';
        for (const f of [...world.players.filter(p => p.alive), ...(world.turrets || []).filter(t => t.alive)]) {
          const q = at(f.x, f.y + 2.4, f.z);
          if (!q) continue;
          ctx.beginPath(); ctx.moveTo(q[0], q[1] + s); ctx.lineTo(q[0] - s, q[1]); ctx.lineTo(q[0], q[1] - s); ctx.lineTo(q[0] + s, q[1]); ctx.closePath(); ctx.fill();
          if (f.id === localId) { ctx.font = `${Math.max(7, s * 2)}px monospace`; ctx.textAlign = 'center'; ctx.fillText('YOU', q[0], q[1] - s - 2); }
        }
      }
      // gunsight in the middle, and the clock
      const cx = W >> 1, cy = H >> 1, r = Math.round(H / 14);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(cx - r * 2, cy, r * 1.4, 1); ctx.fillRect(cx + r * 0.6, cy, r * 1.4, 1);
      ctx.fillRect(cx, cy - r * 2, 1, r * 1.4); ctx.fillRect(cx, cy + r * 0.6, 1, r * 1.4);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeRect(cx - r + 0.5, cy - r + 0.5, r * 2, r * 2);
      ctx.font = `${Math.max(8, Math.round(H / 22))}px monospace`; ctx.textAlign = 'center';
      ctx.fillText(`GUNSHIP (TEST) · ${Math.ceil(st.t)} s`, cx, Math.round(H * 0.2));
    }
  };
}

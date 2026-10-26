// The gunship kill streak, seen from inside (the rules are in sim/gunship.js): while your player
// is up in the gunship, the view is its camera circling 150 m above, through a zoomed thermal
// lens (grey-green picture, people glowing white), with a red square on every enemy and a
// blinking marker over friendlies (you, your partner, turrets). Dragging looks round within the
// camera's reach; AIM zooms in further. The HUD shows the guns, the time left and how your body
// on the ground is doing. Numbers: settings.json → killstreaks.gunship.
import * as THREE from 'three';

export function createGunshipView({ view, settings, canvas }) {
  const g = () => (settings.killstreaks && settings.killstreaks.gunship) || {};
  const st = { on: false, ang: 0, offYaw: 0, offPitch: 0, ads: false, fov: 24, hurtT: 0, flash: 0 };
  const saved = { far: 0 };
  const v = new THREE.Vector3();
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

  /** The camera's place and its look straight at the middle of the circle. */
  function base(gs) {
    const c = g(), R = c.orbit_radius ?? 90, ALT = c.altitude ?? 150;
    const x = gs.cx + Math.cos(st.ang) * R, z = gs.cz + Math.sin(st.ang) * R, y = gs.gy + ALT;
    return { x, y, z, yaw: Math.atan2(-(gs.cx - x), -(gs.cz - z)), pitch: -Math.atan2(ALT, R) };
  }

  function start(gs) {
    st.on = true; st.ang = gs.ang; st.offYaw = 0; st.offPitch = 0; st.fov = g().fov ?? 24; st.hurtT = 0;
    saved.far = view.camera.far;
    canvas.classList.add('thermal');
  }
  function stop() {
    st.on = false;
    canvas.classList.remove('thermal');
    view.camera.far = saved.far; view.camera.updateProjectionMatrix();
    view.scene.fog.near = settings.world.fog_near; view.scene.fog.far = settings.world.fog_far;
  }

  return {
    get active() { return st.on; },
    /** Your body was hit while you're up there (for the warning). */
    hurt() { st.hurtT = 2; },
    /** Look input moves the camera within its reach; AIM zooms. */
    look(lookX, lookY, ads) {
      if (!st.on) return;
      st.ads = !!ads;
      const k = st.fov / 72;   // zoomed in: slower
      st.offYaw = Math.max(-0.6, Math.min(0.6, st.offYaw - lookX * k));
      st.offPitch = Math.max(-0.5, Math.min(0.5, st.offPitch - lookY * k));
    },
    /** Where the gunship's gun points (the command's yaw / pitch while up there). */
    aim(p) {
      const b = base(p.gunship);
      return { yaw: b.yaw + st.offYaw, pitch: b.pitch + st.offPitch };
    },
    /** Each frame, after the normal camera: follow the player's gunship (or come back down). */
    update(dt, p, playing) {
      const gs = playing && p && p.gunship;
      if (!gs) { if (st.on) stop(); return false; }
      if (!st.on) start(gs);
      // circle smoothly (a co-op guest hears where the gunship is only now and then)
      st.ang += dt * Math.PI * 2 / (g().orbit_seconds ?? 45);
      st.ang += wrap(gs.ang - st.ang) * Math.min(1, dt * 3);
      const c = g(), b = base(gs), cam = view.camera;
      cam.position.set(b.x, b.y, b.z);
      cam.rotation.set(b.pitch + st.offPitch, b.yaw + st.offYaw, 0);
      const want = st.ads ? (c.zoom_fov ?? 10) : (c.fov ?? 24);
      st.fov += (want - st.fov) * Math.min(1, dt * 10);
      cam.fov = st.fov; cam.far = 700; cam.updateProjectionMatrix();
      st.hurtT = Math.max(0, st.hurtT - dt);
      return true;
    },
    /** A thermal camera sees through haze, rain and mist (after the weather has set the fog). */
    fog() { if (st.on) { view.scene.fog.near = 400; view.scene.fog.far = 650; } },
    /** The markers and readouts, on the HUD canvas. */
    draw(ctx, W, H, world, p, time) {
      if (!st.on || !p || !p.gunship) return;
      const gs = p.gunship;
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
      const fs = Math.max(7, s * 2);
      ctx.font = `${fs}px monospace`; ctx.textAlign = 'center';
      if (Math.floor(time * 3) % 2 === 0) {
        ctx.fillStyle = 'rgba(80,255,120,0.95)';
        for (const f of [...world.players.filter(q => q.alive), ...(world.turrets || []).filter(t => t.alive)]) {
          const q = at(f.x, f.y + 2.4, f.z);
          if (!q) continue;
          ctx.beginPath(); ctx.moveTo(q[0], q[1] + s); ctx.lineTo(q[0] - s, q[1]); ctx.lineTo(q[0], q[1] - s); ctx.lineTo(q[0] + s, q[1]); ctx.closePath(); ctx.fill();
          if (f.id === p.id) ctx.fillText('YOU', q[0], q[1] - s - 2);
        }
      }
      // the gunsight: a box for the gun, a wider ring for the rockets
      const cx = W >> 1, cy = H >> 1, r = Math.round(H / 14);
      ctx.fillStyle = ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(cx - r * 2, cy, r * 1.4, 1); ctx.fillRect(cx + r * 0.6, cy, r * 1.4, 1);
      ctx.fillRect(cx, cy - r * 2, 1, r * 1.4); ctx.fillRect(cx, cy + r * 0.6, 1, r * 1.4);
      if (gs.sel) { ctx.beginPath(); ctx.arc(cx + 0.5, cy + 0.5, r * 1.3, 0, Math.PI * 2); ctx.stroke(); }
      else ctx.strokeRect(cx - r + 0.5, cy - r + 0.5, r * 2, r * 2);
      // time left; the guns (the one in use bright); your body
      const big = Math.max(8, Math.round(H / 20));
      ctx.font = `${big}px monospace`; ctx.textAlign = 'center';
      ctx.fillText(`GUNSHIP · ${Math.max(0, Math.ceil(gs.t))} s`, cx, Math.round(H * 0.16));
      ctx.textAlign = 'right';
      const rx = W - Math.round(W * 0.03), by = H - Math.round(H * 0.08);
      ctx.fillStyle = gs.sel ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.95)';
      ctx.fillText(`${gs.sel ? '  ' : '▶ '}GUN  ${gs.ammo}`, rx, by - big * 1.3);
      ctx.fillStyle = gs.sel ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)';
      ctx.fillText(`${gs.sel ? '▶ ' : '  '}ROCKETS  ${gs.rockets}`, rx, by);
      ctx.textAlign = 'center';
      if (st.hurtT > 0 && Math.floor(time * 4) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,60,40,0.95)';
        ctx.font = `${Math.round(big * 1.3)}px monospace`;
        ctx.fillText('YOU\'RE TAKING FIRE!', cx, Math.round(H * 0.3));
      }
    }
  };
}


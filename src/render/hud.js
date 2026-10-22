// Low-resolution overlay: crosshair (opens up with bloom), hit marker and damage direction.
// Plus the minimap, drawn on its own small canvas.
import { V, isFull } from '../sim/grid.js';
import { terrainHeight, groundType } from '../sim/terrain.js';

export function createHud() {
  const st = { hitT: 0, headHit: false, hurt: [] };
  return {
    handle(ev, player) {
      if (!player) return;
      if (ev.type === 'hitConfirm' && ev.playerId === player.id) { st.hitT = 0.15; st.headHit = ev.head; }
      if (ev.type === 'hurt' && ev.targetId === player.id) st.hurt.push({ ang: Math.atan2(ev.fromX - player.x, ev.fromZ - player.z), t: 1 });
    },
    draw(ctx, W, H, player, world, dt) {
      ctx.clearRect(0, 0, W, H);
      st.hitT -= dt;
      if (!player || !player.alive || player.downed) return;
      const cx = W >> 1, cy = H >> 1;
      const slot = player.slots[player.active];
      const def = slot ? world.data.weapons[slot.w] : null;
      const b = world.data.settings.ballistics;
      let spread = b.spread_min + player.bloom + (player.moving && def ? b.bloom_moving_at_100 * def.bloom / 100 : 0);
      if (player.ads) spread *= b.ads_spread_factor;
      const gap = Math.round(2 + spread * H * 1.2);
      if (!player.ads || (def && def.id === 'rpg7')) {
        ctx.fillStyle = 'rgba(255,240,200,0.9)';
        ctx.fillRect(cx - gap - 4, cy, 4, 1); ctx.fillRect(cx + gap + 1, cy, 4, 1);
        ctx.fillRect(cx, cy - gap - 4, 1, 4); ctx.fillRect(cx, cy + gap + 1, 1, 4);
      } else {
        ctx.fillStyle = 'rgba(255,60,40,0.95)';
        ctx.fillRect(cx, cy, 1, 1);
      }
      if (st.hitT > 0) {
        ctx.fillStyle = st.headHit ? '#ff4030' : '#ffffff';
        for (let i = 3; i < 7; i++) { ctx.fillRect(cx - i, cy - i, 1, 1); ctx.fillRect(cx + i, cy - i, 1, 1); ctx.fillRect(cx - i, cy + i, 1, 1); ctx.fillRect(cx + i, cy + i, 1, 1); }
      }
      // red marks at the screen edge in the direction damage came from
      st.hurt = st.hurt.filter(h => (h.t -= dt * 0.8) > 0);
      for (const h of st.hurt) {
        const rel = h.ang - Math.atan2(-Math.sin(player.yaw), -Math.cos(player.yaw));
        const a = rel;
        const r = Math.min(W, H) * 0.32;
        const x = cx - Math.sin(a) * r * 1.4, y = cy - Math.cos(a) * r;
        ctx.fillStyle = `rgba(220,40,30,${h.t})`;
        ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
      }
    }
  };
}

/** Top-down map of the level, redrawn when blocks change. */
export function createMinimap(canvas) {
  const g = canvas.getContext('2d');
  let base = null, version = -1;
  function bake(world) {
    const size = world.level.size;
    base = document.createElement('canvas');
    base.width = size; base.height = size;
    const bg = base.getContext('2d');
    const img = bg.createImageData(size, size);
    const grid = world.grid;
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      let top = -1;
      for (let y = grid.h - 1; y >= 0; y--) { const t = grid.cells[x + z * grid.w + y * grid.w * grid.d]; if (t !== V.AIR) { top = t; break; } }
      const gt = groundType(world.ground, x, z);
      let c = gt === 'r' ? [70, 68, 64] : gt === 'p' ? [150, 142, 128] : gt === 'g' ? [140, 128, 108] : [196, 168, 118];
      const h = terrainHeight(world.terrain, x + 0.5, z + 0.5);
      c = c.map(v => v + h * 6);
      if (top >= 0) c = isFull(top) ? (top === V.SLAB ? [96, 92, 86] : [52, 50, 46]) : [120, 112, 100];
      const i = (x + z * size) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
    bg.putImageData(img, 0, 0);
    version = world.voxelVersion;
  }
  return {
    draw(world, player, now) {
      if (!base || version !== world.voxelVersion || base.width !== world.level.size) bake(world);
      // big levels show a window around the player instead of the whole map
      const size = world.level.size, span = Math.min(size, 120);
      const W = canvas.width, H = canvas.height, k = W / span;
      const cx = player ? player.x : size / 2, cz = player ? player.z : size / 2;
      const ox = Math.max(0, Math.min(size - span, cx - span / 2)), oz = Math.max(0, Math.min(size - span, cz - span / 2));
      const X = x => (x - ox) * k, Z = z => (z - oz) * k;
      const edge = v => Math.max(3, Math.min(W - 3, v));
      g.imageSmoothingEnabled = false;
      g.drawImage(base, ox, oz, span, span, 0, 0, W, H);
      const a = world.base.area;
      g.strokeStyle = world.base.claimed ? '#f0a23a' : '#c8402e';
      g.lineWidth = 2;
      g.strokeRect(X(a.x0), Z(a.z0), (a.x1 - a.x0) * k, (a.z1 - a.z0) * k);
      for (const pk of world.pickups) {
        if (pk.type !== 'item') continue;
        if (Math.floor(now / 300) % 2) { g.fillStyle = '#ffd040'; g.fillRect(edge(X(pk.x)) - 3, edge(Z(pk.z)) - 3, 6, 6); }
      }
      for (const s of world.base.buildSpots) {
        if (!world.base.claimed) continue;
        g.strokeStyle = '#ffd040'; g.lineWidth = 1; g.strokeRect(X(s.x) - 3, Z(s.z) - 3, 6, 6);
      }
      for (const w of world.weather) {
        if (!w.active) continue;
        g.fillStyle = `rgba(180,140,80,${0.45 * w.intensity})`;
        g.beginPath(); g.arc(X(w.x), Z(w.z), w.radius * k, 0, Math.PI * 2); g.fill();
      }
      if (player) {
        for (const e of world.enemies) {
          if (!e.alive || Math.hypot(e.x - player.x, e.z - player.z) > 22) continue;
          g.fillStyle = '#e03020'; g.fillRect(X(e.x) - 2, Z(e.z) - 2, 4, 4);
        }
        for (const p of world.players) {
          const me = p === player;
          g.save();
          g.translate(edge(X(p.x)), edge(Z(p.z)));
          g.rotate(-p.yaw);
          g.fillStyle = me ? '#ffffff' : '#60d0ff';
          g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 4); g.lineTo(-4, 4); g.closePath(); g.fill();
          g.restore();
        }
      }
    }
  };
}

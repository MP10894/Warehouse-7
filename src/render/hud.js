// Low-resolution overlay: crosshair (opens up with bloom), hit marker and damage direction.
// Plus the minimap, drawn on its own small canvas.
import { V, isFull } from '../sim/grid.js';
import { terrainHeight, groundType } from '../sim/terrain.js';
import { levelBases, crateWanted, spotUseful } from '../sim/base.js';

export function createHud() {
  const st = { hitT: 0, headHit: false, hurt: [] };
  const api = {
    handle(ev, player) {
      if (!player) return;
      if (ev.type === 'hitConfirm' && ev.playerId === player.id) { st.hitT = 0.15; st.headHit = ev.head; }
      if (ev.type === 'hurt' && ev.targetId === player.id) st.hurt.push({ ang: Math.atan2(ev.fromX - player.x, ev.fromZ - player.z), t: 1 });
    },
    draw(ctx, W, H, player, world, dt, scope = 0) {
      ctx.clearRect(0, 0, W, H);
      st.hitT -= dt;
      if (!player || !player.alive || player.downed) return;
      const cx = W >> 1, cy = H >> 1;
      if (scope > 0.01) { drawScope(ctx, W, H, scope); if (scope > 0.6) { drawHits(ctx, W, H, player, dt); return; } }
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
      drawHits(ctx, W, H, player, dt);
    }
  };
  function drawHits(ctx, W, H, player, dt) {
      const cx = W >> 1, cy = H >> 1;
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
  return api;
}

/** The view through a telescopic sight: black all round a round lens, a thin crosshair. */
function drawScope(ctx, W, H, k) {
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.47;
  ctx.save();
  ctx.globalAlpha = Math.min(1, k * 1.6);
  ctx.fillStyle = '#050505';
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.arc(cx, cy, R, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  // a darker rim inside the lens
  const g = ctx.createRadialGradient(cx, cy, R * 0.75, cx, cy, R);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  // reticle: thin lines with thicker posts at the edges, a gap at the centre
  ctx.fillStyle = 'rgba(10,10,10,0.95)';
  const gap = Math.max(2, Math.round(R * 0.05));
  ctx.fillRect(Math.round(cx - R), Math.round(cy), Math.round(R - gap), 1);
  ctx.fillRect(Math.round(cx + gap), Math.round(cy), Math.round(R - gap), 1);
  ctx.fillRect(Math.round(cx), Math.round(cy + gap), 1, Math.round(R - gap));
  ctx.fillRect(Math.round(cx), Math.round(cy - R), 1, Math.round(R - gap));
  const post = Math.round(R * 0.55);
  ctx.fillRect(Math.round(cx - R), Math.round(cy) - 1, Math.round(R - post), 3);
  ctx.fillRect(Math.round(cx + post), Math.round(cy) - 1, Math.round(R - post), 3);
  ctx.fillRect(Math.round(cx) - 1, Math.round(cy + post), 3, Math.round(R - post));
  ctx.fillStyle = 'rgba(220,40,30,0.95)';
  ctx.fillRect(Math.round(cx), Math.round(cy), 1, 1);
  ctx.restore();
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
      let c = gt === 'r' ? [70, 68, 64] : gt === 'p' ? [150, 142, 128] : gt === 'g' ? [140, 128, 108] : gt === 'c' ? [150, 150, 144] : gt === 'd' ? [170, 140, 100] : [196, 168, 118];
      const h = terrainHeight(world.terrain, x + 0.5, z + 0.5);
      c = c.map(v => v + h * 6);
      if (top >= 0) c = top === V.TANK ? [170, 174, 172] : top === V.FENCE ? [110, 110, 104] : top === V.PIPE ? [70, 92, 106]
        : top === V.ROCK ? [120, 104, 86] : isFull(top) ? (top === V.SLAB ? [96, 92, 86] : [52, 50, 46]) : [120, 112, 100];
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
      // base areas: red while enemy-held, orange once yours (the others fade out then)
      levelBases(world.data.levels[world.levelId]).forEach((def, i) => {
        const a = def.area, mine = world.base.claimed && world.base.index === i;
        if (world.base.claimed && !mine) g.strokeStyle = 'rgba(200,64,46,0.35)';
        else g.strokeStyle = mine ? '#f0a23a' : '#c8402e';
        g.lineWidth = 2;
        g.strokeRect(X(a.x0), Z(a.z0), (a.x1 - a.x0) * k, (a.z1 - a.z0) * k);
      });
      for (const pk of world.pickups) {
        if (pk.type !== 'item' || !crateWanted(world, pk.item)) continue;
        if (Math.floor(now / 300) % 2) { g.fillStyle = '#ffd040'; g.fillRect(edge(X(pk.x)) - 3, edge(Z(pk.z)) - 3, 6, 6); }
      }
      if (world.base.claimed) for (const s of world.base.buildSpots) {
        if (!spotUseful(world, s)) continue;
        g.strokeStyle = '#ffd040'; g.lineWidth = 1; g.strokeRect(X(s.x + 0.5) - 3, Z(s.z + 0.5) - 3, 6, 6);
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

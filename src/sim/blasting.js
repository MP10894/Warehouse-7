// Blasting in the mine (Kambala): a detonator on the pit floor sets off charges along the
// bench walls, and unstable rock faces come down when an explosion hits them.
//
// level.json → "blasting":
//   detonator: { x, z }                      the plunger box (stand within 2 m: DETONATE)
//   charges:   [{ x, z, y }, …]              where each charge sits, at the foot of a bench wall
//   unstable:  [{ x, z, y, points: [{ x, z, y }, …] }, …]   cracked faces; points: where the rock lands
//
// DETONATE: a siren for a few seconds (everyone can get clear), then every charge goes off:
// anyone within the danger radius on the bench below is badly hurt, and rock falls there as
// breakable slabs (new cover; it can block the haul road until it's blown or shot apart).
// Then it recharges. An explosion within reach of an unstable face brings that face down
// (once), the same way. Numbers: settings.json → blasting.
//
// Co-op: every blast and collapse is written to the base log (b<n> / u<n>), and where the rock
// lands comes from the position and the blast number only, so the partner's phone drops the
// same rocks in the same order.
import { V, gidx, getV, setV, inGrid } from './grid.js';
import { terrainHeight, groundType } from './terrain.js';
import { emit, damageActor } from './damage.js';
import { markNavDirty } from './nav.js';

const conf = world => world.data.settings.blasting || {};
const def = world => world.data.levels[world.levelId].blasting || null;

export function createBlasting() {
  return { count: 0, state: 'idle', sirenT: 0, readyAt: 0, collapsed: [], by: null };
}

/** A repeatable number in [0, 1) from a cell and a blast number (the same on every phone). */
const hash = (x, z, k) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };

/** Seconds until the detonator can be used again (0 = ready). */
export const blastWait = world => Math.max(0, world.blast.readyAt - world.time);

/** The detonator within reach of this player, or null. */
export function detonatorFor(world, p) {
  const d = def(world);
  if (!d || !d.detonator) return null;
  const dx = d.detonator.x + 0.5 - p.x, dz = d.detonator.z + 0.5 - p.z;
  return Math.hypot(dx, dz) <= (conf(world).use_range ?? 2) ? d.detonator : null;
}

/** DETONATE: start the siren (if the detonator is ready). */
export function detonate(world, p) {
  const b = world.blast;
  if (!def(world) || b.state !== 'idle' || blastWait(world) > 0) return false;
  b.state = 'siren'; b.sirenT = conf(world).siren_time ?? 5; b.by = p ? p.id : null;
  emit(world, { type: 'siren', x: def(world).detonator.x, z: def(world).detonator.z, time: b.sirenT });
  emit(world, { type: 'message', text: `BLASTING IN ${Math.round(b.sirenT)} SECONDS — GET OFF THE BENCHES` });
  return true;
}

/**
 * Rock comes down around these points (cells on the bench below a wall). Host and guest both
 * run this; only the host hurts anyone (hurt = true).
 */
function fall(world, points, k, source, hurt) {
  const c = conf(world), g = world.grid;
  const R = c.rock_radius ?? 3.5, share = c.rock_share ?? 0.3, D = c.danger_radius ?? 4.5;
  const cells = [];
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const pt of points) {
    // (the partner's phone gets the host's explosions as events; it only drops the rock)
    if (hurt) emit(world, { type: 'explosion', x: pt.x + 0.5, y: pt.y + 1.5, z: pt.z + 0.5, r: 2.2 });
    for (let z = Math.floor(pt.z - R); z <= Math.ceil(pt.z + R); z++) {
      for (let x = Math.floor(pt.x - R); x <= Math.ceil(pt.x + R); x++) {
        // on the haul road rock falls sparsely and only knee-high: something to weave round,
        // never a wall (or attackers could never reach the pit floor again)
        const road = groundType(world.ground, x + 0.5, z + 0.5) === 't';
        if (Math.hypot(x - pt.x, z - pt.z) > R || hash(x, z, k) >= (road ? share * (c.road_share_factor ?? 0.3) : share)) continue;
        const ground = terrainHeight(world.terrain, x + 0.5, z + 0.5);
        if (Math.abs(ground - pt.y) > 1.2) continue;             // only on this bench
        const y0 = Math.round(ground), h = !road && hash(z, x, k + 7) < 0.4 ? 2 : 1;
        const piece = [];
        for (let y = y0; y < y0 + h; y++) {
          if (!inGrid(g, x, y, z) || getV(g, x, y, z) !== V.AIR) continue;
          setV(g, x, y, z, V.ROCK);
          const i = gidx(g, x, y, z);
          piece.push(i); cells.push(i);
        }
        if (piece.length) {
          const id = world.pieces.length + 1, m = world.data.materials.rockslab;
          world.pieces.push({ id, material: 'rockslab', cells: piece, hp: m ? m.health : 150, armour: m ? m.armour : 60, alive: true });
          for (const i of piece) world.pieceOf[i] = id;
        }
        x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z);
      }
    }
  }
  if (cells.length) {
    world.voxelVersion++;
    markNavDirty(world, x0, z0, x1, z1);
    emit(world, { type: 'blocks', cells, material: 'rockslab', rockfall: true });
  }
  if (!hurt) return;
  // everyone in the danger strips: badly hurt, more the closer they are
  const H = c.damage_health ?? 200, A = c.damage_armour ?? 200;
  for (const a of [...world.players, ...world.enemies, ...(world.turrets || [])]) {
    if (!a.alive || a.downed) continue;
    let near = Infinity;
    for (const pt of points) if (Math.abs(a.y - pt.y) < 2.5) near = Math.min(near, Math.hypot(a.x - pt.x - 0.5, a.z - pt.z - 0.5));
    if (near > D) continue;
    const k2 = 1 - 0.5 * near / D;
    damageActor(world, a, H * k2, A * k2, source);
  }
}

function blastNow(world, hurt = true) {
  const b = world.blast, d = def(world);
  b.count++;
  const source = world.players.find(p => p.id === b.by) || null;
  fall(world, d.charges || [], b.count, source, hurt);
  world.base.log.push(`b${b.count}`);
  b.state = 'idle';
  b.readyAt = world.time + (conf(world).recharge ?? 60);
  emit(world, { type: 'message', text: 'BLAST!' });
}

/** An explosion at (x, y, z): does it bring an unstable face down? (host only) */
export function checkUnstable(world, x, y, z, source) {
  const d = def(world);
  if (!d || !d.unstable) return;
  const reach = conf(world).unstable_reach ?? 3;
  d.unstable.forEach((u, i) => {
    if (world.blast.collapsed.includes(i)) return;
    if (Math.hypot(x - u.x - 0.5, z - u.z - 0.5) > reach || Math.abs(y - u.y) > 4) return;
    world.blast.collapsed.push(i);
    fall(world, u.points, 1000 + i, source, true);
    world.base.log.push(`u${i}`);
    emit(world, { type: 'message', text: 'ROCKFALL!' });
  });
}

/** Each tick: count the siren down, then blast. */
export function updateBlasting(world, dt) {
  const b = world.blast;
  if (!b || b.state !== 'siren') return;
  b.sirenT -= dt;
  if (b.sirenT <= 0) blastNow(world);
}

/** Co-op guest: replay a blast or collapse from the host's log (rock only; the host did the damage). */
export function replayBlast(world, token) {
  const d = def(world);
  if (!d) return;
  if (token[0] === 'b') {
    const n = Number(token.slice(1));
    world.blast.count = n;
    fall(world, d.charges || [], n, null, false);
  } else if (token[0] === 'u') {
    const i = Number(token.slice(1));
    if (!world.blast.collapsed.includes(i) && d.unstable && d.unstable[i]) { world.blast.collapsed.push(i); fall(world, d.unstable[i].points, 1000 + i, null, false); }
  }
}

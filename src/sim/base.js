// The player base: claiming it, carrying base-building items, building upgrades.
import { placeBlocks } from './level.js';
import { V } from './grid.js';
import { markNavDirty } from './nav.js';
import { emit, dropPickup } from './damage.js';

export function createBase(level) {
  const b = level.base;
  return {
    name: b.name, area: b.area, buildSpots: b.build_spots, wallPlan: b.wall_plan,
    claimed: false, buildCount: 0,
    upgrades: { walls: { level: 0, pieces: [] } }
  };
}

export const inBase = (world, x, z) => {
  const a = world.base.area;
  return x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1;
};

export function updateBase(world) {
  const b = world.base;
  if (b.claimed) return;
  const level = world.data.levels[world.levelId];
  const holders = level.enemy_groups.filter(g => g.holds_base).map(g => g.id);
  const defendersLeft = world.enemies.some(e => e.alive && (holders.includes(e.group) || inBase(world, e.x, e.z)));
  const playerInside = world.players.some(p => p.alive && !p.downed && inBase(world, p.x, p.z));
  if (!defendersLeft && playerInside) {
    b.claimed = true;
    emit(world, { type: 'baseClaimed' });
    emit(world, { type: 'message', text: `${b.name.toUpperCase()} SECURED — IT'S YOUR BASE` });
  }
}

/** The build spot a player is standing at, if they carry what it needs. */
export function buildSpotFor(world, p) {
  const b = world.base;
  if (!b.claimed || !p.carrying) return null;
  const r = world.data.settings.base.build_range;
  return b.buildSpots.find(s => s.needs === p.carrying.item && Math.hypot(s.x - p.x, s.z - p.z) <= r) || null;
}

/** Put the base walls up to `level` blocks high (also used by a co-op guest to mirror the host). */
export function placeWalls(world, level) {
  const b = world.base, up = b.upgrades.walls;
  up.level = level;
  for (const r of b.wallPlan) {
    for (let dz = 0; dz < (r.d || 1); dz++) for (let dx = 0; dx < (r.w || 1); dx++) {
      const pid = placeBlocks(world, r.x + dx, r.z + dz, V.SANDBAG, level);
      if (pid) up.pieces.push(pid);
    }
  }
  world.voxelVersion++;
  for (const r of b.wallPlan) markNavDirty(world, r.x, r.z, r.x + (r.w || 1) - 1, r.z + (r.d || 1) - 1);
  emit(world, { type: 'blocks', cells: [], material: 'sandbags', rebuild: true });
}

export function build(world, p, spot) {
  const b = world.base;
  if (spot.upgrade === 'walls') placeWalls(world, Math.min(2, b.upgrades.walls.level + 1));
  b.buildCount++;
  const origin = p.carrying.origin;
  world.pending.push({ kind: 'respawnItem', item: p.carrying.item, x: origin.x, y: origin.y, z: origin.z, t: world.data.settings.base.item_respawn });
  p.carrying = null;
  emit(world, { type: 'built', upgrade: spot.upgrade, level: b.upgrades.walls.level, playerId: p.id });
  emit(world, { type: 'message', text: b.upgrades.walls.level > 1 ? 'WALLS REINFORCED' : 'WALLS BUILT' });
  return true;
}

export function respawnItem(world, job) {
  dropPickup(world, { type: 'item', item: job.item, origin: { x: job.x, y: job.y, z: job.z }, x: job.x, y: job.y, z: job.z });
}

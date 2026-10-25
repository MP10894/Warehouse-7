// The player base: claiming one, carrying base-building crates, building and upgrading,
// and what the upgrades produce.
//
// A level has one or more base areas (level.json "bases", or a single "base"). The first
// one a player clears and walks into becomes THE base for the rest of the run; the others
// stay enemy territory. world.base holds the claimed base (for a level with only one base
// area it is filled in from the start, but not claimed).
//
// Upgrades come from data/upgrades.csv: one row per level, so the number of rows is the
// number of levels. Walls put up sandbags along the base's wall plan; the other upgrades
// are a locker (one destructible block) that hands out a pickup every so often.
import { placeBlocks } from './level.js';
import { V, getV } from './grid.js';
import { terrainHeight } from './terrain.js';
import { groundAt } from './body.js';
import { markNavDirty } from './nav.js';
import { startWaves } from './waves.js';
import { emit, dropPickup } from './damage.js';

/** The level's base areas as a list (a level may define one "base" or several "bases"). */
export function levelBases(level) {
  if (Array.isArray(level.bases)) return level.bases.map((b, i) => ({ id: b.id || `base${i + 1}`, ...b }));
  return level.base ? [{ id: level.base.id || 'base', ...level.base }] : [];
}

function fill(state, def, index, upgrades) {
  Object.assign(state, {
    index, id: def.id, name: def.name, area: def.area, buildSpots: def.build_spots || [], wallPlan: def.wall_plan || []
  });
  state.upgrades = {};
  for (const s of state.buildSpots) {
    if (!upgrades[s.upgrade] || state.upgrades[s.upgrade]) continue;
    state.upgrades[s.upgrade] = { level: 0, pieces: [], piece: 0, dropId: null, nextT: 0 };
  }
  if (!state.upgrades.walls) state.upgrades.walls = { level: 0, pieces: [], piece: 0, dropId: null, nextT: 0 };
}

export function createBase(level, upgrades = {}) {
  const bases = levelBases(level);
  const state = { claimed: false, index: -1, id: null, name: '', area: null, buildSpots: [], wallPlan: [], buildCount: 0, upgrades: {}, log: [], cleared: [] };
  // only one base area: everything is known from the start (the tests rely on this too)
  if (bases.length === 1) fill(state, bases[0], 0, upgrades);
  return state;
}

export const inArea = (a, x, z) => !!a && x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1;
export const inBase = (world, x, z) => inArea(world.base.area, x, z);

/** Does this enemy group defend base `def`? ("holds_base": the base's id, or true for a level's only base) */
export function holdsBase(group, def, baseCount) {
  if (!group.holds_base) return false;
  if (group.holds_base === true) return baseCount === 1 || def.index === 0;
  return group.holds_base === def.id;
}

/** Make base `index` the player base. silent: copy only (a co-op guest mirroring the host). */
function markCleared(b, id) {
  if (!b.cleared) b.cleared = [];
  if (!b.cleared.includes(id)) b.cleared.push(id);
}

/**
 * Base areas enemies must not spawn in: the claimed base and every base that has been cleared,
 * each grown by settings enemy_ai.base_spawn_margin metres so nobody appears right at the walls.
 */
export function noSpawnAreas(world) {
  const level = world.data.levels[world.levelId];
  const m = world.data.settings.enemy_ai?.base_spawn_margin ?? 8;
  const ids = new Set(world.base.cleared || []);
  if (world.base.claimed) ids.add(world.base.id);
  return levelBases(level).filter(d => ids.has(d.id) && d.area)
    .map(d => ({ x0: d.area.x0 - m, z0: d.area.z0 - m, x1: d.area.x1 + m, z1: d.area.z1 + m }));
}

export function claimBase(world, index, silent = false) {
  const level = world.data.levels[world.levelId];
  const def = levelBases(level)[index];
  if (!def || world.base.claimed) return;
  const keepLog = world.base.log;
  fill(world.base, def, index, world.data.upgrades);
  world.base.log = keepLog;
  world.base.claimed = true;
  markCleared(world.base, def.id);
  world.cache.baseField = null;
  // crates that belong to another base (level.json → base_items "base") are taken away;
  // one already in someone's hands stays
  world.pickups = world.pickups.filter(k => !(k.type === 'item' && k.base && k.base !== def.id));
  if (silent) return;
  emit(world, { type: 'baseClaimed', base: def.id });
  emit(world, { type: 'message', text: `${def.name.toUpperCase()} SECURED — HOLD IT UNTIL THE CLOCK RUNS OUT` });
  // the level timer and the attack waves start now
  startWaves(world);
}

export function updateBase(world) {
  const b = world.base;
  if (!b.claimed) {
    const level = world.data.levels[world.levelId];
    const bases = levelBases(level);
    bases.forEach((def, index) => {
      if (b.claimed) return;
      const holders = level.enemy_groups.filter(g => holdsBase(g, { ...def, index }, bases.length)).map(g => g.id);
      const defendersLeft = world.enemies.some(e => e.alive && !e.wave && (holders.includes(e.group) || inArea(def.area, e.x, e.z)));
      // a base whose defenders are all dead stays cleared: nobody spawns in it again
      if (!defendersLeft) markCleared(b, def.id);
      const playerInside = world.players.some(p => p.alive && !p.downed && inArea(def.area, p.x, p.z));
      if (!defendersLeft && playerInside) claimBase(world, index);
    });
    return;
  }
  produce(world);
}

// ---------------------------------------------------------------- upgrades

export const upgradeDef = (world, id) => world.data.upgrades[id];
export const maxLevel = (world, id) => (upgradeDef(world, id) ? upgradeDef(world, id).levels.length : 0);
const spotOf = (world, id) => world.base.buildSpots.find(s => s.upgrade === id);
export const crateName = item => String(item || 'crate').replace(/_/g, ' ').toUpperCase();

/** Wall-plan cells that should hold a sandbag at ground level but don't (never built, or blown up). */
export function missingWallCells(world) {
  const g = world.grid, out = [];
  for (const r of world.base.wallPlan) {
    for (let dz = 0; dz < (r.d || 1); dz++) for (let dx = 0; dx < (r.w || 1); dx++) {
      const x = r.x + dx, z = r.z + dz;
      const y = Math.max(0, Math.round(terrainHeight(world.terrain, x + 0.5, z + 0.5)));
      if (getV(g, x, y, z) !== V.SANDBAG) out.push([x, z]);
    }
  }
  return out;
}

/** Would building at this spot do anything? (not maxed; walls at the top level can still be repaired) */
export function spotUseful(world, spot) {
  const up = world.base.upgrades[spot.upgrade];
  if (!up) return false;
  if (up.level < maxLevel(world, spot.upgrade)) return true;
  return spot.upgrade === 'walls' && missingWallCells(world).length > 0;
}

/** The build spot a player is standing at, if they carry what it needs and building there helps. */
export function buildSpotFor(world, p) {
  const b = world.base;
  if (!b.claimed || !p.carrying) return null;
  const r = world.data.settings.base.build_range;
  return b.buildSpots.find(s => s.needs === p.carrying.item && Math.hypot(s.x + 0.5 - p.x, s.z + 0.5 - p.z) <= r && spotUseful(world, s)) || null;
}

/**
 * The armoury: a built ammunition supply also hands out weapons (upgrades.csv → unlocks,
 * one or more weapon ids per level, separated by spaces; every level keeps the ones before).
 * Returns the weapon ids on offer now (empty when there is no supply).
 */
export function armouryWeapons(world) {
  const b = world.base;
  if (!b.claimed) return [];
  const out = [];
  for (const [id, up] of Object.entries(b.upgrades)) {
    const def = upgradeDef(world, id);
    if (!up.level || !def) continue;
    for (const row of def.levels.slice(0, up.level))
      for (const w of String(row.unlocks || '').split(/[\s;,]+/)) if (w && world.data.weapons[w] && !out.includes(w)) out.push(w);
  }
  return out;
}

/** Is this player standing at a locker that hands out weapons? Returns that build spot or null. */
export function armouryFor(world, p) {
  const b = world.base;
  if (!b.claimed) return null;
  const r = world.data.settings.base.build_range;
  return b.buildSpots.find(s => {
    const up = b.upgrades[s.upgrade];
    return up && up.level > 0 && upgradeDef(world, s.upgrade)?.levels.some(l => l.unlocks) &&
      Math.hypot(s.x + 0.5 - p.x, s.z + 0.5 - p.z) <= r && Math.abs(groundAt(world, s.x + 0.5, s.z + 0.5, p.y + 1) - p.y) < 1.6;
  }) || null;
}

/** Context-button text for building at a spot. */
export function buildLabel(world, spot) {
  const up = world.base.upgrades[spot.upgrade], max = maxLevel(world, spot.upgrade);
  const name = upgradeDef(world, spot.upgrade).name.toUpperCase();
  if (spot.upgrade === 'walls') return up.level === 0 ? 'BUILD WALLS' : up.level >= max ? 'REPAIR WALLS' : 'REINFORCE WALLS';
  return up.level === 0 ? `BUILD ${name}` : `UPGRADE ${name} ${up.level + 1}/${max}`;
}

/** Put the base walls up to `height` blocks high where they are missing. Returns the cells filled. */
export function placeWalls(world, height) {
  const b = world.base, up = b.upgrades.walls, cells = [];
  for (const r of b.wallPlan) {
    for (let dz = 0; dz < (r.d || 1); dz++) for (let dx = 0; dx < (r.w || 1); dx++) {
      const pid = placeBlocks(world, r.x + dx, r.z + dz, V.SANDBAG, height);
      if (pid) { up.pieces.push(pid); cells.push(...world.pieces[pid - 1].cells); }
    }
  }
  if (cells.length) {
    world.voxelVersion++;
    for (const r of b.wallPlan) markNavDirty(world, r.x, r.z, r.x + (r.w || 1) - 1, r.z + (r.d || 1) - 1);
    emit(world, { type: 'blocks', cells, material: 'sandbags', placed: true });
  }
  return cells;
}

/**
 * Set an upgrade to `level` and put up what it needs (walls, or its locker if that is
 * missing). Shared by the host and a co-op guest replaying the host's build log, so it
 * places exactly the same blocks in the same order.
 */
export function applyUpgrade(world, id, level) {
  const b = world.base, up = b.upgrades[id], def = upgradeDef(world, id);
  if (!up || !def) return;
  up.level = level;
  if (id === 'walls') {
    placeWalls(world, Number(def.levels[level - 1].wall_height) || level);
  } else if (!up.piece || !world.pieces[up.piece - 1].alive) {
    const s = spotOf(world, id);
    const pid = placeBlocks(world, s.x, s.z, V.LOCKER, 1);
    up.piece = pid;
    if (pid) {
      world.pieces[pid - 1].upgrade = id;
      world.voxelVersion++;
      markNavDirty(world, s.x, s.z, s.x, s.z);
      emit(world, { type: 'blocks', cells: world.pieces[pid - 1].cells, material: 'locker', placed: true });
    }
    up.nextT = world.time;   // a fresh locker hands out its first supply straight away
  }
  b.log.push(`${Object.keys(world.data.upgrades).indexOf(id)}.${level}`);
}

/** Host: a player builds at a spot with the crate they carry. */
export function build(world, p, spot) {
  const b = world.base, id = spot.upgrade, up = b.upgrades[id];
  const max = maxLevel(world, id);
  const level = Math.min(max, up.level + 1);
  applyUpgrade(world, id, level);
  b.buildCount++;
  const item = p.carrying.item, origin = p.carrying.origin;
  p.carrying = null;
  // the crate comes back at its spot (unless its upgrade is now at the top level)
  if (crateWanted(world, item)) world.pending.push({ kind: 'respawnItem', item, x: origin.x, y: origin.y, z: origin.z, t: world.data.settings.base.item_respawn });
  emit(world, { type: 'built', upgrade: id, level, playerId: p.id });
  const name = upgradeDef(world, id).name.toUpperCase();
  emit(world, { type: 'message', text: id === 'walls' ? (level > 1 ? 'WALLS REINFORCED' : 'WALLS BUILT') : level > 1 ? `${name} — LEVEL ${level}` : `${name} BUILT` });
  return true;
}

/** Is a crate of this kind still useful? Construction crates always are (walls get destroyed). */
export function crateWanted(world, item) {
  if (item === 'construction_crate') return true;
  const b = world.base;
  if (!b.claimed) return true;
  const spot = b.buildSpots.find(s => s.needs === item);
  if (!spot) return true;
  return b.upgrades[spot.upgrade].level < maxLevel(world, spot.upgrade);
}

export function respawnItem(world, job) {
  if (!crateWanted(world, job.item)) return;
  dropPickup(world, { type: 'item', item: job.item, origin: { x: job.x, y: job.y, z: job.z }, x: job.x, y: job.y, z: job.z });
}

/** Make sure a crate of this kind exists somewhere (lying around, carried, or on its way back). */
function ensureCrate(world, item) {
  const exists = world.pickups.some(k => k.type === 'item' && k.item === item)
    || world.players.some(p => p.carrying && p.carrying.item === item)
    || world.pending.some(j => j.kind === 'respawnItem' && j.item === item);
  if (exists) return;
  // bring it back at the home spot nearest the base
  const a = world.base.area, bx = a ? (a.x0 + a.x1) / 2 : 0, bz = a ? (a.z0 + a.z1) / 2 : 0;
  const all = (world.data.levels[world.levelId].base_items || []).filter(it => it.item === item);
  const own = all.filter(it => it.base === world.base.id);   // this base's own crate spots, if it has any
  const home = (own.length ? own : all)
    .sort((p, q) => Math.hypot(p.x - bx, p.z - bz) - Math.hypot(q.x - bx, q.z - bz))[0];
  if (home) world.pending.push({ kind: 'respawnItem', item, x: home.x, y: groundAt(world, home.x, home.z, (home.y ?? 30) + 0.6), z: home.z, t: world.data.settings.base.item_respawn });
}

/**
 * Called when any destructible piece breaks (host and guest alike). Pieces put up by
 * building are logged, so a co-op guest can replay builds and breakages in the same
 * order. A destroyed locker takes its upgrade back to nothing.
 */
export function onPieceDestroyed(world, p) {
  const b = world.base;
  if (world.basePieceCount !== undefined && p.id > world.basePieceCount) b.log.push(`-${p.id - world.basePieceCount}`);
  if (!p.upgrade || !b.upgrades[p.upgrade]) return;
  const up = b.upgrades[p.upgrade];
  if (up.piece !== p.id) return;
  up.level = 0; up.piece = 0; up.dropId = null;
  emit(world, { type: 'message', text: `${upgradeDef(world, p.upgrade).name.toUpperCase()} DESTROYED` });
  ensureCrate(world, upgradeDef(world, p.upgrade).needs);
}

/** Lockers hand out a pickup every so often; one waits on top of the locker at a time. */
function produce(world) {
  const b = world.base;
  for (const [id, up] of Object.entries(b.upgrades)) {
    if (id === 'walls' || up.level <= 0 || !up.piece) continue;
    const row = upgradeDef(world, id).levels[up.level - 1];
    if (!row || !row.gives) continue;
    if (up.dropId !== null) {
      if (world.pickups.some(k => k.id === up.dropId)) continue;
      up.dropId = null;
      up.nextT = world.time + (Number(row.every) || 30);   // taken: the next one comes later
      continue;
    }
    if (world.time < up.nextT) continue;
    const s = spotOf(world, id);
    const pk = dropPickup(world, { type: row.gives, amount: Number(row.amount) || 0, x: s.x + 0.5, y: groundAt(world, s.x + 0.5, s.z + 0.5, 40), z: s.z + 0.5, reach: 1.6 });
    up.dropId = pk.id;
  }
}

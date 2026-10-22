// The damage model, shared by people and destructible blocks:
// armour soaks damage first; when it runs out mid-hit, the unused share of the hit
// goes to health (see DESIGN.md → Players).
import { V, V_INFO, getV, cellXYZ, gidx } from './grid.js';
import { terrainHeight } from './terrain.js';
import { rand } from './rng.js';

export const emit = (world, ev) => world.events.push(ev);

/** Apply one hit to something with { hp, armour }. Returns health lost. */
export function applyHit(target, dmgHealth, dmgArmour) {
  if (target.armour > 0) {
    if (dmgArmour <= 0) return 0;
    if (dmgArmour >= target.armour) {
      const used = target.armour / dmgArmour;
      target.armour = 0;
      const lost = dmgHealth * (1 - used);
      target.hp -= lost;
      return lost;
    }
    target.armour -= dmgArmour;
    return 0;
  }
  target.hp -= dmgHealth;
  return dmgHealth;
}

export function findActor(world, id) {
  return world.players.find(p => p.id === id) || world.enemies.find(e => e.id === id) || null;
}

export function alertEnemy(world, e, x, y, z) {
  if (!e.alive) return;
  e.alert = true;
  e.lastSeen = { x, y, z };
  e.lostT = 0;
}

/** Damage a person. source: the actor who caused it (may be null). */
export function damageActor(world, a, dmgHealth, dmgArmour, source, head = false) {
  if (!a.alive || a.downed) return;
  const mult = head ? world.data.settings.ballistics.headshot_multiplier : 1;
  const before = a.hp + a.armour;
  applyHit(a, dmgHealth * mult, dmgArmour * mult);
  emit(world, {
    type: 'hurt', targetId: a.id, team: a.kind, amount: Math.round(before - a.hp - a.armour), head,
    fromX: source ? source.x : a.x, fromZ: source ? source.z : a.z
  });
  if (a.kind === 'enemy' && source) alertEnemy(world, a, source.x, source.y, source.z);
  if (a.hp <= 0) killActor(world, a, source);
}

export function dropPickup(world, p) {
  const pk = { id: world.nextId++, ...p };
  world.pickups.push(pk);
  return pk;
}

export function killActor(world, a, source) {
  a.hp = 0;
  if (a.kind === 'player') {
    if (a.carrying) {
      dropPickup(world, { type: 'item', item: a.carrying.item, origin: a.carrying.origin, x: a.x, y: a.y, z: a.z });
      a.carrying = null;
    }
    const teammateUp = world.players.some(p => p !== a && p.alive && !p.downed);
    if (teammateUp) {
      a.downed = true;
      a.downT = world.data.settings.player.revive_window;
      emit(world, { type: 'downed', playerId: a.id });
      emit(world, { type: 'message', text: 'PARTNER DOWN — REVIVE THEM' });
      return;
    }
    a.alive = false;
    emit(world, { type: 'death', actorId: a.id, team: 'player' });
    return;
  }
  // enemy
  a.alive = false;
  a.state = 'dead';
  a.deadT = 0;
  world.kills++;
  if (source && source.kind === 'player') source.stats.kills++;
  emit(world, { type: 'death', actorId: a.id, team: 'enemy', x: a.x, y: a.y, z: a.z });
  const w = world.data.weapons[a.weapon.w];
  dropPickup(world, { type: 'weapon', weapon: a.weapon.w, mag: Math.max(0, a.weapon.mag), x: a.x + rand(world, -0.3, 0.3), y: a.y, z: a.z + rand(world, -0.3, 0.3) });
  const def = world.data.enemies[a.type];
  const amount = Math.round(rand(world, def.ammo_drop_min, def.ammo_drop_max) * (w.mag_size <= 2 ? 0.1 : 1));
  if (amount > 0) dropPickup(world, { type: 'ammo', calibre: w.calibre, amount, x: a.x + rand(world, -0.4, 0.4), y: a.y, z: a.z + rand(world, -0.4, 0.4) });
}

/** Damage a destructible block group. */
export function damagePiece(world, pid, amount) {
  const p = world.pieces[pid - 1];
  if (!p || !p.alive || amount <= 0) return;
  applyHit(p, amount, amount);
  if (p.hp <= 0) destroyPiece(world, p);
}

export function destroyPiece(world, p) {
  const g = world.grid;
  p.alive = false;
  const changed = [];
  let lowest = null;
  for (const i of p.cells) {
    const [x, y, z] = cellXYZ(g, i);
    if (!lowest || y < lowest[1]) lowest = [x, y, z];
    g.cells[i] = V.AIR;
    world.pieceOf[i] = 0;
    changed.push(i);
  }
  const mat = world.data.materials[p.material];
  if (lowest && mat && String(mat.leaves_rubble).toLowerCase() === 'yes') {
    const [x, y, z] = lowest;
    const supported = y === 0 || getV(g, x, y - 1, z) !== V.AIR || terrainHeight(world.terrain, x + 0.5, z + 0.5) >= y - 0.3;
    if (supported) g.cells[gidx(g, x, y, z)] = V.RUBBLE;
  }
  p.cells = [];
  world.voxelVersion++;
  world.cache.navDirty = true;
  emit(world, { type: 'blocks', cells: changed, material: p.material });
}

/** An explosion: hurts everyone and breaks blocks within its radius. */
export function explode(world, x, y, z, wdef, source) {
  const b = world.data.settings.ballistics;
  const r = (wdef.area_of_effect || 0) * b.aoe_metres_per_point;
  emit(world, { type: 'explosion', x, y, z, r: Math.max(r, b.min_explosion_visual_radius) });
  if (r <= 0) return;
  for (const a of [...world.players, ...world.enemies]) {
    if (!a.alive) continue;
    const d = Math.hypot(a.x - x, a.y + 0.9 - y, a.z - z);
    if (d > r) continue;
    const k = 1 - 0.5 * (d / r);
    damageActor(world, a, wdef.damage_health * k, wdef.damage_armour * k, source);
  }
  if (wdef.damage_environment > 0) {
    const g = world.grid, hit = new Set();
    const rr = r + 0.6;
    for (let cy = Math.floor(y - rr); cy <= Math.floor(y + rr); cy++)
      for (let cz = Math.floor(z - rr); cz <= Math.floor(z + rr); cz++)
        for (let cx = Math.floor(x - rr); cx <= Math.floor(x + rr); cx++) {
          if (cx < 0 || cy < 0 || cz < 0 || cx >= g.w || cy >= g.h || cz >= g.d) continue;
          if (Math.hypot(cx + 0.5 - x, cy + 0.5 - y, cz + 0.5 - z) > rr) continue;
          const pid = world.pieceOf[gidx(g, cx, cy, cz)];
          if (pid) hit.add(pid);
        }
    for (const pid of hit) damagePiece(world, pid, wdef.damage_environment);
  }
}

export const isDestructible = t => !!(V_INFO[t] && V_INFO[t].material);

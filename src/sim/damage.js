// The damage model, shared by people and destructible blocks:
// armour soaks damage first; when it runs out mid-hit, the unused share of the hit
// goes to health (see DESIGN.md → Players).
import { V, V_INFO, getV, cellXYZ, gidx } from './grid.js';
import { terrainHeight } from './terrain.js';
import { rand } from './rng.js';
import { markNavDirty } from './nav.js';
import { onPieceDestroyed } from './base.js';
import { destroyTurret, dropTurretAtFeet } from './turrets.js';
import { checkUnstable } from './blasting.js';

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
  return world.players.find(p => p.id === id) || world.enemies.find(e => e.id === id) || (world.turrets || []).find(t => t.id === id) || null;
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
  a.lastHurtAt = world.time;
  a.regenRate = 0;
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
  if (a.kind === 'turret') { destroyTurret(world, a); return; }
  if (a.kind === 'player') {
    // a turret in your hands is set down where you fall (it isn't lost)
    if (a.carrying && a.carrying.turret) dropTurretAtFeet(world, a);
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
  // a turret's kills count for the player who set it down
  if (source && source.kind === 'turret') { const o = world.players.find(p => p.id === source.owner); if (o) o.stats.kills++; }
  emit(world, { type: 'death', actorId: a.id, team: 'enemy', x: a.x, y: a.y, z: a.z });
  const w = world.data.weapons[a.weapon.w];
  // a suicide bomber's vest goes off when he dies, wherever he falls; he drops nothing
  if (w.projectile === 'grenade') {
    if (!a.exploded) { a.exploded = true; explode(world, a.x, a.y + 1, a.z, w, source || a); }
    return;
  }
  const def0 = world.data.enemies[a.type];
  // a melee weapon (the machete) stays with him: only his item drops fall
  if (w.projectile === 'melee') {
    for (const d of def0.drops || []) dropPickup(world, { type: d.type, amount: d.amount, x: a.x + rand(world, -0.4, 0.4), y: a.y, z: a.z + rand(world, -0.4, 0.4) });
    return;
  }
  // the Enemies tab's "Item drop" column (e.g. heavy insurgents' armour plates), and sometimes a grenade
  for (const d of def0.drops || []) dropPickup(world, { type: d.type, amount: d.amount, x: a.x + rand(world, -0.4, 0.4), y: a.y, z: a.z + rand(world, -0.4, 0.4) });
  const gChance = (world.data.settings.grenades?.drop_chance || {})[a.type] || 0;
  if (gChance > 0 && Object.values(world.data.weapons).some(x => x.projectile === 'grenade') && rand(world) < gChance) {
    dropPickup(world, { type: 'grenade', amount: 1, x: a.x + rand(world, -0.4, 0.4), y: a.y, z: a.z + rand(world, -0.4, 0.4) });
  }
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
    // rubble is decoration only (see grid.js), so it can go anywhere without blocking anyone
    if (supported) g.cells[gidx(g, x, y, z)] = V.RUBBLE;
  }
  // a burst fuel tank leaves a ring of scorched debris where it stood
  if (p.tank) for (const i of p.tank.floor) if (g.cells[i] === V.AIR) g.cells[i] = V.RUBBLE;
  p.cells = [];
  world.voxelVersion++;
  onPieceDestroyed(world, p);
  if (changed.length) {
    const xyz = changed.map(i => cellXYZ(g, i));
    markNavDirty(world, Math.min(...xyz.map(c => c[0])), Math.min(...xyz.map(c => c[2])), Math.max(...xyz.map(c => c[0])), Math.max(...xyz.map(c => c[2])));
  }
  emit(world, { type: 'blocks', cells: changed, material: p.material });
}

/** An explosion: hurts everyone and breaks blocks within its radius. */
export function explode(world, x, y, z, wdef, source) {
  const b = world.data.settings.ballistics;
  const r = (wdef.area_of_effect || 0) * b.aoe_metres_per_point;
  emit(world, { type: 'explosion', x, y, z, r: Math.max(r, b.min_explosion_visual_radius) });
  if (r <= 0) return;
  for (const a of [...world.players, ...world.enemies, ...(world.turrets || [])]) {
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
  // an explosion next to an unstable rock face (the mine) brings it down
  if (r > 0) checkUnstable(world, x, y, z, source);
  // a rocket that bursts against a fuel tank sets the whole tank off
  if (wdef.projectile === 'rocket') {
    const tank = tankNear(world, x, y, z, 1.5);
    if (tank) tankExplode(world, tank, wdef, source);
  }
}

function tankNear(world, x, y, z, r) {
  const g = world.grid;
  for (let cy = Math.floor(y - r); cy <= Math.floor(y + r); cy++)
    for (let cz = Math.floor(z - r); cz <= Math.floor(z + r); cz++)
      for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
        if (cx < 0 || cy < 0 || cz < 0 || cx >= g.w || cy >= g.h || cz >= g.d) continue;
        const pid = world.pieceOf[gidx(g, cx, cy, cz)];
        const p = pid ? world.pieces[pid - 1] : null;
        if (p && p.alive && p.tank) return p;
      }
  return null;
}

/**
 * A fuel tank blows up: it is gone, and everyone and everything within the blast radius of
 * its wall is hurt, most at the wall, nothing at the edge. The blast does not set off other
 * tanks (no chain reactions). Sizes are in settings.json → hazards.
 */
export function tankExplode(world, p, wdef, source) {
  const hz = world.data.settings.hazards || {};
  const R = hz.tank_blast_radius ?? 12, f = hz.tank_blast_damage_factor ?? 4;
  const t = p.tank, top = t.y0 + t.h;
  destroyPiece(world, p);
  emit(world, { type: 'explosion', x: t.cx, y: t.y0 + t.h * 0.6, z: t.cz, r: t.r + R * 0.6, big: true });
  emit(world, { type: 'message', text: 'FUEL TANK EXPLODED' });
  // distance from the tank's wall (or roof)
  const away = (x, y, z) => {
    const out = Math.max(0, Math.hypot(x - t.cx, z - t.cz) - t.r);
    const up = Math.max(0, y - top);
    return Math.hypot(out, up);
  };
  for (const a of [...world.players, ...world.enemies, ...(world.turrets || [])]) {
    if (!a.alive) continue;
    const d = away(a.x, a.y + 0.9, a.z);
    if (d > R) continue;
    const k = 1 - d / R;
    damageActor(world, a, wdef.damage_health * f * k, wdef.damage_armour * f * k, source);
  }
  const g = world.grid, hit = new Map(), reach = t.r + R;
  for (let cy = 0; cy < Math.min(g.h, top + R); cy++)
    for (let cz = Math.floor(t.cz - reach); cz <= Math.floor(t.cz + reach); cz++)
      for (let cx = Math.floor(t.cx - reach); cx <= Math.floor(t.cx + reach); cx++) {
        if (cx < 0 || cz < 0 || cx >= g.w || cz >= g.d) continue;
        const pid = world.pieceOf[gidx(g, cx, cy, cz)];
        if (!pid || hit.has(pid)) continue;
        const d = away(cx + 0.5, cy + 0.5, cz + 0.5);
        if (d <= R) hit.set(pid, 1 - d / R);
      }
  for (const [pid, k] of hit) {
    const q = world.pieces[pid - 1];
    if (q.tank) continue; // no chain reactions
    damagePiece(world, pid, wdef.damage_environment * f * k);
  }
}

export const isDestructible = t => !!(V_INFO[t] && V_INFO[t].material);

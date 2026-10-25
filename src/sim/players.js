// Players: movement, picking things up, the context button (pick up / build / revive),
// and the downed state for co-op.
import { moveBody, groundAt } from './body.js';
import { updatePlayerWeapon, grenadeMax } from './weapons.js';
import { emit, dropPickup } from './damage.js';
import { buildSpotFor, build, buildLabel, crateWanted, crateName, armouryFor, armouryWeapons } from './base.js';
import { blocked } from './body.js';
import { onBuild } from './waves.js';
import { isAlly, takeTurret, placementFor, dropTurret, turretToPickUp, pickUpTurret } from './turrets.js';

export function createPlayer(world, id, spawn) {
  const s = world.data.settings.player;
  const w = world.data.weapons[s.start_weapon];
  const y = groundAt(world, spawn.x, spawn.z, 40);
  return {
    id, kind: 'player', x: spawn.x, y, z: spawn.z, vy: 0, onGround: true,
    yaw: (spawn.facing || 0) * Math.PI / 180, pitch: 0,
    hp: s.max_health, armour: 0, alive: true, downed: false, downT: 0,
    slots: [{ w: w.id, mag: w.mag_size }, null], active: 0,
    reserve: { [w.calibre]: w.max_total - w.mag_size },
    reloadT: 0, swapT: 0, fireCd: 0, bloom: 0, trigger: false, ads: false, moving: false,
    carrying: null, context: null, lastHurtAt: 0, regenRate: 0,
    grenades: Math.min(world.data.settings.grenades?.start ?? 0, grenadeMax(world)), throwT: 0, releaseT: 0,
    stats: { shots: 0, hits: 0, kills: 0 }
  };
}

const weaponName = (world, id) => world.data.weapons[id].name;

function ownsWeapon(p, id) { return p.slots.some(s => s && s.w === id); }

function addAmmo(world, p, calibre, amount) {
  const cap = world.data.calibres[calibre] || 0;
  const cur = p.reserve[calibre] || 0;
  const take = Math.max(0, Math.min(amount, cap - cur));
  p.reserve[calibre] = cur + take;
  return take;
}

/** Walk-over pickups that happen automatically. Returns true if the pickup was used up. */
function autoCollect(world, p, pk) {
  const s = world.data.settings.player;
  if (pk.type === 'ammo') {
    const took = addAmmo(world, p, pk.calibre, pk.amount);
    if (took <= 0) return false;
    pk.amount -= took;
    emit(world, { type: 'pickup', playerId: p.id, what: 'ammo' });
    emit(world, { type: 'message', text: `+${took} ${pk.calibre}`, playerId: p.id });
    return pk.amount <= 0;
  }
  if (pk.type === 'armour') {
    if (p.armour >= s.max_armour) return false;
    p.armour = Math.min(s.max_armour, p.armour + pk.amount);
    emit(world, { type: 'pickup', playerId: p.id, what: 'armour' });
    emit(world, { type: 'message', text: `+${pk.amount} ARMOUR`, playerId: p.id });
    return true;
  }
  if (pk.type === 'weapon') {
    const def = world.data.weapons[pk.weapon];
    if (ownsWeapon(p, pk.weapon)) {
      // same gun: just take its ammunition
      const mag = pk.mag ?? def.mag_size;
      if (mag <= 0) return false;
      const took = addAmmo(world, p, def.calibre, mag);
      if (took <= 0) return false;
      pk.mag = mag - took;
      emit(world, { type: 'pickup', playerId: p.id, what: 'ammo' });
      emit(world, { type: 'message', text: `+${took} ${def.calibre}`, playerId: p.id });
      return pk.mag <= 0;
    }
    const free = p.slots.findIndex(x => !x);
    if (free < 0) return false;
    p.slots[free] = { w: pk.weapon, mag: pk.mag ?? def.mag_size };
    if (p.reserve[def.calibre] === undefined) p.reserve[def.calibre] = 0;
    emit(world, { type: 'pickup', playerId: p.id, what: 'weapon', weapon: pk.weapon });
    emit(world, { type: 'message', text: `PICKED UP ${def.name.toUpperCase()}`, playerId: p.id });
    return true;
  }
  if (pk.type === 'health') {
    if (p.hp >= s.max_health) return false;
    p.hp = Math.min(s.max_health, p.hp + pk.amount);
    emit(world, { type: 'pickup', playerId: p.id, what: 'health' });
    emit(world, { type: 'message', text: `+${pk.amount} HEALTH`, playerId: p.id });
    return true;
  }
  if (pk.type === 'resupply') {
    // ammunition for every gun you carry: a share (amount %) of what you can carry of each
    let took = 0;
    for (const slot of p.slots) {
      if (!slot) continue;
      const c = world.data.weapons[slot.w].calibre;
      took += addAmmo(world, p, c, Math.ceil((world.data.calibres[c] || 0) * pk.amount / 100));
    }
    // and grenades
    const gWant = Math.min(world.data.settings.grenades?.supply_gives ?? 0, grenadeMax(world) - (p.grenades || 0));
    if (gWant > 0) p.grenades = (p.grenades || 0) + gWant;
    if (took <= 0 && gWant <= 0) return false;
    emit(world, { type: 'pickup', playerId: p.id, what: 'ammo' });
    emit(world, { type: 'message', text: gWant > 0 ? `AMMUNITION RESUPPLIED · +${gWant} GRENADE` : 'AMMUNITION RESUPPLIED', playerId: p.id });
    return true;
  }
  if (pk.type === 'grenade') {
    const max = grenadeMax(world), have = p.grenades || 0;
    if (have >= max) return false;
    const take = Math.min(pk.amount || 1, max - have);
    p.grenades = have + take;
    pk.amount = (pk.amount || 1) - take;
    emit(world, { type: 'pickup', playerId: p.id, what: 'grenade' });
    emit(world, { type: 'message', text: `+${take} GRENADE${take > 1 ? 'S' : ''}`, playerId: p.id });
    return pk.amount <= 0;
  }
  if (pk.type === 'item') {
    if (p.carrying || !crateWanted(world, pk.item)) return false;
    p.carrying = { item: pk.item, origin: pk.origin || { x: pk.x, y: pk.y, z: pk.z } };
    emit(world, { type: 'pickup', playerId: p.id, what: 'item', item: pk.item });
    emit(world, { type: 'message', text: `${crateName(pk.item)} — TAKE IT TO YOUR BASE`, playerId: p.id });
    return true;
  }
  return false;
}

const near = (p, pk, r) => Math.hypot(pk.x - p.x, pk.z - p.z) <= r && Math.abs(pk.y - p.y) < 1.6;

/** Work out what the context button would do right now. */
function findContext(world, p) {
  const s = world.data.settings.player;
  const downed = world.players.find(o => o !== p && o.downed && Math.hypot(o.x - p.x, o.z - p.z) <= s.revive_range);
  if (downed) return { kind: 'revive', label: 'REVIVE', targetId: downed.id };
  // carrying a turret: DROP puts it where it is shown (only on a good spot)
  if (p.carrying && p.carrying.turret) return p.place && p.place.ok ? { kind: 'dropTurret', label: 'DROP' } : null;
  const spot = buildSpotFor(world, p);
  if (spot) return { kind: 'build', label: buildLabel(world, spot), spot };
  if (armouryFor(world, p) && armouryWeapons(world).length) return { kind: 'armoury', label: 'ARMOURY' };
  const tur = turretToPickUp(world, p);
  if (tur) return { kind: 'pickupTurret', label: 'PICK UP TURRET', turretId: tur.id };
  if (p.slots.every(Boolean)) {
    const pk = world.pickups.find(k => k.type === 'weapon' && !ownsWeapon(p, k.weapon) && near(p, k, s.pickup_range));
    if (pk) return { kind: 'pickup', label: `TAKE ${weaponName(world, pk.weapon).toUpperCase()}`, pickupId: pk.id };
  }
  return null;
}

function doContext(world, p, ctx) {
  if (ctx.kind === 'revive') {
    const o = world.players.find(x => x.id === ctx.targetId);
    if (o && o.downed) {
      o.downed = false; o.hp = world.data.settings.player.revive_health;
      emit(world, { type: 'revived', playerId: o.id });
    }
  } else if (ctx.kind === 'dropTurret') {
    dropTurret(world, p);
  } else if (ctx.kind === 'pickupTurret') {
    pickUpTurret(world, p, ctx.turretId);
  } else if (ctx.kind === 'build') {
    if (build(world, p, ctx.spot)) onBuild(world);
  } else if (ctx.kind === 'pickup') {
    const pk = world.pickups.find(k => k.id === ctx.pickupId);
    if (!pk) return;
    const old = p.slots[p.active];
    const def = world.data.weapons[pk.weapon];
    p.slots[p.active] = { w: pk.weapon, mag: pk.mag ?? def.mag_size };
    if (p.reserve[def.calibre] === undefined) p.reserve[def.calibre] = 0;
    world.pickups = world.pickups.filter(k => k !== pk);
    p.reloadT = 0; p.swapT = world.data.settings.player.swap_time;
    if (old) dropPickup(world, { type: 'weapon', weapon: old.w, mag: old.mag, x: p.x + Math.sin(p.yaw) * 0.6, y: p.y, z: p.z + Math.cos(p.yaw) * 0.6 });
    emit(world, { type: 'pickup', playerId: p.id, what: 'weapon', weapon: pk.weapon });
    emit(world, { type: 'message', text: `PICKED UP ${def.name.toUpperCase()}`, playerId: p.id });
  }
}

/**
 * Take a weapon from the armoury (the ammunition supply): it goes into a free slot, or replaces
 * the weapon in your hands, which is left on the ground beside the locker (a little way off,
 * so you can walk over and take it back). The new weapon comes loaded with full ammunition.
 */
export function takeFromArmoury(world, p, weaponId) {
  const spot = armouryFor(world, p);
  if (!spot || !armouryWeapons(world).includes(weaponId) || ownsWeapon(p, weaponId)) return false;
  // a turret (Allies tab) goes into your hands, not into a weapon slot
  if (isAlly(world, weaponId)) return takeTurret(world, p, weaponId);
  const def = world.data.weapons[weaponId];
  const free = p.slots.findIndex(x => !x);
  const slot = free >= 0 ? free : p.active;
  const old = p.slots[slot];
  p.slots[slot] = { w: weaponId, mag: def.mag_size };
  p.reserve[def.calibre] = Math.max(p.reserve[def.calibre] || 0, Math.min(world.data.calibres[def.calibre] || 0, def.max_total - def.mag_size));
  p.active = slot; p.reloadT = 0; p.swapT = world.data.settings.player.swap_time;
  if (old) {
    const sx = spot.x + 0.5, sz = spot.z + 0.5;
    let dx = p.x - sx, dz = p.z - sz;
    const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
    const off = world.data.settings.base.build_range + 0.5;
    let x = sx + dx * off, z = sz + dz * off, y = groundAt(world, x, z, p.y + 1);
    if (Math.abs(y - p.y) > 1.2 || blocked(world, x, z, y, 0.25, 1.6, 0.3)) { x = p.x; z = p.z; y = p.y; }
    dropPickup(world, { type: 'weapon', weapon: old.w, mag: old.mag, x, y, z });
  }
  emit(world, { type: 'pickup', playerId: p.id, what: 'weapon', weapon: weaponId });
  emit(world, { type: 'message', text: `${def.name.toUpperCase()} FROM THE ARMOURY`, playerId: p.id });
  return true;
}

/** Walk a player from a joystick/keys vector { x, y }. Shared with the co-op guest's own device. */
export function walkPlayer(world, p, move, dt) {
  const s = world.data.settings;
  let f = -(move?.y || 0), r = move?.x || 0;
  const len = Math.hypot(f, r);
  if (len > 1) { f /= len; r /= len; }
  let speed = s.player.walk_speed;
  if (p.carrying) speed *= s.player.carry_speed_factor;
  if (p.ads) speed *= s.player.ads_speed_factor;
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  const moved = moveBody(world, p, (-sy * f + cy * r) * speed * dt, (-cy * f - sy * r) * speed * dt, dt);
  p.moving = moved > speed * dt * 0.3;
}

/**
 * Health slowly comes back after a while without being hit, but only up to a cap
 * (settings: regen_delay seconds without damage, then up to regen_cap health over
 * regen_duration seconds). Armour never regenerates.
 */
function regenerate(world, p, dt) {
  const s = world.data.settings.player;
  if (p.hp >= s.regen_cap || world.time - p.lastHurtAt < s.regen_delay) { p.regenRate = 0; return; }
  if (!p.regenRate) p.regenRate = (s.regen_cap - p.hp) / s.regen_duration;
  p.hp = Math.min(s.regen_cap, p.hp + p.regenRate * dt);
}

/** Apply one tick of a player's command: { move: {x, y}, yaw, pitch, fire, ads, reload, swap, interact } */
export function updatePlayer(world, p, cmd, dt) {
  const s = world.data.settings;
  if (p.downed) {
    p.downT -= dt; p.moving = false;
    if (p.downT <= 0) { p.downed = false; p.alive = false; emit(world, { type: 'death', actorId: p.id, team: 'player' }); }
    return;
  }
  if (!p.alive) { p.moving = false; return; }
  cmd = cmd || {};
  regenerate(world, p, dt);
  if (cmd.yaw !== undefined) p.yaw = cmd.yaw;
  if (cmd.pitch !== undefined) p.pitch = Math.max(-s.controls.max_pitch, Math.min(s.controls.max_pitch, cmd.pitch));
  p.ads = !!cmd.ads && !(p.carrying && p.carrying.turret);

  if (cmd.pos) {
    // co-op guest: their own device moves them (so it feels instant) and reports where they are
    p.x = cmd.pos[0]; p.y = cmd.pos[1]; p.z = cmd.pos[2];
    p.moving = !!cmd.moving;
  } else {
    walkPlayer(world, p, cmd.move, dt);
  }

  updatePlayerWeapon(world, p, cmd, dt);

  // automatic pickups
  const range = s.player.pickup_range * 0.8;
  const used = new Set();
  for (const pk of world.pickups) {
    if (near(p, pk, Math.max(range, pk.reach || 0)) && autoCollect(world, p, pk)) used.add(pk);
  }
  if (used.size) world.pickups = world.pickups.filter(k => !used.has(k));

  if (cmd.armoury) takeFromArmoury(world, p, cmd.armoury);
  // where a carried turret would go (the graphics show it there, green or red)
  p.place = p.carrying && p.carrying.turret ? placementFor(world, p) : null;
  p.context = findContext(world, p);
  if (cmd.interact && p.context && p.context.kind !== 'armoury') doContext(world, p, p.context);
}

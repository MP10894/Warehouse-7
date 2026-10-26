// Kill streaks: every enemy a player kills (shooting, grenades, blasting, rockfall, the
// streaks themselves; not their turret) adds one to an invisible counter. The best streak
// the counter has reached (data/killstreaks.csv: fewest kills first) is the one on offer, and
// only one is ever held: keep killing and a better one can replace it. Going down loses the
// counter and the streak. Calling a streak in starts the count again from zero.
//
// The mortar strike (the only streak for now): the button puts a laser designator in your
// hands instead of your gun (SWAP puts the gun back; the strike stays on offer). The button
// again (or the trigger) calls the rounds onto whatever the laser points at, up to `range`
// metres away: "INCOMING!" counts down `countdown` seconds, then `rounds` shells fall over
// `duration` seconds within `scatter` metres of the spot, each exploding like the Weapons
// tab's Mortar row. Shells come straight down, so one aimed into a building lands on its roof.
// They hurt everyone, the players too ("danger close").
//
// Co-op: the host runs all of this; the partner's phone sees the shells as projectiles and the
// explosions as events, and a partner's designator and streak count travel with the players.
import { rand, randomInDisc } from './rng.js';
import { emit } from './damage.js';
import { aimVector } from './weapons.js';
import { traceSegment } from './ballistics.js';
import { getV, V } from './grid.js';
import { terrainHeight } from './terrain.js';
import { startGunship, endGunship } from './gunship.js';

const table = world => world.data.killstreaks || [];
const conf = world => world.data.settings.killstreaks || {};

/** The streak on offer for this player right now (the best one their count reaches), or null. */
export function strikeFor(world, p) {
  if (!p || !p.alive || p.downed) return null;
  let best = null;
  for (const k of table(world)) if ((p.streak || 0) >= k.kills) best = k;
  return best;
}

/** The kill count the next streak needs (for the HUD bar): { have, from, need } or null. */
export function streakProgress(world, p) {
  const t = table(world);
  if (!t.length) return null;
  const have = p.streak || 0;
  const next = t.find(k => k.kills > have);
  const prev = [...t].reverse().find(k => k.kills <= have);
  return { have, from: prev ? prev.kills : 0, need: next ? next.kills : t[t.length - 1].kills, top: !next };
}

/** An enemy died at this player's hand: count it, and say so when a new streak is reached. */
export function countKill(world, p) {
  if (!p || p.kind !== 'player' || !table(world).length) return;
  const before = strikeFor(world, p);
  p.streak = (p.streak || 0) + 1;
  const now = strikeFor(world, p);
  if (now && now !== before) {
    emit(world, { type: 'streakReady', playerId: p.id, streak: now.id });
    emit(world, { type: 'message', text: `${String(now.name).toUpperCase()} AVAILABLE!`, playerId: p.id });
  }
}

/** Going down (or dying) loses the count and any streak held. */
export function loseStreak(world, p) {
  p.streak = 0;
  p.designating = false;
  if (p.gunship) endGunship(world, p, 'GUNSHIP LOST');   // the body went down: the gunship goes too
}

/**
 * Where the laser points: the first wall, roof, rock or piece of ground along the aim within
 * range, or null (sky, or too far). Shells fall straight down, so the spot that counts is the
 * column it marks.
 */
export function laserPoint(world, p) {
  const range = conf(world).laser_max_range ?? 150;
  const d = aimVector(p.yaw, p.pitch);
  const eye = p.y + world.data.settings.player.eye_height;
  const x0 = p.x + d[0] * 0.4, y0 = eye + d[1] * 0.4, z0 = p.z + d[2] * 0.4;
  const hit = traceSegment(world, x0, y0, z0, x0 + d[0] * range, y0 + d[1] * range, z0 + d[2] * range, { actors: world.enemies.filter(e => e.alive) });
  if (!hit) return null;
  return { x: hit.x, y: hit.y, z: hit.z };
}

/** Top of whatever stands at (x, z): a roof, a wall top, a rock, or the ground. */
function topAt(world, x, z) {
  const g = world.grid, cx = Math.floor(x), cz = Math.floor(z);
  if (cx >= 0 && cz >= 0 && cx < g.w && cz < g.d) {
    for (let y = g.h - 1; y >= 0; y--) {
      const v = getV(g, cx, y, cz);
      if (v && v !== V.SHRUB) return y + 1;
    }
  }
  return terrainHeight(world.terrain, x, z);
}

/** The streak button: designator in hand, or (with it in hand) call the strike in. */
export function strikeButton(world, p) {
  const k = strikeFor(world, p);
  if (!k || p.gunship) return;
  // the gunship: straight up into it (gunship.js)
  if (k.id === 'gunship') { startGunship(world, p, k); return; }
  if (!p.designating) {
    if (p.carrying && p.carrying.turret) return;   // both hands on the turret
    p.designating = true;
    p.reloadT = 0; p.ads = false;
    emit(world, { type: 'designate', actorId: p.id, on: true });
    return;
  }
  callStrike(world, p, k);
}

/** Put the designator away (SWAP): the gun comes back, the streak stays on offer. */
export function stowDesignator(world, p) {
  if (!p.designating) return;
  p.designating = false;
  p.swapT = world.data.settings.player.swap_time;
  emit(world, { type: 'designate', actorId: p.id, on: false });
}

function callStrike(world, p, k) {
  const at = laserPoint(world, p);
  if (!at) { emit(world, { type: 'message', text: 'OUT OF RANGE', playerId: p.id }); return; }
  const count = Math.max(1, Math.round(k.rounds || 1)), dur = Number(k.duration) || 0, wait = Number(k.countdown) || 0;
  const rounds = [];
  for (let i = 0; i < count; i++) {
    const [ox, oz] = randomInDisc(world, Number(k.scatter) || 0);
    rounds.push({ t: wait + (count > 1 ? dur * i / (count - 1) : 0) + rand(world, -0.08, 0.08), x: at.x + ox, z: at.z + oz, out: false });
  }
  world.strikes.push({ id: world.nextId++, owner: p.id, weapon: k.weapon, x: at.x, z: at.z, t: 0, shown: Math.ceil(wait) + 1, rounds });
  p.streak = 0;
  p.designating = false;
  p.swapT = world.data.settings.player.swap_time;
  emit(world, { type: 'designate', actorId: p.id, on: false });
  emit(world, { type: 'strikeCalled', playerId: p.id, x: at.x, z: at.z, streak: k.id });
}

/** Each tick: count down, then send the shells down. */
export function updateStrikes(world, dt) {
  if (!world.strikes || !world.strikes.length) return;
  const c = conf(world), H = c.shell_drop_height ?? 70, V0 = c.shell_fall_speed ?? 45;
  const g = world.data.settings.ballistics.gravity;
  // how long a shell takes to come down from H: H = V0 t + g t² / 2
  const fall = (-V0 + Math.sqrt(V0 * V0 + 2 * g * H)) / g;
  for (const s of world.strikes) {
    s.t += dt;
    const first = s.rounds[0].t;
    // "INCOMING! 5 s", 4 s, … until the first shell lands
    const left = Math.ceil(first - s.t);
    if (left > 0 && left < s.shown) {
      s.shown = left;
      emit(world, { type: 'message', text: `INCOMING! ${left} s` });
    }
    for (const r of s.rounds) {
      if (r.out || s.t < r.t - fall) continue;
      r.out = true;
      const top = topAt(world, r.x, r.z);
      world.projectiles.push({
        id: world.nextId++, owner: s.owner, team: 'player', weapon: s.weapon, kind: 'mortar',
        x: r.x, y: top + H, z: r.z, vx: 0, vy: -V0, vz: 0, life: fall + 3
      });
      emit(world, { type: 'shellIncoming', x: r.x, y: top, z: r.z, time: fall });
    }
  }
  world.strikes = world.strikes.filter(s => s.rounds.some(r => !r.out));
}

/** A player's laser for the graphics: from the designator to where it points (or null). */
export function laserFor(world, p) {
  if (!p.designating || !p.alive || p.downed) return null;
  const at = laserPoint(world, p);
  const range = conf(world).laser_max_range ?? 150;
  const d = aimVector(p.yaw, p.pitch);
  const eye = p.y + world.data.settings.player.eye_height;
  return { from: [p.x, eye, p.z], to: at ? [at.x, at.y, at.z] : [p.x + d[0] * range, eye + d[1] * range, p.z + d[2] * range], hit: !!at };
}


// Attack waves. They start once a base has been secured (the level clock starts then too).
// Rhythm: a wave attacks; once every attacker of it is dead, there is a short break
// (`break_after_wave` seconds), then the next, bigger wave comes. Building upgrades makes
// the next wave come sooner and all later waves bigger. Composition is in waves.csv.
// At most `max_attackers_alive` attackers are on the map at once: the rest of a wave waits
// at the edge of the map and comes in as others fall.
import { rand, weightedPick } from './rng.js';
import { spawnEnemy, pickEnemyWeapon } from './enemies.js';
import { emit } from './damage.js';

// nextT: when the next wave comes; null while waiting (no base yet, or a wave is being fought)
// queue: attackers of the current wave still waiting to come in
export function createWaves() {
  return { index: 0, number: 0, nextT: null, started: false, queue: [], releaseT: 0 };
}

/** A base was just secured: the first wave comes `first_wave_at` seconds later. */
export function startWaves(world) {
  const w = world.waves;
  if (w.started) return;
  w.started = true;
  w.nextT = world.time + world.data.settings.waves.first_wave_at;
}

function waveRow(world, index) {
  const rows = world.data.waves;
  const row = rows[Math.min(index, rows.length) - 1];
  const extra = Math.max(0, index - rows.length) * 2;
  const weights = {}, types = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('weight_')) weights[k.slice(7)] = v;
    if (k.startsWith('type_')) types[k.slice(5)] = v;   // mix of enemy types (Enemies tab)
  }
  return { count: row.enemy_count + extra, armourChance: row.armour_chance, armour: row.armour_amount, weights, types };
}

export const attackersAlive = world => world.enemies.reduce((n, e) => n + (e.alive && e.wave ? 1 : 0), 0);
/** Attackers still to beat in the current wave: on the map plus waiting to come in. */
export const attackersLeft = world => attackersAlive(world) + world.waves.queue.length;

export function spawnWave(world) {
  const w = world.waves;
  w.index++;
  w.number++;
  w.nextT = null;
  const level = world.data.levels[world.levelId];
  const row = waveRow(world, w.index);
  // come in from the two edge points nearest the base that are not too close to a player
  // (on a big map the furthest points would mean a long walk before anyone arrives)
  const minD = world.data.settings.waves.min_spawn_distance ?? 60;
  const ar = world.base.area;
  const bx = ar ? (ar.x0 + ar.x1) / 2 : 0, bz = ar ? (ar.z0 + ar.z1) / 2 : 0;
  const fromPlayers = q => Math.min(...world.players.map(p => Math.hypot(p.x - q.x, p.z - q.z)));
  const far = level.wave_spawns.filter(q => fromPlayers(q) >= minD);
  const pts = (far.length >= 2 ? far : [...level.wave_spawns].sort((a, b) => fromPlayers(b) - fromPlayers(a)).slice(0, 2))
    .sort((a, b) => Math.hypot(a.x - bx, a.z - bz) - Math.hypot(b.x - bx, b.z - bz)).slice(0, 2);
  for (let i = 0; i < row.count; i++) {
    const sp = pts[i % pts.length];
    const type = weightedPick(world, row.types) || 'insurgent';
    w.queue.push({
      type, weapon: pickEnemyWeapon(world, row.weights, type),
      armour: rand(world) < row.armourChance ? row.armour : 0,
      x: sp.x + rand(world, -3, 3), z: sp.z + rand(world, -3, 3)
    });
  }
  w.releaseT = world.time;
  releaseQueued(world, true);
  emit(world, { type: 'wave', number: w.number, index: w.index, count: row.count });
  emit(world, { type: 'message', text: `WAVE ${w.number} INCOMING` });
}

/** Bring waiting attackers in while there is room under the cap (a few at a time). */
function releaseQueued(world, all = false) {
  const w = world.waves, cap = world.data.settings.waves.max_attackers_alive ?? 20;
  let alive = attackersAlive(world);
  while (w.queue.length && alive < cap && (all || world.time >= w.releaseT)) {
    const a = w.queue.shift();
    spawnEnemy(world, { x: a.x, z: a.z, weapon: a.weapon, armour: a.armour, wave: true, behaviour: 'assault', type: a.type });
    alive++;
    if (!all) { w.releaseT = world.time + 0.5; break; }
  }
}

export function updateWaves(world) {
  const w = world.waves;
  if (!w.started) return;
  if (w.queue.length) releaseQueued(world);
  if (w.nextT !== null) {
    if (world.time >= w.nextT) spawnWave(world);
  } else if (w.number > 0 && !w.queue.length && attackersAlive(world) === 0) {
    // wave beaten: a breather before the next one
    const pause = world.data.settings.waves.break_after_wave ?? 20;
    w.nextT = world.time + pause;
    emit(world, { type: 'message', text: `WAVE ${w.number} BEATEN — NEXT IN ${Math.round(pause)} S` });
  }
}

/** Building brings the next wave sooner (if one is counting down) and makes later ones bigger. */
export function onBuild(world) {
  const s = world.data.settings.waves;
  const w = world.waves;
  if (w.nextT !== null) w.nextT = Math.max(world.time + 5, w.nextT - s.build_interval_cut);
  w.index += s.build_wave_bump;
}

// Attack waves: they come at shrinking intervals, get bigger and better armed, and
// building upgrades makes them come sooner and harder. Composition is in waves.csv.
import { rand, weightedPick } from './rng.js';
import { spawnEnemy, pickEnemyWeapon } from './enemies.js';
import { emit } from './damage.js';

// Waves (and the level timer) only start once a base has been secured: until then the
// game can go on for as long as it takes. nextT is null while waves aren't running.
export function createWaves(settings) {
  return { index: 0, number: 0, nextT: null, interval: settings.waves.interval_start };
}

/** A base was just secured: the first wave comes `first_wave_at` seconds later. */
export function startWaves(world) {
  if (world.waves.nextT === null) world.waves.nextT = world.time + world.data.settings.waves.first_wave_at;
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

export function spawnWave(world) {
  const s = world.data.settings.waves;
  const w = world.waves;
  w.index++;
  w.number++;
  const level = world.data.levels[world.levelId];
  const row = waveRow(world, w.index);
  // spawn from the edge points furthest from the players
  const pts = [...level.wave_spawns].sort((a, b) => {
    const da = Math.min(...world.players.map(p => Math.hypot(p.x - a.x, p.z - a.z)));
    const db = Math.min(...world.players.map(p => Math.hypot(p.x - b.x, p.z - b.z)));
    return db - da;
  }).slice(0, 2);
  for (let i = 0; i < row.count; i++) {
    const sp = pts[i % pts.length];
    const type = weightedPick(world, row.types) || 'insurgent';
    const weapon = pickEnemyWeapon(world, row.weights, type);
    const armour = rand(world) < row.armourChance ? row.armour : 0;
    spawnEnemy(world, { x: sp.x + rand(world, -3, 3), z: sp.z + rand(world, -3, 3), weapon, armour, wave: true, behaviour: 'assault', type });
  }
  w.interval = Math.max(s.interval_min, w.interval * s.interval_decay);
  w.nextT = world.time + w.interval;
  emit(world, { type: 'wave', number: w.number, index: w.index, count: row.count });
  emit(world, { type: 'message', text: `WAVE ${w.number} INCOMING` });
}

export function updateWaves(world) {
  if (world.waves.nextT !== null && world.time >= world.waves.nextT) spawnWave(world);
}

/** Building speeds up the next wave and makes later ones bigger. */
export function onBuild(world) {
  const s = world.data.settings.waves;
  const w = world.waves;
  if (w.nextT !== null) w.nextT = Math.max(world.time + 5, w.nextT - s.build_interval_cut);
  w.index += s.build_wave_bump;
}

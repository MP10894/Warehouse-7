// Attack waves: they come at shrinking intervals, get bigger and better armed, and
// building upgrades makes them come sooner and harder. Composition is in waves.csv.
import { rand } from './rng.js';
import { spawnEnemy, pickEnemyWeapon } from './enemies.js';
import { emit } from './damage.js';

export function createWaves(settings) {
  return { index: 0, number: 0, nextT: settings.waves.first_wave_at, interval: settings.waves.interval_start };
}

function waveRow(world, index) {
  const rows = world.data.waves;
  const row = rows[Math.min(index, rows.length) - 1];
  const extra = Math.max(0, index - rows.length) * 2;
  const weights = {};
  for (const [k, v] of Object.entries(row)) if (k.startsWith('weight_')) weights[k.slice(7)] = v;
  return { count: row.enemy_count + extra, armourChance: row.armour_chance, armour: row.armour_amount, weights };
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
    const weapon = pickEnemyWeapon(world, row.weights);
    const armour = rand(world) < row.armourChance ? row.armour : 0;
    spawnEnemy(world, { x: sp.x + rand(world, -3, 3), z: sp.z + rand(world, -3, 3), weapon, armour, wave: true, behaviour: 'assault' });
  }
  w.interval = Math.max(s.interval_min, w.interval * s.interval_decay);
  w.nextT = world.time + w.interval;
  emit(world, { type: 'wave', number: w.number, index: w.index, count: row.count });
  emit(world, { type: 'message', text: `WAVE ${w.number} INCOMING` });
}

export function updateWaves(world) {
  if (world.time >= world.waves.nextT) spawnWave(world);
}

/** Building speeds up the next wave and makes later ones bigger. */
export function onBuild(world) {
  const s = world.data.settings.waves;
  const w = world.waves;
  w.nextT = Math.max(world.time + 5, w.nextT - s.build_interval_cut);
  w.index += s.build_wave_bump;
}

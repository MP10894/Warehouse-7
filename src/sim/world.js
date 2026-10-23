// Creates the game state. Everything the game "knows" lives in this one object, which is
// what makes co-op possible: a host runs the simulation on it and sends it to the guest.
import { buildLevel } from './level.js';
import { groundAt } from './body.js';
import { createPlayer } from './players.js';
import { spawnEnemy, rollLoadout } from './enemies.js';
import { createBase } from './base.js';
import { createWaves } from './waves.js';
import { createWeather } from './weather.js';
import { dropPickup } from './damage.js';

export function createWorld({ data, levelId, seed = 7, playerIds = ['p1'] }) {
  levelId = levelId || data.settings.level;
  const level = data.levels[levelId];
  if (!level) throw new Error(`Level not found: ${levelId}`);
  const world = {
    data, levelId,
    rng: { s: seed },
    tick: 0, time: 0, timeLeft: level.time_limit,
    nextId: 1,
    players: [], enemies: [], projectiles: [], pickups: [], groups: [],
    pending: [], events: [],
    status: 'playing', outcome: null, endT: 0, kills: 0,
    cache: {} // derived data (navigation); rebuilt on demand, never sent over a network
  };
  buildLevel(world, level);
  world.base = createBase(level);
  world.waves = createWaves();
  world.weather = createWeather(level);

  world.players = playerIds.map((id, i) => createPlayer(world, id, level.player_spawns[i] || level.player_spawns[0]));

  for (const g of level.enemy_groups) {
    world.groups.push({ id: g.id, respawnT: g.respawn || 0 });
    for (const sp of g.spawns) {
      const lo = rollLoadout(world, g.weapons, g.armour_chance || 0, g.armour || 0, g.type);
      spawnEnemy(world, { x: sp.x + 0.5, y: sp.y, z: sp.z + 0.5, weapon: lo.weapon, armour: lo.armour, group: g.id, behaviour: g.behaviour, radius: g.radius, type: g.type });
    }
  }
  world.startEnemies = world.enemies.length;

  for (const p of level.pickups || []) {
    dropPickup(world, { ...p, y: groundAt(world, p.x, p.z, (p.y ?? 30) + 0.6), mag: p.type === 'weapon' ? data.weapons[p.weapon].mag_size : undefined });
  }
  for (const it of level.base_items || []) {
    const y = groundAt(world, it.x, it.z, (it.y ?? 30) + 0.6);
    dropPickup(world, { type: 'item', item: it.item, x: it.x, y, z: it.z, origin: { x: it.x, y, z: it.z } });
  }
  return world;
}

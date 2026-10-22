// Creates the game state. Everything the game "knows" lives in this one plain object,
// which is what makes co-op possible later: a host runs the simulation on it, and the
// other player's game receives copies of it.
import { parseMap, cellCenter } from './map.js';
import { rand } from './rng.js';

export const SPAWN_YAW = -Math.PI / 2; // players start facing east (+x, to the right on the map)

export function createWorld({ data, levelText, seed = 7, playerIds = ['p1'] }) {
  const map = parseMap(levelText);
  const world = {
    data,
    map,
    rng: { s: seed },
    tick: 0,
    time: 0,
    nextId: 1,
    players: [],
    enemies: [],
    barrels: [],
    pickups: [],
    barrelAt: Array.from({ length: map.h }, () => Array(map.w).fill(0)),
    barrelVersion: 0,
    pending: [],        // delayed actions, e.g. chain explosions
    events: [],         // what happened this frame; drained by graphics, sound and UI
    status: 'playing',  // 'playing' | 'won' | 'lost'
    outcome: null,
    endT: 0,
    kills: 0,
    total: 0,
    cache: {}           // derived data (navigation field); rebuilt on demand, never sent over a network
  };

  const spawns = [];
  for (let cy = 0; cy < map.h; cy++) {
    for (let cx = 0; cx < map.w; cx++) {
      const ch = map.cells[cy][cx];
      const x = cellCenter(cx), z = cellCenter(cy);
      if (ch === 'P') spawns[0] = { x, z };
      else if (ch === '2') spawns[1] = { x, z };
      else if (ch === 'E') world.enemies.push(createEnemy(world, 'insurgent', x, z));
      else if (ch === 'b') {
        const b = { id: world.nextId++, cx, cy, x, z, alive: true };
        world.barrels.push(b);
        world.barrelAt[cy][cx] = b.id;
      } else if (data.pickupsBySymbol[ch]) spawnPickup(world, data.pickupsBySymbol[ch].id, x, z);
    }
  }
  if (!spawns[0]) spawns[0] = { x: cellCenter(1), z: cellCenter(1) };
  world.players = playerIds.map((id, i) => createPlayer(world, id, spawns[i] || spawns[0]));
  world.total = world.enemies.length;
  return world;
}

export function createPlayer(world, id, spawn) {
  const s = world.data.settings.player;
  const weapon = world.data.weapons[s.start_weapon];
  return {
    id,
    x: spawn.x, z: spawn.z,
    yaw: SPAWN_YAW, pitch: 0,
    hp: s.max_health,
    weapon: s.start_weapon,
    ammo: weapon.start_ammo,
    alive: true,
    moving: false,
    fireCd: 0,
    stats: { shots: 0, hits: 0, kills: 0 }
  };
}

export function createEnemy(world, type, x, z) {
  const def = world.data.enemies[type];
  return {
    id: world.nextId++,
    type,
    x, z,
    hp: def.health,
    state: 'idle',      // idle | chase | aim | fire | pain | dead
    t: 0,
    awake: false,
    fireCd: rand(world, 1, 2),
    seeT: rand(world, 0, 0.2),
    los: false,
    targetId: null,
    moving: false,
    animT: rand(world),
    strafe: rand(world) < 0.5 ? 1 : -1,
    strafeT: 0
  };
}

export function spawnPickup(world, type, x, z) {
  world.pickups.push({ id: world.nextId++, type, x, z, taken: false });
}

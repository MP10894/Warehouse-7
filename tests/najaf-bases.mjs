// Checks for Najaf's three bases, the upgrades, fuel tanks, flare smoke, fences and co-op
// mirroring of what gets built. Usage: node tests/najaf-bases.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { buildData, parseCsv, byKey } from '../src/data/parse.js';
import { gameDataFromXlsx } from '../src/data/xlsx.js';
import { createWorld } from '../src/sim/world.js';
import { stepWorld } from '../src/sim/step.js';
import { buildNav, nodeAt, flowField } from '../src/sim/nav.js';
import { destroyPiece, explode } from '../src/sim/damage.js';
import { V, getV, solidAt } from '../src/sim/grid.js';
import { blocked, groundAt } from '../src/sim/body.js';
import { levelBases, maxLevel, crateWanted } from '../src/sim/base.js';
import { stormAt } from '../src/sim/weather.js';
import { createHostEncoder, createGuestDecoder } from '../src/net/snapshot.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const loadLevel = id => {
  const lv = `data/levels/${id}/`, buildings = {};
  for (const f of readdirSync(new URL('../' + lv + 'buildings', import.meta.url))) buildings[f] = read(lv + 'buildings/' + f);
  return { json: read(lv + 'level.json'), terrain: read(lv + 'terrain.txt'), ground: read(lv + 'ground.txt'), buildings };
};
const gameData = gameDataFromXlsx(readFileSync(new URL('../data/Game Data.xlsx', import.meta.url)), byKey(parseCsv(read('data/enemies.csv')), 'id'));
const data = buildData({
  weaponsRows: gameData.weapons, enemiesRows: gameData.enemies, materialsCsv: read('data/materials.csv'),
  enemiesCsv: read('data/enemies.csv'), wavesCsv: read('data/waves.csv'), upgradesCsv: read('data/upgrades.csv'),
  settings: JSON.parse(read('data/settings.json')), levels: { najaf: loadLevel('najaf') }
});
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
const level = data.levels.najaf;
const bases = levelBases(level);
const step = (w, cmd = {}, n = 1) => { for (let i = 0; i < n; i++) { stepWorld(w, { p1: cmd }, 1 / 60); w.events.length = 0; } };
const S = data.settings;

check(bases.length === 3 && ['police_station', 'truck_stop', 'control_building'].every(id => bases.some(b => b.id === id)), `three base areas: ${bases.map(b => b.name).join(', ')}`);
check(level.enemy_groups.reduce((n, g) => n + g.spawns.length, 0) >= 55 && level.enemy_groups.length >= 18,
  `about 60 enemies in about 20 groups (${level.enemy_groups.reduce((n, g) => n + g.spawns.length, 0)} in ${level.enemy_groups.length})`);
for (const item of ['construction_crate', 'ammo_crate', 'medical_crate', 'armour_crate']) {
  check((level.base_items || []).some(it => it.item === item), `a ${item.replace('_', ' ')} is placed`);
}

// every base: its build spots and wall plan are on open, reachable ground
{
  const w = createWorld({ data, levelId: 'najaf', seed: 2 });
  const nav = buildNav(w);
  const p = w.players[0];
  const field = flowField(nav, [nodeAt(nav, p.x, p.y, p.z)]);
  for (const b of bases) {
    const bad = [];
    for (const s of b.build_spots) {
      const y = groundAt(w, s.x + 0.5, s.z + 0.5, 30);
      const n = nodeAt(nav, s.x + 0.5, y, s.z + 0.5);
      if (n < 0 || field[n] < 0 || getV(w.grid, s.x, Math.round(y), s.z) !== V.AIR) bad.push(`${s.upgrade}@${s.x},${s.z}`);
    }
    for (const r of b.wall_plan) for (let dz = 0; dz < (r.d || 1); dz++) for (let dx = 0; dx < (r.w || 1); dx++) {
      const x = r.x + dx, z = r.z + dz, y = Math.round(groundAt(w, x + 0.5, z + 0.5, 30));
      if (getV(w.grid, x, y, z) !== V.AIR) bad.push(`wall@${x},${z}`);
    }
    check(!bad.length && b.build_spots.length === 4, `${b.name}: 4 build spots and the wall plan on open, reachable ground${bad.length ? ': ' + bad.join(' ') : ''}`);
  }
}

// every base has each kind of upgrade crate within 80 m, on ground you can walk to
{
  const w = createWorld({ data, levelId: 'najaf', seed: 2 });
  const nav = buildNav(w);
  const p = w.players[0];
  const field = flowField(nav, [nodeAt(nav, p.x, p.y, p.z)]);
  const reach = it => { const y = groundAt(w, it.x, it.z, (it.y ?? 30) + 0.6), n = nodeAt(nav, it.x, y, it.z); return n >= 0 && field[n] >= 0; };
  const unreachable = level.base_items.filter(it => !reach(it)).map(it => `${it.item}@${it.x},${it.z}`);
  check(!unreachable.length, `all ${level.base_items.length} upgrade crates lie where you can walk to them${unreachable.length ? ': ' + unreachable.join(' ') : ''}`);
  for (const b of bases) {
    const cx = (b.area.x0 + b.area.x1) / 2, cz = (b.area.z0 + b.area.z1) / 2;
    const far = ['construction_crate', 'ammo_crate', 'medical_crate', 'armour_crate'].map(item => {
      const d = Math.min(...level.base_items.filter(it => it.item === item).map(it => Math.hypot(it.x - cx, it.z - cz)));
      return [item, Math.round(d)];
    });
    check(far.every(([, d]) => d <= 80), `${b.name}: every kind of crate within 80 m (${far.map(([i, d]) => `${i.split('_')[0]} ${d} m`).join(', ')})`);
  }
}

// each base can be claimed by clearing its defenders and walking in; the others stay enemy territory
for (const [i, b] of bases.entries()) {
  const w = createWorld({ data, levelId: 'najaf', seed: 4 + i });
  w.waves.nextT = 1e9;
  const holders = level.enemy_groups.filter(g => g.holds_base === b.id).map(g => g.id);
  const a = b.area, inside = e => e.x >= a.x0 && e.x <= a.x1 && e.z >= a.z0 && e.z <= a.z1;
  w.enemies = w.enemies.filter(e => !holders.includes(e.group) && !inside(e));
  const pl = w.players[0];
  const sp = b.build_spots[0];
  Object.assign(pl, { x: sp.x + 0.5, z: sp.z + 0.5 });
  pl.y = groundAt(w, pl.x, pl.z, 30);
  step(w, {}, 20);
  const others = level.enemy_groups.filter(g => g.holds_base && g.holds_base !== b.id).map(g => g.id);
  check(w.base.claimed && w.base.id === b.id && others.every(g => w.enemies.some(e => e.alive && e.group === g)),
    `${b.name} becomes your base once cleared; the other bases keep their defenders`);
  // the next wave comes in from edge points that have a path to this base, and not from far away
  w.waves.nextT = w.time;
  step(w, {}, 2);
  const nav = w.cache.nav, field = w.cache.baseField;
  const att = w.enemies.filter(e => e.wave && e.alive);
  const ok = att.length > 0 && att.every(e => { const n = nodeAt(nav, e.x, e.y, e.z); return n >= 0 && field[n] >= 0; });
  const dist = Math.max(...att.map(e => Math.hypot(e.x - (a.x0 + a.x1) / 2, e.z - (a.z0 + a.z1) / 2)));
  check(ok && dist < 160, `${b.name}: attack waves can walk to it and start within ${Math.round(dist)} m`);
}

// upgrades: build, hand out supplies, top level, crate rules, lockers can be destroyed
{
  const w = createWorld({ data, levelId: 'najaf', seed: 11 });
  w.waves.nextT = 1e9;
  w.enemies = []; w.groups = [];
  const b = bases.find(x => x.id === 'truck_stop');
  const pl = w.players[0];
  Object.assign(pl, { x: b.build_spots[0].x + 0.5, z: b.build_spots[0].z + 0.5 });
  pl.y = groundAt(w, pl.x, pl.z, 30);
  step(w, {}, 5);
  check(w.base.id === 'truck_stop', 'truck stop claimed');
  const spot = w.base.buildSpots.find(s => s.upgrade === 'ammo');
  // stand next to the spot (the locker goes on the spot itself)
  const stand = [[0, 1.3], [1.3, 0], [0, -1.3], [-1.3, 0]].map(([dx, dz]) => [spot.x + 0.5 + dx, spot.z + 0.5 + dz])
    .find(([x, z]) => !blocked(w, x, z, groundAt(w, x, z, 30), S.player.radius, S.player.height, S.player.step_height));
  const buildOnce = () => {
    pl.carrying = { item: 'ammo_crate', origin: { x: 175.5, y: 2, z: 225.5 } };
    Object.assign(pl, { x: stand[0], z: stand[1] }); pl.y = groundAt(w, pl.x, pl.z, 30);
    step(w, {}, 2);
    const ctx = pl.context && pl.context.label;
    step(w, { interact: true }, 1);
    return ctx;
  };
  const cal = data.weapons[pl.slots[0].w].calibre;
  pl.reserve[cal] = data.calibres[cal]; pl.grenades = 5;   // full up, so the first box stays where it appears
  const label = buildOnce();
  const up = w.base.upgrades.ammo;
  const locker = up.piece && w.pieces[up.piece - 1];
  check(label === 'BUILD AMMUNITION SUPPLY' && up.level === 1 && locker && locker.alive && getV(w.grid, spot.x, Math.round(pl.y), spot.z) === V.LOCKER,
    `building with an ammunition crate puts up the ammunition supply (button: ${label})`);
  check(w.pending.some(j => j.item === 'ammo_crate'), 'the ammunition crate comes back to the checkpoint while the supply is below its top level');
  step(w, {}, 2);
  const drop = w.pickups.find(k => k.type === 'resupply');
  check(drop && Math.abs(drop.x - spot.x - 0.5) < 0.01 && drop.y > pl.y + 0.9, 'a fresh supply hands out an ammunition box at once, on top of the locker');
  // take it (run low on ammunition first)
  pl.reserve[cal] = 0;
  step(w, {}, 2);
  check(!w.pickups.includes(drop) && pl.reserve[cal] > 0, `standing next to the locker you take the box (+${pl.reserve[cal]} ${cal})`);
  pl.reserve[cal] = data.calibres[cal]; pl.grenades = 5;
  const every = Number(data.upgrades.ammo.levels[0].every);
  step(w, {}, Math.round((every - 1) * 60));
  const early = w.pickups.some(k => k.type === 'resupply');
  step(w, {}, 3 * 60);
  check(!early && w.pickups.some(k => k.type === 'resupply'), `the next box comes ${every} s after the last was taken`);
  const label2 = buildOnce();
  buildOnce();
  check(label2 === 'UPGRADE AMMUNITION SUPPLY 2/3' && up.level === 3 && up.level === maxLevel(w, 'ammo'), `upgraded to the top level, 3 (button: ${label2})`);
  w.pending = w.pending.filter(j => j.item !== 'ammo_crate');
  check(!crateWanted(w, 'ammo_crate') && crateWanted(w, 'construction_crate'), 'at the top level the ammunition crate stops coming back (construction crates always do)');
  // a crate of a maxed upgrade is left lying (you can't get stuck carrying it)
  w.pickups.push({ id: w.nextId++, type: 'item', item: 'ammo_crate', x: pl.x, y: pl.y, z: pl.z, origin: { x: 0, y: 0, z: 0 } });
  step(w, {}, 2);
  check(!pl.carrying, 'a crate for an upgrade that is already at the top level is not picked up');
  w.pickups = w.pickups.filter(k => k.type !== 'item' || k.item !== 'ammo_crate');
  destroyPiece(w, w.pieces[up.piece - 1]);
  check(up.level === 0 && w.pending.some(j => j.item === 'ammo_crate') && getV(w.grid, spot.x, Math.round(pl.y), spot.z) === V.AIR,
    'a destroyed locker takes its upgrade back to nothing, and its crate comes back');
}

// fuel tanks: a rocket sets one off; wide blast; no chain reaction
{
  const w = createWorld({ data, levelId: 'najaf', seed: 12 });
  w.enemies = []; w.groups = [];
  const tanks = w.pieces.filter(p => p.tank);
  check(tanks.length === 8, `8 fuel tanks in the refinery (${tanks.length})`);
  const t = tanks.find(p => p.tank.r >= 9);
  const pl = w.players[0];
  const R = S.hazards.tank_blast_radius;
  // stand 9 m from the tank wall, on the side away from the other tanks
  pl.x = t.tank.cx; pl.z = t.tank.cz - t.tank.r - 9; pl.y = groundAt(w, pl.x, pl.z, 30); pl.hp = 100; pl.armour = 0;
  const rifle = data.weapons.ak47;
  explode(w, t.tank.cx, t.tank.y0 + 2, t.tank.cz - t.tank.r - 0.3, rifle, null);
  check(t.alive, 'bullets and rifle hits do nothing to a tank');
  const others = tanks.filter(p => p !== t).map(p => p.alive);
  w.events.length = 0;
  explode(w, t.tank.cx, t.tank.y0 + 2, t.tank.cz - t.tank.r - 0.3, data.weapons.rpg7, null);
  const big = w.events.find(e => e.type === 'explosion' && e.big);
  check(!t.alive && big, 'an RPG hit blows the tank up');
  check(pl.hp > 0 && pl.hp < 40, `the blast hurts someone 9 m away badly (health ${Math.round(pl.hp)})`);
  check(tanks.filter(p => p !== t).every(p => p.alive) && others.every(Boolean), 'no chain reaction: the other tanks are still standing');
  const floor = t.tank.floor.filter(i => w.grid.cells[i] === V.RUBBLE).length;
  check(floor > 100, `a scorched ring of debris is left where it stood (${floor} cells)`);
}

// flare smoke is always there; fences stop people but not bullets
{
  const w = createWorld({ data, levelId: 'najaf', seed: 13 });
  const z = w.weather.find(x => x.type === 'smoke');
  step(w, {}, 60);
  check(z && z.active && stormAt(w, z.x, z.z) === 1 && stormAt(w, z.x, z.z, 'sandstorm') === 0, 'smoke at the flare stack is always there (cuts enemy sight like a storm)');
  const fp = level.props.find(p => p.type === 'fence' && p.d > 10);
  const fx = fp.x + 0.5, fz = fp.z + 5.5, fy = groundAt(w, fx, fz, 0.5);
  check(blocked(w, fx, fz, fy, S.player.radius, S.player.height, S.player.step_height) && !solidAt(w.grid, fx, fy + 1.2, fz), 'a fence blocks people but bullets and eyes pass through it');
}

// co-op: the partner's phone mirrors builds and broken base pieces exactly
{
  const host = createWorld({ data, levelId: 'najaf', seed: 21 });
  const guest = createWorld({ data, levelId: 'najaf', seed: 21, playerIds: ['p1', 'p2'] });
  host.enemies = []; host.groups = []; host.waves.nextT = 1e9;
  const b = bases.find(x => x.id === 'control_building');
  const pl = host.players[0];
  Object.assign(pl, { x: b.build_spots[0].x + 0.5, z: b.build_spots[0].z + 0.5 }); pl.y = groundAt(host, pl.x, pl.z, 30);
  step(host, {}, 3);
  const enc = createHostEncoder(data), dec = createGuestDecoder(data);
  const sync = () => { host.tick++; enc.record(host, host.events); const snap = enc.encode(host); host.events.length = 0; dec.apply(guest, snap, 'p2'); guest.events.length = 0; return snap; };
  const { applyUpgrade } = await import('../src/sim/base.js');
  applyUpgrade(host, 'walls', 1); applyUpgrade(host, 'armour', 1); applyUpgrade(host, 'medical', 1);
  sync();
  // break some wall pieces and the armour locker, then rebuild both
  const wp = host.base.upgrades.walls.pieces.slice(0, 5).map(id => host.pieces[id - 1]);
  for (const p of wp) destroyPiece(host, p);
  destroyPiece(host, host.pieces[host.base.upgrades.armour.piece - 1]);
  applyUpgrade(host, 'walls', 2); applyUpgrade(host, 'armour', 1);
  let size = 0;
  for (let i = 0; i < 3; i++) size = Math.max(size, JSON.stringify(sync()).length);
  const same = host.pieces.length === guest.pieces.length && host.pieces.every((p, i) => p.alive === guest.pieces[i].alive && p.cells.join() === guest.pieces[i].cells.join());
  check(guest.base.claimed && guest.base.id === 'control_building' && same && ['walls', 'armour', 'medical'].every(id => guest.base.upgrades[id].level === host.base.upgrades[id].level),
    `co-op partner sees the same base, upgrades and walls (${host.pieces.length} pieces each)`);
  // message size with every enemy of the level around the players
  const full = createWorld({ data, levelId: 'najaf', seed: 22, playerIds: ['p1', 'p2'] });
  const e2 = createHostEncoder(data);
  let worst = 0;
  for (const [x, z] of [[128, 150], [70, 66], [212, 100], [65, 199], [30, 40]]) {
    full.players[0].x = x; full.players[0].z = z; full.players[1].x = 256 - x; full.players[1].z = 256 - z;
    e2.forceFull();
    e2.record(full, []);
    worst = Math.max(worst, JSON.stringify(e2.encode(full)).length);
  }
  check(worst < 4000 && size < 4000, `co-op messages stay under 4 KB with ${full.enemies.length} enemies on the map (largest ${worst} bytes)`);
}

process.exit(failures ? 1 : 0);

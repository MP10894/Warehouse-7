// Moves enemy spawn points that ended up inside a wall (or somewhere nobody can walk to) to the
// nearest open spot that can be reached on foot, and writes level.json back. Run after a level
// generator, e.g.:  node tools/settle_spawns.mjs kambala
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { buildData, parseCsv, byKey } from '../src/data/parse.js';
import { gameDataFromXlsx } from '../src/data/xlsx.js';
import { createWorld } from '../src/sim/world.js';
import { buildNav, nodeAt, flowField } from '../src/sim/nav.js';
import { groundAt, blocked } from '../src/sim/body.js';

const id = process.argv[2];
if (!id) { console.log('usage: node tools/settle_spawns.mjs <level folder>'); process.exit(1); }
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const lv = `data/levels/${id}/`, buildings = {};
for (const f of readdirSync(new URL('../' + lv + 'buildings', import.meta.url))) buildings[f] = read(lv + 'buildings/' + f);
const gameData = gameDataFromXlsx(readFileSync(new URL('../data/Game Data.xlsx', import.meta.url)), byKey(parseCsv(read('data/enemies.csv')), 'id'));
const data = buildData({
  weaponsRows: gameData.weapons, enemiesRows: gameData.enemies, alliesRows: gameData.allies, materialsCsv: read('data/materials.csv'),
  enemiesCsv: read('data/enemies.csv'), wavesCsv: read('data/waves.csv'), upgradesCsv: read('data/upgrades.csv'),
  settings: JSON.parse(read('data/settings.json')),
  levels: { [id]: { json: read(lv + 'level.json'), terrain: read(lv + 'terrain.txt'), ground: read(lv + 'ground.txt'), buildings } }
});
const S = data.settings.player;
const world = createWorld({ data, levelId: id, seed: 1 });
world.enemies = [];
const nav = buildNav(world);
const p = world.players[0];
const field = flowField(nav, [nodeAt(nav, p.x, p.y, p.z)]);
const ok = (x, y, z) => {
  if (blocked(world, x, z, y, S.radius, S.height, S.step_height)) return false;
  const n = nodeAt(nav, x, y, z);
  return n >= 0 && field[n] >= 0;
};

const level = JSON.parse(read(lv + 'level.json'));
let moved = 0;
for (const g of level.enemy_groups) {
  for (const sp of g.spawns) {
    const want = sp.y ?? 30;
    let y = groundAt(world, sp.x + 0.5, sp.z + 0.5, want + 0.6);
    if (ok(sp.x + 0.5, y, sp.z + 0.5)) continue;
    let found = null;
    for (let r = 1; r <= 8 && !found; r++) {
      for (let k = 0; k < 8 * r && !found; k++) {
        const a = k * Math.PI * 2 / (8 * r);
        const x = Math.round(sp.x + Math.cos(a) * r), z = Math.round(sp.z + Math.sin(a) * r);
        const yy = groundAt(world, x + 0.5, z + 0.5, want + 0.6);
        if (Math.abs(yy - want) < 1.6 && ok(x + 0.5, yy, z + 0.5)) found = { x, z, y: yy };
      }
    }
    if (found) { console.log(`${g.id}: ${sp.x},${sp.z} → ${found.x},${found.z}`); Object.assign(sp, found); moved++; }
    else console.log(`${g.id}: ${sp.x},${sp.z} has no open spot nearby (left as it is)`);
  }
}
writeFileSync(new URL('../' + lv + 'level.json', import.meta.url), JSON.stringify(level, null, 1));
console.log(`${moved} spawn points moved`);

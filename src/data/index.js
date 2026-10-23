// Loads everything in /data into one object. Vite bundles these files, and while
// `npm run dev` is running, saving any of them reloads the game automatically.
// Weapons (and enemies, once the workbook has an Enemies tab) come straight from the
// Excel workbook, converted when the game is built (see vite.config.js and src/data/xlsx.js).
import gameData from 'virtual:gamedata';
import materialsCsv from '../../data/materials.csv?raw';
import enemiesCsv from '../../data/enemies.csv?raw';
import wavesCsv from '../../data/waves.csv?raw';
import upgradesCsv from '../../data/upgrades.csv?raw';
import settings from '../../data/settings.json';
import { buildData } from './parse.js';

const files = import.meta.glob('../../data/levels/*/**/*.{json,txt}', { query: '?raw', import: 'default', eager: true });

const levels = {};
for (const [path, text] of Object.entries(files)) {
  const m = path.match(/levels\/([^/]+)\/(.+)$/);
  if (!m) continue;
  const [, id, rest] = m;
  const lv = levels[id] || (levels[id] = { buildings: {} });
  if (rest === 'level.json') lv.json = text;
  else if (rest === 'terrain.txt') lv.terrain = text;
  else if (rest === 'ground.txt') lv.ground = text;
  else if (rest.startsWith('buildings/')) lv.buildings[rest.slice('buildings/'.length)] = text;
}
for (const id of Object.keys(levels)) if (!levels[id].json) delete levels[id];

export const DATA = buildData({ weaponsRows: gameData.weapons, enemiesRows: gameData.enemies, materialsCsv, enemiesCsv, wavesCsv, upgradesCsv, settings, levels });

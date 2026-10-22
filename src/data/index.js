// Loads everything in /data into one object. Vite bundles these files, and while
// `npm run dev` is running, saving any of them reloads the game automatically.
import enemiesCsv from '../../data/enemies.csv?raw';
import weaponsCsv from '../../data/weapons.csv?raw';
import pickupsCsv from '../../data/pickups.csv?raw';
import settings from '../../data/settings.json';
import warehouse from '../../data/levels/warehouse.txt?raw';
import { buildData } from './parse.js';

export const DATA = buildData({
  enemiesCsv,
  weaponsCsv,
  pickupsCsv,
  settings,
  levels: { warehouse }
});

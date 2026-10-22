import { defineConfig } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gameDataFromXlsx } from './src/data/xlsx.js';
import { parseCsv, byKey } from './src/data/parse.js';

const file = name => fileURLToPath(new URL(`./data/${name}`, import.meta.url));
// The workbook was called Weapons.xlsx at first; Game Data.xlsx is the new name.
const WORKBOOKS = [file('Game Data.xlsx'), file('Weapons.xlsx')];
const ENEMIES_CSV = file('enemies.csv');

// Lets the game import the Excel workbook directly: `import data from 'virtual:gamedata'`.
// While `npm run dev` runs, saving the workbook in Excel reloads the game.
function gameDataWorkbook() {
  const id = 'virtual:gamedata', resolved = '\0virtual:gamedata';
  return {
    name: 'game-data-workbook',
    resolveId(src) { return src === id ? resolved : null; },
    load(src) {
      if (src !== resolved) return null;
      const path = WORKBOOKS.find(existsSync);
      if (!path) throw new Error('No game data workbook found: expected data/Game Data.xlsx');
      for (const p of WORKBOOKS) this.addWatchFile(p);
      const defaults = byKey(parseCsv(readFileSync(ENEMIES_CSV, 'utf8')), 'id');
      return `export default ${JSON.stringify(gameDataFromXlsx(readFileSync(path), defaults))};`;
    },
    handleHotUpdate(ctx) {
      if (WORKBOOKS.includes(ctx.file)) {
        const mod = ctx.server.moduleGraph.getModuleById(resolved);
        if (mod) ctx.server.moduleGraph.invalidateModule(mod);
        ctx.server.ws.send({ type: 'full-reload' });
        return [];
      }
    }
  };
}

// base './' keeps every path relative, so the built game works from any folder:
// GitHub Pages, a Capacitor Android wrapper, or a plain web host.
export default defineConfig({
  base: './',
  plugins: [gameDataWorkbook()],
  build: { target: 'es2020', chunkSizeWarningLimit: 1000 }
});

import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { weaponsFromXlsx } from './src/data/xlsx.js';

const WEAPONS_XLSX = fileURLToPath(new URL('./data/Weapons.xlsx', import.meta.url));

// Lets the game import the weapons workbook directly: `import rows from 'virtual:weapons'`.
// While `npm run dev` runs, saving Weapons.xlsx in Excel reloads the game.
function weaponsWorkbook() {
  const id = 'virtual:weapons', resolved = '\0virtual:weapons';
  return {
    name: 'weapons-workbook',
    resolveId(src) { return src === id ? resolved : null; },
    load(src) {
      if (src !== resolved) return null;
      this.addWatchFile(WEAPONS_XLSX);
      return `export default ${JSON.stringify(weaponsFromXlsx(readFileSync(WEAPONS_XLSX)))};`;
    },
    handleHotUpdate(ctx) {
      if (ctx.file === WEAPONS_XLSX) {
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
  plugins: [weaponsWorkbook()],
  build: { target: 'es2020', chunkSizeWarningLimit: 1000 }
});

import { defineConfig } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { gameDataFromXlsx } from './src/data/xlsx.js';
import { parseCsv, byKey } from './src/data/parse.js';

const file = name => fileURLToPath(new URL(`./data/${name}`, import.meta.url));
const WORKBOOKS = [file('Game Data.xlsx')];
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

// Art files imported with `?art` become data URLs inside the game code, so the
// single-file play link carries them (see src/render/assets.js).
function artFiles() {
  const types = { png: 'image/png', glb: 'model/gltf-binary' };
  return {
    name: 'art-files',
    enforce: 'pre',
    load(id) {
      const m = id.match(/^(.*\.(png|glb))\?art$/);
      if (!m) return null;
      this.addWatchFile(m[1]);
      return `export default ${JSON.stringify(`data:${types[m[2]]};base64,${readFileSync(m[1]).toString('base64')}`)};`;
    }
  };
}

// The version shown on the menu and compared when two phones start co-op: the package
// version plus the commit it was built from (so every published build has its own).
function appVersion() {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  let sha = (process.env.GITHUB_SHA || '').slice(0, 7);
  if (!sha) { try { sha = execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { sha = 'local'; } }
  return `${pkg.version}-${sha}`;
}

// base './' keeps every path relative, so the built game works from any folder:
// GitHub Pages, a Capacitor Android wrapper, or a plain web host.
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  plugins: [artFiles(), gameDataWorkbook()],
  build: { target: 'es2020', chunkSizeWarningLimit: 1000 }
});

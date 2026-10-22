import { defineConfig } from 'vite';

// base './' keeps every path relative, so the built game works from any folder:
// GitHub Pages, a Capacitor Android wrapper, or a plain web host.
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 1000 }
});

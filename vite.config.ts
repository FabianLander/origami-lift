import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Relative base, so the same build serves at the repository's GitHub Pages path
// (https://fabianlander.github.io/origami-lift/), inside an iframe, and anywhere else.
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/engine/core', import.meta.url)),
      '@display': fileURLToPath(new URL('./src/engine/display', import.meta.url)),
    },
  },
  server: { port: 5466, strictPort: false },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 800 },  // three.js is most of it
});

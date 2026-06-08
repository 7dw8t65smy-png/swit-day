import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Исходники d3-transition (filter.js ↔ index.js) циклически импортируют
// default, из-за чего падает прод-сборка rollup (в dev на esbuild проходит).
// Берём UMD-сборку без цикла; путь вычисляем от резолва пакета (надёжно при
// любом расположении в node_modules), т.к. exports не отдаёт подпути.
const d3TransitionDist = resolve(dirname(require.resolve('d3-transition')), '../dist/d3-transition.js');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve('src/main/index.ts') } }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve('src/preload/index.ts') } }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    resolve: {
      alias: {
        'd3-transition': d3TransitionDist
      }
    },
    build: {
      rollupOptions: { input: { index: resolve('src/renderer/index.html') } }
    }
  }
});

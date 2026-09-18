import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  server: {
    fs: {
      allow: ['..'],
    },
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  worker: {
    format: 'es',
  },
});

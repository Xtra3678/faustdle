import { defineConfig } from 'vite';

export default defineConfig({
  base: '/faustdle/',
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/archipelago': {
        target: 'ws://localhost:38281',
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});
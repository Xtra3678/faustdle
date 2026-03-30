import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true,
    middlewareMode: false,
    proxy: {
      '/archipelago': {
        target: 'ws://localhost:38281',
        ws: true
      }
    }
  },
  plugins: [],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: 'index.html',
        tos: 'tos.html',
        privacy: 'privacy.html'
      }
    },
    // Ensure audio files are copied to the build output
    copyPublicDir: true
  },
  // Make sure audio files are treated as static assets
  assetsInclude: ['**/*.mp3'],
  resolve: {
    alias: {
      '@supabase/supabase-js': '/node_modules/@supabase/supabase-js/dist/module/index.js'
    }
  },
  // Configure public directory
  publicDir: 'public'
});
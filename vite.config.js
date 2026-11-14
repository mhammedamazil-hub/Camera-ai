import { defineConfig } from 'vite';

// Project TERRA build config.
// The physics/simulation core under src/ is plain ES modules with zero
// browser dependencies so every module can be unit-tested under Node.
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // The Arena preview proxy requests the dev server through a
    // *.e2b.app host; never block unknown hosts (Vite 6+ host check).
    allowedHosts: true,
  },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    reporters: 'default',
  },
});

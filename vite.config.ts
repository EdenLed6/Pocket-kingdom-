import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Predictable filename so the diag overlay can fetch-test it directly.
        // Drop the hash + revisit when we add code-splitting later.
        entryFileNames: 'assets/main.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: { host: true },
});

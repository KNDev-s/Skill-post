import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/public/slides': 'http://127.0.0.1:3001',
      '/health': 'http://127.0.0.1:3001',
    },
  },
  test: { include: ['src/**/*.test.ts'] },
});

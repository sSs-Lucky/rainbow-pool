import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    proxy: {
      '/ws': { target: 'ws://127.0.0.1:3000', ws: true },
      '/health': { target: 'http://127.0.0.1:3000' },
    },
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem,key,p12}', '**/.git/**', '**/.runtime/**', '**/deployment.json'],
    },
  },
});

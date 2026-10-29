import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, '../server/src'),
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: `http://localhost:${process.env.AMS_API_PORT ?? 8791}`, changeOrigin: true } },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { flowTower } from './src/server/plugin.ts';

export default defineConfig({
  plugins: [react(), flowTower()],
  server: { host: '127.0.0.1' },
});

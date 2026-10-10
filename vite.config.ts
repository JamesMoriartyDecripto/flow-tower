import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { flowTower } from './src/server/plugin.ts';

export default defineConfig({
  plugins: [react(), flowTower()],
  server: {
    host: '127.0.0.1',
    // A list here replaces Vite's defaults, so they are repeated (Vite 8.3 defaults), plus the voice journal
    // and memory: the dev server never serves them, wherever FLOW_TOWER_HOME points.
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/voice-journal.jsonl', '**/voice-memory.json'],
    },
  },
});

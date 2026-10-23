import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { flowTower } from './src/server/plugin.ts';

export default defineConfig({
  plugins: [react(), flowTower()],
  server: {
    host: '127.0.0.1',
    // Transform the app (the entry and its static imports) at start: a hub runs with --no-open, so without this
    // the first viewer pays for a cold cache, about 45 s over a tailnet (#166).
    warmup: { clientFiles: ['./index.html', './src/app/main.tsx'] },
    // A list here replaces Vite's defaults, so they are repeated (Vite 8.3 defaults), plus the voice journal
    // and memory: the dev server never serves them, wherever FLOW_TOWER_HOME points. The checkout config
    // flow-tower.local.json can hold a sender token, so it is refused too (#287).
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', 'flow-tower.local.json', '**/.git/**', '**/voice-journal.jsonl', '**/voice-memory.json'],
    },
  },
});

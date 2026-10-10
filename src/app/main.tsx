import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/orbitron/600.css';
import '@fontsource/orbitron/800.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles.css';
import { App } from './App';
import { initPrefs } from './settings';
import { useStore } from './store';
import { useVoice } from './voice/voice';
import { converse } from './voice/agent';

initPrefs();
// Dev-only hook for the E2E sweep (e2e/): tests assert on app state, not on canvas pixels. App.tsx adds `three`.
if (import.meta.env.DEV) Object.assign(window, { __flowTower: { store: useStore, voice: (text: string) => useVoice.getState().run(text), ask: (text: string) => converse(text), hear: (text: string) => useVoice.getState().hear(text) } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import { describe, expect, it } from 'vitest';
import { isViewerRequest } from '../src/server/viewer-assets';

/**
 * Hub mode (#287): a remote viewer may load the app and nothing else. The tables are the requests the app
 * really makes (measured on the 3D and document pages) and the reads the guard must refuse.
 */
describe('isViewerRequest: what a remote viewer may load', () => {
  it.each([
    ['/'],
    ['/?tower=team-hub'],
    ['/?doc=team-hub&snap=0'],
    ['/index.html'],
    ['/@vite/client'],
    ['/@vite/env'],
    ['/@react-refresh'],
    ['/src/app/main.tsx'],
    ['/src/app/hud/Hud.tsx?t=1700000000000'],
    ['/src/app/hud/hud.css?direct&t=1'],
    ['/src/core/schema.ts'],
    ['/node_modules/.vite/port-5317/deps/react.js?v=bb39b553'],
    ['/node_modules/vite/dist/client/env.mjs'],
    ['/node_modules/@fontsource/orbitron/600.css'],
    ['/node_modules/@fontsource/orbitron/files/orbitron-latin-600-normal.woff2'],
    ['/node_modules/@fontsource/orbitron/files/orbitron-latin-600-normal.woff?import&url'],
    ['/node_modules/katex/dist/katex.min.css'],
    ['/package.json?import'],
    ['/api/workspace'],
    ['/api/file?path=a/b.md&tower=x'],
    ['/API/workspace'],
  ])('allows %s', (url) => {
    expect(isViewerRequest(url)).toBe(true);
  });

  it.each([
    ['/package.json'],
    ['/package.json?raw'],
    ['/package.json?import&raw'],
    ['/NEXT.md'],
    ['/flow-tower.local.json'],
    ['/src/server/hub.ts'],
    ['/src/server/hub.ts?raw'],
    ['/SRC/server/hub.ts'],
    ['/src/app/main.tsx?raw'],
    ['/src/app/main.tsx?import&raw'],
    ['/src/core/schema.ts?url'],
    ['/src/app/main.tsx?worker_file&type=module'],
    ['/src/app/main.tsx%3fraw'],
    ['/node_modules/.vite/../../package.json'],
    ['/node_modules/.vite/..%2f..%2fpackage.json'],
    ['/src/app/%2e%2e/server/hub.ts'],
    ['/src/app/./main.tsx'],
    ['/src/app/..\\server\\hub.ts'],
    ['/src//app/main.tsx'],
    ['/api/../package.json'],
    ['/api/..%2fpackage.json'],
    ['/src/app/%E0%A4%A'],
    ['/node_modules/three/package.json'],
    ['/node_modules/three/build/three.module.js'],
    ['/node_modules/@fontsource/orbitron/600.css?raw'],
    ['/@id/three'],
    ['/@fs/etc/passwd'],
    ['/examples/team-hub/team-hub.tower.yaml'],
    ['/tests/hub-mode.test.ts'],
    [''],
    ['src/app/main.tsx'],
  ])('refuses %s', (url) => {
    expect(isViewerRequest(url)).toBe(false);
  });
});

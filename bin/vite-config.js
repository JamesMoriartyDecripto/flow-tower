import { join } from 'node:path';

/**
 * The Vite config for the CLI server, loaded once and passed inline (#99).
 *
 * Why: when a file that vite.config.ts imports changes, Vite restarts the dev server in-process, and each
 * restart leaked the previous server (Vite #23493; the native resolve callbacks behind it are Rolldown
 * #10887, still open). Passing the config as an object with configFile: false leaves Vite no config
 * dependencies to watch.
 *
 * Effect: edits to the server's own source (src/server, src/core) never restart it. Restart the server by
 * hand to run new server code. Revisit when Rolldown #10887 ships.
 */
export async function serveConfig(pkgRoot, overrides) {
  // Vite is loaded here, not at the top of the CLI: `emit` runs on every hook call and must not pay for it.
  const { loadConfigFromFile, mergeConfig } = await import('vite');
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, join(pkgRoot, 'vite.config.ts'), pkgRoot, 'warn');
  return { ...mergeConfig(loaded.config, overrides), configFile: false };
}

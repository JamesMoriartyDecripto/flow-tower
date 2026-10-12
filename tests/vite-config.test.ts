import { describe, expect, it } from 'vitest';
import { serveConfig } from '../bin/vite-config.js';

describe('serveConfig (#99: the CLI server loads its Vite config once)', () => {
  it('passes the config inline and keeps the config file own settings', { timeout: 30_000 }, async () => {
    const config = await serveConfig(process.cwd(), { server: { port: 5999, strictPort: true } });

    expect(config.configFile).toBe(false);
    const plugins = (config.plugins as unknown[]).flat(Infinity) as { name?: string }[];
    expect(plugins.filter((p) => p?.name === 'flow-tower')).toHaveLength(1);
    expect(config.server?.port).toBe(5999);
    expect(config.server?.strictPort).toBe(true);
    // Set only in vite.config.ts: proves the loaded config survives the merge with the overrides.
    expect(config.server?.fs?.deny).toContain('.env');
  });
});

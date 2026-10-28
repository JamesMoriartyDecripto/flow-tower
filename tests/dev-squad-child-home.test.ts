import { existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { childEnv, scratchHome } from '../examples/dev-squad/src/child-env.ts';

describe('scratchHome', () => {
  it('returns the same empty folder under the OS temp dir on every call', () => {
    const home = scratchHome();
    expect(scratchHome()).toBe(home);
    expect(existsSync(home)).toBe(true);
    expect(statSync(home).isDirectory()).toBe(true);
    expect(dirname(resolve(home))).toBe(resolve(tmpdir()));
    expect(home.split(/[\\/]/).pop()).toMatch(/^dev-squad-home-/);
    expect(readdirSync(home)).toEqual([]);
  });

  it('is what childEnv points HOME at, instead of the real home', () => {
    const env = childEnv({ HOME: '/real', PATH: '/bin' });
    expect(env.HOME).toBe(scratchHome());
    expect(env.HOME).not.toBe('/real');
    expect(env.XDG_CONFIG_HOME).toBe(join(scratchHome(), '.config'));
  });
});

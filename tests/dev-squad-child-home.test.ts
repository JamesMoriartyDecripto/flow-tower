import { existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { childEnv, removeScratchHomes, scratchHome } from '../examples/dev-squad/src/child-env.ts';

describe('scratchHome', () => {
  it('returns the same empty folder under the OS temp dir on every call', () => {
    const home = scratchHome('/w1');
    expect(scratchHome('/w1')).toBe(home);
    expect(existsSync(home)).toBe(true);
    expect(statSync(home).isDirectory()).toBe(true);
    expect(dirname(resolve(home))).toBe(resolve(tmpdir()));
    expect(home.split(/[\\/]/).pop()).toMatch(/^dev-squad-home-/);
    // The XDG folders are created up front, so the home is not empty but holds only those entries.
    expect(readdirSync(home).sort()).toEqual(['.cache', '.config', '.local']);
    expect(readdirSync(join(home, '.local'))).toEqual(['share']);
  });

  it('is what childEnv points HOME at, instead of the real home', () => {
    const env = childEnv({ HOME: '/real', PATH: '/bin' }, scratchHome('/w1'));
    expect(env.HOME).toBe(scratchHome('/w1'));
    expect(env.HOME).not.toBe('/real');
    expect(env.XDG_CONFIG_HOME).toBe(join(scratchHome('/w1'), '.config'));
  });

  it('gives each worktree key its own folder, and the same key the same folder', () => {
    const w1 = scratchHome('/w1');
    expect(scratchHome('/w1')).toBe(w1);
    const w2 = scratchHome('/w2');
    expect(w2).not.toBe(w1);
    expect(statSync(join(w1, '.config')).isDirectory()).toBe(true);
    expect(statSync(join(w2, '.config')).isDirectory()).toBe(true);
  });

  it('removeScratchHomes deletes the folders, and a new call makes a different one', () => {
    const old = scratchHome('/w3');
    removeScratchHomes();
    expect(existsSync(old)).toBe(false);
    const fresh = scratchHome('/w3');
    expect(fresh).not.toBe(old);
    expect(statSync(fresh).isDirectory()).toBe(true);
    removeScratchHomes();
  });
});

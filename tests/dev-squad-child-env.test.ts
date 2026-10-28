import { describe, expect, it } from 'vitest';
import { SECRET_ENV, childEnv } from '../examples/dev-squad/src/child-env.ts';

describe('childEnv', () => {
  it('keeps PATH, drops both secrets, and points HOME at the scratch folder', () => {
    const env = childEnv({ PATH: '/bin', OPENROUTER_API_KEY: 'k', GITHUB_TOKEN: 't', HOME: '/h' }, '/scratch');
    expect(env).toEqual({
      PATH: '/bin',
      HOME: '/scratch',
      USERPROFILE: '/scratch',
      XDG_CONFIG_HOME: '/scratch/.config',
      XDG_CACHE_HOME: '/scratch/.cache',
      XDG_DATA_HOME: '/scratch/.local/share',
    });
  });

  it('drops every name in SECRET_ENV', () => {
    const base = Object.fromEntries([...SECRET_ENV, 'PATH'].map((k) => [k, 'x']));
    const env = childEnv(base);
    for (const key of SECRET_ENV) expect(env).not.toHaveProperty(key);
    expect(env.PATH).toBe('x');
  });

  it('does not modify the input object', () => {
    const base = { PATH: '/bin', OPENROUTER_API_KEY: 'k' };
    childEnv(base);
    expect(base).toEqual({ PATH: '/bin', OPENROUTER_API_KEY: 'k' });
  });
});

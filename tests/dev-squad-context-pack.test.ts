import { describe, expect, it } from 'vitest';

// Loaded at run time: context-loader.ts type-imports the Claude Agent SDK, which this repo does not install, and tsc would follow a static import into it.
const modulePath = '../examples/dev-squad/src/hooks/context-loader.ts';
const { contextPack } = (await import(/* @vite-ignore */ modulePath)) as { contextPack: (ctx: { issue: number; areas?: string[] }) => string };

describe('contextPack', () => {
  it('carries the header, the learned patterns and the global rules', () => {
    const pack = contextPack({ issue: 7 });
    expect(pack.startsWith('# Dev Squad context for issue #7')).toBe(true);
    expect(pack).toContain('## Learned patterns (follow these)');
    expect(pack).toContain('Write the failing test first');
    expect(pack).not.toContain('Validate request bodies');
  });

  it('adds the rules of the issue areas', () => {
    expect(contextPack({ issue: 7, areas: ['api'] })).toContain('Validate request bodies');
  });

  it('stays within the budget', () => {
    expect(contextPack({ issue: 7, areas: ['api'] }).length).toBeLessThanOrEqual(6000);
  });
});

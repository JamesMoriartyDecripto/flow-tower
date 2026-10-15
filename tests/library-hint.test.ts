import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { libraryHint } from '../src/app/libraryHint';

describe('libraryHint', () => {
  it('tells a library serve to add towers to the library', () => {
    expect(libraryHint('library')).toBe('add towers: flow-tower library add <path>');
  });

  it('tells a hub that teammates share towers', () => {
    expect(libraryHint('hub')).toBe('teammates add towers with flow-tower share <folder>');
  });

  it('keeps the plain-folder advice everywhere else', () => {
    expect(libraryHint('plain')).toBe('add projects: flow-tower <dir> scans every *.tower.yaml');
  });
});

describe('flow-tower guide', () => {
  // `guide` prints and exits before any server starts, so this runs the real CLI with no port in use.
  const bin = fileURLToPath(new URL('../bin/flow-tower.js', import.meta.url));
  const out = spawnSync(process.execPath, [bin, 'guide'], { encoding: 'utf8' }).stdout;

  it('states the checkout path after substitution', () => {
    expect(out).toContain(`Commands below use this checkout: node ${bin}.`);
    expect(out).not.toContain('<path>');
  });

  it('drops the sentence that asks the reader to fill in the placeholder', () => {
    expect(out).not.toContain('where `/');
    expect(out).not.toContain('where `<flow-tower>` is');
  });
});

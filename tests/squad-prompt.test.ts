import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// The squad's prompt helpers are plain ESM with no types, so they are imported as untyped modules here.
import { DEFAULTS, STYLE_RULES } from '../tools/squad/config.mjs';
// @ts-expect-error plain .mjs without declarations
import { oneshotSystem } from '../tools/squad/oneshot.mjs';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const RUN = join(ROOT, 'tools', 'squad', 'run.mjs');

describe('STYLE_RULES', () => {
  it('asks for the efficient approach and forbids premature optimization', () => {
    expect(STYLE_RULES).toContain('prefer the efficient approach when it adds no complexity');
    expect(STYLE_RULES).toContain('no premature optimization');
  });

  it('keeps the existing style and secret rules', () => {
    expect(STYLE_RULES).toContain('English only in code and comments');
    expect(STYLE_RULES).toContain('Never touch secret files.');
  });
});

describe('oneshotSystem', () => {
  it('carries STYLE_RULES verbatim and names the role', () => {
    const system: string = oneshotSystem('reviewer', '/repo');
    expect(system).toContain(STYLE_RULES);
    expect(system.startsWith('You are the reviewer of a dev squad')).toBe(true);
  });

  it('appends the configured rules after STYLE_RULES', () => {
    const system: string = oneshotSystem('security', '/repo', { ...DEFAULTS, rules: ['Rule X.'] });
    expect(system).toContain(STYLE_RULES);
    expect(system.endsWith(' Rule X.')).toBe(true);
  });
});

describe('loop system prompt', () => {
  it('uses STYLE_RULES instead of a copied sentence', () => {
    const text = readFileSync(RUN, 'utf8');
    expect(text).toContain('${styleRules(config)}');
    expect(text).not.toContain('files under ~400 lines. Never touch secret files.');
  });
});

describe('reviewed line header', () => {
  it('always prints the reviewed line, with none when the task has no commit', () => {
    const text = readFileSync(RUN, 'utf8');
    const line = text.split('\n').find((l) => l.includes('console.log(`reviewed: '));
    expect(line).toBeDefined();
    expect(line).toContain(`?? 'none'`);
    expect(text).not.toContain('if (reviewed) console.log(`');
  });
});

describe('style setting in the reviewer prompt (#404)', () => {
  it('a project that asks for Italian and 800 lines gets those rules, and no English-only sentence', () => {
    const cfg = { ...DEFAULTS, style: { language: 'Italian', maxFileLines: 800 } };
    const system: string = oneshotSystem('reviewer', '/repo', cfg);
    expect(system).toContain('Italian only in code and comments');
    expect(system).toContain('~800 lines');
    expect(system).not.toContain('English only');
    expect(system).not.toContain('~400 lines');
  });
});

describe('STYLE_RULES line scope', () => {
  it('asks the coder to change only the needed lines and report a long file in Known gaps', () => {
    expect(STYLE_RULES).toContain('change only the lines the task needs');
    expect(STYLE_RULES).toContain('say so in Known gaps instead of trimming other code');
  });
});

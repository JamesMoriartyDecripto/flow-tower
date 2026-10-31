import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// The squad's config helpers are plain ESM with no types, so they are imported as untyped modules here.
// @ts-expect-error plain .mjs without declarations
import { DEFAULTS, commandArgv, loadConfig, systemLine } from '../tools/squad/config.mjs';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const CONFIG = join(ROOT, 'tools', 'squad', 'config.mjs');

// A temp repo, optionally with a tools/squad/squad.json holding the given text.
function repoWith(json?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'squad-config-'));
  if (json !== undefined) {
    mkdirSync(join(dir, 'tools', 'squad'), { recursive: true });
    writeFileSync(join(dir, 'tools', 'squad', 'squad.json'), json);
  }
  return dir;
}

describe('squad config (#265)', () => {
  it('a repo with no config gets DEFAULTS', () => {
    expect(loadConfig(repoWith())).toEqual(DEFAULTS);
  });

  it('a config overrides commands.check and keeps the default models', () => {
    const cfg = loadConfig(repoWith(JSON.stringify({ commands: { check: 'make check' } })));
    expect(cfg.commands.check).toBe('make check');
    expect(cfg.models).toEqual(DEFAULTS.models);
  });

  it('a bad write dir (../x) throws naming the key', () => {
    expect(() => loadConfig(repoWith(JSON.stringify({ write: ['../x'] })))).toThrow(/"write"/);
  });

  it('a bad extras item throws naming the key', () => {
    expect(() => loadConfig(repoWith(JSON.stringify({ extras: ['deploy'] })))).toThrow(/"extras"/);
  });

  it('an empty commands.check throws naming the key', () => {
    expect(() => loadConfig(repoWith(JSON.stringify({ commands: { check: '  ' } })))).toThrow(/"commands.check"/);
  });

  it('commandArgv replaces {file} as one argument', () => {
    expect(commandArgv('npx vitest run {file}', 'tests/a.test.ts')).toEqual(['npx', 'vitest', 'run', 'tests/a.test.ts']);
  });

  it('commandArgv appends the file when the command has no {file}', () => {
    expect(commandArgv('npm run lint', 'src/a.ts')).toEqual(['npm', 'run', 'lint', 'src/a.ts']);
  });

  it('commandArgv returns null for an empty command', () => {
    expect(commandArgv('   ')).toBeNull();
  });

  it('systemLine names the project when set, and not when empty', () => {
    expect(systemLine({ project: 'Acme (Go)' }, '/r')).toBe('the repo Acme (Go) at /r');
    expect(systemLine({ project: '' }, '/r')).toBe('the repo at /r');
  });

  it("this repo's squad.json loads and keeps npm run check", () => {
    const cfg = loadConfig(ROOT);
    expect(cfg.commands.check).toBe('npm run check');
    expect(cfg.extras).toEqual(['validate', 'dryrun']);
  });

  it('get prints the default coder model for a repo with no config', () => {
    const out = execFileSync(process.execPath, [CONFIG, 'get', 'models.coder', repoWith()], { encoding: 'utf8' });
    expect(out.trim()).toBe(DEFAULTS.models.coder);
  });

  it('check runs the configured command and exits with its code', () => {
    const dir = repoWith(JSON.stringify({ commands: { check: 'node -e process.exit(3)' } }));
    const r = spawnSync(process.execPath, [CONFIG, 'check', dir], { encoding: 'utf8' });
    expect(r.status).toBe(3);
  });
});

describe('squad config validation (#265 review)', () => {
  it('a base that starts with "-" throws naming the key', () => {
    expect(() => loadConfig(repoWith(JSON.stringify({ base: '--output=/tmp/x' })))).toThrow(/"base"/);
  });

  it('an empty write array throws naming the key', () => {
    expect(() => loadConfig(repoWith(JSON.stringify({ write: [] })))).toThrow(/"write"/);
  });

  it('an empty review array throws naming the key', () => {
    expect(() => loadConfig(repoWith(JSON.stringify({ review: [] })))).toThrow(/"review"/);
  });

  it('extras without a cli throws naming the key', () => {
    expect(() => loadConfig(repoWith(JSON.stringify({ extras: ['validate'], cli: '' })))).toThrow(/"cli"/);
  });
});

describe('squad model defaults (#322)', () => {
  it('with no squad.json the reviewer default is z-ai/glm-5.3-flash', () => {
    expect(loadConfig(repoWith()).models).toEqual({
      coder: 'anthropic/claude-haiku-5.5',
      reviewer: 'z-ai/glm-5.3-flash',
      security: 'deepseek/deepseek-v4.1-flash',
      architect: 'openai/gpt-6.1-terra',
      'lead-judge': 'anthropic/claude-sonnet-5.5',
    });
  });
});

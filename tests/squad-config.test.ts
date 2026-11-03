import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// The squad's config helpers are plain ESM with no types, so they are imported as untyped modules here.
import { DEFAULTS, STYLE_RULES, commandArgv, loadConfig, styleRules, systemLine, taskRules } from '../tools/squad/config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
    expect(systemLine({ ...DEFAULTS, project: 'Acme (Go)' }, '/r')).toBe('the repo Acme (Go) at /r');
    expect(systemLine({ ...DEFAULTS, project: '' }, '/r')).toBe('the repo at /r');
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

describe('squad config refuses shell syntax (#382)', () => {
  const SHELL = /"commands.check" uses shell syntax, but the runner runs it without a shell/;

  it.each(['docker build . >/dev/null && bash x.sh', 'a | b', 'echo $(pwd)'])('refuses "%s"', (check) => {
    expect(() => loadConfig(repoWith(JSON.stringify({ commands: { check } })))).toThrow(SHELL);
  });

  it.each(['bash tools/ci/check.sh', 'npm run check', 'pytest -q {file}'])('accepts "%s"', (check) => {
    expect(loadConfig(repoWith(JSON.stringify({ commands: { check } }))).commands.check).toBe(check);
  });
});

describe('squad style setting (#404)', () => {
  // The text the prompts carried before the style setting existed: with no squad.json it must not change.
  const OLD_STYLE = 'English only in code and comments; match the surrounding style; comments explain why; files under ~400 lines, but change only the lines the task needs: if a file would pass ~400 lines, say so in Known gaps instead of trimming other code; prefer the efficient approach when it adds no complexity: batch work instead of handling items one by one, do not repeat work, run independent I/O concurrently (e.g. Promise.all); no premature optimization. Write the minimum that meets the task: no abstraction, option or check it does not ask for. Never touch secret files.';
  // The runner plan's task-file rules before they came from taskRules.
  const OLD_TASK = 'Rules: English only; never touch secret files; edit only the files named below; comments explain why; files under ~400 lines; never rewrite or empty an existing test file (add to the new one only).';

  it('with no squad.json the style and task rules are the old text', () => {
    expect(styleRules()).toBe(OLD_STYLE);
    expect(STYLE_RULES).toBe(OLD_STYLE);
    expect(taskRules()).toBe(OLD_TASK);
  });

  it('a language and a file size replace the fixed words in both rule texts', () => {
    const cfg = loadConfig(repoWith(JSON.stringify({ style: { language: 'Italian', maxFileLines: 800 } })));
    const style = styleRules(cfg);
    expect(style).toContain('Italian only');
    expect(style).toContain('~800 lines');
    expect(style).not.toContain('English only');
    expect(style).not.toContain('~400 lines');
    expect(taskRules(cfg)).toContain('Rules: Italian only;');
    expect(taskRules(cfg)).toContain('files under ~800 lines;');
  });

  it('refuses a style that is not an object', () => {
    expect(() => loadConfig(repoWith(JSON.stringify({ style: 'Italian' })))).toThrow(/"style"/);
  });

  it('refuses a maxFileLines that is not a positive integer', () => {
    expect(() => loadConfig(repoWith(JSON.stringify({ style: { maxFileLines: 0 } })))).toThrow(/"style.maxFileLines"/);
    expect(() => loadConfig(repoWith(JSON.stringify({ style: { maxFileLines: 2.5 } })))).toThrow(/"style.maxFileLines"/);
  });

  it('refuses an empty language', () => {
    expect(() => loadConfig(repoWith(JSON.stringify({ style: { language: '' } })))).toThrow(/"style.language"/);
  });
});

describe('squad skills setting (#432)', () => {
  it('refuses a skills value whose role is not an array of skill names, naming skills.coder', () => {
    expect(() => loadConfig(repoWith(JSON.stringify({ skills: { coder: 'tests' } })))).toThrow(/"skills.coder"/);
    expect(() => loadConfig(repoWith(JSON.stringify({ skills: { coder: ['../x'] } })))).toThrow(/"skills.coder"/);
  });
});

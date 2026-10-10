import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const CLI = resolve('bin/flow-tower.js');
const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

describe('cli validate', () => {
  it('passes on the examples and reports JSON', () => {
    const r = run('validate', 'examples/dev-squad', '--json');
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.projects).toEqual(['dev-squad.tower.yaml']);
  });

  it('fails with exit 1 on errors', () => {
    const r = run('validate', 'tests/fixtures/broken.tower.yaml');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('unknown agent "ghost"');
  });
});

describe('cli guide', () => {
  it('prints the procedure with this checkout filled in', () => {
    const r = run('guide');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('# Generate a tower from a codebase');
    expect(r.stdout).toContain(`node ${CLI} validate <tower-file> --json`);
    expect(r.stdout).toContain(`](${resolve('skills/flow-tower/reference.md')})`);
  });
});

describe('cli install-skill', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'flow-tower-skill-'));
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));
  const install = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, 'install-skill', ...args, '--project'], { cwd, encoding: 'utf8' });

  it.each([
    ['claude', '.claude/skills'],
    ['codex', '.agents/skills'],
    ['pi', '.pi/skills'],
    ['hermes', '.hermes/skills'],
  ])('--target %s installs into ./%s', (target, dir) => {
    const r = install('--target', target);
    expect(r.status).toBe(0);
    const skill = join(cwd, dir, 'flow-tower');
    for (const f of ['SKILL.md', 'reference.md', 'procedure.md']) expect(existsSync(join(skill, f))).toBe(true);
    const md = readFileSync(join(skill, 'SKILL.md'), 'utf8');
    expect(md).not.toContain('{{FLOW_TOWER_CLI}}');
    expect(md).toContain(`node ${CLI} validate`);
    expect(md).toContain('](procedure.md)');
    const proc = readFileSync(join(skill, 'procedure.md'), 'utf8');
    expect(proc).toContain('](reference.md)');
    expect(proc).not.toContain('<flow-tower>/');

    const costs = join(cwd, dir, 'flow-tower-costs');
    for (const f of ['SKILL.md', 'reference.md', 'models.mjs']) expect(existsSync(join(costs, f))).toBe(true);
    const costsMd = readFileSync(join(costs, 'SKILL.md'), 'utf8');
    expect(costsMd).not.toContain('{{FLOW_TOWER_CLI}}');
    expect(costsMd).not.toContain('](../../');
    expect(costsMd).toContain('](../flow-tower/SKILL.md)');
    expect(costsMd).toContain(`](${resolve('docs/realtime.md')})`);
    expect(readFileSync(join(costs, 'reference.md'), 'utf8')).not.toContain('](../../');
  });

  it('rejects an unknown target', () => {
    const r = install('--target', 'nope');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('unknown target');
  });
});

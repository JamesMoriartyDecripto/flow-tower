import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'yaml';
import { afterAll, describe, expect, it } from 'vitest';
import { cleanEnv } from './fixtures/clean-env';
// The squad's role helpers are plain ESM with no types, so they are imported as untyped modules here.
// @ts-expect-error plain .mjs without declarations
import { DEFAULTS, modelFor } from '../tools/squad/config.mjs';
// @ts-expect-error plain .mjs without declarations
import { ROLES, canWrite, finishRule, isRole, needsVerdict, roleRule, startupWrite, writeArgFor } from '../tools/squad/roles.mjs';
import { pickMode } from '../tools/squad/mode.mjs';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const NONE = { oneshot: false, batch: false, loop: false };
const ALL = Object.keys(ROLES) as string[];

describe('role registry (#334)', () => {
  it('lists the nine squad roles', () => {
    expect(ALL.sort()).toEqual(['architect', 'coder', 'doc-writer', 'researcher', 'reviewer', 'security', 'tester', 'triage', 'verifier'].sort());
  });

  it('only reviewer and security are gated on a verdict', () => {
    expect(ALL.filter((r) => needsVerdict(r)).sort()).toEqual(['reviewer', 'security']);
  });

  it('isRole accepts registry roles and refuses anything else, including path-like input', () => {
    expect(isRole('verifier')).toBe(true);
    expect(isRole('../evil')).toBe(false);
    expect(isRole('constructor')).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it('only coder and doc-writer can write; every other role is read-only', () => {
    expect(ALL.filter((r) => canWrite(r)).sort()).toEqual(['coder', 'doc-writer']);
  });

  it('roleRule is empty for an unknown role', () => {
    expect(roleRule('nope')).toBe('');
    expect(roleRule('tester')).toContain('write no files');
  });

  it('finishRule asks for the JSON verdict only on the gated roles', () => {
    expect(finishRule('reviewer')).toContain('only the JSON verdict');
    expect(finishRule('triage')).toContain('with your report');
  });
});

describe('writeArgFor', () => {
  it('a doc writer with no --write gets null, never the coder folders', () => {
    expect(writeArgFor('doc-writer', undefined, ['src', 'tests'])).toBeNull();
  });

  it('a doc writer keeps the --write it was given', () => {
    expect(writeArgFor('doc-writer', 'docs', ['src', 'tests'])).toBe('docs');
  });

  it('other roles fall back to the config folders', () => {
    expect(writeArgFor('coder', undefined, ['src', 'tests'])).toBe('src,tests');
    expect(writeArgFor('triage', undefined, ['src'])).toBe('src');
  });
});

describe('modelFor', () => {
  it('uses the role-specific model when squad.json names one', () => {
    expect(modelFor({ ...DEFAULTS, models: { ...DEFAULTS.models, triage: 'x/triage' } }, 'triage')).toBe('x/triage');
  });

  it('falls back to the reviewer family for the read-only graders', () => {
    for (const r of ['architect', 'researcher', 'verifier']) expect(modelFor(DEFAULTS, r)).toBe(DEFAULTS.models.reviewer);
  });

  it('falls back to the coder family for triage, tester and doc-writer', () => {
    for (const r of ['triage', 'tester', 'doc-writer']) expect(modelFor(DEFAULTS, r)).toBe(DEFAULTS.models.coder);
  });

  it('an unknown role resolves to undefined', () => {
    expect(modelFor(DEFAULTS, 'nope')).toBeUndefined();
  });

  it('an explicit empty or non-string model is returned as is, not replaced by the family model', () => {
    expect(modelFor({ ...DEFAULTS, models: { ...DEFAULTS.models, triage: '' } }, 'triage')).toBe('');
    expect(modelFor({ ...DEFAULTS, models: { ...DEFAULTS.models, tester: 42 } }, 'tester')).toBe(42);
  });
});

describe('startupWrite', () => {
  it('a doc writer with no --write has no folders', () => {
    expect(startupWrite('doc-writer', undefined, ['src', 'tests'])).toBeNull();
  });

  it('a doc writer gets the folders it names', () => {
    expect(startupWrite('doc-writer', 'docs,guide', ['src'])).toEqual(['docs', 'guide']);
  });

  it('a bad --write is refused for every role', () => {
    expect(startupWrite('coder', '/etc', ['src'])).toBeNull();
    expect(startupWrite('coder', 'docs,..', ['src'])).toBeNull();
  });

  it('other roles fall back to the config folders', () => {
    expect(startupWrite('coder', undefined, ['src', 'tests'])).toEqual(['src', 'tests']);
  });
});

describe('pickMode for the new roles', () => {
  it('every non-verdict role runs the tool loop by default', () => {
    for (const r of ['triage', 'architect', 'researcher', 'tester', 'verifier', 'doc-writer']) {
      expect(pickMode({ role: r, flags: NONE, pace: undefined })).toEqual({ mode: 'loop' });
    }
  });

  it('refuses --oneshot and --batch for the new roles', () => {
    for (const flag of ['oneshot', 'batch'] as const) {
      expect(() => pickMode({ role: 'tester', flags: { ...NONE, [flag]: true }, pace: undefined }))
        .toThrow('tester needs tools: --oneshot/--batch are for reviewer and security');
    }
  });

  it('--loop is accepted for a new role', () => {
    expect(pickMode({ role: 'verifier', flags: { ...NONE, loop: true }, pace: undefined })).toEqual({ mode: 'loop' });
  });
});

// run.mjs runs on import, so it is exercised as a subprocess in a temp git repo. Every case here exits before any
// request: a fake key is set where a key is needed, and the user key folder is empty, so nothing reaches the network.
const RUN = join(ROOT, 'tools', 'squad', 'run.mjs');
const scratch: string[] = [];
afterAll(() => { for (const d of scratch) rmSync(d, { recursive: true, force: true }); });

function squadRepo(config?: object): { repo: string; task: string } {
  const repo = mkdtempSync(join(tmpdir(), 'squad-run-'));
  scratch.push(repo);
  spawnSync('git', ['init', '-q', repo], { encoding: 'utf8' });
  if (config !== undefined) {
    mkdirSync(join(repo, 'tools', 'squad'), { recursive: true });
    writeFileSync(join(repo, 'tools', 'squad', 'squad.json'), JSON.stringify(config));
  }
  const task = join(repo, 'task.md');
  writeFileSync(task, 'Do the thing.\n');
  return { repo, task };
}

// The child gets no FLOW_TOWER_* from the parent and no real key: the fake key is set only when a case asks for it.
function runSquad(args: string[], { repo, withKey = false }: { repo: string; withKey?: boolean }) {
  const home = mkdtempSync(join(tmpdir(), 'squad-home-'));
  scratch.push(home);
  const env = cleanEnv({ FLOW_TOWER_HOME: home, SQUAD_LEDGER: join(home, 'ledger.jsonl'), ...(withKey && { OPENROUTER_API_KEY: 'test-fake-key' }) });
  if (!withKey) delete env.OPENROUTER_API_KEY;
  return spawnSync(process.execPath, [RUN, ...args, '--repo', repo], { encoding: 'utf8', timeout: 30_000, env });
}

describe('run.mjs role startup (#334)', () => {
  it('a doc writer without --write is refused with the usage, even with a key', () => {
    const { repo, task } = squadRepo({ models: { 'doc-writer': 'x/doc' } });
    const r = runSquad(['--role', 'doc-writer', '--task', task], { repo, withKey: true });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage: node tools/squad/run.mjs');
    expect(r.stdout).not.toContain('mode:');
  });

  it('a doc writer without --write gets the usage, not the missing key error, when no key is set', () => {
    const { repo, task } = squadRepo({ models: { 'doc-writer': 'x/doc' } });
    const r = runSquad(['--role', 'doc-writer', '--task', task], { repo });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage: node tools/squad/run.mjs');
    expect(r.stderr).not.toContain('no key');
  });

  it('an unknown role and a path-like role are refused with the usage', () => {
    const { repo, task } = squadRepo();
    for (const role of ['nope', '../evil']) {
      const r = runSquad(['--role', role, '--task', task], { repo, withKey: true });
      expect(r.status, role).toBe(1);
      expect(r.stderr, role).toContain('usage: node tools/squad/run.mjs');
    }
  });

  it('an empty --model is refused before any request', () => {
    const { repo, task } = squadRepo();
    const r = runSquad(['--role', 'triage', '--task', task, '--model', '  '], { repo, withKey: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no model for triage');
  });

  it('an empty or non-string configured model is refused by the config, naming the key', () => {
    for (const bad of ['', 42]) {
      const { repo, task } = squadRepo({ models: { triage: bad } });
      const r = runSquad(['--role', 'triage', '--task', task], { repo, withKey: true });
      expect(r.status, String(bad)).toBe(1);
      expect(r.stderr, String(bad)).toContain('"models.triage"');
    }
  });

  it('a valid configured new role gets past startup and stops at the missing key, not a crash', () => {
    const { repo, task } = squadRepo({ models: { triage: 'x/triage' } });
    const r = runSquad(['--role', 'triage', '--task', task], { repo });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no key: run');
    expect(r.stderr).not.toContain('TypeError');
    expect(r.stderr).not.toContain('Error:');
  });
});

describe('canonical node mapping', () => {
  const tower = parse(readFileSync(join(ROOT, 'examples', 'dev-squad', 'dev-squad.tower.yaml'), 'utf8'));
  const nodeIds = new Map<string, Set<string>>();
  for (const layer of tower.layers) nodeIds.set(layer.id, new Set(layer.nodes.map((n: { id: string }) => n.id)));

  it('every role names a node that exists in the dev-squad tower', () => {
    for (const r of ALL) {
      const [layer, id] = ROLES[r].node.split('.');
      expect(nodeIds.get(layer)?.has(id), `${r} -> ${ROLES[r].node}`).toBe(true);
    }
  });

  it('each role maps to a unique node', () => {
    const nodes = ALL.map((r) => ROLES[r].node);
    expect(new Set(nodes).size).toBe(nodes.length);
  });
});

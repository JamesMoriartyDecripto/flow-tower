import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLibrary } from '../src/core/loader';

/**
 * A tower from a cloned repository must not read files outside its project: prompt `file:`, agent
 * `from:`, `root:` and nested `tower:` stay inside the git repository (or the opened folder).
 */
function project() {
  const base = mkdtempSync(join(tmpdir(), 'flow-tower-sandbox-'));
  writeFileSync(join(base, 'secret.txt'), 'SECRET_SENTINEL');
  const repo = join(base, 'repo');
  mkdirSync(join(repo, '.git'), { recursive: true });
  mkdirSync(join(repo, 'towers'));
  writeFileSync(join(repo, 'inside.md'), 'inside prompt');
  return { base, repo };
}

const errors = (r: Awaited<ReturnType<typeof loadLibrary>>) =>
  Object.values(r.workspace.towers).flatMap((t) => t.issues.filter((i) => i.level === 'error').map((i) => i.message));

describe('tower files stay inside their project', () => {
  it('does not read prompt or agent files outside the repository', async () => {
    const { base, repo } = project();
    writeFileSync(join(repo, 't.tower.yaml'), [
      'name: T',
      'prompts:',
      '  up: { file: ../secret.txt }',
      `  abs: { file: ${join(base, 'secret.txt')} }`,
      '  ok: { file: inside.md }',
      'agents:',
      '  a: { from: ../secret.txt }',
      'layers:',
      '  - id: l',
      '    title: L',
      '    nodes: [{ id: n, agent: a, prompt: up }, { id: m, prompt: ok }]',
    ].join('\n'));
    const r = await loadLibrary([repo]);
    expect(JSON.stringify(r.workspace)).not.toContain('SECRET_SENTINEL');
    expect(JSON.stringify(r.workspace)).toContain('inside prompt');
    expect(errors(r).filter((m) => m.includes('outside the project'))).toHaveLength(3);
  });

  it('rejects a root outside the repository, so /api/file stays sandboxed', async () => {
    const { repo } = project();
    writeFileSync(join(repo, 't.tower.yaml'), 'name: T\nroot: /\nlayers:\n  - id: l\n    title: L\n    nodes: [{ id: n }]\n');
    const r = await loadLibrary([repo]);
    expect(r.roots.get('t.tower.yaml')).toBe(repo);
    expect(errors(r).some((m) => m.includes('outside the project'))).toBe(true);
  });

  it('allows a root and nested towers anywhere inside the repository', async () => {
    const { repo } = project();
    writeFileSync(join(repo, 'towers', 'sub.tower.yaml'), 'name: Sub\nroot: ..\nprompts:\n  p: { file: inside.md }\nlayers:\n  - id: l\n    title: L\n    nodes: [{ id: n, prompt: p }]\n');
    writeFileSync(join(repo, 'towers', 'main.tower.yaml'), 'name: Main\nroot: ..\nlayers:\n  - id: l\n    title: L\n    nodes: [{ id: n, tower: towers/sub.tower.yaml }]\n');
    const r = await loadLibrary([join(repo, 'towers', 'main.tower.yaml')]);
    expect(errors(r)).toEqual([]);
    expect(JSON.stringify(r.workspace)).toContain('inside prompt');
  });

  it('does not follow a symlink that leaves the repository', async () => {
    const { base, repo } = project();
    symlinkSync(join(base, 'secret.txt'), join(repo, 'link.md'));
    writeFileSync(join(repo, 't.tower.yaml'), 'name: T\nprompts:\n  p: { file: link.md }\nlayers:\n  - id: l\n    title: L\n    nodes: [{ id: n, prompt: p }]\n');
    const r = await loadLibrary([repo]);
    expect(JSON.stringify(r.workspace)).not.toContain('SECRET_SENTINEL');
  });

  it('without git, the opened folder is the project', async () => {
    const { base } = project();
    const dir = join(base, 'plain');
    mkdirSync(dir);
    writeFileSync(join(dir, 't.tower.yaml'), 'name: T\nprompts:\n  p: { file: ../secret.txt }\nlayers:\n  - id: l\n    title: L\n    nodes: [{ id: n, prompt: p }]\n');
    const r = await loadLibrary([dir]);
    expect(JSON.stringify(r.workspace)).not.toContain('SECRET_SENTINEL');
  });
});

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { readTowerFile } from '../src/server/files';
import { crossSite, isJson } from '../src/server/guard';

const req = (headers: Record<string, string>) => ({ headers: { host: '127.0.0.1:5317', ...headers } }) as unknown as IncomingMessage;

describe('server guards (security review of #62)', () => {
  it('reads the content type by its exact essence', () => {
    expect(isJson(req({ 'content-type': 'application/json; charset=utf-8' }))).toBe(true);
    expect(isJson(req({ 'content-type': 'text/plain;x=application/json' }))).toBe(false);
  });

  it('tells browser requests from other sites apart from local tools', () => {
    expect(crossSite(req({}))).toBe(false); // curl, hooks, OTLP exporters
    expect(crossSite(req({ origin: 'http://127.0.0.1:5317', 'sec-fetch-site': 'same-origin' }))).toBe(false);
    expect(crossSite(req({ origin: 'http://localhost:3000' }))).toBe(true);
    expect(crossSite(req({ 'sec-fetch-site': 'same-site' }))).toBe(true);
  });

  it('never serves secret files, even inside a tower root', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flow-tower-'));
    for (const f of ['.env', '.env.local', 'id_rsa', 'server.key', 'notes.md']) writeFileSync(join(dir, f), 'x');
    for (const f of ['.env', '.env.local', 'id_rsa', 'server.key', './.env', 'sub/../.env']) {
      expect((await readTowerFile(dir, f)).status, f).toBe(403);
    }
    expect((await readTowerFile(dir, 'notes.md')).status).toBe(200);
  });

  it('knows the usual credential files and folders (round 2)', async () => {
    const { isSecretPath } = await import('../src/server/files');
    for (const p of ['.envrc', '.git-credentials', '.dev.vars', '.aws/credentials', 'home/.ssh/config', '.kube/config', 'prod.tfvars', '.config/gcloud/x.json']) {
      expect(isSecretPath(p), p).toBe(true);
    }
    for (const p of ['.claude/agents/coder.md', '.mcp.json', 'src/config.ts', 'docs/keys.md']) expect(isSecretPath(p), p).toBe(false);
  });
});

describe('the loader never reads secrets or the user folder (#68 security review)', () => {
  it('reports a prompt file that is a key file or lives in the user folder, and does not read it', async () => {
    const { loadLibrary } = await import('../src/core/loader');
    const { env } = await import('node:process');
    const { mkdirSync } = await import('node:fs');
    const project = mkdtempSync(join(tmpdir(), 'flow-tower-project-'));
    mkdirSync(join(project, 'home'));
    writeFileSync(join(project, 'home', 'voice-journal.jsonl'), 'PERSONAL TRANSCRIPT');
    writeFileSync(join(project, 'api.key'), 'SECRET KEY');
    writeFileSync(join(project, 'ok.md'), 'A real prompt.');
    writeFileSync(join(project, 't.tower.yaml'), [
      'name: T',
      'prompts:',
      '  journal: { file: home/voice-journal.jsonl }',
      '  key: { file: api.key }',
      '  ok: { file: ok.md }',
      'layers:',
      '  - id: l',
      '    title: L',
      '    nodes:',
      '      - { id: a, label: A, prompt: journal }',
      '      - { id: b, label: B, prompt: key }',
      '      - { id: c, label: C, prompt: ok }',
    ].join('\n'));
    const saved = env.FLOW_TOWER_HOME;
    env.FLOW_TOWER_HOME = join(project, 'home');
    try {
      const { workspace } = await loadLibrary([project]);
      const json = JSON.stringify(workspace);
      expect(json).not.toContain('PERSONAL TRANSCRIPT');
      expect(json).not.toContain('SECRET KEY');
      expect(json).toContain('A real prompt.');
      const issues = Object.values(workspace.towers).flatMap((t) => t.issues.map((i) => i.message));
      expect(issues.filter((m) => m.includes('secret file or in the user folder'))).toHaveLength(2);
    } finally {
      if (saved === undefined) delete env.FLOW_TOWER_HOME; else env.FLOW_TOWER_HOME = saved;
    }
  });
});

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import { TowerSchema } from '../src/core/schema';
import { appendixFiles } from '../src/core/docFiles';
import { checkDocument, type DomFacts, type WorkspaceFacts } from '../src/core/doc-check';

const tower = (nodeFiles: string, agentFiles = '') => [
  'name: T',
  'agents:',
  '  bot:',
  '    name: Bot',
  ...(agentFiles ? [`    files: [${agentFiles}]`] : []),
  'layers:',
  '  - id: l',
  '    title: L',
  '    nodes:',
  `      - { id: a, agent: bot, files: [${nodeFiles}] }`,
  '',
].join('\n');

/** Loads a one-tower folder and returns the tower's warnings and the resolved node `a`. */
async function load(text: string, extra: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'flow-tower-opt-'));
  writeFileSync(join(dir, 't.tower.yaml'), text);
  for (const [name, body] of Object.entries(extra)) writeFileSync(join(dir, name), body);
  const { workspace } = await loadLibrary([dir]);
  const t = workspace.towers['t.tower.yaml'];
  const node = t.layers[0].nodes[0];
  const warnings = t.issues.filter((i) => i.level === 'warning').map((i) => i.message);
  return { workspace, node, warnings };
}

describe('files entries in the schema', () => {
  it('accept a plain path and an object with optional and description', () => {
    const parsed = TowerSchema.safeParse({
      name: 'T',
      layers: [{ id: 'l', title: 'L', nodes: [{ id: 'a', files: ['a.md', { path: 'b.log', optional: true, description: 'last run' }] }] }],
    });
    expect(parsed.success).toBe(true);
  });

  it('reject an object with an unknown key', () => {
    const parsed = TowerSchema.safeParse({
      name: 'T',
      layers: [{ id: 'l', title: 'L', nodes: [{ id: 'a', files: [{ path: 'b.log', optinal: true }] }] }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('optional files (#137)', () => {
  it('a missing optional file gives no warning and is listed as missing', async () => {
    const { node, warnings } = await load(tower('{ path: report.md, optional: true }'));
    expect(warnings).toEqual([]);
    expect(node.optionalFiles).toEqual(['report.md']);
    expect(node.missingOptional).toEqual(['report.md']);
  });

  it('a missing plain file still warns', async () => {
    const { warnings } = await load(tower('later.md'));
    expect(warnings).toEqual(['file not found: later.md']);
  });

  it('an optional file that exists is resolved as optional, not missing', async () => {
    const { node, warnings } = await load(tower('{ path: report.md, optional: true }'), { 'report.md': '# r' });
    expect(warnings).toEqual([]);
    expect(node.optionalFiles).toEqual(['report.md']);
    expect(node.missingOptional).toEqual([]);
  });

  it('a path listed twice is optional only when every listing is', async () => {
    const { node } = await load(tower('{ path: x.md, optional: true }, x.md'));
    expect(node.files).toEqual(['x.md']);
    expect(node.optionalFiles).toEqual([]);
  });

  it('an agent optional file resolves on the agent, and is inherited by its node', async () => {
    const text = [
      'name: T',
      'agents:',
      '  bot:',
      '    name: Bot',
      '    files: [{ path: agent-out.md, optional: true }]',
      'layers:',
      '  - id: l',
      '    title: L',
      '    nodes:',
      '      - { id: a, agent: bot }',
      '',
    ].join('\n');
    const { node, warnings } = await load(text);
    expect(warnings).toEqual([]);
    expect(node.agent?.optionalFiles).toEqual(['agent-out.md']);
    expect(node.optionalFiles).toEqual(['agent-out.md']);
  });
});

describe('the PDF appendix (#137)', () => {
  it('marks a missing optional file as not generated, and keeps it in the list', async () => {
    const { workspace } = await load(tower('{ path: report.md, optional: true }, plain.md'), { 'plain.md': 'x' });
    const files = appendixFiles(workspace, new Map([['t.tower.yaml', 0]]));
    expect(files.map((f) => f.path)).toContain('report.md');
    const report = files.find((f) => f.path === 'report.md');
    expect(report?.notGenerated).toBe(true);
    expect(files.find((f) => f.path === 'plain.md')?.notGenerated).toBeUndefined();
  });

  it('a not-generated file is printed with a reason, so the completeness check passes', () => {
    const dom: DomFacts = {
      buildingText: false, mainText: '', layerTitles: [], nodeLabels: [], hrefs: [], ids: [],
      control: { layers: 0, nodes: 0, subTowers: 0 }, chapters: [], charts: [],
      appendix: [{ key: 't :: report.md', printed: true }],
    };
    const ws: WorkspaceFacts = { towerId: 't', chapters: [], counts: { layers: 0, nodes: 0, subTowers: 0 }, files: ['t :: report.md'], towers: [] };
    const blank = checkDocument(dom, ws).find((r) => r.name === 'every appendix file has text or a reason');
    expect(blank?.ok).toBe(true);
  });
});

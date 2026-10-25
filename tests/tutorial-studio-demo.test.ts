import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  cleanHits,
  codeCard,
  escapeHtml,
  relativeTo,
  runShown,
} from '../examples/tutorial-studio/demos/helpers.ts';

const demoDir = 'examples/tutorial-studio/demos';

describe('tutorial demo helpers', () => {
  it('reports only the forbidden strings that occur in the text', () => {
    expect(cleanHits('at /home/al/x on box1', ['/home/al', 'box1', 'zz'])).toEqual(['/home/al', 'box1']);
  });

  it('escapes the five HTML special characters', () => {
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('renders a card with the escaped title and the lines in a pre block', () => {
    const html = codeCard('t<', ['a & b']);
    expect(html).toContain('t&lt;');
    expect(html).toContain('<pre style=');
    expect(html).toContain('a &amp; b');
  });

  it('strips the working folder from command output', () => {
    expect(relativeTo('copied x -> /tmp/d/my/tower', '/tmp/d')).toBe('copied x -> my/tower');
  });

  it('throws when a shown line holds a forbidden string', () => {
    const script = 'console.log("ok\\nsecret-box\\nfine")';
    expect(() => runShown('node', ['-e', script], process.cwd(), () => true, ['secret-box'])).toThrow(
      'clean screen',
    );
  });

  it('wraps the code card lines inside the card', () => {
    expect(codeCard('t', ['x'])).toContain('white-space:pre-wrap');
  });

  it('returns the kept lines when none holds a forbidden string', () => {
    const script = 'console.log("ok\\nsecret-box\\nfine")';
    const lines = runShown('node', ['-e', script], process.cwd(), (line) => line !== 'secret-box', ['secret-box']);
    expect(lines).toEqual(['ok', 'fine']);
  });
});

describe('flow-tower demo scenes', () => {
  it('marks every manifest scene once, in manifest order', () => {
    const scenes = JSON.parse(readFileSync(`${demoDir}/flow-tower.scenes.json`, 'utf8')) as { scene: string }[];
    const source = readFileSync(`${demoDir}/flow-tower.demo.ts`, 'utf8');
    const marks = [...source.matchAll(/narration\.mark\('([^']+)'\)/g)].map((m) => m[1]);
    expect(marks).toEqual(scenes.map((s) => s.scene));
    expect(new Set(marks).size).toBe(marks.length);
  });

  it('never waits for the short project id, which the stack does not hold', () => {
    const source = readFileSync(`${demoDir}/flow-tower.demo.ts`, 'utf8');
    expect(source).not.toContain("stack[0] === 'dev-squad'");
  });
});

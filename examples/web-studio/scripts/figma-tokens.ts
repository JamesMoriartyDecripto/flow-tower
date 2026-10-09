// Maps design/tokens.json (exported from Figma variables) to a Tailwind v4 @theme block.
// Run after every design-system change; the frontend lane never hand-edits theme.css.
import { readFileSync, writeFileSync } from 'node:fs';

type Token = { $type?: string; $value?: unknown };
type Tree = { [key: string]: Tree | Token };

const tokens = JSON.parse(readFileSync('design/tokens.json', 'utf8')) as Tree;

const resolve = (value: unknown): string => {
  const ref = typeof value === 'string' && value.match(/^\{(.+)\}$/);
  if (!ref) return Array.isArray(value) ? value.join(', ') : String(value);
  const target = ref[1].split('.').reduce<Tree | Token>((node, key) => (node as Tree)[key], tokens) as Token;
  return resolve(target.$value);
};

// Tailwind v4 theme namespaces: --color-*, --font-*, --text-*, --spacing-*, --radius-*.
const RENAME: [RegExp, string][] = [[/^font-family-/, 'font-'], [/^font-size-/, 'text-'], [/^space-/, 'spacing-']];
const lines: string[] = [];

function walk(node: Tree | Token, path: string[]) {
  if ('$value' in node) {
    const name = RENAME.reduce((n, [from, to]) => n.replace(from, to), path.join('-'));
    lines.push(`  --${name}: ${resolve(node.$value)};`);
    return;
  }
  for (const [key, child] of Object.entries(node)) if (!key.startsWith('$')) walk(child as Tree, [...path, key]);
}

walk(tokens, []);
writeFileSync('packages/ui/src/theme.css', `@theme {\n${lines.join('\n')}\n}\n`);
console.log(`wrote ${lines.length} tokens`);

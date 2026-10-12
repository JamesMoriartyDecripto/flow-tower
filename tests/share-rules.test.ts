import { describe, expect, it } from 'vitest';
import {
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  allowedFile,
  checkFiles,
  checkPath,
  shareName,
} from '../src/server/share-rules';

const TOWER = { path: 'demo.tower.yaml', content: 'name: demo\n' };

/** Shared folder rules (#164): the hub and the satellite judge uploads by the same checks. */
describe('share rules', () => {
  it('accepts well-formed share names only', () => {
    expect(shareName('alice-2')).toBe('alice-2');
    expect(shareName('Alice')).toBeUndefined();
    expect(shareName('-x')).toBeUndefined();
    expect(shareName('a'.repeat(65))).toBeUndefined();
  });

  it('refuses unsafe paths', () => {
    expect(checkPath('../x.md')).toBeDefined();
    expect(checkPath('a/../x.md')).toBeDefined();
    expect(checkPath('/abs/x.md')).toBeDefined();
    expect(checkPath('a\\b.md')).toBeDefined();
    expect(checkPath('C:/x.md')).toBeDefined();
    expect(checkPath('.hidden/x.md')).toBeDefined();
    expect(checkPath(`${'a'.repeat(201)}.md`)).toBeDefined();
    expect(checkPath(`${'d/'.repeat(8)}x.md`)).toBeDefined();
  });

  it('refuses secret-looking names and disallowed types', () => {
    expect(checkPath('.env')).toBeDefined();
    expect(checkPath('.env.local')).toBeDefined();
    expect(checkPath('id_rsa')).toBeDefined();
    expect(checkPath('id_ed25519.pub')).toBeDefined();
    expect(checkPath('x.pem')).toBeDefined();
    expect(checkPath('tokens.json')).toBeDefined();
    expect(checkPath('.npmrc')).toBeDefined();
    expect(checkPath('credentials.txt')).toBeDefined();
    expect(checkPath('photo.png')).toBeDefined();
  });

  it('allows tower files and text files', () => {
    expect(allowedFile('demo.tower.yml')).toBe(true);
    expect(allowedFile('notes/readme.md')).toBe(true);
    expect(checkPath('notes/deep/readme.md')).toBeUndefined();
  });

  it('enforces the file count limit', () => {
    const many = Array.from({ length: MAX_FILES + 1 }, (_, i) => ({ path: `f${i}.md`, content: '' }));
    expect('error' in checkFiles([TOWER, ...many])).toBe(true);
    expect('files' in checkFiles([TOWER])).toBe(true);
    expect('error' in checkFiles([])).toBe(true);
  });

  it('enforces the per-file byte limit', () => {
    const big = { path: 'big.md', content: 'x'.repeat(MAX_FILE_BYTES + 1) };
    expect('error' in checkFiles([TOWER, big])).toBe(true);
  });

  it('enforces the total byte limit', () => {
    const chunk = 'x'.repeat(MAX_FILE_BYTES);
    const files = Array.from({ length: 17 }, (_, i) => ({ path: `c${i}.md`, content: chunk }));
    expect(files.length * MAX_FILE_BYTES).toBeGreaterThan(MAX_TOTAL_BYTES);
    expect('error' in checkFiles([TOWER, ...files])).toBe(true);
  });

  it('requires at least one tower file', () => {
    expect('error' in checkFiles([{ path: 'notes.md', content: 'hi' }])).toBe(true);
  });

  it('refuses duplicate paths', () => {
    expect('error' in checkFiles([TOWER, TOWER])).toBe(true);
  });

  it('refuses non-string content', () => {
    expect('error' in checkFiles([{ path: 'demo.tower.yaml', content: 42 }])).toBe(true);
  });

  it('accepts a fine nested folder', () => {
    const result = checkFiles([TOWER, { path: 'sub/dir/notes.md', content: 'ok' }]);
    expect(result).toEqual({ files: [TOWER, { path: 'sub/dir/notes.md', content: 'ok' }] });
  });
});

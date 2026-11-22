import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { doneSet } from '../examples/model-benchmark/scripts/squad-child.mjs';

const keyOf = (l: { model: string; run: number }) => `${l.model}#${l.run}`;

describe('squad-child doneSet', () => {
  it('keeps the complete lines before a torn last line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'squad-child-test-'));
    const file = join(dir, 'out.jsonl');
    writeFileSync(file, '{"model":"a","run":1}\n{"model":"b","run":1}\n{"model":"c",');
    expect([...doneSet(file, keyOf)].sort()).toEqual(['a#1', 'b#1']);
    rmSync(dir, { recursive: true, force: true });
  });

  it('is empty when the file does not exist', () => {
    expect(doneSet(join(tmpdir(), 'squad-child-no-such-file.jsonl'), keyOf).size).toBe(0);
  });
});

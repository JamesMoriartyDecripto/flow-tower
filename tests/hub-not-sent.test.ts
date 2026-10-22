import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { remoteReadRefusal } from '../src/server/files';

/**
 * Hub mode, files a satellite did not send (#289): a tower shared WITHOUT `--files` has only its YAML on the hub.
 * A referenced file missing there gets a 404 that says how to fix it; every other refusal stays a 403.
 * The library is a real temp folder, so realpath decides as in production.
 */
const base = mkdtempSync(join(tmpdir(), 'flow-tower-not-sent-'));
afterAll(() => rmSync(base, { recursive: true, force: true }));

mkdirSync(join(base, 'library'));
const library = realpathSync(join(base, 'library'));
const shared = join(library, 'towers', 'm', 's');
const privateRoot = join(library, 'private');
for (const dir of [join(shared, 'config'), privateRoot]) mkdirSync(dir, { recursive: true });
writeFileSync(join(shared, 'notes.md'), '# notes');
writeFileSync(join(shared, 'config', 'prod.json'), '{"password":"x"}');
writeFileSync(join(privateRoot, 'notes.md'), '# private');
const HINT = 'this file was not sent by the satellite: share the tower with --files';

describe('remoteReadRefusal (#289)', () => {
  it('lets a referenced file that is on disk through', async () => {
    const referenced = new Set([join(shared, 'notes.md')]);
    expect(await remoteReadRefusal(shared, 'notes.md', library, referenced, new Set())).toBeUndefined();
  });

  it('answers 404 with the hint for a referenced file the satellite did not send', async () => {
    const missing = new Set([join(shared, 'data.csv')]);
    expect(await remoteReadRefusal(shared, 'data.csv', library, new Set(), missing)).toEqual({ status: 404, error: HINT });
  });

  it('keeps 403 for an absent file the tower does not reference', async () => {
    expect(await remoteReadRefusal(shared, 'probe.csv', library, new Set(), new Set())).toEqual({
      status: 403,
      error: 'file not shared with viewers',
    });
  });

  it('keeps 403 for a file that exists but is not referenced', async () => {
    expect(await remoteReadRefusal(shared, 'config/prod.json', library, new Set(), new Set())).toEqual({
      status: 403,
      error: 'file not shared with viewers',
    });
  });

  it('keeps 403 for an absent file of a tower root that is not under towers/', async () => {
    const missing = new Set([join(privateRoot, 'missing.md')]);
    expect(await remoteReadRefusal(privateRoot, 'missing.md', library, new Set(), missing)).toEqual({
      status: 403,
      error: 'file not shared with viewers',
    });
  });

  it('keeps 403 for a path that climbs out of the root', async () => {
    expect(await remoteReadRefusal(shared, '../x', library, new Set(), new Set())).toEqual({
      status: 403,
      error: 'file not shared with viewers',
    });
  });

  it('keeps 403 with no library configured', async () => {
    const missing = new Set([join(shared, 'data.csv')]);
    expect(await remoteReadRefusal(shared, 'data.csv', undefined, new Set(), missing)).toEqual({
      status: 403,
      error: 'file not shared with viewers',
    });
  });
});

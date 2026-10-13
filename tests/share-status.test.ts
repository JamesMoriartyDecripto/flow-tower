import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FRESH_SHARE_MS, sharedLabel } from '../src/app/library';
import { projectSharedAt } from '../src/server/sources';
import { satClass, satText, satTitle, towerLine, unsentSuffix, unsentTowers, type SharingState } from '../src/app/sharing';

const NOW = Date.UTC(2025, 0, 1, 12, 0, 0);
const at = (secondsAgo: number) => NOW - secondsAgo * 1000;
const base: SharingState = { state: 'online', hub: 'https://hub.example.com', lastSentAt: at(12) };

describe('towerLine', () => {
  it('shows a synced tower as on the hub with its time, in the green tone', () => {
    const line = towerLine({ name: 'demo', syncedAt: at(90) }, NOW);
    expect(line.text).toBe('demo · on the hub · 2 min ago');
    expect(line.tone).toBe('on');
  });

  it('shows a tower that never synced as never', () => {
    expect(towerLine({ name: 'demo' }, NOW).text).toBe('demo · on the hub · never');
  });

  it('shows a failed tower as not sent with the error, in the red tone, and the full error in the title', () => {
    const error = 'hub refused the name: only a-z, 0-9 and -';
    const line = towerLine({ name: 'demo', syncedAt: at(5), error }, NOW);
    expect(line.text).toBe(`demo · not sent: ${error}`);
    expect(line.tone).toBe('err');
    expect(line.title).toBe(error);
  });
});

describe('unsent towers on the SAT chip', () => {
  const failing = { name: 'a', error: 'boom' };
  const withTowers = (...towers: { name: string; syncedAt?: number; error?: string }[]): SharingState => ({ ...base, towers });

  it('lists only the towers with an error, in order', () => {
    const s = withTowers({ name: 'ok', syncedAt: at(1) }, failing, { name: 'b', error: 'slow' });
    expect(unsentTowers(s)).toEqual([failing, { name: 'b', error: 'slow' }]);
  });

  it('adds nothing to the chip when every tower is on the hub', () => {
    expect(unsentSuffix(withTowers({ name: 'ok', syncedAt: at(1) }))).toBe('');
    expect(unsentSuffix(base)).toBe('');
  });

  it('counts one failed tower in the singular and several in the plural', () => {
    expect(unsentSuffix(withTowers(failing))).toBe(' · 1 tower not sent');
    expect(unsentSuffix(withTowers(failing, { name: 'b', error: 'x' }))).toBe(' · 2 towers not sent');
  });

  it('appends the count to the chip label and turns an online chip to warn', () => {
    const s = withTowers(failing);
    expect(satText(s, NOW)).toBe('SAT → hub.example.com · 12s ago · 1 tower not sent');
    expect(satClass(s)).toBe('warn');
    expect(satClass(base)).toBe('on');
  });

  it('keeps a worse state colour when a tower also failed', () => {
    expect(satClass({ ...withTowers(failing), state: 'revoked' })).toBe('err');
  });

  it('names the towers and the first error in the chip title', () => {
    const title = satTitle(withTowers(failing, { name: 'b', error: 'other' }));
    expect(title).toContain('Not sent: a, b.');
    expect(title).toContain('First error: boom');
  });
});

describe('sharedLabel (hub library card)', () => {
  it('is undefined for a local project, which has no shared folder time', () => {
    expect(sharedLabel(undefined, 'box-1', NOW)).toBeUndefined();
  });

  it('reads updated <time ago> and names the machine in the title', () => {
    const label = sharedLabel(at(3600), 'box-1', NOW);
    expect(label?.text).toBe('updated 1 h ago');
    expect(label?.title).toBe('box-1 shared a new version 1 h ago');
  });

  it('shows the dot only for a version from the last 10 minutes', () => {
    expect(FRESH_SHARE_MS).toBe(10 * 60_000);
    expect(sharedLabel(at(599), 'box-1', NOW)?.dot).toBe(true);
    expect(sharedLabel(at(601), 'box-1', NOW)?.dot).toBe(false);
  });
});

describe('projectSharedAt (hub side)', () => {
  const TOWER = 'name: demo\nlayers: []\n';

  it('takes the share folder mtime for a shared project and skips a local one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'flow-tower-shared-at-'));
    const share = join(dir, 'towers', 'box-1', 'demo');
    mkdirSync(share, { recursive: true });
    writeFileSync(join(share, 'demo.tower.yaml'), TOWER);
    writeFileSync(join(dir, 'root.tower.yaml'), TOWER);
    const when = new Date(Date.UTC(2024, 5, 1, 8, 0, 0));
    utimesSync(share, when, when);

    const shared = { id: 'towers/box-1/demo/demo.tower.yaml', file: join(share, 'demo.tower.yaml') };
    const local = { id: 'root.tower.yaml', file: join(dir, 'root.tower.yaml') };
    expect(projectSharedAt([shared, local], dir)).toEqual({ [shared.id]: when.getTime() });
  });

  it('is undefined when no project sits under a machine folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'flow-tower-shared-at-'));
    writeFileSync(join(dir, 'root.tower.yaml'), TOWER);
    expect(projectSharedAt([{ id: 'root.tower.yaml', file: join(dir, 'root.tower.yaml') }], dir)).toBeUndefined();
    expect(projectSharedAt([{ id: 'x', file: join(dir, 'towers', 'box-1', 'x.tower.yaml') }], undefined)).toBeUndefined();
  });
});

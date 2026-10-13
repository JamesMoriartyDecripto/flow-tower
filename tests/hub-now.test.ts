import { describe, expect, it } from 'vitest';
import { nowRows, workingCount, type ResolveTarget } from '../src/app/hub';
import type { FlowEvent } from '../src/core/events';

const NOW = 1_000_000_000_000;

/** A minimal live event: the fields the model reads, with the rest of FlowEvent filled in. */
function ev(over: Partial<FlowEvent> & { ts: number }): FlowEvent {
  return { id: 0, kind: 'log', source: 'claude-code', targets: [], ...over } as FlowEvent;
}

/** Labels that look like a library: tower names and node labels, no workspace needed. */
const resolve: ResolveTarget = (target) => {
  const [tower, node] = target.split('#');
  const names: Record<string, string> = { 'towers/app.tower.yaml': 'My Agent' };
  return { tower: names[tower] ?? tower, node: node?.endsWith('coder') ? 'Coder' : node };
};

describe('nowRows: grouping by session', () => {
  it('collapses events of one machine and session onto one row', () => {
    const rows = nowRows([
      ev({ ts: NOW - 1000, host: 'alice-laptop', user: 'alice', session: 's1' }),
      ev({ ts: NOW - 2000, host: 'alice-laptop', user: 'alice', session: 's1' }),
      ev({ ts: NOW - 3000, host: 'alice-laptop', user: 'alice', session: 's2' }),
    ], NOW);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.count).sort()).toEqual([1, 2]);
  });

  it('falls back to runtime and project when an event has no session', () => {
    const rows = nowRows([
      ev({ ts: NOW - 1000, host: 'box', runtime: 'claude-code', project: 'a' }),
      ev({ ts: NOW - 2000, host: 'box', runtime: 'claude-code', project: 'a' }),
      ev({ ts: NOW - 3000, host: 'box', runtime: 'codex', project: 'a' }),
    ], NOW);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.runtime === 'claude-code')?.count).toBe(2);
  });
});

describe('nowRows: tower, node and fallbacks', () => {
  it('takes the tower and node from the latest event that has a target', () => {
    const rows = nowRows([
      ev({ ts: NOW - 5000, session: 's', targets: ['towers/app.tower.yaml#agents.coder'] }),
      ev({ ts: NOW - 1000, session: 's', targets: [] }),
    ], NOW, resolve);
    expect(rows[0].tower).toBe('My Agent');
    expect(rows[0].node).toBe('Coder');
    expect(rows[0].target).toBe('towers/app.tower.yaml#agents.coder');
  });

  it('falls back to the project when no event of the group has a target', () => {
    const [row] = nowRows([ev({ ts: NOW - 1000, session: 's', project: 'flow' })], NOW, resolve);
    expect(row.tower).toBe('flow');
    expect(row.node).toBeUndefined();
    expect(row.target).toBeUndefined();
  });

  it('shows a dash when there is neither a target nor a project', () => {
    const [row] = nowRows([ev({ ts: NOW - 1000, session: 's' })], NOW, resolve);
    expect(row.tower).toBe('–');
  });
});

describe('nowRows: last error', () => {
  it('keeps the latest error of the group with its node and time', () => {
    const [row] = nowRows([
      ev({ ts: NOW - 9000, session: 's', kind: 'error', tool: 'Read', targets: ['t#a'] }),
      ev({ ts: NOW - 4000, session: 's', status: 'error', tool: 'Bash', message: 'secret text', targets: ['t#coder'] }),
      ev({ ts: NOW - 1000, session: 's', kind: 'log' }),
    ], NOW, resolve);
    // Only the node label and the tool: the message text never reaches the row.
    expect(row.lastError).toEqual({ node: 'Coder', tool: 'Bash', ts: NOW - 4000 });
    expect(JSON.stringify(row)).not.toContain('secret text');
  });

  it('is absent when the group has no error', () => {
    const [row] = nowRows([ev({ ts: NOW - 1000, session: 's' })], NOW);
    expect(row.lastError).toBeUndefined();
  });
});

describe('nowRows: sort order', () => {
  it('puts run first, then idle, then silent, newest first inside each', () => {
    const rows = nowRows([
      ev({ ts: NOW - 60 * 60_000, session: 'silent-old' }),
      ev({ ts: NOW - 10 * 60_000, session: 'idle' }),
      ev({ ts: NOW - 60_000, session: 'run-old' }),
      ev({ ts: NOW - 5000, session: 'run-new' }),
      ev({ ts: NOW - 2 * 60 * 60_000, session: 'silent-older' }),
    ], NOW);
    // Rows no longer carry the session (free text), so the order is checked by each row's latest timestamp.
    expect(rows.map((r) => r.last)).toEqual([NOW - 5000, NOW - 60_000, NOW - 10 * 60_000, NOW - 60 * 60_000, NOW - 2 * 60 * 60_000]);
    expect(rows.map((r) => r.state)).toEqual(['run', 'run', 'idle', 'silent', 'silent']);
  });
});

describe('workingCount', () => {
  it('counts only the rows that are running', () => {
    const rows = nowRows([
      ev({ ts: NOW - 5000, session: 'a' }),
      ev({ ts: NOW - 6000, session: 'b' }),
      ev({ ts: NOW - 10 * 60_000, session: 'c' }),
    ], NOW);
    expect(workingCount(rows)).toBe(2);
  });

  it('is zero for no rows', () => {
    expect(workingCount([])).toBe(0);
  });
});

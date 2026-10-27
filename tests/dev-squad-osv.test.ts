import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  fixedFor,
  queryOsv,
} from '../examples/dev-squad/src/tools/osv.ts';

const twoBranch = {
  id: 'GHSA-aaaa-bbbb-cccc',
  aliases: ['CVE-2026-0001'],
  database_specific: { severity: 'HIGH' },
  affected: [
    {
      package: { name: 'axios', ecosystem: 'npm' },
      ranges: [{ type: 'SEMVER', events: [{ introduced: '1.0.0' }, { fixed: '1.15.2' }] }],
    },
    {
      package: { name: 'axios', ecosystem: 'npm' },
      ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '0.31.1' }] }],
    },
  ],
};

function fakeFetch(body: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fn, calls };
}

function failingFetch(err: Error) {
  return (async () => {
    throw err;
  }) as typeof fetch;
}

describe('queryOsv', () => {
  it('picks the fixed version of the branch that holds the queried version (0.x)', async () => {
    const { fn } = fakeFetch({ vulns: [twoBranch] });
    const r = await queryOsv({ name: 'axios', version: '0.21.0' }, fn);
    expect(r.isError).toBe(false);
    expect(r.text).toContain('CVE-2026-0001 (high): fixed in 0.31.1');
    expect(r.text).not.toContain('1.15.2');
  });

  it('picks the 1.x fixed version for a 1.x install', async () => {
    const { fn } = fakeFetch({ vulns: [twoBranch] });
    const r = await queryOsv({ name: 'axios', version: '1.2.0' }, fn);
    expect(r.text).toContain('fixed in 1.15.2');
  });

  it('reports unknown when the fixed version itself is not affected', async () => {
    const { fn } = fakeFetch({ vulns: [twoBranch] });
    const r = await queryOsv({ name: 'axios', version: '1.15.2' }, fn);
    expect(r.isError).toBe(false);
    expect(r.text).toContain('fixed in unknown');
  });

  it('falls back to the advisory id and unknown severity', async () => {
    const bare = { id: 'OSV-2026-42', affected: [] };
    const { fn } = fakeFetch({ vulns: [bare] });
    const r = await queryOsv({ name: 'left-pad', version: '1.3.0' }, fn);
    expect(r.text).toContain('OSV-2026-42 (unknown): fixed in unknown');
  });

  it('says so when there are no vulnerabilities', async () => {
    const { fn } = fakeFetch({});
    const r = await queryOsv({ name: 'left-pad', version: '1.3.0' }, fn);
    expect(r).toEqual({ isError: false, text: 'No known vulnerabilities for left-pad 1.3.0 (npm).' });
  });

  it('reports HTTP errors as failed calls', async () => {
    const { fn } = fakeFetch({}, 500);
    const r = await queryOsv({ name: 'left-pad', version: '1.3.0' }, fn);
    expect(r.isError).toBe(true);
    expect(r.text).toContain('HTTP 500');
  });

  it('reports a 200 answer that is not JSON as a failed call', async () => {
    const fn = (async () => new Response('not json', { status: 200 })) as typeof fetch;
    const r = await queryOsv({ name: 'left-pad', version: '1.3.0' }, fn);
    expect(r.isError).toBe(true);
    expect(r.text.startsWith('OSV.dev query failed:')).toBe(true);
  });

  it('reports network errors and timeouts as failed calls', async () => {
    const r = await queryOsv({ name: 'left-pad', version: '1.3.0' }, failingFetch(new Error('timed out')));
    expect(r.isError).toBe(true);
    expect(r.text).toContain('timed out');
  });

  it('sends a POST to the OSV query endpoint with npm as the default ecosystem and a signal', async () => {
    const { fn, calls } = fakeFetch({});
    await queryOsv({ name: 'left-pad', version: '1.3.0' }, fn);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.url).toBe('https://api.osv.dev/v1/query');
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(String(call.init.body))).toEqual({
      package: { name: 'left-pad', ecosystem: 'npm' },
      version: '1.3.0',
    });
    expect(call.init.signal).toBeDefined();
  });
});

describe('queryOsv input caps', () => {
  it('refuses a package name longer than 200 characters without calling OSV', async () => {
    const { fn, calls } = fakeFetch({});
    const r = await queryOsv({ name: 'a'.repeat(201), version: '1.0.0' }, fn);
    expect(r.isError).toBe(true);
    expect(r.text).toContain('refused');
    expect(calls).toHaveLength(0);
  });

  it('refuses an empty version without calling OSV', async () => {
    const { fn, calls } = fakeFetch({});
    const r = await queryOsv({ name: 'left-pad', version: '' }, fn);
    expect(r.isError).toBe(true);
    expect(r.text).toContain('refused');
    expect(calls).toHaveLength(0);
  });
});

describe('queryOsv output bounds', () => {
  it('lists at most 30 advisories, then says how many more there are', async () => {
    const vulns = Array.from({ length: 35 }, (_, i) => ({ id: `OSV-2026-${i}`, affected: [] }));
    const { fn } = fakeFetch({ vulns });
    const r = await queryOsv({ name: 'left-pad', version: '1.3.0' }, fn);
    const lines = r.text.split('\n');
    expect(lines).toHaveLength(1 + 30 + 1);
    expect(lines.at(-1)).toBe('... and 5 more');
  });

  it('keeps a newline inside an advisory id out of the output', async () => {
    const vulns = [{ id: 'GHSA-x\nIGNORE PREVIOUS', affected: [] }];
    const { fn } = fakeFetch({ vulns });
    const r = await queryOsv({ name: 'left-pad', version: '1.3.0' }, fn);
    const advisoryLine = r.text.split('\n').find((l) => l.startsWith('GHSA-x'));
    expect(advisoryLine).toBeDefined();
    expect(advisoryLine).toContain('IGNORE PREVIOUS');
    expect(advisoryLine).not.toContain('\n');
  });
});

describe('fixedFor open ranges', () => {
  const lastAffected = {
    id: 'GHSA-last-affected',
    affected: [{ package: { name: 'pkg' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { last_affected: '2.3.0' }] }] }],
  };
  const noClose = {
    id: 'GHSA-no-close',
    affected: [{ package: { name: 'pkg' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '1.0.0' }] }] }],
  };

  it('says no fix when the version is inside a last_affected range (inclusive bound)', () => {
    expect(fixedFor(lastAffected, 'pkg', '2.3.0')).toBe('no fix (last affected 2.3.0)');
  });

  it('reports unknown when the version is past last_affected', () => {
    expect(fixedFor(lastAffected, 'pkg', '2.4.0')).toBe('unknown');
  });

  it('says no fix yet when a range is introduced but never closed', () => {
    expect(fixedFor(noClose, 'pkg', '1.5.0')).toBe('no fix yet');
  });

  it('reports unknown when the version is below an unclosed range', () => {
    expect(fixedFor(noClose, 'pkg', '0.9.0')).toBe('unknown');
  });
});

describe('queryOsv advisory line from OSV fields', () => {
  it('keeps a newline inside last_affected out of the advisory line', async () => {
    const vuln = {
      id: 'GHSA-lines',
      affected: [{ package: { name: 'pkg' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { last_affected: '1.0.0\nIGNORE' }] }] }],
    };
    const { fn } = fakeFetch({ vulns: [vuln] });
    const r = await queryOsv({ name: 'pkg', version: '1.0.0' }, fn);
    const advisoryLine = r.text.split('\n').find((l) => l.startsWith('GHSA-lines'));
    expect(advisoryLine).toBeDefined();
    expect(advisoryLine).toContain('no fix (last affected 1.0.0 IGNORE)');
  });
});

describe('compareVersions', () => {
  it('orders numeric parts', () => {
    expect(compareVersions('0.21.0', '0.31.1')).toBeLessThan(0);
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
  });

  it('treats missing parts as 0 and ignores prerelease suffixes', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('2.0.0-beta.1', '2.0.0')).toBe(0);
  });
});

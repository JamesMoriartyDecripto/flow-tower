import { describe, expect, it } from 'vitest';
import {
  compareVersions,
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

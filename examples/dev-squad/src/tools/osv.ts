// OSV.dev query helpers, kept free of the Claude Agent SDK so tests can import
// them. The SDK tool wrapper in osv-scan.ts only adapts this module's output.

export interface OsvEvent {
  introduced?: string;
  fixed?: string;
}

export interface OsvVuln {
  id: string;
  aliases?: string[];
  database_specific?: { severity?: string };
  affected?: Array<{
    package?: { name?: string; ecosystem?: string };
    ranges?: Array<{ type?: string; events: OsvEvent[] }>;
  }>;
}

interface OsvQueryResponse {
  vulns?: OsvVuln[];
}

/**
 * Compare dot-separated numeric versions. Missing parts count as 0, so
 * `1.2` equals `1.2.0`. Prerelease and build suffixes are ignored on purpose:
 * the advisory ranges we compare against are plain release numbers, and a
 * full semver ordering would add complexity without changing any answer here.
 */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .split(/[-+]/)[0]
      .split('.')
      .map((p) => Number.parseInt(p, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Return the fixed version of the range that actually holds `version`.
 * The first range of the first entry is not enough: one advisory often lists
 * one range per major branch (1.x fixed in 1.15.2, 0.x fixed in 0.31.1), and
 * only the branch containing the installed version gives a useful answer.
 */
export function fixedFor(vuln: OsvVuln, name: string, version: string): string {
  for (const affected of vuln.affected ?? []) {
    if (affected.package?.name !== name) continue;
    for (const range of affected.ranges ?? []) {
      let introduced: string | undefined;
      for (const event of range.events) {
        if (event.introduced !== undefined) {
          introduced = event.introduced;
        } else if (event.fixed !== undefined && introduced !== undefined) {
          if (compareVersions(version, introduced) >= 0 && compareVersions(version, event.fixed) < 0) {
            return event.fixed;
          }
        }
      }
    }
  }
  return 'unknown';
}

/** Severity as a plain word (LOW, MODERATE, HIGH, CRITICAL), not a CVSS vector. */
export function severityOf(vuln: OsvVuln): string {
  const sev = vuln.database_specific?.severity;
  return sev ? sev.toLowerCase() : 'unknown';
}

/**
 * Query OSV.dev for known vulnerabilities in name@version.
 * Failures are reported with isError true; a found advisory is a valid answer,
 * so it is returned with isError false. The timeout keeps a stalled OSV.dev
 * from hanging the agent turn.
 */
export async function queryOsv(
  q: { name: string; version: string; ecosystem?: string },
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<{ text: string; isError: boolean }> {
  const ecosystem = q.ecosystem ?? 'npm';
  const label = `${q.name} ${q.version} (${ecosystem})`;
  let res: Response;
  try {
    res = await fetchImpl('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: { name: q.name, ecosystem }, version: q.version }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, text: `OSV.dev query failed: ${message}` };
  }
  if (!res.ok) {
    return { isError: true, text: `OSV.dev query failed: HTTP ${res.status}` };
  }
  const data = (await res.json()) as OsvQueryResponse;
  const vulns = data.vulns ?? [];
  if (!vulns.length) {
    return { isError: false, text: `No known vulnerabilities for ${label}.` };
  }
  const lines = vulns.map((v) => {
    const id = v.aliases?.find((a) => a.startsWith('CVE-')) ?? v.id;
    return `${id} (${severityOf(v)}): fixed in ${fixedFor(v, q.name, q.version)}`;
  });
  const noun = vulns.length === 1 ? 'advisory' : 'advisories';
  return {
    isError: false,
    text: `Found ${vulns.length} ${noun} for ${label}:\n${lines.join('\n')}`,
  };
}

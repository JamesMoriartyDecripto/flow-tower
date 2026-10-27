// OSV.dev query helpers, kept free of the Claude Agent SDK so tests can import
// them. The SDK tool wrapper in osv-scan.ts only adapts this module's output.

export interface OsvEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
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

const MAX_ADVISORY_LINES = 30;
// Generous for a real OSV answer; caps memory use if a proxy or misbehaving server sends a huge body.
const MAX_RESPONSE_CHARS = 1_000_000;

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
      // True from an `introduced` event until a closing event. A range that ends
      // still open has no fix yet, which is a different answer from "not affected".
      let open = false;
      for (const event of range.events) {
        if (event.introduced !== undefined) {
          introduced = event.introduced;
          open = true;
        } else if (event.fixed !== undefined && introduced !== undefined) {
          if (compareVersions(version, introduced) >= 0 && compareVersions(version, event.fixed) < 0) {
            return event.fixed;
          }
          open = false;
        } else if (event.last_affected !== undefined && introduced !== undefined) {
          // last_affected is inclusive: that version is still affected and no fix exists.
          if (compareVersions(version, introduced) >= 0 && compareVersions(version, event.last_affected) <= 0) {
            return `no fix (last affected ${event.last_affected})`;
          }
          open = false;
        }
      }
      if (open && introduced !== undefined && compareVersions(version, introduced) >= 0) {
        return 'no fix yet';
      }
    }
  }
  return 'unknown';
}

// Newlines and control characters could fake extra lines in the auditor's context, so every
// string that reaches the output (advisory fields and the echoed package label) goes through this.
const clean = (s: string) => s.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 80);

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
  // The caps bound the outbound POST: the model picks these values, so an unbounded
  // name or version could send an arbitrarily large body to a third-party API.
  if (!q.name || q.name.length > 200 || !q.version || q.version.length > 50 || (q.ecosystem ?? '').length > 50) {
    return { isError: true, text: 'OSV.dev query refused: package name 1-200 chars, version 1-50, ecosystem up to 50' };
  }
  const ecosystem = q.ecosystem ?? 'npm';
  // The name and version are copied from the model's diff, so they are cleaned like advisory text.
  const label = `${clean(q.name)} ${clean(q.version)} (${clean(ecosystem)})`;
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
  // Read as text first so the size is bounded in characters, not just in time.
  // The advisory list is small in practice; anything this large is not a normal answer.
  let body: string;
  try {
    body = await res.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, text: `OSV.dev query failed: ${message}` };
  }
  if (body.length > MAX_RESPONSE_CHARS) {
    return { isError: true, text: 'OSV.dev query failed: response too large' };
  }
  // A 200 answer can still be unusable (proxy page, cut body). Parse inside the
  // failure path so it is reported like every other failed call, not thrown.
  let data: OsvQueryResponse;
  try {
    data = JSON.parse(body) as OsvQueryResponse;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, text: `OSV.dev query failed: ${message}` };
  }
  // A non-array vulns would make slice/map throw below, so it is refused here. Absent means none.
  const raw: unknown = (data as { vulns?: unknown } | null)?.vulns;
  if (raw !== undefined && !Array.isArray(raw)) {
    return { isError: true, text: 'OSV.dev query failed: unexpected response shape' };
  }
  const vulns = (raw ?? []) as OsvVuln[];
  if (!vulns.length) {
    return { isError: false, text: `No known vulnerabilities for ${label}.` };
  }
  // The advisory text is third-party input, so each field is flattened and cut, and the list is capped.
  const lines = vulns.slice(0, MAX_ADVISORY_LINES).map((v) => {
    const id = clean(v.aliases?.find((a) => a.startsWith('CVE-')) ?? v.id);
    return `${id} (${clean(severityOf(v))}): fixed in ${clean(fixedFor(v, q.name, q.version))}`;
  });
  const more = vulns.length - lines.length;
  if (more > 0) lines.push(`... and ${more} more`);
  const noun = vulns.length === 1 ? 'advisory' : 'advisories';
  return {
    isError: false,
    text: `Found ${vulns.length} ${noun} for ${label}:\n${lines.join('\n')}`,
  };
}

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

// Input shapes. The name and version are sent to a third-party host, so only package-like text may leave the machine.
const NAME_RE = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]{0,199}$/i;
const VERSION_RE = /^[0-9A-Za-z.+_-]{1,50}$/;
const ECOSYSTEMS = ['npm', 'PyPI', 'Go', 'Maven', 'crates.io', 'RubyGems', 'NuGet', 'Packagist'];

// Output shapes. Advisory text is free prose, so only these forms reach the auditor.
const CVE_RE = /^CVE-\d{4}-\d{4,}$/;
const ADVISORY_ID_RE = /^[A-Z]+-[\w-]{1,60}$/;
const SEVERITIES = ['low', 'moderate', 'medium', 'high', 'critical'];
const FIXED_RE = /^(?:[0-9A-Za-z.+_-]{1,50}|no fix yet|no fix \(last affected [0-9A-Za-z.+_-]{1,50}\)|unknown)$/;

// A field counts only when it is a string; any other type is treated as missing, so it cannot throw.
const str = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined);

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
 * Entries for the same name in another ecosystem are skipped: a PyPI fix says nothing about an npm package.
 */
export function fixedFor(vuln: OsvVuln, name: string, version: string, ecosystem = 'npm'): string {
  for (const affected of Array.isArray(vuln.affected) ? vuln.affected : []) {
    if (affected?.package?.name !== name) continue;
    const eco = str(affected.package?.ecosystem);
    if (eco !== undefined && eco.toLowerCase() !== ecosystem.toLowerCase()) continue;
    for (const range of Array.isArray(affected.ranges) ? affected.ranges : []) {
      let introduced: string | undefined;
      // True from an `introduced` event until a closing event. A range that ends
      // still open has no fix yet, which is a different answer from "not affected".
      let open = false;
      for (const event of Array.isArray(range?.events) ? range.events : []) {
        const intro = str(event?.introduced);
        const fixed = str(event?.fixed);
        const last = str(event?.last_affected);
        if (intro !== undefined) {
          introduced = intro;
          open = true;
        } else if (fixed !== undefined && introduced !== undefined) {
          if (compareVersions(version, introduced) >= 0 && compareVersions(version, fixed) < 0) {
            return fixed;
          }
          open = false;
        } else if (last !== undefined && introduced !== undefined) {
          // last_affected is inclusive: that version is still affected and no fix exists.
          if (compareVersions(version, introduced) >= 0 && compareVersions(version, last) <= 0) {
            return `no fix (last affected ${last})`;
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

/**
 * Advisory id for the output: the first CVE alias, else the OSV id when it has a known shape,
 * else unknown. Aliases are checked by shape too, so a prose alias never reaches the auditor.
 */
function idOf(v: OsvVuln): string {
  const cve = (Array.isArray(v.aliases) ? v.aliases : []).find((a) => typeof a === 'string' && CVE_RE.test(a));
  if (cve !== undefined) return cve;
  const id = str(v.id);
  return id !== undefined && ADVISORY_ID_RE.test(id) ? id : 'unknown';
}

/** Severity as a plain word (LOW, MODERATE, HIGH, CRITICAL), not a CVSS vector. */
export function severityOf(vuln: OsvVuln): string {
  const sev = str(vuln.database_specific?.severity)?.toLowerCase();
  return sev !== undefined && SEVERITIES.includes(sev) ? sev : 'unknown';
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
  // The shape checks bound the outbound POST: the model picks these values, so anything
  // outside package-like text could leave the machine or send an arbitrarily large body.
  const ecosystem = q.ecosystem ?? 'npm';
  if (!NAME_RE.test(q.name) || q.name.length > 200 || !VERSION_RE.test(q.version) || !ECOSYSTEMS.includes(ecosystem)) {
    return {
      isError: true,
      text: `OSV.dev query refused: package name 1-200 chars (optional @scope/), version 1-50 chars of [0-9A-Za-z.+_-], ecosystem one of ${ECOSYSTEMS.join(', ')}`,
    };
  }
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
  // A non-object entry is replaced by an empty one, so every field reads as missing instead of throwing.
  const vulns = ((raw ?? []) as unknown[]).map((v) => (v && typeof v === 'object' ? v : {}) as OsvVuln);
  if (!vulns.length) {
    return { isError: false, text: `No known vulnerabilities for ${label}.` };
  }
  // The advisory text is third-party input, so each field is checked against its shape, cut, and the list is capped.
  const lines = vulns.slice(0, MAX_ADVISORY_LINES).map((v) => {
    const fixed = fixedFor(v, q.name, q.version, ecosystem);
    return `${clean(idOf(v))} (${clean(severityOf(v))}): fixed in ${FIXED_RE.test(fixed) ? clean(fixed) : 'unknown'}`;
  });
  const more = vulns.length - lines.length;
  if (more > 0) lines.push(`... and ${more} more`);
  const noun = vulns.length === 1 ? 'advisory' : 'advisories';
  return {
    isError: false,
    text: `Found ${vulns.length} ${noun} for ${label}:\n${lines.join('\n')}`,
  };
}

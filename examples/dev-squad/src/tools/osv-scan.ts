import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

interface OsvVuln {
  id: string;
  severity?: Array<{ type: string; score: string }>;
  aliases?: string[];
  affected?: Array<{
    ranges?: Array<{ events: Array<{ fixed?: string }> }>;
  }>;
}

interface OsvQueryResponse {
  vulns?: OsvVuln[];
}

/**
 * Query OSV.dev for known vulnerabilities in a package@version.
 * Evidence-based SCA: the security auditor calls this instead of relying on
 * model knowledge cutoff. OSV.dev is an open database maintained by Google,
 * aggregating CVEs from npm, GitHub Advisories, and upstream sources.
 *
 * @see https://osv.dev/docs/ API documentation
 */
export const osvScan = tool(
  'osv_scan',
  'Query OSV.dev for known vulnerabilities in a specific package and version. ' +
    'Returns CVE aliases, severity score and fixed version. Use for every new or updated dependency.',
  {
    package_name: z.string().min(1).max(200).describe('Package name (e.g. lodash)'),
    version: z.string().min(1).max(50).describe('Installed version (e.g. 4.17.20)'),
    ecosystem: z.string().default('npm').optional().describe('Package ecosystem: npm, PyPI, Go, Maven, etc.'),
  },
  async ({ package_name, version, ecosystem }) => {
    const res = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: { name: package_name, ecosystem }, version }),
    });
    if (!res.ok) {
      return { content: [{ type: 'text', text: `OSV.dev query failed: HTTP ${res.status}` }], isError: true };
    }
    const data = (await res.json()) as OsvQueryResponse;
    const vulns = data.vulns ?? [];
    if (!vulns.length) {
      return { content: [{ type: 'text', text: `No known vulnerabilities for ${package_name}@${version} (${ecosystem}).` }] };
    }

    const lines = vulns.map((v) => {
      const sev = v.severity?.[0]?.score ?? 'unknown';
      const fixed = v.affected?.[0]?.ranges?.[0]?.events?.find((e) => e.fixed)?.fixed ?? 'unknown';
      const cve = v.aliases?.find((a) => a.startsWith('CVE-')) ?? v.id;
      return `${cve} (severity: ${sev}) — fixed in ${fixed}`;
    });

    return {
      content: [{ type: 'text', text: `Found ${vulns.length} advisory(s) for ${package_name}@${version}:\n${lines.join('\n')}` }],
      isError: true,
    };
  },
  { annotations: { readOnlyHint: true, idempotentHint: true } },
);

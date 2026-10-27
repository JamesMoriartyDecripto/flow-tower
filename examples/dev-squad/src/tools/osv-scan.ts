import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { queryOsv } from './osv';

/**
 * Evidence-based SCA for the SDK harness: the security auditor calls this instead of relying on
 * model knowledge cutoff. The query itself lives in osv.ts so the OpenRouter loop shares it.
 *
 * @see https://osv.dev/docs/ API documentation
 */
export const osvScan = tool(
  'osv_scan',
  'Query OSV.dev for known vulnerabilities in a specific package and version. ' +
    'Returns CVE aliases, severity and fixed version. Use for every new or updated dependency.',
  {
    package_name: z.string().min(1).max(200).describe('Package name (e.g. lodash)'),
    version: z.string().min(1).max(50).describe('Installed version (e.g. 4.17.20)'),
    ecosystem: z.string().default('npm').describe('Package ecosystem: npm, PyPI, Go, Maven, etc.'),
  },
  async ({ package_name, version, ecosystem }) => {
    const { text, isError } = await queryOsv({ name: package_name, version, ecosystem });
    return { content: [{ type: 'text', text }], isError };
  },
  { annotations: { readOnlyHint: true, idempotentHint: true } },
);

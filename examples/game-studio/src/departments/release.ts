import { agent, promptAgent } from '../agents';
import { LIMITS, loadConfig } from '../config';
import { lastJson, runAgent, totalCost } from '../run-agent';
import { awaitApproval } from '../tools/request-approval';
import type { StudioCtx } from '../pipeline';

interface Platforms { targets: { platform: string; config: string; store: string; depot?: number }[] }
interface PackageReport { platform: string; ok: boolean; artifact: string; size_mb: number; cook_warnings: number }

export interface ReleaseResult { buildId: string; shipped: boolean; notes: string; costUsd: number }

/**
 * Build & Release. CI (GitHub Actions, .github/workflows/package.yml) packages every
 * target in parallel via mcp__forge__package_build. Nothing is uploaded to a store until
 * a human gives the release go/no-go; the build-gate hook enforces that independently.
 */
export async function runRelease(ctx: StudioCtx, input: { version: string; qaSummary: string }): Promise<ReleaseResult> {
  const base = { cwd: ctx.cwd, runId: ctx.runId, department: 'release' };
  const { targets } = loadConfig<Platforms>('platforms');
  const buildId = `${input.version}+${ctx.runId}`;

  // 1. Package per platform in parallel (Win64 Shipping, Win64 Development for QA, etc.).
  const packages = await Promise.all(targets.map((t) => runAgent(agent('release-engineer'), [
    `Package ${buildId} for ${t.platform} (${t.config}) with mcp__forge__package_build. Do NOT upload.`,
    'Verify the pak signature and run the smoke test map. End with JSON {"platform","ok","artifact","size_mb","cook_warnings"}.',
  ].join('\n'), { ...base, ...LIMITS.specialist, servers: ['github'] })));
  const reports = packages.map((p) => lastJson<PackageReport>(p.text));
  const broken = reports.filter((r) => !r.ok);

  // 2. Release notes from merged PRs (Haiku) while the build is fresh.
  const notesAgent = promptAgent('release-notes', 'Player-facing patch notes', ['mcp__github__list_pull_requests'], {
    prs: `merged into slice/${ctx.runId}`, version: input.version,
  });
  const notes = await runAgent(notesAgent, 'Write player-facing notes (max 12 bullets) and a dev changelog.', { ...base, ...LIMITS.cheap, servers: ['github'] });

  const costUsd = totalCost([...packages, notes]);
  ctx.charge('release', costUsd);
  if (broken.length) {
    return { buildId, shipped: false, notes: `packaging failed: ${broken.map((b) => b.platform).join(', ')}`, costUsd };
  }

  // 3. Human release go/no-go. The only path to an upload.
  const decision = await awaitApproval('release_go_no_go', [
    `Build ${buildId}`,
    ...reports.map((r) => `${r.platform}: ${r.size_mb} MB, ${r.cook_warnings} cook warnings`),
    `QA:\n${input.qaSummary.slice(0, 2_000)}`,
    `Notes:\n${notes.text.slice(0, 1_500)}`,
  ].join('\n'));
  if (!decision.approved) return { buildId, shipped: false, notes: `no-go: ${decision.notes}`, costUsd };

  // 4. Upload to the store branch (beta), never straight to default.
  const upload = await runAgent(agent('release-engineer'),
    `Go/no-go approved. Upload ${buildId} to the Steam "beta" branch with mcp__forge__package_build {upload:true, branch:"beta"}.`,
    { ...base, ...LIMITS.specialist, maxTurns: 8 });
  ctx.charge('release', upload.costUsd);
  return { buildId, shipped: upload.ok, notes: decision.notes, costUsd: costUsd + upload.costUsd };
}

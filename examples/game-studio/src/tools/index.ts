import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { checkLicense } from './check-license';
import { generateWorld } from './generate-world';
import { packageBuild } from './package-build';
import { queryTelemetry } from './query-telemetry';
import { registerAsset } from './register-asset';
import { requestApproval } from './request-approval';
import { runPlaytest } from './run-playtest';
import { simulateEconomy } from './simulate-economy';
import { validateAsset } from './validate-asset';

/**
 * In-process MCP server with the studio's own tools. Exposed as mcp__forge__<name>
 * so each agent file grants exactly the ones it needs (least privilege):
 *
 *   producer / creative director  -> request_approval
 *   game designer, economy        -> simulate_economy
 *   concept artist, audio         -> check_license
 *   modeler, materials, rigger    -> validate_asset (register_asset runs in the pipeline)
 *   art director                  -> validate_asset (read-only report)
 *   world builder                 -> generate_world
 *   QA bots, perf profiler        -> run_playtest, query_telemetry
 *   release engineer              -> package_build (guarded by the build-gate hook)
 */
export const forgeServer = createSdkMcpServer({
  name: 'forge',
  version: '1.0.0',
  instructions:
    'Forge Studio production tools. Prefer these over raw Bash: they return compact, structured ' +
    'results and are covered by the asset-budget, license and build-gate hooks.',
  tools: [
    requestApproval,
    validateAsset,
    checkLicense,
    registerAsset,
    simulateEconomy,
    generateWorld,
    runPlaytest,
    queryTelemetry,
    packageBuild,
  ],
});

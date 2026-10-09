import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { env } from 'node:process';
import { promisify } from 'node:util';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { ROOT, loadConfig } from '../config';

const run = promisify(execFile);

interface Platforms {
  targets: Record<string, { platform: string; config: 'Development' | 'Shipping'; steam_branch?: string; cook_flags: string[] }>;
}

/**
 * Thin wrapper over Unreal's RunUAT BuildCookRun. Agents never call RunUAT directly
 * (the build-gate hook denies it): this tool fixes the arguments, writes logs to disk
 * and returns only the summary plus the first errors. Store channels (beta, release)
 * are additionally guarded by the build-gate hook (quality gates + human go/no-go).
 */
export const packageBuild = tool(
  'package_build',
  'Cook and package Emberwake for a target in config/platforms.yaml. channel "dev"/"playtest" for internal builds, ' +
    '"beta"/"release" upload to the Steam branch and require passing gates plus a human go.',
  {
    target: z.string().default('win64_steam'),
    channel: z.enum(['dev', 'playtest', 'beta', 'release']).default('dev'),
    build_id: z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/).describe('Semver, e.g. 0.3.0-slice.4'),
  },
  async ({ target, channel, build_id }) => {
    const t = loadConfig<Platforms>('platforms').targets[target];
    if (!t) return { content: [{ type: 'text', text: `Unknown target ${target}.` }], isError: true };

    const uat = join(env.UE_ROOT ?? 'C:/Program Files/Epic Games/UE_5.6', 'Engine/Build/BatchFiles/RunUAT.bat');
    const archive = join(env.FORGE_BUILDS_DIR ?? join(ROOT, 'Builds'), build_id);
    const config = channel === 'release' ? 'Shipping' : t.config;
    const args = [
      'BuildCookRun', `-project=${join(ROOT, 'Emberwake/Emberwake.uproject')}`, `-platform=${t.platform}`,
      `-clientconfig=${config}`, '-build', '-cook', '-stage', '-pak', '-iostore', '-compressed', '-prereqs',
      '-archive', `-archivedirectory=${archive}`, '-nop4', '-utf8output', ...t.cook_flags,
      `-AdditionalCookerOptions=-BuildVersion=${build_id}`,
    ];

    const started = Date.now();
    let log = '';
    try {
      log = (await run(uat, args, { timeout: 2 * 3600_000, maxBuffer: 256 * 1024 * 1024 })).stdout;
    } catch (err) {
      log = (err as { stdout?: string }).stdout ?? String(err);
      const errors = log.split('\n').filter((l) => /\b(Error|error C\d+|LogCook: Error)\b/.test(l)).slice(0, 10);
      return { content: [{ type: 'text', text: `BUILD FAILED ${build_id} (${target}/${config})\n${errors.join('\n')}` }], isError: true };
    }

    const warnings = log.split('\n').filter((l) => /Warning:/.test(l)).length;
    const lines = [`BUILD OK ${build_id} ${target}/${config} in ${Math.round((Date.now() - started) / 60000)}m, ${warnings} warnings`, `archive: ${archive}`];

    if ((channel === 'beta' || channel === 'release') && t.steam_branch) {
      const branch = channel === 'beta' ? `${t.steam_branch}-beta` : t.steam_branch;
      await run('steamcmd', ['+login', env.STEAM_BUILD_USER ?? 'forge-ci', '+run_app_build', join(ROOT, 'ci', `app_build_${branch}.vdf`), '+quit'], { timeout: 3600_000 });
      lines.push(`uploaded to Steam branch "${branch}" (not live until a human sets it default)`);
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
  { annotations: { destructiveHint: false, openWorldHint: true } },
);

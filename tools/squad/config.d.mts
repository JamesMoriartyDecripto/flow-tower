// Types for the runner's config loader (config.mjs), so the TypeScript doctor imports the same loader without any.
// Keep in step with config.mjs: the runtime file is the source of truth.
export interface SquadConfig {
  project: string;
  commands: Record<string, string>;
  write: string[];
  base: string;
  review: string[];
  rules: string[];
  extras: string[];
  models: Record<string, string>;
  tower: string;
  source: string;
  cli: string;
}

export const DEFAULTS: SquadConfig;
export function loadConfig(repo: string): SquadConfig;
export function modelFor(config: SquadConfig, role: string): string | undefined;

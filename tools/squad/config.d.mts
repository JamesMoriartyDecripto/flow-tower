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
  runner: { usdPerIssue: number; minutes: number; fixRounds: number; pollMinutes: number };
  style: { language: string; maxFileLines: number };
}

export const DEFAULTS: SquadConfig;
export const STYLE_RULES: string;
export function styleRules(config?: SquadConfig): string;
export function taskRules(config?: SquadConfig): string;
export function configPath(repo: string): string;
export function loadConfig(repo: string): SquadConfig;
export function commandArgv(command: string, file?: string): string[] | null;
export function modelFor(config: SquadConfig, role: string): string | undefined;
export function systemLine(config: SquadConfig, repo: string): string;

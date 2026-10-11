/**
 * One config file for the hub and the emit settings (#90): <home>/config.json holds both what the hub
 * needs (host, viewers, retention) and what a sender needs (url, token, user, machine), instead of a
 * pile of environment variables and the old <home>/hub.json. A checkout may carry a
 * flow-tower.local.json (git-ignored) for the machine it sits on; the user's own file always wins.
 *
 * Node only: the browser bundle never imports this. Every read is best-effort — an invalid or unreadable
 * file becomes a warning, because a server must still start with a hand-edited config.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { userHome } from '../core/secrets.ts';

/** The flow-tower package root: `<checkout>/flow-tower.local.json` sits next to package.json. */
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const ROLES = ['local', 'hub', 'satellite'] as const;
export const PROFILES = ['personal', 'freelancers', 'employees'] as const;
export const CADENCES = ['always-on', 'on-demand', 'scheduled'] as const;

/** Every key optional: a config file names only what it changes (defaults live in `effective`). */
export const ConfigSchema = z.strictObject({
  hub: z.boolean().optional().describe('Run as a shared hub.'),
  host: z.string().optional().describe('Address the server binds to.'),
  allowedHosts: z.array(z.string()).optional().describe('Proxy host names the server accepts.'),
  ingestOnly: z.boolean().optional().describe('Serve ingest routes only, no UI.'),
  viewers: z.array(z.string()).optional().describe('Tailnet users allowed to view the hub.'),
  profile: z.enum(PROFILES).optional(),
  members: z.array(z.string()).optional(),
  optedIn: z.array(z.string()).optional(),
  retentionDays: z.number().int().min(1).max(21).optional().describe('Raw history kept, 1..21.'),
  url: z.string().optional().describe('Where a sender posts its events.'),
  user: z.string().optional(),
  machine: z.string().optional(),
  token: z.string().optional(),
  role: z.enum(ROLES).optional(),
  cadence: z.record(z.string(), z.enum(CADENCES)).optional().describe('Per sender id: always-on, on-demand or scheduled.'),
  budgets: z.strictObject({
    global: z.number().optional(),
    projects: z.record(z.string(), z.number()).optional(),
  }).optional().describe('EUR per month.'),
  alerts: z.record(z.string(), z.boolean()).optional().describe('Per rule name.'),
  noticeRef: z.string().optional(),
  purpose: z.string().optional(),
});
export type Config = z.infer<typeof ConfigSchema>;
export type Role = (typeof ROLES)[number];
export type Profile = (typeof PROFILES)[number];
export type Cadence = (typeof CADENCES)[number];

export interface LoadedConfig {
  config: Config;
  /** The files that contributed, in the order they were applied (local first, then the user's own). */
  sources: string[];
  warnings: string[];
}

/** Today's retention default (src/server/history/store.ts): kept local so this module pulls in no store. */
const RETENTION = { minDays: 1, maxDays: 21, defaultDays: 14 } as const;

/** Comment bodies are dropped, not the line's newline: a `//` comment must not join two lines. */
function stripComments(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') { out += text[++i] ?? ''; continue; } // an escaped quote does not end the string
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++; // lands on the "/" (or past the end), the loop's i++ moves to the next char
      continue;
    }
    out += c;
  }
  return out;
}

/** Trailing commas are a JSONC courtesy, so they are only dropped outside a string: "a,]" may be a value. */
function dropTrailingCommas(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') { out += text[++i] ?? ''; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === '}' || text[j] === ']') continue; // nothing may follow it but the closing bracket
    }
    out += c;
  }
  return out;
}

/** JSONC: what a human edits. Comments and trailing commas are accepted, everything else is plain JSON. */
export const stripJsonc = (text: string) => dropTrailingCommas(stripComments(text));

/** What the old hub.json may carry: the keys that moved into config.json. Loose, its other keys are its own. */
const LegacySchema = z.object({
  viewers: z.array(z.string()).optional(),
  profile: z.enum(PROFILES).optional(),
  members: z.array(z.string()).optional(),
  optedIn: z.array(z.string()).optional(),
});
const LEGACY_KEYS = ['viewers', 'profile', 'members', 'optedIn'] as const;

/**
 * The effective configuration: <home>/config.json over <checkout>/flow-tower.local.json, both as JSONC.
 * `sources` lists the files that were used (a file that failed to parse contributed nothing), `warnings`
 * what a human must fix — an invalid file is never a crash.
 */
export function loadConfig({ home = userHome(), checkout = PKG_ROOT }: { home?: string; checkout?: string } = {}): LoadedConfig {
  const warnings: string[] = [];
  const sources: string[] = [];
  const read = (path: string, addSource = true): Config | undefined => {
    let raw: string;
    try { raw = readFileSync(path, 'utf8'); } catch { return undefined; } // a missing file is the normal case
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonc(raw));
    } catch (err) {
      if (addSource) sources.push(path);
      warnings.push(`${path}: invalid JSON (${(err as Error).message})`);
      return undefined;
    }
    const result = ConfigSchema.safeParse(parsed);
    if (!result.success) {
      if (addSource) sources.push(path);
      const issues = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      warnings.push(`${path}: ${issues}`);
      return undefined;
    }
    if (addSource) sources.push(path);
    return result.data;
  };

  const local = read(join(checkout, 'flow-tower.local.json'));
  const own = read(join(home, 'config.json'));
  const config: Config = { ...local, ...own }; // the user's own file wins key by key

  const hubFile = join(home, 'hub.json');
  // Migration (#90): viewers, profile, members and optedIn used to live in hub.json. Fill only the keys
  // config.json leaves out, read the file through its own schema (its extra keys are not ours to warn
  // about), leave the file alone and tell the user to move them.
  if (existsSync(hubFile) && LEGACY_KEYS.some((k) => config[k] === undefined)) {
    let legacy: Record<string, unknown> | undefined;
    try { legacy = JSON.parse(stripJsonc(readFileSync(hubFile, 'utf8'))) as Record<string, unknown>; } catch { /* hand-edited: nothing to migrate */ }
    if (legacy) {
      const result = LegacySchema.safeParse(legacy);
      if (result.success) {
        for (const key of LEGACY_KEYS) if (config[key] === undefined && result.data[key] !== undefined) Object.assign(config, { [key]: result.data[key] });
        warnings.push('hub.json is deprecated: move its keys into config.json');
      }
    }
  }

  // The user's own file may hold a token: anything but owner-only is readable by another account.
  const ownFile = join(home, 'config.json');
  try {
    if (statSync(ownFile).mode & 0o077) warnings.push(`${ownFile}: readable by group or others (mode should be 0600): it may hold a token`);
  } catch { /* not there: nothing to warn about */ }

  return { config, sources, warnings };
}

/** The options a CLI flag can set: only these beat the environment, because the flag is right here. */
export interface ConfigFlags {
  hub?: boolean;
  host?: string;
  allowedHosts?: string[];
  ingestOnly?: boolean;
  retentionDays?: number;
  url?: string;
  user?: string;
  machine?: string;
  token?: string;
}

/** Flags, the environment and the config resolved into one value: what the rest of the server reads. */
export interface EffectiveSettings {
  hub: boolean;
  host?: string;
  allowedHosts: string[];
  ingestOnly: boolean;
  viewers: string[];
  retentionDays: number;
  url?: string;
  user?: string;
  machine?: string;
  token?: string;
  role: Role;
  profile?: Profile;
  members: string[];
  optedIn: string[];
  cadence: Record<string, Cadence>;
  budgets: { global?: number; projects?: Record<string, number> };
  alerts: Record<string, boolean>;
  noticeRef?: string;
  purpose?: string;
}

const truthy = (v: string | undefined) => (v === undefined ? undefined : /^(1|true|yes)$/i.test(v));
const list = (v: string | undefined) => (v === undefined ? undefined : v.split(',').map((s) => s.trim()).filter(Boolean));
const number = (v: string | undefined) => {
  if (v === undefined) return undefined;
  const n = Number(v.trim());
  return v.trim() === '' || !Number.isFinite(n) ? undefined : Math.min(RETENTION.maxDays, Math.max(RETENTION.minDays, Math.trunc(n)));
};
/**
 * A text option: a flag wins, then a *set* environment variable — an empty one means "no value", so
 * FLOW_TOWER_USER='' turns a configured user off — then the config file.
 */
const text = (flag: string | undefined, envValue: string | undefined, configValue: string | undefined) =>
  flag ?? (envValue !== undefined ? envValue.trim() || undefined : configValue);

/**
 * The settings the server and the CLI act on (#90). Pure: no file is read here, so the precedence
 * flags > environment > config > defaults is testable on its own. `FLOW_TOWER_HUB`,
 * `FLOW_TOWER_INGEST_ONLY`, `FLOW_TOWER_ALLOWED_HOSTS`, `FLOW_TOWER_RETENTION_DAYS`, `FLOW_TOWER_USER`,
 * `FLOW_TOWER_MACHINE`, `FLOW_TOWER_TOKEN` and `FLOW_TOWER_URL` are the environment's share.
 */
export function effective(config: Config = {}, env: NodeJS.ProcessEnv = process.env, flags: ConfigFlags = {}): EffectiveSettings {
  const envRetention = number(env.FLOW_TOWER_RETENTION_DAYS);
  return {
    hub: flags.hub ?? truthy(env.FLOW_TOWER_HUB) ?? config.hub ?? false,
    host: text(flags.host, env.FLOW_TOWER_HOST, config.host),
    allowedHosts: flags.allowedHosts ?? list(env.FLOW_TOWER_ALLOWED_HOSTS) ?? config.allowedHosts ?? [],
    ingestOnly: flags.ingestOnly ?? truthy(env.FLOW_TOWER_INGEST_ONLY) ?? config.ingestOnly ?? false,
    viewers: config.viewers ?? [],
    retentionDays: flags.retentionDays ?? envRetention ?? config.retentionDays ?? RETENTION.defaultDays,
    url: text(flags.url, env.FLOW_TOWER_URL, config.url),
    user: text(flags.user, env.FLOW_TOWER_USER, config.user),
    machine: text(flags.machine, env.FLOW_TOWER_MACHINE, config.machine),
    token: text(flags.token, env.FLOW_TOWER_TOKEN, config.token),
    role: config.role ?? 'local',
    profile: config.profile,
    members: config.members ?? [],
    optedIn: config.optedIn ?? [],
    cadence: config.cadence ?? {},
    budgets: config.budgets ?? {},
    alerts: config.alerts ?? {},
    noticeRef: config.noticeRef,
    purpose: config.purpose,
  };
}

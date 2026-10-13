/**
 * `flow-tower config path|show` (#90) and the internal `config json` the plain-JS CLI calls to learn the
 * effective settings. The loader is TypeScript (src/server/config.ts), so bin/flow-tower.js runs this file
 * with Node's built-in type stripping, exactly like `token`, `history` and `validate`.
 *
 * `json` prints the effective config as JSON so bin/ never re-implements the flags > environment > config
 * precedence; it always redacts the token, because the config's token is the sender credential and no
 * server may treat it as its own secret.
 */
import { existsSync } from 'node:fs';
import { exit, env } from 'node:process';
import { parseArgs } from 'node:util';
import { configPaths, effective, loadConfig, placeholderHosts, type ConfigFlags, type EffectiveSettings } from '../server/config.ts';

const USAGE = 'usage: flow-tower config path | show';

/** A token is never printed in full: the shape is enough to tell "there is one" from "there is none". */
const redact = (token: string | undefined) => (token === undefined ? undefined : 'ft_…redacted');

const { values, positionals } = parseArgs({
  strict: false,
  allowPositionals: true,
  options: {
    // The same flags bin/flow-tower.js parses; forwarding them keeps every precedence rule in one place.
    hub: { type: 'boolean' },
    host: { type: 'string' },
    'allowed-host': { type: 'string', multiple: true },
    'ingest-only': { type: 'boolean' },
    'retention-days': { type: 'string' },
    url: { type: 'string' },
    user: { type: 'string' },
    machine: { type: 'string' },
    token: { type: 'string' },
  },
});

/** Only what the caller actually passed: an absent flag must let the environment and the file win. */
const flags: ConfigFlags = {
  hub: values.hub as boolean | undefined,
  host: values.host as string | undefined,
  allowedHosts: values['allowed-host'] as string[] | undefined,
  ingestOnly: values['ingest-only'] as boolean | undefined,
  retentionDays: values['retention-days'] === undefined ? undefined : Number(values['retention-days']),
  url: values.url as string | undefined,
  user: values.user as string | undefined,
  machine: values.machine as string | undefined,
  token: values.token as string | undefined,
};

const loaded = loadConfig();
const eff = effective(loaded.config, env, flags);

/** Where the settings come from, so `show` can say env vs config vs default for each key. */
function sourceOf(key: keyof EffectiveSettings, envVar: string): string {
  if (envVar && (env[envVar] ?? '').trim() !== '') return 'env';
  return loaded.config[key as keyof typeof loaded.config] !== undefined ? 'config' : 'default';
}

/** The keys `show` prints with their environment twin; the rest are config-only and printed as they are. */
const ROWS: [keyof EffectiveSettings, string][] = [
  ['hub', 'FLOW_TOWER_HUB'],
  ['host', 'FLOW_TOWER_HOST'],
  ['allowedHosts', 'FLOW_TOWER_ALLOWED_HOSTS'],
  ['ingestOnly', 'FLOW_TOWER_INGEST_ONLY'],
  ['retentionDays', 'FLOW_TOWER_RETENTION_DAYS'],
  ['url', 'FLOW_TOWER_URL'],
  ['user', 'FLOW_TOWER_USER'],
  ['machine', 'FLOW_TOWER_MACHINE'],
  ['token', 'FLOW_TOWER_TOKEN'],
  ['viewers', ''],
  ['role', ''],
  ['profile', ''],
  ['members', ''],
  ['optedIn', ''],
  ['noticeRef', ''],
  ['purpose', ''],
];

const show = (v: unknown): string =>
  v === undefined ? '(none)' : Array.isArray(v) ? (v.length ? v.join(', ') : '(none)') : typeof v === 'object' ? JSON.stringify(v) : String(v);

switch (positionals[0]) {
  case 'path': {
    // The files a load would read, in the order they are applied: say which exist and where to create one.
    const [checkoutFile, ownFile, hubFile] = configPaths();
    console.log(`user:     ${ownFile}${existsSync(ownFile) ? '' : '  (missing: create it here)'}`);
    console.log(`checkout: ${checkoutFile}${existsSync(checkoutFile) ? '' : '  (missing)'}`);
    // hub.json is deprecated: a line for it only when it exists, so a clean setup is not told about a file it never had.
    if (existsSync(hubFile)) console.log(`hub.json: ${hubFile}  (deprecated: move its keys into config.json)`);
    for (const w of loaded.warnings) console.error(`warning: ${w}`);
    break;
  }
  case 'show': {
    console.log('flow-tower config (effective: flags > environment > config > defaults)\n');
    for (const [key, envVar] of ROWS) {
      const value = key === 'token' ? redact(eff.token) : eff[key];
      console.log(`  ${key.padEnd(14)} ${show(value).padEnd(24)} (${sourceOf(key, envVar)})`);
    }
    for (const w of loaded.warnings) console.error(`warning: ${w}`);
    break;
  }
  case 'json': {
    // The internal contract bin/flow-tower.js reads: the whole effective config, token always redacted.
    // placeholders: the kit's example domains still in the settings, so bin/ can warn at serve start.
    const placeholders = placeholderHosts({ allowedHosts: eff.allowedHosts, viewers: eff.viewers });
    console.log(JSON.stringify({ ...eff, token: redact(eff.token), placeholders }));
    break;
  }
  default:
    console.error(USAGE);
    exit(2);
}

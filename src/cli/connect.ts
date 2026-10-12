/**
 * `flow-tower connect <hub-url> [--token <token>] [--machine <name>] [--user <name>]` (#91): turns this
 * machine into a satellite. It writes the user folder's config.json (userHome(), never the checkout or a
 * flow-tower.local.json) and then sends one heartbeat, so the answer to "does this token work?" arrives
 * now instead of at the first event. The token is written and sent, never printed.
 *
 * Without --token the hub mints one (POST /api/hub/enroll) for an allowed viewer on a tailnet hub (#164).
 *
 * Like `token` and `history`, bin/flow-tower.js runs this file with Node's built-in type stripping.
 */
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { userHome } from '../core/secrets.ts';
import { writeUserConfig } from '../server/user-config.ts';
import { machineId } from './machine-id.ts';

// Read once, the way bin/flow-tower.js and plugin.ts do: the heartbeat names the version the relay sends.
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERSION = (JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')) as { version: string }).version;

const USAGE = 'usage: flow-tower connect <hub-url> [--token <token>] [--machine <name>] [--user <name>]\n\n'
  + 'Without --token, a tailnet hub mints one for an allowed viewer.\n'
  + 'The token is written to the user folder\'s config.json and never printed.';
/** One heartbeat, then the command is over: a hub that does not answer in 5 s counts as unreachable. */
const TIMEOUT_MS = 5_000;

/** The one-line fix for each refusal of the enrolment endpoint; the hub's own `error` is printed above it. */
const ENROL_FIX: Record<number, string> = {
  403: 'Enrolment needs the hub behind tailscale serve and your tailnet login in its viewers. Or ask the hub owner for a token: flow-tower token add <id>, then connect --token.',
  404: 'This server is not a hub, or is too old for enrolment. Use --token.',
  409: 'Pick another name with --machine <name>.',
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    token: { type: 'string' },
    machine: { type: 'string' },
    user: { type: 'string' },
  },
});

const raw = positionals[0];
const givenToken = values.token?.trim();
if (!raw) {
  console.error(USAGE);
  exit(1);
}

/** A satellite posts to an http(s) hub; anything else is a typo, not a URL to write into a config file. */
const url = raw.replace(/\/+$/, '');
let parsed: URL | undefined;
try { parsed = new URL(url); } catch { parsed = undefined; }
if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
  console.error(`not a hub url: "${raw}" (expected http:// or https://)`);
  exit(1);
}

/** --machine as given, else the hostname turned into a slug the hub accepts. */
const machine = values.machine?.trim() || machineId(hostname());
// Only enrolment needs a name; with --token the hub names the sender from the token id.
if (!machine && !givenToken) {
  console.error('could not derive a machine name from this hostname: pass --machine <name>');
  exit(1);
}

/** Asks the hub to mint a token for this machine. Exits 1 on any refusal, writing nothing. */
async function enrol(): Promise<{ token: string; machine: string; rotated: boolean }> {
  let res: Response;
  try {
    res = await fetch(`${url}/api/hub/enroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ machine }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`cannot reach ${url} (${reason}): nothing was written.`);
    exit(1);
  }
  const body = (await res.json().catch(() => ({}))) as { token?: unknown; machine?: unknown; rotated?: unknown; error?: unknown };
  if (res.status === 200 && typeof body.token === 'string' && body.token) {
    return {
      token: body.token,
      machine: typeof body.machine === 'string' && body.machine ? body.machine : machine,
      rotated: body.rotated === true,
    };
  }
  const reason = typeof body.error === 'string' ? body.error : `the hub answered ${res.status}`;
  console.error(`${reason}\n${ENROL_FIX[res.status] ?? 'Try again, or use --token.'}\nnothing was written.`);
  exit(1);
}

const enrolled = givenToken ? undefined : await enrol();
const token = givenToken ?? enrolled!.token;

const home = userHome();

/** The keys this command owns; everything else in the file survives (see writeUserConfig). */
const next: Record<string, unknown> = { role: 'satellite', url, token };
if (enrolled) next.machine = enrolled.machine;
else if (values.machine?.trim()) next.machine = values.machine.trim();
if (values.user?.trim()) next.user = values.user.trim();

const file = writeUserConfig(home, next);

/** The hub records the sender from the token id ("ft_<id>_<secret>"), so that is the honest name to print. */
const sender = /^ft_([a-z0-9-]{1,32})_/.exec(token)?.[1] ?? next.machine ?? next.user ?? hostname();

// Same shape the relay beats with, version included: the hub shows a satellite's version from the first beat.
const body = { queued: 0, dropped: 0, state: 'online', version: VERSION };
const written = `config written to ${file}`;

try {
  const res = await fetch(`${url}/api/heartbeat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-flow-tower-token': token },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 204) {
    const rotated = enrolled?.rotated ? ' (the previous token of this machine was revoked)' : '';
    console.log(`connected to ${url} as ${sender}${rotated}`);
  } else if (res.status === 401 || res.status === 403) {
    // The config is written anyway: the relay queues events and stops sending, so nothing is lost by hand.
    console.error(`the hub refused this token (${res.status}): ${written}, but the relay will not send until it is fixed.
Get a working token on the hub machine (flow-tower token add <id>) and run connect again.`);
  } else {
    console.error(`the hub answered ${res.status}: ${written}. The relay will keep trying.`);
  }
} catch (err) {
  // Offline or a wrong url: the same message either way, since the user can act on neither in one command.
  const reason = err instanceof Error ? err.message : String(err);
  console.error(`cannot reach ${url} (${reason}): ${written}.
The satellite relay queues events (up to 5000, oldest dropped first) until the hub answers.`);
}
exit(0);

/**
 * `flow-tower connect <hub-url> --token <token> [--machine <name>] [--user <name>]` (#91): turns this
 * machine into a satellite. It writes the user folder's config.json (userHome(), never the checkout or a
 * flow-tower.local.json) and then sends one heartbeat, so the answer to "does this token work?" arrives
 * now instead of at the first event. The token is written and sent, never printed.
 *
 * Like `token` and `history`, bin/flow-tower.js runs this file with Node's built-in type stripping.
 */
import { hostname } from 'node:os';
import { exit } from 'node:process';
import { parseArgs } from 'node:util';
import { userHome } from '../core/secrets.ts';
import { writeUserConfig } from '../server/user-config.ts';

const USAGE = 'usage: flow-tower connect <hub-url> --token <token> [--machine <name>] [--user <name>]\n\nThe token is written to the user folder\'s config.json and never printed.';
/** One heartbeat, then the command is over: a hub that does not answer in 5 s counts as unreachable. */
const TIMEOUT_MS = 5_000;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    token: { type: 'string' },
    machine: { type: 'string' },
    user: { type: 'string' },
  },
});

const raw = positionals[0];
const token = values.token?.trim();
if (!raw || !token) {
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

const home = userHome();

/** The keys this command owns; everything else in the file survives (see writeUserConfig). */
const next: Record<string, unknown> = { role: 'satellite', url, token };
if (values.machine?.trim()) next.machine = values.machine.trim();
if (values.user?.trim()) next.user = values.user.trim();

const file = writeUserConfig(home, next);

/** The hub records the sender from the token id ("ft_<id>_<secret>"), so that is the honest name to print. */
const sender = /^ft_([a-z0-9-]{1,32})_/.exec(token)?.[1] ?? next.machine ?? next.user ?? hostname();

const body = { queued: 0, dropped: 0, state: 'online' };
const written = `config written to ${file}`;

try {
  const res = await fetch(`${url}/api/heartbeat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-flow-tower-token': token },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 204) {
    console.log(`connected to ${url} as ${sender}`);
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

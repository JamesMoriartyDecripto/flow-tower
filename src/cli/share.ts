/**
 * `flow-tower share <dir> [--files] [--name <name>]`, `flow-tower share --list` and
 * `flow-tower unshare <name|dir> [--force]` (#164): the satellite's side of giving a tower folder to the hub.
 * The hub url and token come from the user folder's config.json (written by `flow-tower connect`). The shares
 * this command makes are recorded there too, so `unshare` and `--list` know what was sent. The token is read
 * and sent, never printed.
 *
 * Like `connect`, bin/flow-tower.js runs this file with Node's built-in type stripping.
 */
import { resolve } from 'node:path';
import { exit } from 'node:process';
import { parseArgs } from 'node:util';
import { userHome } from '../core/secrets.ts';
import type { Share } from '../server/config.ts';
import { addToLibrary } from './library.ts';
import { asShare, withShare, withoutShare } from '../server/share-entries.ts';
import { collectTower, listShared, removeTower, shareName, uploadTower } from '../server/share-client.ts';
import { shareName as validShareName } from '../server/share-rules.ts';
import { readUserConfig, writeUserConfig } from '../server/user-config.ts';

const USAGE = 'usage: flow-tower share <dir> [--files] [--name <name>]\n'
  + '       flow-tower share --list\n'
  + '       flow-tower unshare <name|dir> [--force]';

/** How many sent paths `share` lists before it says "and K more": a big folder must not flood the terminal. */
const SENT_LIST_CAP = 30;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: 'string' },
    files: { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    unshare: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  },
});

const home = userHome();
const config = readUserConfig(home);
const hub = typeof config.url === 'string' && config.url ? config.url : undefined;
const token = typeof config.token === 'string' && config.token ? config.token : undefined;

function fail(message: string): never {
  console.error(message);
  exit(1);
}

/** The raw entries of config `shares` as read at start; the write re-reads them, see `rawSharesNow`. */
function rawShares(): unknown[] {
  return Array.isArray(config.shares) ? config.shares : [];
}

/**
 * The entries as they are on disk now. The hub call takes a while, and another `share` or `unshare` may have
 * written meanwhile: a write must build on what is there, not on the snapshot taken at start.
 */
function rawSharesNow(): unknown[] {
  const fresh = readUserConfig(home).shares;
  return Array.isArray(fresh) ? fresh : [];
}

function recorded(): Share[] {
  return rawShares().flatMap((s) => {
    const share = asShare(s);
    return share ? [share] : [];
  });
}

/** The hub files a share under towers/<sender>/<name>, where the sender is the token id ("ft_<id>_<secret>"). */
function tokenId(t: string): string | undefined {
  return /^ft_([a-z0-9-]{1,32})_/.exec(t)?.[1];
}

async function share(dir: string | undefined) {
  if (!dir) fail(USAGE);
  if (!hub || !token) fail('not connected: run flow-tower connect <hub-url> first');

  const absDir = resolve(dir);
  const name = values.name ?? shareName(absDir);
  if (!validShareName(name)) fail(`not a share name: "${name}" (a-z, 0-9 and dashes, up to 64 characters)`);

  const collected = await collectTower(absDir, { withFiles: values.files });
  if ('error' in collected) fail(collected.error);

  const { files, skipped } = collected;
  console.log(`sharing ${name}: ${files.length} ${files.length === 1 ? 'file' : 'files'}, ${values.files ? 'YAML and referenced files' : 'YAML only'}`);
  // The user sees exactly what leaves the machine; the list is capped so a big folder stays readable.
  for (const f of files.slice(0, SENT_LIST_CAP)) console.log(`  ${f.path}`);
  if (files.length > SENT_LIST_CAP) console.log(`  … and ${files.length - SENT_LIST_CAP} more`);
  for (const s of skipped) console.log(`  skipped ${s.path}: ${s.reason}`);

  const sent = await uploadTower(hub, token, name, files);
  // The config is not written on failure: a share the hub refused must not show up as shared.
  if (!sent.ok) fail(`${sent.error}\nnothing was recorded: ${name} is not shared.`);

  writeUserConfig(home, { shares: withShare(rawSharesNow(), { dir: absDir, name, files: values.files }) });

  // A shared tower is one of the user's own towers: add it to the library so `library` and the sync see it (#164).
  const lib = addToLibrary(home, absDir);
  if (lib.reason !== undefined) console.log(`not added to your library: ${lib.reason}`);
  else if (lib.added) console.log(`added to your library: ${absDir}`);
  else if (lib.via) console.log(`already in your library (via ${lib.via})`);
  if (lib.warning) console.log(`  warning: ${lib.warning}`);

  const sender = tokenId(token) ?? 'this-machine';
  console.log(`shared ${name} with ${hub}: it appears on the hub as towers/${sender}/${name}`);
}

async function list() {
  const shares = recorded();
  const hubShares = hub && token ? await listShared(hub, token) : undefined;
  if (shares.length === 0) console.log('no shares in config');
  for (const s of shares) {
    const missing = hubShares?.ok && !hubShares.towers.includes(s.name) ? '  (missing on the hub)' : '';
    console.log(`${s.name}  ${s.dir}  ${s.files ? 'YAML and referenced files' : 'YAML only'}${missing}`);
  }
  if (hubShares?.ok) console.log(`on the hub: ${hubShares.towers.join(', ') || 'none'}`);
  else if (hubShares) console.error(`cannot list the hub's shares: ${hubShares.error}`);
}

async function unshare(target: string | undefined) {
  if (!target) fail(USAGE);
  const shares = recorded();
  const match = shares.find((s) => s.name === target || s.dir === resolve(target));
  if (!match) {
    const known = shares.map((s) => s.name).join(', ') || 'none';
    fail(`no share named or at "${target}". known shares: ${known}`);
  }

  const r = hub && token
    ? await removeTower(hub, token, match.name)
    : { ok: false as const, status: 0, error: 'not connected: run flow-tower connect <hub-url> first' };
  // A 404 means the hub holds nothing under that name, which is what unshare wants: drop the entry.
  const gone = !r.ok && r.status === 404;
  if (!r.ok && !gone && r.status !== 0) fail(`the hub refused the unshare: ${r.error}\n${match.name} stays in config.`);
  if (!r.ok && !gone && !values.force) {
    fail(`cannot reach the hub (${r.error}): ${match.name} stays shared.\nUse --force to drop it from config only.`);
  }

  // Dropped from config only after the hub agreed (or had nothing), or on --force when it could not be asked.
  writeUserConfig(home, { shares: withoutShare(rawSharesNow(), match.name) });
  if (gone) console.log(`unshared ${match.name} (it was not on the hub)`);
  else console.log(r.ok ? `unshared ${match.name}` : `unshared ${match.name} (hub unreachable: dropped from config only)`);
}

if (values.unshare) await unshare(positionals[0]);
else if (values.list) await list();
else await share(positionals[0]);

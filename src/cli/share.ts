/**
 * `flow-tower share <dir> [--files] [--name <name>]`, `flow-tower share --list` and
 * `flow-tower unshare <name|dir> [--force]` (#164): the satellite's side of giving a tower folder to the hub.
 * The work lives in src/server/share-actions.ts, so a server route can call the same functions; this file only
 * parses the arguments, prints, and sets the exit code. The token is read and sent, never printed.
 *
 * Like `connect`, bin/flow-tower.js runs this file with Node's built-in type stripping.
 */
import { exit } from 'node:process';
import { parseArgs } from 'node:util';
import { userHome } from '../core/secrets.ts';
import type { SharedFile, SkippedFile } from '../server/share-client.ts';
import { listShares, shareFolder, unshareFolder } from '../server/share-actions.ts';

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

function fail(message: string): never {
  console.error(message);
  exit(1);
}

/** The "sharing …" block: what leaves the machine, shown before the hub is asked. */
function printSending(name: string, files: SharedFile[], skipped: SkippedFile[]) {
  console.log(`sharing ${name}: ${files.length} ${files.length === 1 ? 'file' : 'files'}, ${values.files ? 'YAML and referenced files' : 'YAML only'}`);
  // The user sees exactly what leaves the machine; the list is capped so a big folder stays readable.
  for (const f of files.slice(0, SENT_LIST_CAP)) console.log(`  ${f.path}`);
  if (files.length > SENT_LIST_CAP) console.log(`  … and ${files.length - SENT_LIST_CAP} more`);
  for (const s of skipped) console.log(`  skipped ${s.path}: ${s.reason}`);
}

async function share(dir: string | undefined) {
  if (!dir) fail(USAGE);
  const r = await shareFolder(home, dir, { files: values.files, name: values.name });
  if (!r.ok) {
    // A hub refusal comes after the list: the user sees what was sent before the error.
    if (r.sent) printSending(r.sent.name, r.sent.files, r.sent.skipped);
    fail(r.error);
  }

  printSending(r.name, r.files, r.skipped);

  const { library } = r;
  if (library.reason !== undefined) console.log(`not added to your library: ${library.reason}`);
  else if (library.added) console.log(`added to your library: ${r.dir}`);
  else if (library.via) console.log(`already in your library (via ${library.via})`);
  if (library.warning) console.log(`  warning: ${library.warning}`);

  console.log(`shared ${r.name} with ${r.hub}: it appears on the hub as towers/${r.sender}/${r.name}`);
}

async function list() {
  const { shares, hub } = await listShares(home);
  if (shares.length === 0) console.log('no shares in config');
  for (const s of shares) {
    const missing = hub?.ok && !hub.towers.includes(s.name) ? '  (missing on the hub)' : '';
    console.log(`${s.name}  ${s.dir}  ${s.files ? 'YAML and referenced files' : 'YAML only'}${missing}`);
  }
  if (hub?.ok) console.log(`on the hub: ${hub.towers.join(', ') || 'none'}`);
  else if (hub) console.error(`cannot list the hub's shares: ${hub.error}`);
}

async function unshare(target: string | undefined) {
  if (!target) fail(USAGE);
  const r = await unshareFolder(home, target, { force: values.force });
  if (!r.ok) fail(r.error);
  if (r.gone) console.log(`unshared ${r.name} (it was not on the hub)`);
  else console.log(r.hubReached ? `unshared ${r.name}` : `unshared ${r.name} (hub unreachable: dropped from config only)`);
}

if (values.unshare) await unshare(positionals[0]);
else if (values.list) await list();
else await share(positionals[0]);

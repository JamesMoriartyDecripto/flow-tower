/**
 * `flow-tower token add|list|revoke|pause|resume` (#83): manages the per-sender hub tokens.
 * The store is TypeScript (src/server/tokens.ts), so the plain-JS CLI runs this file with Node's
 * built-in type stripping, exactly like `validate`. The folder is userHome(): FLOW_TOWER_HOME or
 * ~/.config/flow-tower, never the checkout.
 */
import { argv, exit } from 'node:process';
import { userHome } from '../core/secrets.ts';
import { appendAudit } from '../server/admin-audit.ts';
import { loadConfig } from '../server/config.ts';
import { tokenStore } from '../server/tokens.ts';
import { isLoopbackUrl } from '../../bin/identity.js';
import { OTHER_MACHINE_CLI } from '../../bin/cli-name.js';

// The port `serve` listens on by default: the config has no port key, so the printed url uses this one.
const DEFAULT_PORT = 5317;

const USAGE = 'usage: flow-tower token add <id> | list | revoke <id> | pause <id> | resume <id>';

const [cmd, id] = argv.slice(2);
// One folder for the store and the audit log, so a CLI change lands in the same history as the Admin tab's.
const home = userHome();
const store = tokenStore(home);
const known = (x: string) => store.list().some((t) => t.id === x);
/**
 * The Admin tab's route: a line per change, the CLI marked, and never a token. It only warns on failure:
 * the change already happened, and a read-only or full disk must not hide a token that was just created.
 */
const audit = (action: string, target: string) => {
  try {
    appendAudit(home, { action, target, detail: { via: 'cli' } });
  } catch (err) {
    console.error(`warning: could not write the audit log: ${err instanceof Error ? err.message : String(err)}`);
  }
};

switch (cmd) {
  case 'add': {
    if (!id) { console.error(USAGE); exit(2); }
    // A paused sender still exists, so refuse it too; a revoked id may be reused (rotation keeps working).
    if (store.list().some((t) => t.id === id && t.revokedAt === undefined)) {
      console.error(`a sender named ${id} exists: revoke it first, or pick another id`);
      exit(1);
    }
    const { token } = store.create(id);
    // Print first: the token exists now, so the user must see it even if the audit line cannot be written.
    // The plaintext is printed once and never stored: say so, or the user will look for it again.
    console.log(token);
    console.log('this token is shown once: it is kept only as a sha256, so a lost token cannot be recovered — store it now');
    // The line the teammate runs on their machine, as the Admin tab shows it. The url is the config's when set
    // (a tailnet or proxy name), else this server's loopback address, which only this machine can reach.
    const cfg = loadConfig({ home }).config;
    const hubUrl = cfg.url ?? `http://127.0.0.1:${DEFAULT_PORT}`;
    console.log(`on the other machine: ${OTHER_MACHINE_CLI} connect ${hubUrl} --token ${token} --machine ${id}`);
    if (isLoopbackUrl(hubUrl)) console.log('replace 127.0.0.1 with the address other machines use for this hub (its tailnet name)');
    audit('sender.add', id);
    break;
  }
  case 'list': {
    const list = store.list();
    if (!list.length) console.log('no tokens');
    for (const t of list) {
      const state = t.revokedAt !== undefined ? `revoked ${new Date(t.revokedAt).toISOString()}` : t.paused ? 'paused' : 'active';
      console.log(`${t.id}  ${new Date(t.createdAt).toISOString()}  ${state}`);
    }
    break;
  }
  case 'revoke':
  case 'pause':
  case 'resume': {
    // The store treats an unknown id as a no-op; the shell wants to know the id was wrong, so check here.
    if (!id || !known(id)) { console.error(`unknown token "${id ?? ''}"`); exit(1); }
    if (cmd === 'revoke') store.revoke(id); else store.pause(id, cmd === 'pause');
    audit(`sender.${cmd}`, id);
    console.log(`${id}: ${cmd === 'revoke' ? 'revoked' : cmd === 'pause' ? 'paused' : 'resumed'}`);
    break;
  }
  default:
    console.error(USAGE);
    exit(2);
}

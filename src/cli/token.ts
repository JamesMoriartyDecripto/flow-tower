/**
 * `flow-tower token add|list|revoke|pause|resume` (#83): manages the per-sender hub tokens.
 * The store is TypeScript (src/server/tokens.ts), so the plain-JS CLI runs this file with Node's
 * built-in type stripping, exactly like `validate`. The folder is userHome(): FLOW_TOWER_HOME or
 * ~/.config/flow-tower, never the checkout.
 */
import { argv, exit } from 'node:process';
import { userHome } from '../core/secrets.ts';
import { appendAudit } from '../server/admin-audit.ts';
import { tokenStore } from '../server/tokens.ts';

const USAGE = 'usage: flow-tower token add <id> | list | revoke <id> | pause <id> | resume <id>';

const [cmd, id] = argv.slice(2);
// One folder for the store and the audit log, so a CLI change lands in the same history as the Admin tab's.
const home = userHome();
const store = tokenStore(home);
const known = (x: string) => store.list().some((t) => t.id === x);
/** The Admin tab's route: a line per change, the CLI marked, and never a token. */
const audit = (action: string, target: string) => appendAudit(home, { action, target, detail: { via: 'cli' } });

switch (cmd) {
  case 'add': {
    if (!id) { console.error(USAGE); exit(2); }
    // A paused sender still exists, so refuse it too; a revoked id may be reused (rotation keeps working).
    if (store.list().some((t) => t.id === id && t.revokedAt === undefined)) {
      console.error(`a sender named ${id} exists: revoke it first, or pick another id`);
      exit(1);
    }
    const { token } = store.create(id);
    audit('sender.add', id);
    // The plaintext is printed once and never stored: say so, or the user will look for it again.
    console.log(token);
    console.log('this token is shown once: it is kept only as a sha256, so a lost token cannot be recovered — store it now');
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

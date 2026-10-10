import { homedir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

/**
 * The user's own folder (#68): key, voice journal and memory, outside every repo. FLOW_TOWER_HOME overrides
 * it (tests, e2e). Read at each call, so /api/file denies whatever folder is in use now. Node built-ins
 * only: files.ts imports it, and the static demo build imports files.ts.
 */
export const userHome = () => env.FLOW_TOWER_HOME || join(homedir(), '.config', 'flow-tower');

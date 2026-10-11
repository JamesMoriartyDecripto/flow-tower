/**
 * The environment for a spawned CLI/serve child: the parent's minus every FLOW_TOWER_* variable.
 * The environment beats the config file (and even some flags), so without this a caller who exports
 * FLOW_TOWER_URL/TOKEN/HUB/USER/MACHINE silently changes what these tests exercise.
 */
export function cleanEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('FLOW_TOWER_')) env[key] = value;
  }
  // The vars the test sets on purpose (e.g. FLOW_TOWER_HOME) go in last.
  return { ...env, ...extra };
}

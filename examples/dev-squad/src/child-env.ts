// Keys the OpenRouter loop holds. Child processes run code the coder just wrote (vitest, check,
// prettier configs next to a file), so none of them may inherit these.
export const SECRET_ENV = ['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'GITHUB_TOKEN', 'CONTEXT7_API_KEY', 'SEMGREP_APP_TOKEN'] as const;

/** A copy of the environment without the secrets; the input is left untouched. */
export function childEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  for (const key of SECRET_ENV) delete env[key];
  return env;
}

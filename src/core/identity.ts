/**
 * OTel/usage attributes are a moving target: agents and SDKs rename the same intent
 * over releases, and every source namespaces it differently. These helpers pick the
 * first attribute that is actually set so every event can carry who/where/what.
 */

import { clip } from './adapters.ts';

export type Identity = {
  user?: string;
  host?: string;
  runtime?: string;
  project?: string;
  session?: string;
};

export type TokenKind = 'input' | 'output' | 'cache_read' | 'cache_write';

/** Longest identity field kept: attributes come from outside, so they cannot bloat every event. */
export const IDENTITY_MAX = 200;

/** First attribute whose value is a non-empty string wins; non-strings are ignored. */
function pick(a: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = a[key];
    if (typeof v === 'string' && v !== '') return v;
  }
  return undefined;
}

/** Claude reports user.id as an anonymous install id, not an account: never treat it as a user. */
const claudeRuntime = (names: (string | undefined)[]) =>
  names.some((n) => n === 'claude-code' || n === 'claude-code-desktop');

/** Last path segment of a URL or path, e.g. ".../repo.git" → "repo". */
function basename(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const clean = value.replace(/\.git$/, '').replace(/\/+$/, '');
  const name = clean.split('/').pop();
  return name ? name : undefined;
}

/**
 * Reduce a flat attribute bag (OTel resource + span attributes merged) to the identity of one event.
 * Each field follows its own cascade; the first match wins and unrelated fields are independent.
 */
export function identityFromAttributes(a: Record<string, unknown>): Identity {
  const serviceName = pick(a, ['service.name']);
  const claude = claudeRuntime([serviceName]);

  const user =
    pick(a, ['enduser.id', 'user.email', 'user.account_uuid']) ??
    // Codex user.id is a real account id; Claude's is an install id, kept as a last resort only.
    (claude ? undefined : pick(a, ['user.id'])) ??
    (claude ? pick(a, ['user.id']) : undefined);

  const host = pick(a, ['host.name', 'faas.name', 'container.name', 'cloud.instance.id']);

  // e.g. "claude-code/aws" — the runtime plus where it ran, when the source tells us.
  const where = pick(a, ['cloud.platform', 'faas.name', 'deployment.environment.name']);
  const runtime = serviceName === undefined ? undefined : where === undefined ? serviceName : `${serviceName}/${where}`;

  const project =
    pick(a, ['project', 'service.namespace']) ??
    basename(pick(a, ['vcs.repository.url.full'])) ??
    pick(a, ['vcs.repository.name']);

  const session = pick(a, ['session.id', 'conversation.id', 'gen_ai.conversation.id']);

  return {
    user: clip(user, IDENTITY_MAX), host: clip(host, IDENTITY_MAX), runtime: clip(runtime, IDENTITY_MAX),
    project: clip(project, IDENTITY_MAX), session: clip(session, IDENTITY_MAX),
  };
}

const TOKEN_KEYS: Record<TokenKind, string[]> = {
  // The `*_token_count` spellings are what Gemini CLI's gemini_cli.api_response exports.
  input: ['gen_ai.usage.input_tokens', 'gen_ai.usage.prompt_tokens', 'input_tokens', 'input_token_count'],
  output: ['gen_ai.usage.output_tokens', 'gen_ai.usage.completion_tokens', 'output_tokens', 'output_token_count'],
  cache_read: [
    'gen_ai.usage.cache_read.input_tokens', 'gen_ai.usage.cache_read_input_tokens',
    'cache_read_tokens', 'cache_read_input_tokens',
    // What a source puts in a flat `data` bag: OpenAI's usage.prompt_tokens_details.cached_tokens.
    'cached_tokens',
  ],
  cache_write: [
    'gen_ai.usage.cache_write.input_tokens', 'gen_ai.usage.cache_creation.input_tokens',
    'gen_ai.usage.cache_creation_input_tokens', 'cache_creation_tokens', 'cache_creation_input_tokens',
    'cache_write_tokens',
  ],
};

/** Token counts, with the old and new attribute spellings accepted; numbers may arrive as strings. */
export function tokenAttr(a: Record<string, unknown>, kind: TokenKind): number | undefined {
  for (const key of TOKEN_KEYS[kind]) {
    const v = a[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    // Some exporters stringify counts; only accept fully numeric strings.
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

// One-request review modes (#169): a review whose task already embeds the code (the diff and the files) is answered
// in a single request with no tools. The tool loop timed out three times on the 180 s per-call cap on #164, while a
// single request answered in 2.5 min. Both the direct call (--oneshot) and the batch (--batch) send this body.

import { DEFAULTS, STYLE_RULES, systemLine } from './config.mjs';

// One long answer, not a loop: the direct call waits up to 10 min for it.
export const ONESHOT_TIMEOUT_MS = 600_000;

// Prompt caching is opt-in per request and only Claude models honour it here: cache reads cost 0.1x, writes 1.25x.
export const cacheControl = (id) => (id.startsWith('anthropic/') ? { cache_control: { type: 'ephemeral' } } : {});

// The loop's system prompt minus the tool sentences: a model told it has tools would try to call them.
// The project line and the rules come from the repo's config (config.mjs), so the prompt names the repo it runs on.
export function oneshotSystem(role, repo, config = DEFAULTS) {
  const rules = config.rules.map((r) => ` ${r}`).join('');
  return `You are the ${role} of a dev squad working on ${systemLine(config, repo)}. You have no tools: answer from the task, which holds all the code you need, in the format it asks for. ${STYLE_RULES}${rules}`;
}

// The settings both requests share (the loop's and the one-request review's), so the two cannot drift apart.
function sharedSettings(model, session) {
  return {
    max_tokens: 16000,
    usage: { include: true },
    session_id: session,
    // OpenRouter caches Claude prompts only on request; the breakpoint trails the last cacheable block (https://openrouter.ai/docs/guides/best-practices/prompt-caching).
    ...cacheControl(model),
    // Low effort everywhere (maintainer, 2026-10-10): quick passes, the review rounds re-check the work.
    reasoning: { effort: 'low' },
    provider: { require_parameters: true, data_collection: 'deny' },
  };
}

// Same settings as the loop's request (reasoning, provider, session), without `tools`.
export function oneshotBody({ model, system, task, session }) {
  return { model, messages: [{ role: 'system', content: system }, { role: 'user', content: task }], ...sharedSettings(model, session) };
}

// The tool loop's request: the shared settings, with the tools it is offered.
export function loopBody({ model, messages, tools, session }) {
  return { model, messages, tools, ...sharedSettings(model, session) };
}

// A failed HTTP answer is logged as its status and a short error code only: the provider's body can echo the
// request, and the log and the console must not carry that. The body is read here, for the code, and dropped.
export async function httpFailure(r) {
  const j = await r.json().catch(() => null);
  const code = j?.error?.code;
  const short = typeof code === 'string' || typeof code === 'number' ? String(code) : '';
  return `HTTP ${r.status}${/^[\w.-]{1,40}$/.test(short) ? ` ${short}` : ''}`;
}

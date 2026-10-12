// One-request review modes (#169): a review whose task already embeds the code (the diff and the files) is answered
// in a single request with no tools. The tool loop timed out three times on the 180 s per-call cap on #164, while a
// single request answered in 2.5 min. Both the direct call (--oneshot) and the batch (--batch) send this body.

// One long answer, not a loop: the direct call waits up to 10 min for it.
export const ONESHOT_TIMEOUT_MS = 600_000;

// Prompt caching is opt-in per request and only Claude models honour it here: cache reads cost 0.1x, writes 1.25x.
export const cacheControl = (id) => (id.startsWith('anthropic/') ? { cache_control: { type: 'ephemeral' } } : {});

// The loop's system prompt minus the tool sentences: a model told it has tools would try to call them.
export function oneshotSystem(role, repo) {
  return `You are the ${role} of a dev squad working on the repo Flow Tower (TypeScript, React 19, Vite 8, vitest) at ${repo}. You have no tools: answer from the task, which holds all the code you need, in the format it asks for. English only in code and comments; match the surrounding style; comments explain why; files under ~400 lines. Never touch secret files.`;
}

// Same settings as the loop's request (reasoning, provider, session), without `tools`.
export function oneshotBody({ model, system, task, session }) {
  return {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: task }],
    max_tokens: 16000,
    usage: { include: true },
    session_id: session,
    ...cacheControl(model),
    // Low effort everywhere (maintainer, 2026-10-10): quick passes, the review rounds re-check the work.
    reasoning: { effort: 'low' },
    provider: { require_parameters: true, data_collection: 'deny' },
  };
}

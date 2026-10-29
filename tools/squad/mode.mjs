// Picks how a squad run answers (#169, #322). Pure, so the rules are tested without spawning run.mjs.
// The tool loop is the default for the coder only: it needs its tools. Reviewer and security answer in one request
// by default (#322: cheap reviewer models answer prose inside the loop, but give the JSON verdict in one request).
// An explicit flag wins over SQUAD_PACE; overnight is a batch (half the price, hours of wait).

const PACES = ['now', 'relaxed', 'overnight'];

export function pickMode({ role, flags, pace }) {
  const { oneshot, batch, loop } = flags;
  // Only the verdict roles have a one-request path; every other role (coder and the new roles) needs its tools.
  if (role !== 'reviewer' && role !== 'security' && (oneshot || batch)) {
    throw new Error(role === 'coder'
      ? 'the coder needs tools: --oneshot/--batch are for reviewer and security'
      : `${role} needs tools: --oneshot/--batch are for reviewer and security`);
  }
  if ([oneshot, batch, loop].filter(Boolean).length > 1) {
    throw new Error('--oneshot, --batch and --loop are exclusive');
  }
  // An unknown pace is refused rather than read as now: a typo must not silently pick the paid mode.
  if (pace !== undefined && !PACES.includes(pace)) {
    throw new Error('SQUAD_PACE must be now, relaxed or overnight');
  }
  if (role !== 'reviewer' && role !== 'security') return { mode: 'loop' };
  if (batch) return { mode: 'batch', why: 'flag' };
  if (oneshot) return { mode: 'oneshot', why: 'flag' };
  if (loop) return { mode: 'loop', why: 'flag' };
  if (pace === 'overnight') return { mode: 'batch', why: 'pace' };
  if (pace !== undefined) return { mode: 'oneshot', why: 'pace' };
  return { mode: 'oneshot', why: 'default' };
}

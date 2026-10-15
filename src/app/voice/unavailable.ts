/** The text shown when /api/voice gave no config. Kept apart from voice.ts so it can be tested without the DOM. */

const UNREACHABLE = 'Voice commands need the local flow-tower server, which this page cannot reach.';
const REMOTE_VIEW = "Voice is off on a remote view of the hub: it would run on the hub's machine. Open this tower in your own Flow Tower (flow-tower library) and use voice there.";

/**
 * A hub answers 403 to voice from a remote viewer on purpose (voice acts on and bills the machine that runs
 * it), so the server did answer: say so, instead of claiming the page cannot reach it. Any other failure
 * (network error, 404, 5xx) keeps the original message.
 */
export function voiceUnavailable(status: number | undefined): string {
  return status === 403 ? REMOTE_VIEW : UNREACHABLE;
}

// The step cap of the tool loop (run.mjs --steps), kept apart from it so the rules are tested without spawning the runner.
// Pure: no I/O, no environment.

export const STEP_DEFAULT = 40;
// The printed diagnostic is bounded: the full text stays in the run log, which is written before anything is printed.
export const DIAGNOSTIC_MAX = 4000;

// --steps must be a whole number of at least 1. Anything else (NaN, Infinity, 0, negative, fraction, exponent, empty,
// blanks) is refused before any paid request, so the caller can print the usage. Absent means the default.
export function parseSteps(raw) {
  if (raw === undefined) return STEP_DEFAULT;
  const s = String(raw);
  if (!/^[1-9]\d*$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

// Shown to the model before a request when at most two calls remain, so it stops exploring and reports. `left` counts
// this request too. The model is told the truth about the limit: a finish with unfinished work is an honest partial report.
export function stepReminder(left) {
  if (!(left >= 1 && left <= 2)) return null;
  return `${left} model call${left === 1 ? '' : 's'} left, including this one. Stop exploring: call finish now. `
    + 'Report what is done and what is not. If the work is not finished, say so plainly and end the report with a `Known gaps:` line that names what is missing. Do not claim unfinished work passed.';
}

// Terminal control sequences (CSI, OSC, a lone ESC) and C0 controls, but keeping newline and tab. A model's text must not
// move the cursor, clear the screen or rewrite a line of the console.
const CONTROL = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[\x40-\x5f]|[\x00-\x08\x0b-\x1f\x7f]/g;

// The printed copy of the last assistant text: controls stripped, "[finish]" disarmed (the log's own marker), and bounded.
export function diagnosticText(text) {
  const clean = String(text).replace(CONTROL, '').replace(/\[finish\]/g, '[finish-text]');
  return clean.length > DIAGNOSTIC_MAX ? `${clean.slice(0, DIAGNOSTIC_MAX)}\n…[cut ${clean.length - DIAGNOSTIC_MAX} chars]` : clean;
}

// The lines printed at the cap. They are labelled INCOMPLETE and carry no verdict or finish marker: nothing reads them as
// a completed report, and the run exits nonzero.
export function incompleteText(lastText) {
  if (!lastText) return 'INCOMPLETE: the step cap was reached with no assistant text. There is no partial report; nothing here is a verdict or a finished report.';
  return `INCOMPLETE: the step cap was reached. Last assistant text (unverified partial output, not a verdict or a finished report; the full text is in the log):\n${diagnosticText(lastText)}`;
}

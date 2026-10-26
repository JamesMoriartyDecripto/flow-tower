// Pure helpers for the Flow Tower demo. No Argo import here, so the vitest suite can load
// them without a browser. Everything shown on screen passes through these functions, so the
// clean-screen rule is enforced in one place.
import { execFileSync } from 'node:child_process';

/** The forbidden strings that occur in `text`. An empty entry is ignored: it would match everything. */
export function cleanHits(text: string, forbidden: string[]): string[] {
  return forbidden.filter((s) => s !== '' && text.includes(s));
}

/**
 * The environment for child processes the demo runs. A copy without OPENROUTER_API_KEY: the commands
 * shown on screen and the simulator never need the paid key, and only the speech engine should hold it.
 */
export function childEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const copy = { ...env };
  delete copy.OPENROUTER_API_KEY;
  return copy;
}

/**
 * The list scripts/run.mjs passes in TUTORIAL_FORBIDDEN (home path, machine name, user name).
 * Throws when it is missing or empty: an empty list would silently switch the clean-screen check off.
 */
export function forbiddenFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  let list: unknown;
  try {
    list = env.TUTORIAL_FORBIDDEN === undefined ? undefined : JSON.parse(env.TUTORIAL_FORBIDDEN);
  } catch {
    list = undefined;
  }
  if (!Array.isArray(list) || list.length === 0 || !list.every((s) => typeof s === 'string')) {
    throw new Error('TUTORIAL_FORBIDDEN is missing: run the demo through scripts/run.mjs');
  }
  return list as string[];
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Inner HTML of an overlay card: the title, then the lines in a pre block. Everything is escaped. */
export function codeCard(title: string, lines: string[]): string {
  // The wrap style sits on the pre itself, not on a wrapper div: the browser's default stylesheet sets
  // `pre { white-space: pre }`, which beats any value inherited from an ancestor, so long lines would not wrap.
  return `<div class="tutorial-card-title">${escapeHtml(title)}</div><pre style="white-space:pre-wrap;overflow-wrap:anywhere;margin:0">${escapeHtml(lines.join('\n'))}</pre>`;
}

/** Shows command output relative to its working folder, so the absolute path never reaches the screen. */
export function relativeTo(text: string, dir: string): string {
  return text.split(dir + '/').join('');
}

/**
 * Runs a command and returns the lines to show. Throws if a shown line holds a forbidden string,
 * so a leaked path stops the run instead of reaching the recording.
 */
export function runShown(
  cmd: string,
  args: string[],
  cwd: string,
  keep: (line: string) => boolean,
  forbidden: string[],
  allowFail = false,
): string[] {
  let output: string;
  try {
    output = execFileSync(cmd, args, { cwd, encoding: 'utf8', env: childEnv() });
  } catch (err) {
    // audit and validate exit non-zero when they find problems; with allowFail their stdout is
    // kept, since the findings are what the viewer should see. Otherwise, including a failed copy,
    // the error is re-thrown so the run stops instead of showing a partial result.
    const out = (err as { stdout?: unknown }).stdout;
    if (!allowFail || typeof out !== 'string') throw err;
    output = out;
  }
  // The final newline ends the last line; it is not an empty line to show.
  const lines = relativeTo(output, cwd).replace(/\n$/, '').split('\n').filter(keep);
  for (const line of lines) {
    const hit = cleanHits(line, forbidden)[0];
    if (hit !== undefined) throw new Error(`clean screen: output of ${cmd} shows "${hit}"`);
  }
  return lines;
}

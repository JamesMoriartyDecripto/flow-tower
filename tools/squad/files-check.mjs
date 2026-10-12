// "Files touched" check for squad steps (#176). A step came back green with half its task missing, because its own
// tests passed and the chain went on. Every task has a `Files:` line; after a step each listed path must show up in
// the step's changes, else the step is RED with the paths that are missing.
// node tools/squad/files-check.mjs <task.md> <base-rev> [repo]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const USAGE = 'usage: node tools/squad/files-check.mjs <task.md> <base-rev> [repo]';

// The last Files: line wins: a task may quote an earlier one in its prose. A trailing "+" marks a new file (the
// check does not need it), and "(optional)" marks a path that need not be touched.
export function parseFiles(taskText) {
  const lines = String(taskText).split('\n').filter((l) => /^Files:/.test(l));
  if (!lines.length) return [];
  return lines[lines.length - 1]
    .slice('Files:'.length)
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .filter((e) => !/\s\(optional\)$/.test(e))
    .map((e) => e.replace(/\+$/, '').trim())
    .filter(Boolean);
}

// `*` matches within one path segment, `**` at any depth. Every other character is literal.
function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    if (glob.startsWith('**/', i)) { re += '(?:.*/)?'; i += 2; }
    else if (glob.startsWith('**', i)) { re += '.*'; i += 1; }
    else if (glob[i] === '*') re += '[^/]*';
    else re += glob[i].replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

// An entry is met by an exact path, by a directory it names (with or without the trailing slash), or by a glob.
function satisfied(entry, changed) {
  if (entry.includes('*')) {
    const re = globToRegex(entry);
    return changed.some((p) => re.test(p));
  }
  const dir = entry.endsWith('/') ? entry : `${entry}/`;
  return changed.some((p) => p === entry || p.startsWith(dir));
}

// Returns the entries no changed path satisfies, in the order the task lists them.
export function missingFiles(entries, changed) {
  return entries.filter((e) => !satisfied(e, changed));
}

const GAPS_HEAD = /^(#{1,6}\s*Known gaps\s*:?\s*|Known gaps\s*:)(.*)$/i;
const NONE = /^(none|n\/a|n|no|-)\.?$/i;

// The text under a "Known gaps" heading, up to the next heading. A report that only says none is no gap at all.
export function knownGaps(report) {
  const lines = String(report).split('\n');
  const start = lines.findIndex((l) => GAPS_HEAD.test(l.trim()));
  if (start < 0) return '';
  const first = GAPS_HEAD.exec(lines[start].trim())[2].trim();
  const body = [first];
  for (const l of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(l.trim())) break;
    body.push(l);
  }
  const text = body.join('\n').trim();
  return NONE.test(text.replace(/^[-*]\s*/, '').trim()) ? '' : text;
}

// Changes since the base commit, plus new files not yet added to git (a step may create files it never staged).
function changedPaths(base, repo) {
  const run = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', maxBuffer: 20e6 })
    .split('\n').map((p) => p.trim()).filter(Boolean);
  return [...new Set([...run('diff', '--name-only', base), ...run('ls-files', '--others', '--exclude-standard')])];
}

function main(args) {
  const [taskFile, base, repo = process.cwd()] = args;
  if (!taskFile || !base) { console.error(USAGE); return 2; }
  let entries, changed;
  try {
    entries = parseFiles(readFileSync(taskFile, 'utf8'));
    changed = changedPaths(base, repo);
  } catch (e) {
    console.error(`files check: ${e.message}`);
    return 2;
  }
  const missing = missingFiles(entries, changed);
  if (missing.length) { console.log(`files check: missing ${missing.join(', ')}`); return 1; }
  console.log(`files check: ok (${entries.length} listed)`);
  return 0;
}

// Runs as the CLI only when executed directly, so the tests can import the functions.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}

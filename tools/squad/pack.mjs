// Packs a review task file for --oneshot and --batch reviews (#169): those runs have no tools, so the file
// must carry the role's instructions, the brief, the answer format, the diff and the files that matter.
// node tools/squad/pack.mjs --role reviewer|security --issue <n> [--base origin/main] [--repo <path>] [--files a,b] [--paths a,b] [--brief <file>] [--max-kb 120]
// Prints the task on stdout. A warning on stderr says when the output was trimmed to fit --max-kb.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { argv, exit, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';
import { realRelIfAllowed } from './guard.mjs';

const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i > 0 ? argv[i + 1] : d; };
const USAGE = 'usage: node tools/squad/pack.mjs --role reviewer|security --issue <n> [--base origin/main] [--repo <path>] [--files a,b] [--paths a,b] [--brief <file>] [--max-kb 120]';
if (argv.includes('--help')) { stdout.write(`${USAGE}\n`); exit(0); }

const role = arg('role');
const issue = arg('issue');
// The issue goes into the title and the gh call: digits only, so nothing else can ride along (#169 review).
if (!['reviewer', 'security'].includes(role) || !/^\d+$/.test(String(issue ?? ''))) { stderr.write(`${USAGE}\n`); exit(1); }
const maxKb = Number(arg('max-kb', '120'));
if (!Number.isFinite(maxKb) || maxKb <= 0) { stderr.write(`${USAGE}\n`); exit(1); }
const REPO = resolve(arg('repo') ?? execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
// The repo's own settings: the base to diff against and the folders to review come from its squad.json (#265).
let config;
try { config = loadConfig(REPO); } catch (e) { stderr.write(`${e.message}\n`); exit(1); }
const base = arg('base', config.base);
// A base is a revision, never an option: one starting with '-' would be read by git as a flag.
if (String(base).startsWith('-')) { stderr.write(`base must be a revision, not an option: ${base}\n`); exit(1); }
// The base must name a commit in this repo; --verify --quiet makes a bad one a plain failure, not a git error text.
try {
  execFileSync('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`], { cwd: REPO, encoding: 'utf8', stdio: 'ignore' });
} catch {
  stderr.write(`base is not a commit: ${base}\n`);
  exit(1);
}

// Same idea as run.mjs: never hand over env files, keys, npm/ssh config, git internals or the user's tower folder.
const SECRET = /(^|\/)(\.env[^/]*|.*\.(key|pem|p12|pfx|crt)|id_rsa[^/]*|\.npmrc|\.git|node_modules|\.ssh|\.config\/flow-tower)(\/|$)/i;
const inRepo = (p) => {
  const abs = resolve(REPO, p);
  const rel = relative(REPO, abs);
  if (!rel || rel.startsWith('..') || SECRET.test(rel)) throw new Error(`path not allowed: ${p}`);
  // readFileSync follows symlinks: a link inside the repo must not lead to a file outside it (guard.mjs).
  if (realRelIfAllowed({ repo: REPO, abs, secret: SECRET, writable: /^/ }) === null) throw new Error(`path not allowed: ${p}`);
  return { abs, rel };
};

const FOCUS = {
  reviewer: [
    'Focus: correctness bugs, missed edge cases, races, behaviour that contradicts the brief,',
    'and files over ~400 lines. Do not comment on style.',
  ],
  security: [
    'Focus: who can mint or use a credential; header spoofing; path traversal and symlinks;',
    'secrets leaving the machine; one sender touching another\'s data; body and file-count DoS;',
    'tokens in logs; CSRF. Give a severity per finding (critical, high, medium, low).',
  ],
};
// The quote lets a script check each finding against the real file, so a line the model made up is caught.
const FORMAT = [
  'Answer with JSON only, no prose around it:',
  '{"verdict":"approve"|"changes","findings":[{'
    + (role === 'security' ? '"severity":"critical|high|medium|low", ' : '')
    + '"file":"path:line","quote":"...","what":"...","why":"...","fix":"..."}]}',
  'quote is the exact text of that line as shown in the diff or the files below, copied character by character, without the line number and without the leading + or - of a diff line. A finding whose quote is not at that line is dropped as unverified, so never paraphrase it and never cite a line you were not shown.',
];

const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', maxBuffer: 50e6 });

// The brief is --brief text, else the issue body; a failed gh call is said out loud, not hidden.
function brief() {
  const file = arg('brief');
  if (file) {
    if (!existsSync(file)) { stderr.write(`brief not found: ${file}\n`); exit(1); }
    return readFileSync(file, 'utf8').trim();
  }
  try {
    const j = JSON.parse(execFileSync('gh', ['issue', 'view', issue, '--json', 'title,body'], { cwd: REPO, encoding: 'utf8' }));
    return `${j.title}\n\n${j.body ?? ''}`.trim();
  } catch {
    return 'No brief was found (gh failed or is not logged in); the reviewer has only the diff and files below.';
  }
}

// cat -n style: right-aligned line number, a tab, then the line.
const numbered = (text) => text.replace(/\n$/, '').split('\n')
  .map((l, i) => `${String(i + 1).padStart(6)}\t${l}`).join('\n');

function fileBlocks(list) {
  return list.map((p) => {
    const { abs, rel } = inRepo(p);
    const body = readFileSync(abs, 'utf8');
    return `### ${rel}\n\n\`\`\`\n${numbered(body)}\n\`\`\`\n`;
  });
}

// The commit this task was packed from: the merge gate compares it with the pull request head, so a rerun of an
// old task after a new commit cannot pass as a fresh review of the new code (its output file is newer, its code is not).
// The diff is taken from the working tree, so a dirty tree would be reviewed under a commit that does not hold its edits:
// the Reviewed commit line is left out then, and the merge gate refuses a review that has no such line.
const dirty = git('status', '--porcelain', '--untracked-files=no').trim() !== '';
if (dirty) stderr.write('pack: uncommitted changes, so no Reviewed commit line (the merge gate will not accept this review)\n');
const reviewedLines = dirty ? [] : [`Reviewed commit: ${git('rev-parse', 'HEAD').trim()}`, ''];

const head = [
  `# ${issue} ${role} review`,
  '',
  ...reviewedLines,
  'Rules: read-only review. You have no tools; answer only from what follows. Do not invent files or lines that are not shown.',
  '',
  ...FOCUS[role],
  '',
  '## Brief',
  '',
  brief(),
  '',
  '## Answer format',
  '',
  ...FORMAT,
  '',
].join('\n');

// Tests are left out on purpose: they are large, so the diff covers the review folders only (config.review).
// --paths (#249) replaces those folders, so a change under examples/ can be reviewed too. Each path gets the same
// inRepo check as --files; a leading '-' is refused before it reaches git, where it would read as an option.
const pathsArg = argv.includes('--paths') ? arg('paths') : undefined;
if (argv.includes('--paths') && pathsArg === undefined) { stderr.write(`${USAGE}\n`); exit(1); }
const reviewPaths = pathsArg === undefined
  ? config.review
  : pathsArg.split(',').map((s) => s.trim()).filter(Boolean);
if (pathsArg !== undefined && reviewPaths.length === 0) { stderr.write(`${USAGE}\n`); exit(1); }
if (pathsArg !== undefined) {
  for (const p of reviewPaths) {
    if (p.startsWith('-')) { stderr.write(`path not allowed: ${p}\n`); exit(1); }
    try { inRepo(p); } catch { stderr.write(`path not allowed: ${p}\n`); exit(1); }
  }
}
// Paths were checked as written, so git must read them as written: --literal-pathspecs stops a glob or a magic
// prefix from widening the diff. The file list comes first so SECRET files can be dropped before the diff is built,
// since a folder in --paths or squad.json would otherwise pull a tracked key or env file into the task.
// -z keeps names raw (no C-quoting that would hide a '.pem' suffix), and -M with --name-status lists a rename as
// old + new, so both sides are checked: a key renamed to a plain name must not ride along under its new name.
const entries = [];
if (reviewPaths.length) {
  const tokens = git('--literal-pathspecs', 'diff', '-z', '-M', '--name-status', base, '--', ...reviewPaths).split('\0');
  for (let i = 0; i < tokens.length && tokens[i] !== ''; ) {
    const n = /^[RC]/.test(tokens[i]) ? 2 : 1;
    entries.push({ paths: tokens.slice(i + 1, i + 1 + n) });
    i += 1 + n;
  }
}
const kept = [];
for (const { paths } of entries) {
  if (paths.some((p) => SECRET.test(p))) {
    for (const p of paths) stderr.write(`left out of the diff: ${p}\n`);
    continue;
  }
  kept.push(...paths);
}
const diffRaw = kept.length ? git('--literal-pathspecs', 'diff', base, '--', ...kept) : '';
// (the -- above keeps the paths from being read as options; base was checked as a commit already)
const diffHead = '## Diff\n\nTests are not included (git diff '
  + `${base} -- ${reviewPaths.join(' ')}).\n\n\`\`\`diff\n`;
const diffTail = '\n```\n';

const files = arg('files') ? arg('files').split(',').map((s) => s.trim()).filter(Boolean) : [];
const fileSection = files.length
  ? `## Files\n\n${fileBlocks(files).join('\n')}`
  : '';

const limit = Math.floor(maxKb * 1024);
const bytes = (s) => Buffer.byteLength(s, 'utf8');
const fixed = bytes(head) + bytes(diffHead) + bytes(diffTail);

let out;
let warned = false;
const full = fixed + bytes(diffRaw) + bytes(fileSection);
if (full <= limit) {
  out = head + diffHead + diffRaw + diffTail + (fileSection ? `\n${fileSection}` : '');
} else {
  // Full files go first: the diff is what the reviewer must read; the files are context.
  warned = true;
  const withDiff = fixed + bytes(diffRaw);
  const dropped = fileSection ? '\n## Files\n\n[full files left out to fit --max-kb; read the diff]\n' : '';
  if (withDiff + bytes(dropped) <= limit) {
    out = head + diffHead + diffRaw + diffTail + dropped;
  } else {
    // Cut the diff at the byte budget; the marker says how much was left out.
    const budget = limit - fixed - bytes(`\n[… cut 999999 KB]\n`);
    let kept = diffRaw;
    while (bytes(kept) > budget && kept.length > 0) kept = kept.slice(0, Math.max(0, kept.length - Math.max(1, Math.ceil((bytes(kept) - budget) / 4))));
    const cutKb = Math.ceil((bytes(diffRaw) - bytes(kept)) / 1024);
    out = head + diffHead + kept + `\n[… cut ${cutKb} KB]\n` + diffTail;
  }
}

if (warned) stderr.write(`pack: output over ${maxKb} KB; trimmed to fit (see the markers in the task)\n`);
stdout.write(out);

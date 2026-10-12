// Packs a review task file for --oneshot and --batch reviews (#169): those runs have no tools, so the file
// must carry the role's instructions, the brief, the answer format, the diff and the files that matter.
// node tools/squad/pack.mjs --role reviewer|security --issue <n> [--base origin/main] [--repo <path>] [--files a,b] [--brief <file>] [--max-kb 120]
// Prints the task on stdout. A warning on stderr says when the output was trimmed to fit --max-kb.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { argv, exit, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i > 0 ? argv[i + 1] : d; };
const USAGE = 'usage: node tools/squad/pack.mjs --role reviewer|security --issue <n> [--base origin/main] [--repo <path>] [--files a,b] [--brief <file>] [--max-kb 120]';
if (argv.includes('--help')) { stdout.write(`${USAGE}\n`); exit(0); }

const role = arg('role');
const issue = arg('issue');
if (!['reviewer', 'security'].includes(role) || !issue) { stderr.write(`${USAGE}\n`); exit(1); }
const base = arg('base', 'origin/main');
const maxKb = Number(arg('max-kb', '120'));
if (!Number.isFinite(maxKb) || maxKb <= 0) { stderr.write(`${USAGE}\n`); exit(1); }
const REPO = resolve(arg('repo') ?? execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());

// Same idea as run.mjs: never hand over env files, keys, npm/ssh config, git internals or the user's tower folder.
const SECRET = /(^|\/)(\.env[^/]*|.*\.(key|pem|p12|pfx|crt)|id_rsa[^/]*|\.npmrc|\.git|node_modules|\.ssh|\.config\/flow-tower)(\/|$)/i;
const inRepo = (p) => {
  const abs = resolve(REPO, p);
  const rel = relative(REPO, abs);
  if (!rel || rel.startsWith('..') || SECRET.test(rel)) throw new Error(`path not allowed: ${p}`);
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
const FORMAT = [
  'Answer with JSON only, no prose around it:',
  '{"verdict":"approve"|"changes","findings":[{'
    + (role === 'security' ? '"severity":"critical|high|medium|low", ' : '')
    + '"file":"path:line","what":"...","why":"...","fix":"..."}]}',
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

const head = [
  `# ${issue} ${role} review`,
  '',
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

// Tests are left out on purpose: they are large and the review is of src, bin and tools.
const diffRaw = git('diff', base, '--', 'src', 'bin', 'tools');
const diffHead = '## Diff\n\nTests are not included (git diff '
  + `${base} -- src bin tools).\n\n\`\`\`diff\n`;
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

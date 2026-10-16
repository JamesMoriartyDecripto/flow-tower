/**
 * `flow-tower check-example <dir> [--json]` (#116): the pre-flight before proposing a tower to the library.
 * Exit 0 only when every check passes: validation (0 errors, 0 warnings), self-contained paths, a README.md
 * with a "Sources" heading, no personal data in any text file, and no huge or git-ignored file.
 * TypeScript, run with Node's type stripping like validate/token/copy (see bin/flow-tower.js).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { exit, argv } from 'node:process';
import { parseDocument } from 'yaml';
import { findTowerFiles, loadLibrary } from '../core/loader.ts';

interface Finding {
  rule: string;
  /** Path relative to the checked folder; '' for a whole-folder finding (validation). */
  file: string;
  /** 1-based; 0 for a finding that is not on a line. */
  line: number;
  /** The matched text (secrets masked), or a message for whole-file findings. */
  text: string;
}

const USAGE = 'usage: flow-tower check-example <dir> [--json]';
/** Big files are pasted data or a build artifact, never part of a hand-written tower. */
const MAX_BYTES = 1024 * 1024;

/** True when `path` is `root` itself or inside it. Prefix check, not a glob (same rule as copy.ts). */
const within = (root: string, path: string) => path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);
const toRel = (dir: string, file: string) => relative(dir, file).split(sep).join('/');

/** 1-based line of the first `needle` in `text`, or 0 when it is not there (whole-file findings). */
function lineOf(text: string, needle: string): number {
  const i = text.indexOf(needle);
  return i < 0 ? 0 : text.slice(0, i).split('\n').length;
}

/** Files under `dir`, relative paths, without node_modules and .git (regenerated, not content). */
function listFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

/**
 * The files git ignores inside `dir`, asked in one batch (`git check-ignore --stdin -z`). No git, or a
 * folder outside any repository: nothing is ignored, and the check simply passes.
 */
function ignoredFiles(dir: string, files: string[]): Set<string> {
  if (!files.length) return new Set();
  const r = spawnSync('git', ['-C', dir, 'check-ignore', '--stdin', '-z'], {
    input: files.map((f) => relative(dir, f)).join('\0') + '\0', encoding: 'utf8',
  });
  if (r.error || (r.status !== 0 && r.status !== 1)) return new Set(); // 1 = none ignored; other = not a repo
  return new Set((r.stdout ?? '').split('\0').filter(Boolean).map((p) => resolve(dir, p)));
}

/** A secret is never echoed in full, not even inside a finding: keep a short hint, hide the rest. */
const mask = (s: string) => `${s.slice(0, Math.min(4, s.length))}…${'*'.repeat(4)}`;

/** Secret shapes that must never reach a shared example. The one placeholder is excepted on purpose. */
const SECRET_SHAPES = [
  // The lookbehind keeps `ft_` from matching inside a word such as "draft_for_review".
  /(?<![A-Za-z0-9_])ft_[A-Za-z0-9_-]{20,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
];
const maskSecrets = (text: string) =>
  SECRET_SHAPES.reduce((t, re) => t.replace(re, (m) => (m.startsWith('ft_REPLACE_ME') ? m : mask(m))), text);

/**
 * Home folders of a person. Any name under them belongs to a machine, not to a shared example.
 * The lookbehind skips only a folder glued to a word, such as a URL segment (`garanteprivacy.it/home/...`),
 * where `/home/` is just a web path segment. A real home path may also follow `-` (a shell default,
 * `${VAR:-/home/x}`) or `.` and `/` (a traversal, `../../home/x`), so those must not exclude it.
 */
const HOME = /(?<![A-Za-z0-9_%~])(?:\/Users\/|\/home\/|C:\\Users\\)[A-Za-z0-9._-]+/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IPV4 = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g;
/** Loopback and the documentation ranges (RFC 5737): an example may name those on purpose. */
const IP_OK = /^(127\.0\.0\.1|0\.0\.0\.0|192\.0\.2\.\d{1,3}|198\.51\.100\.\d{1,3}|203\.0\.113\.\d{1,3})$/;
/**
 * An email on a reserved domain is a placeholder, not somebody's address. RFC 2606 reserves example.com,
 * example.org and example.net (and their subdomains) for documentation; RFC 6761 reserves the .example,
 * .test, .invalid and .localhost TLDs. The anchored pattern stops at the end of the domain, so a lookalike
 * such as example.com.evil.io or notexample.com is still flagged.
 */
const EMAIL_OK = /@(?:[a-z0-9-]+\.)*(?:example\.(?:com|org|net)|example|test|invalid|localhost)$/i;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whole-token match: a hostname inside a longer word is not what leaked. */
const tokenRe = (s: string) => new RegExp(`(?<![A-Za-z0-9_-])${escapeRe(s)}(?![A-Za-z0-9_-])`, 'g');

/** The personal-data scan of one text file: every rule that can fire on a line. */
function scanText(rel: string, text: string, identities: [string, RegExp][]): Finding[] {
  const found: Finding[] = [];
  const add = (rule: string, line: number, raw: string) =>
    found.push({ rule, file: rel, line, text: maskSecrets(raw.trim()).slice(0, 200) });

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    for (const m of raw.matchAll(HOME)) add('home-path', line, m[0]);
    for (const m of raw.matchAll(EMAIL)) if (!EMAIL_OK.test(m[0])) add('email', line, m[0]);
    for (const m of raw.matchAll(IPV4)) {
      const octets = m.slice(1).map(Number);
      // An out-of-range "1.2.3.4.5" style number is a version string, not an address.
      if (octets.every((o) => o <= 255) && !IP_OK.test(m[0])) add('ipv4', line, m[0]);
    }
    for (const re of SECRET_SHAPES) for (const m of raw.matchAll(re)) {
      if (!m[0].startsWith('ft_REPLACE_ME')) add('secret', line, m[0]);
    }
    for (const [rule, re] of identities) for (const m of raw.matchAll(re)) add(rule, line, m[0]);
  });
  return found;
}

/** Every path a tower definition points at, relative to `root`: what must live inside the folder. */
function refsOf(def: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => { if (typeof v === 'string') out.push(v); };
  for (const p of Object.values((def.prompts as Record<string, { file?: string }>) ?? {})) push(p?.file);
  for (const a of Object.values((def.agents as Record<string, { from?: string; tower?: string; files?: string[]; resources?: { path?: string }[] }>) ?? {})) {
    push(a?.from); push(a?.tower);
    for (const f of a?.files ?? []) push(f);
    for (const r of a?.resources ?? []) push(r?.path);
  }
  for (const l of (def.layers as { nodes?: { tower?: string; files?: string[]; resources?: { path?: string }[] }[] }[]) ?? []) {
    for (const n of l?.nodes ?? []) {
      push(n?.tower);
      for (const f of n?.files ?? []) push(f);
      for (const r of n?.resources ?? []) push(r?.path);
    }
  }
  return out;
}

if (argv.includes('--help')) {
  console.log(USAGE);
  exit(0);
}
const args = argv.slice(2).filter((a) => a !== '--json');
const json = argv.includes('--json');
if (args.length !== 1) {
  console.error(USAGE);
  exit(2);
}
const dir = resolve(args[0]);
if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`not a folder: ${args[0]}`);
  exit(2);
}

const findings: Finding[] = [];
const towers = findTowerFiles([dir]);

// Check 1 (validate: no error, no warning) and check 2 (self-contained) both read the same tower files.
if (!towers.length) {
  findings.push({ rule: 'validate', file: '', line: 0, text: 'no *.tower.yaml found in this folder' });
} else {
  // The same loader the app and `flow-tower validate` use: one code path, one set of issues.
  const { workspace } = await loadLibrary([dir]);
  for (const t of Object.values(workspace.towers)) for (const i of t.issues) {
    if (i.level === 'error') findings.push({ rule: 'validate-error', file: '', line: 0, text: `${i.path ? `${i.path}: ` : ''}${i.message}` });
    if (i.level === 'warning') findings.push({ rule: 'validate-warning', file: '', line: 0, text: `${i.path ? `${i.path}: ` : ''}${i.message}` });
  }

  for (const file of towers) {
    const rel = toRel(dir, file);
    const raw = readFileSync(file, 'utf8');
    let def: Record<string, unknown> | undefined;
    try { def = parseDocument(raw).toJS() as Record<string, unknown>; } catch { def = undefined; }
    if (!def) continue; // unparsable: validate already said why
    const root = typeof def.root === 'string' ? def.root : '.';
    if (!within(dir, resolve(dirname(file), root))) {
      findings.push({ rule: 'outside-root', file: rel, line: lineOf(raw, root), text: `root: ${root}` });
    }
    // A reference may be missing (a warning the author can accept); it may never point outside the folder.
    for (const ref of refsOf(def)) {
      if (!within(dir, resolve(dirname(file), root, ref))) {
        findings.push({ rule: 'outside-file', file: rel, line: lineOf(raw, ref), text: ref });
      }
    }
  }
}

// Check 3: the README is what a reader lands on, and its "Sources" heading is what they can verify.
const readme = join(dir, 'README.md');
if (!existsSync(readme)) {
  findings.push({ rule: 'readme-missing', file: 'README.md', line: 0, text: 'README.md is missing' });
} else if (!/^#{1,6}\s+Sources\b/im.test(readFileSync(readme, 'utf8'))) {
  findings.push({ rule: 'readme-sources', file: 'README.md', line: 0, text: 'README.md has no "Sources" heading' });
}

// Checks 4 and 5: walk every file once, for the personal-data scan, the size limit and the ignore list.
const rels = listFiles(dir);
const ignored = ignoredFiles(dir, rels.map((r) => join(dir, r)));
const identities: [string, RegExp][] = [];
// Short names ("dev", "box") match too much to be evidence of anything: ignore them.
const machine = hostname();
const user = userInfo().username;
if (machine.length > 3) identities.push(['hostname', tokenRe(machine)]);
if (user.length > 3) identities.push(['username', tokenRe(user)]);

for (const rel of rels) {
  const abs = join(dir, rel);
  if (ignored.has(abs)) findings.push({ rule: 'git-ignored', file: rel, line: 0, text: 'file is git-ignored' });
  const buf = readFileSync(abs);
  if (buf.length > MAX_BYTES) {
    findings.push({ rule: 'large-file', file: rel, line: 0, text: `${buf.length} bytes (max ${MAX_BYTES})` });
    continue; // no text scan of a file that should not be here at all
  }
  if (buf.includes(0)) continue; // binary: nothing to read
  findings.push(...scanText(rel, buf.toString('utf8'), identities));
}

const ok = findings.length === 0;
if (json) {
  console.log(JSON.stringify({ ok, findings }, null, 2));
} else if (ok) {
  console.log(`✓ ${dir}: all checks passed`);
} else {
  console.log(`✗ ${dir}: ${findings.length} finding(s)`);
  for (const f of findings) console.log(`  ${f.file ? `${f.file}${f.line ? `:${f.line}` : ''}` : '-'}  ${f.rule}  ${f.text}`);
}
exit(ok ? 0 : 1);

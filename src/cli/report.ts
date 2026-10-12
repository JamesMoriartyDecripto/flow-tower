/**
 * `flow-tower report <type> <input.yaml|json> [--source file]... [--drafts drafts.json] [--out file.pdf] [--html file.html] [--list]`
 *
 * Builds a report from the input file (S1) and any --source files, renders it, and runs the blocking checks
 * (src/report/checks.ts). Only when every blocking check passes are the HTML and the PDF written: a refused
 * report leaves no file behind. No flow-tower server is needed: the HTML is self-contained, so Chromium only prints it.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parse as parseYaml } from 'yaml';
import { checkReport, failed } from '../report/checks.ts';
import { renderReport } from '../report/html.ts';
import type { ReportDoc, Section, Source } from '../report/model.ts';
import { asObject, optStringList, reqString } from '../report/types/input.ts';
import { REPORT_TYPES, type ReportType } from '../report/types/index.ts';

const USAGE = 'usage: flow-tower report <type> <input.yaml|json> [--source file]... [--drafts drafts.json] [--out file.pdf] [--html file.html] [--list]';
const INSTALL_HINT = 'install a browser: npx playwright install chromium';
const PAGE_TIMEOUT_MS = 120_000;
const DEFAULT_LEVEL = 2;
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The file-name slug, as export.ts makes it: lower case, dashes for every other run of characters. */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'report';

interface Draft { section: string; text: string; cites: string[] }

/** Exit 2 with the usage line: the arguments themselves are wrong, so nothing was built. */
function usage(message: string): never {
  console.error(message);
  console.error(USAGE);
  exit(2);
}

function parseCli(args: string[]) {
  // Node's parser throws on an unknown option, which is a usage error (exit 2) for the caller.
  return parseArgs({
    args,
    allowPositionals: true,
    options: {
      source: { type: 'string', multiple: true },
      drafts: { type: 'string' },
      out: { type: 'string' },
      html: { type: 'string' },
      level: { type: 'string' },
      list: { type: 'boolean', default: false },
    },
  });
}

/** The input file as data: JSON by extension, YAML otherwise (JSON is valid YAML, so either parses). */
function readInput(file: string): unknown {
  const text = readFileSync(file, 'utf8');
  return extname(file).toLowerCase() === '.json' ? JSON.parse(text) : parseYaml(text);
}

/**
 * A source is named by its file: the sha256 of the bytes says which version a number came from, and the path
 * is relative to the cwd so the appendix reads the same on every machine the report is shared with.
 */
function sourceOf(file: string, id: string): Source {
  const abs = resolve(file);
  return {
    id,
    label: basename(abs),
    path: relative(process.cwd(), abs),
    sha256: createHash('sha256').update(readFileSync(abs)).digest('hex'),
  };
}

function parseDrafts(raw: unknown, file: string): Draft[] {
  if (!Array.isArray(raw)) throw new Error(`${file}: must be a list`);
  return raw.map((item, i) => {
    const where = `${file}[${i}]`;
    const obj = asObject(item, where);
    const cites = optStringList(obj, 'cites', where);
    // The renderer refuses a draft with no cite; saying so here names the draft instead of a render error.
    if (cites.length === 0) throw new Error(`${where}.cites: a draft must cite at least one source`);
    return { section: reqString(obj, 'section', where), text: reqString(obj, 'text', where), cites };
  });
}

/** The section with this id, searched through the nested tree in document order. */
function findSection(sections: readonly Section[], id: string): Section | undefined {
  for (const s of sections) {
    if (s.id === id) return s;
    const inner = findSection(s.sections ?? [], id);
    if (inner) return inner;
  }
  return undefined;
}

/**
 * Each draft becomes a `draft` text block at the end of its section. The origin marks it as a model's prose,
 * so the checks (digits, cites) and the reader both see it as a draft.
 */
function applyDrafts(doc: ReportDoc, drafts: Draft[]): void {
  drafts.forEach((d, i) => {
    const section = findSection(doc.sections, d.section);
    if (!section) throw new Error(`drafts[${i}]: unknown section "${d.section}"`);
    section.blocks.push({ kind: 'text', text: d.text, origin: 'draft', cites: d.cites });
  });
}

/** Chromium prints the page. The bundled build first, then the installed Chrome; null when neither starts. */
async function launchBrowser() {
  const { chromium } = await import('@playwright/test');
  try {
    return await chromium.launch();
  } catch {
    try {
      return await chromium.launch({ channel: 'chrome' });
    } catch {
      return null;
    }
  }
}

/**
 * The PDF bytes of a rendered report. `setContent` loads the page as is; the ready flag is the renderer's own
 * marker, so a page that did not finish is not printed half-made.
 */
async function printPdf(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  if (!browser) throw new Error(INSTALL_HINT);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForSelector('body[data-rs-ready="1"]', { timeout: PAGE_TIMEOUT_MS });
    return await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
  } finally {
    await browser.close();
  }
}

function printTypes(): void {
  for (const t of REPORT_TYPES) {
    const required = t.delegate ? '(checked by flow-tower export)' : t.required.join(', ');
    console.log(`${t.id}  ${t.title}\n  required sections: ${required}`);
  }
}

/**
 * A delegated type is rendered by `flow-tower export` in the app, so this runs that same command with the same
 * Node. The export owns the output files and its own exit code, which this passes through unchanged.
 */
function runExport(type: ReportType, positionals: string[], values: ReturnType<typeof parseCli>['values']): number {
  if (values.html !== undefined || values.drafts !== undefined) {
    console.error(`${type.id} is rendered by flow-tower export: --html and --drafts do not apply; use --out for the PDF`);
    return 2;
  }
  const level = values.level ?? String(DEFAULT_LEVEL);
  if (!/^[1-4]$/.test(level)) {
    console.error(`--level must be 1, 2, 3 or 4 (got "${level}")`);
    return 2;
  }
  const args = ['export', positionals[1], '--pdf', '--level', level];
  if (values.out !== undefined) args.push('--out', values.out);
  const r = spawnSync(process.execPath, [join(pkgRoot, 'bin', 'flow-tower.js'), ...args], { stdio: 'inherit' });
  // A child killed by a signal has no status; that is a failure, never a silent success.
  return r.status ?? 1;
}

/** Builds the document, checks it, and writes the requested files. Returns the exit code. */
async function run(type: ReportType, positionals: string[], values: ReturnType<typeof parseCli>['values']): Promise<number> {
  const input = resolve(positionals[1]);
  if (!existsSync(input)) { console.error(`not found: ${input}`); return 1; }
  const sources = [input, ...(values.source ?? [])].map((file, i) => sourceOf(file, `S${i + 1}`));
  if (!type.build) throw new Error(`report type "${type.id}" has no builder`);
  const doc = type.build(readInput(input), sources);
  if (values.drafts !== undefined) {
    applyDrafts(doc, parseDrafts(JSON.parse(readFileSync(values.drafts, 'utf8')), values.drafts));
  }
  // The renderer throws on a cite that names no source; that is a bad input, reported as such.
  const html = renderReport(doc);
  const checks = checkReport(doc, html, { sections: type.required });
  const bad = failed(checks);
  if (bad.length) {
    console.error(`report refused: ${bad.length} of ${checks.length} checks failed; no file written`);
    for (const c of bad) console.error(`  ✗ ${c.id}: ${c.detail}`);
    return 1;
  }
  for (const w of checks.filter((c) => c.level === 'warn' && c.detail)) console.warn(`warning: ${w.detail}`);

  // With --html alone the PDF is skipped, so a browser is needed only when a PDF is asked for.
  const pdfPath = values.out ?? (values.html === undefined ? `${slug(doc.title)}.pdf` : undefined);
  const pdf = pdfPath === undefined ? undefined : await printPdf(html);
  if (pdf !== undefined && (pdf.length === 0 || pdf.subarray(0, 4).toString('latin1') !== '%PDF')) {
    console.error('report refused: the printed file is not a PDF; no file written');
    return 1;
  }
  if (values.html !== undefined) {
    writeFileSync(values.html, html);
    console.log(`wrote ${resolve(values.html)}`);
  }
  if (pdf !== undefined && pdfPath !== undefined) {
    writeFileSync(resolve(pdfPath), pdf);
    console.log(`wrote ${resolve(pdfPath)}: ${(pdf.length / 1024).toFixed(0)} KB`);
  }
  console.log(`checks: ${checks.filter((c) => c.ok).length}/${checks.length} passed`);
  return 0;
}

export async function main(args = argv.slice(2)): Promise<void> {
  let parsed: ReturnType<typeof parseCli>;
  try { parsed = parseCli(args); } catch (err) { usage((err as Error).message); }
  const { values, positionals } = parsed;
  if (values.list) { printTypes(); exit(0); }
  if (positionals.length !== 2) usage('report needs a type and one input file');
  const type = REPORT_TYPES.find((t) => t.id === positionals[0]);
  if (!type) usage(`unknown report type "${positionals[0]}"; known: ${REPORT_TYPES.map((t) => t.id).join(', ')}`);
  if (type.delegate === 'export') {
    if (positionals.length !== 2) usage('report needs a type and one input file');
    exit(runExport(type, positionals, values));
  }
  try {
    exit(await run(type, positionals, values));
  } catch (err) {
    console.error(`report failed: ${(err as Error).message}`);
    exit(1);
  }
}

if (import.meta.url === `file://${argv[1]}`) void main();

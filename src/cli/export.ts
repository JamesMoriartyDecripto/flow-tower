/**
 * `flow-tower export <tower file | dir> --pdf [--level 1|2|3] [--out <file.pdf>] [--port N]`
 *
 * Starts a flow-tower server for the path, prints the document view in headless Chromium, runs the blocking
 * checks (src/core/doc-check.ts) and writes the PDF only when every check passes. Any failure prints every
 * failed check and exits 1 with no file written. The server is stopped on every exit, Ctrl-C included.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { argv, env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { checkDocument, coverage, failedChecks, type DomFacts, type WorkspaceFacts } from '../core/doc-check.ts';
import { towerDoc } from '../core/doc.ts';
import { fileKey } from '../core/docFiles.ts';
import { libraryDoc, libraryProjects } from '../core/docLibrary.ts';
import { loadLibrary } from '../core/loader.ts';

/** The file-name slug; the app's own copy lives in exportSvg.ts, which Node cannot load here (extensionless imports). */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tower';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGE_TIMEOUT_MS = 120_000;
const INSTALL_HINT = 'install a browser: npx playwright install chromium';

/** Level 4 is the library: it needs a directory, since one file is one tower and not a library. */
interface Options { target: string; level: 1 | 2 | 3 | 4; out?: string; port?: number }

/** The page text, asked for in one round trip so the checks see one consistent snapshot. */
const PAGE_FACTS = `(() => {
  const main = document.querySelector('main');
  const text = (el) => (el ? el.textContent : '') ?? '';
  const layerTitles = [...document.querySelectorAll('main h3[id]')].map((h) => text(h).replace(/^L\\d+\\s*/, '').trim());
  const nodeLabels = [...document.querySelectorAll('main td.name')].map((td) => text(td).trim());
  const detailLabels = [...document.querySelectorAll('main .details h4')].map((el) => text(el).trim());
  const control = {};
  for (const row of document.querySelectorAll('main .control tr')) {
    const k = text(row.querySelector('th')).trim();
    const v = Number(text(row.querySelector('td')).trim());
    if (k === 'Layers') control.layers = v;
    if (k === 'Nodes') control.nodes = v;
    if (k === 'Sub-towers') control.subTowers = v;
  }
  // The tower id each chapter prints (data-tower), not its anchor: the check compares tower ids with tower ids.
  const chapters = [...document.querySelectorAll('main article.chapter[data-tower]')].map((a) => a.getAttribute('data-tower') || '');
  const appendix = [...document.querySelectorAll('main .file-entry')].map((el) => ({
    key: el.dataset.fileKey ?? '',
    printed: el.dataset.printed === '1',
  }));
  return {
    docError: document.documentElement.dataset.docError,
    buildingText: document.body.innerText.includes('Building the document'),
    mainText: main ? main.innerText : '',
    layerTitles,
    nodeLabels: [...nodeLabels, ...detailLabels],
    hrefs: [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href')),
    ids: [...document.querySelectorAll('[id]')].map((el) => el.id),
    control,
    chapters,
    appendix,
  };
})()`;

/** A free loopback port: the OS picks one, we read it back and release it for the server. */
function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', fail);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => ok(port));
    });
  });
}

/** Polls the server until its workspace answers, or the deadline passes. */
async function waitForServer(base: string, timeoutMs: number, signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !signal.aborted) {
    try {
      const res = await fetch(`${base}/api/workspace`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`the server did not answer at ${base} within ${timeoutMs / 1000} s`);
}

/** Starts `bin/flow-tower.js <path> --no-open --port <p>` with a throwaway user folder. */
function startServer(target: string, port: number, home: string): ChildProcess {
  return spawn(process.execPath, [join(pkgRoot, 'bin', 'flow-tower.js'), target, '--no-open', '--port', String(port)], {
    env: { ...env, FLOW_TOWER_NO_UPDATE_CHECK: '1', FLOW_TOWER_HOME: home },
    stdio: 'ignore',
  });
}

/** Launches Chromium; if the bundled one is missing, the installed Chrome. Null when neither starts. */
async function launchBrowser() {
  const { chromium } = await import('@playwright/test');
  // Software WebGL (SwiftShader): the 3D figures render on servers without a GPU, where the default GL is missing.
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  try {
    return await chromium.launch({ args });
  } catch {
    try {
      return await chromium.launch({ channel: 'chrome', args });
    } catch {
      return null;
    }
  }
}

/** The tower the document prints: the first project, which is the root tower the server lists first. */
async function towerIdFor(target: string): Promise<string> {
  const { workspace } = await loadLibrary([target]);
  const id = workspace.projects[0];
  if (!id) throw new Error(`no tower found in ${target}`);
  return id;
}

/** Counts the page objects of a PDF file (`/Type /Page`, not `/Type /Pages`). */
function pageCount(bytes: Buffer): number {
  return [...bytes.toString('latin1').matchAll(/\/Type\s*\/Page[^s]/g)].length;
}

/**
 * The workspace facts the checks compare the page with, from the same document the view prints. A library
 * (level 4) is checked project by project: each project's chapters, and the cover counts over all of them.
 */
async function workspaceFacts(target: string, towerId: string, level: 1 | 2 | 3 | 4): Promise<WorkspaceFacts> {
  const { workspace } = await loadLibrary([target]);
  const doc = level === 4
    ? libraryDoc(workspace, libraryProjects(workspace))
    : towerDoc(workspace, towerId, level);
  // Every printed tower, once each: a library lists the towers of every project.
  const towers = [...new Set(doc.chapters.map((c) => c.towerId))];
  return {
    towerId: level === 4 ? 'library' : towerId,
    chapters: doc.chapters.map((c) => ({
      towerId: c.towerId,
      layerTitles: c.layers.map((l) => l.title),
      nodeLabels: c.layers.flatMap((l) => l.nodes.map((n) => n.label)),
    })),
    counts: { layers: doc.control.layers, nodes: doc.control.nodes, subTowers: doc.control.subTowers },
    files: (doc.files ?? []).map((f) => fileKey(f)),
    towers,
  };
}

function parseArgs(args: string[]): Options {
  const opts: Options = { target: '', level: 2 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i];
    if (a === '--level') opts.level = Number(next()) as Options['level'];
    else if (a === '--out') opts.out = next();
    else if (a === '--port') opts.port = Number(next());
    else if (a === '--pdf') continue;
    else if (!opts.target) opts.target = a;
    else throw new Error(`unexpected argument: ${a}`);
  }
  if (!opts.target) throw new Error('usage: flow-tower export <tower file | dir> --pdf [--level 1|2|3|4] [--out <file.pdf>] [--port N]');
  if (![1, 2, 3, 4].includes(opts.level)) throw new Error('--level must be 1, 2, 3 or 4');
  return opts;
}

/** One export run: returns the exit code. The server and browser are always closed, even on error. */
async function run(opts: Options, signal: AbortSignal): Promise<number> {
  const target = resolve(opts.target);
  if (!existsSync(target)) { console.error(`not found: ${target}`); return 1; }
  const home = mkdtempSync(join(tmpdir(), 'flow-tower-export-'));
  const port = opts.port ?? await freePort();
  const base = `http://127.0.0.1:${port}`;
  const server = startServer(target, port, home);
  const browser = await launchBrowser();
  try {
    if (!browser) { console.error(INSTALL_HINT); return 1; }
    await waitForServer(base, PAGE_TIMEOUT_MS, signal);
    const towerId = await towerIdFor(target);
    const page = await browser.newPage();
    // A library is addressed as `doc=library`: the page builds every project, so the URL names no single tower.
    const doc = opts.level === 4 ? 'library' : towerId;
    await page.goto(`${base}/?doc=${encodeURIComponent(doc)}&level=${opts.level}`);
    await page.waitForSelector('html[data-doc-ready="1"], html[data-doc-error]', { timeout: PAGE_TIMEOUT_MS });
    if (signal.aborted) return 130;
    const dom = await page.evaluate(PAGE_FACTS) as DomFacts;
    // A missing 3D figure is a warning, not a failed check: its placeholder already says so on the page.
    const snaps = await page.evaluate(() => ({ total: document.querySelectorAll('figure.snap-figure').length, ok: document.querySelectorAll('figure.snap-figure img').length }));
    console.log(`3D snapshots: ${snaps.ok}/${snaps.total}`);
    if (snaps.ok < snaps.total) console.warn(`warning: ${snaps.total - snaps.ok} 3D view(s) unavailable: see the placeholder in the document`);
    const facts = await workspaceFacts(target, towerId, opts.level);
    await page.emulateMedia({ media: 'print' });

    // The PDF is written to a temp file first: only a file that passes every check reaches the final name.
    const out = resolve(opts.out ?? `${slug(towerId.split('/').pop()!.replace(/\.tower\.yaml$/, ''))}-level${opts.level}.pdf`);
    const tmp = join(home, 'document.pdf');
    await page.pdf({ path: tmp, preferCSSPageSize: true, printBackground: true, outline: true, tagged: true });
    const bytes = readFileSync(tmp);
    const results = checkDocument(dom, { ...facts, pdfPages: pageCount(bytes) });
    const failed = failedChecks(results);
    if (failed.length) {
      console.error(`export refused: ${failed.length} of ${results.length} checks failed; no file written`);
      for (const f of failed) console.error(`  ✗ ${f.name}: ${f.detail}`);
      return 1;
    }
    writeFileSync(out, bytes);
    const kb = (statSync(out).size / 1024).toFixed(0);
    const cov = coverage(dom, facts);
    console.log(`towers ${cov.towers[0]}/${cov.towers[1]}, files ${cov.files[0]}/${cov.files[1]}`);
    console.log(`wrote ${out}: ${pageCount(bytes)} pages, ${kb} KB, 3D snapshots: ${snaps.ok}/${snaps.total}, checks: ${results.length}/${results.length} passed`);
    return 0;
  } finally {
    await browser?.close();
    server.kill();
    rmSync(home, { recursive: true, force: true });
  }
}

/** The entry point: the parsed arguments, the run, and a Ctrl-C that stops the server before exiting. */
export async function main(args = argv.slice(2)): Promise<void> {
  let opts: Options;
  try { opts = parseArgs(args); } catch (err) { console.error((err as Error).message); exit(1); }
  // Ctrl-C aborts the run: its finally closes the browser and kills the server before the process exits.
  const ctrl = new AbortController();
  process.on('SIGINT', () => ctrl.abort());
  try {
    const code = await run(opts, ctrl.signal);
    exit(ctrl.signal.aborted ? 130 : code);
  } catch (err) {
    console.error(`export failed: ${(err as Error).message}`);
    exit(1);
  }
}

if (import.meta.url === `file://${argv[1]}`) void main();

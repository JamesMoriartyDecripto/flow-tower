// The drives of verify.mjs: open, events and validate run against an instance that verify.mjs launched (#448).
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

/**
 * The parsed /api/workspace body when it has the shape the drives read; null otherwise. Checking the shape here
 * keeps a 200 with some other JSON from throwing a TypeError inside a drive.
 */
export async function workspaceOf(url, timeoutMs) {
  try {
    const res = await fetch(`${url}/api/workspace`, { signal: AbortSignal.timeout(timeoutMs) });
    if (res.status !== 200) return null;
    const body = await res.json();
    if (Array.isArray(body?.projects) && body.towers && typeof body.towers === 'object') return body;
  } catch { /* refused, timed out or not JSON: null */ }
  return null;
}

const NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * --name becomes a file name inside the run's evidence folder, so a value with a slash or a bare dot segment
 * would write outside it. Refused before any drive reads, fetches or writes.
 */
function badName(args) {
  if (args.name === undefined || (NAME_PATTERN.test(args.name) && args.name !== '.' && args.name !== '..')) return false;
  console.log('FAIL --name takes letters, digits, dot, dash and underscore');
  return true;
}

function resolveProject(ids, prefix) {
  return ids.find((id) => id.startsWith(prefix));
}

function evidenceOf(run) {
  mkdirSync(run.evidence, { recursive: true });
  return run.evidence;
}

/** Writes one evidence file and prints its path, so the record of a drive is easy to find. */
function writeEvidence(dir, file, content) {
  const path = join(dir, file);
  writeFileSync(path, content);
  console.log(`wrote ${path}`);
}

/** The store fields a drive records, read through the dev hook as e2e/fixtures.ts does. */
function readState(page) {
  return page.evaluate(() => {
    const s = window.__flowTower.store.getState();
    return { stack: s.stack, library: s.library, selected: s.selected, focusedLayer: s.focusedLayer, view: s.view };
  });
}

/** Opens a project the way a user does: the library card, then the tower on screen with a real canvas. */
async function openAsUser(page, url, id) {
  await page.goto(`${url}/?quality=eco`);
  await page.locator(`[data-card="${id}"]`).click();
  // The app loads by dynamic import, so the hook can appear after goto: one predicate waits for it and the tower.
  await page.waitForFunction((pid) => {
    if (!('__flowTower' in window)) return false;
    const r = document.querySelector('canvas')?.getBoundingClientRect();
    return window.__flowTower.store.getState().stack[0] === pid && !!r && r.width > 100 && r.height > 100;
  }, id, { timeout: 30_000 });
}

/**
 * Runs one drive in a fresh browser. A failed expectation prints FAIL and is reported back,
 * so the caller still writes the evidence it has.
 */
async function inBrowser(shot, fn) {
  // Loaded here, not at the top: launch, doctor and stop never need Playwright.
  const { chromium } = await import('@playwright/test');
  // Playwright's bundled Chromium does not run on macOS 13, so the installed Chrome is used, as in playwright.config.ts.
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const consoleErrors = [];
  let error;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    try {
      await fn(page);
    } catch (e) {
      // The whole message goes to evidence: Playwright's call log says why a step waited (#448).
      error = String(e.message);
      console.log(`FAIL ${error.split('\n')[0]}`);
    }
    await page.screenshot({ path: shot });
    console.log(`wrote ${shot}`);
  } finally {
    await browser.close();
  }
  return { error, consoleErrors };
}

/**
 * Shared by open and events: resolves the project in the live workspace, runs fn in one fresh browser on it,
 * and writes the evidence pair. fn fills recordSoFar as it goes, so a drive that fails midway keeps what it recorded.
 */
async function drive(args, found, defaultLabel, fn) {
  if (!found) return 1;
  const { run } = found;
  const ws = await workspaceOf(run.url, 5000);
  if (!ws) {
    console.log(`FAIL no instance answers at ${run.url}: run doctor, then launch`);
    return 1;
  }
  const id = resolveProject(ws.projects, args.target);
  if (!id) {
    console.log(`FAIL no project matches ${args.target}; first 5: ${ws.projects.slice(0, 5).join(', ')}`);
    return 1;
  }
  const label = args.name ?? defaultLabel;
  const evidence = evidenceOf(run);
  const recordSoFar = { project: id };
  const { error, consoleErrors } = await inBrowser(join(evidence, `${label}.png`), (page) => fn(page, { run, id, ws }, recordSoFar));
  const failed = error !== undefined;
  writeEvidence(evidence, `${label}.json`, JSON.stringify({ ...recordSoFar, consoleErrors, ...(failed && { error }) }, null, 2) + '\n');
  return failed ? 1 : 0;
}

export function openDrive(args, found) {
  if (badName(args)) return 1;
  if (!args.target) {
    console.log('FAIL open needs a project');
    return 1;
  }
  return drive(args, found, 'open', async (page, { run, id }, recordSoFar) => {
    recordSoFar.url = `${run.url}/?quality=eco`;
    recordSoFar.steps = [];
    await openAsUser(page, run.url, id);
    recordSoFar.steps.push({ action: 'open', state: await readState(page) });
    for (const key of args.keys) {
      await page.keyboard.press(key);
      await page.waitForTimeout(400);
      recordSoFar.steps.push({ action: key, state: await readState(page) });
    }
  });
}

/**
 * Posts one event as a Claude Code hook does. Claude Code reads a JSON body from a hook as a decision,
 * so the endpoint must answer 204 with no body; the drive checks both.
 */
async function postEvent(url, body) {
  const res = await fetch(`${url}/api/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const text = await res.text();
  return { status: res.status, bodyLength: text.length };
}

export function eventsDrive(args, found) {
  if (badName(args)) return 1;
  if (!args.node) {
    console.log('FAIL events needs --node <layer.node>');
    return 1;
  }
  if (!args.target) {
    console.log('FAIL events needs a project');
    return 1;
  }
  return drive(args, found, 'events', async (page, { run, id, ws }, recordSoFar) => {
    // A project the workspace has no tower for would otherwise throw a TypeError on the read below.
    const entry = ws.towers[id];
    if (!entry) throw new Error(`the workspace has no tower for ${id}`);
    const tower = entry.id;
    const tag = `verify-${Date.now()}`;
    const bodies = [
      { kind: 'tool.start', source: tag, node: args.node, tower, message: `${tag} start`, call: tag },
      { kind: 'tool.end', source: tag, node: args.node, tower, status: 'error', message: `${tag} error`, call: tag },
      { kind: 'tool.start', source: tag, agent: 'nobody-matches-this', message: `${tag} unmapped` },
    ];
    Object.assign(recordSoFar, { node: args.node, posts: [], feedRows: undefined, selected: undefined });
    await openAsUser(page, run.url, id);
    await page.keyboard.press('f');
    await page.locator('.livefeed').waitFor({ timeout: 15_000 });
    recordSoFar.posts = await Promise.all(bodies.map((b) => postEvent(run.url, b)));
    const bad = recordSoFar.posts.filter((p) => p.status !== 204 || p.bodyLength !== 0);
    if (bad.length) throw new Error(`events answered ${JSON.stringify(bad)}, expected 204 with no body`);
    // The row arrives after the server has the event: wait for the error row, then click it as a user does.
    await page.locator('.feed-row', { hasText: `${tag} error` }).first().click({ timeout: 15_000 });
    await page.waitForFunction((n) => window.__flowTower.store.getState().selected === n, args.node, { timeout: 15_000 });
    recordSoFar.feedRows = await page.locator('.feed-row').count();
    recordSoFar.selected = (await readState(page)).selected;
  });
}

/** Runs the CLI validate on a path and keeps its output. Needs the run folder for evidence, not a server. */
export function validateDrive(args, found, root) {
  if (badName(args)) return 1;
  if (!args.target) {
    console.log('FAIL validate needs a path');
    return 1;
  }
  if (!found) return 1;
  const argv = ['bin/flow-tower.js', 'validate', resolve(args.target), '--json'];
  const r = spawnSync(process.execPath, argv, { cwd: root, encoding: 'utf8', timeout: 60_000 });
  const exit = r.status ?? 1;
  const error = exit !== 0 ? `validate exited ${exit}` : undefined;
  writeEvidence(evidenceOf(found.run), `${args.name ?? 'validate'}.json`, JSON.stringify({ command: `node ${argv.join(' ')}`, exit, stdout: r.stdout, stderr: r.stderr, ...(error && { error }) }, null, 2) + '\n');
  if (error) console.log(`FAIL ${error}`);
  return exit;
}

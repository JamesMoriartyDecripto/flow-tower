// The drives of verify.mjs: open, events and validate run against an instance that verify.mjs launched (#448).
// Loaded by dynamic import only for those commands, so launch, doctor and stop never pull in Playwright.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

/**
 * The workspace as the running server reports it. A stopped or wrong server gets one FAIL line and null,
 * not a stack trace, so the drive exits 1 before a browser starts.
 */
async function workspaceOf(url) {
  try {
    const res = await fetch(`${url}/api/workspace`, { signal: AbortSignal.timeout(5000) });
    if (res.status === 200) return await res.json();
  } catch { /* refused, timed out or not JSON: reported below */ }
  console.log(`FAIL no instance answers at ${url}: run doctor, then launch`);
  return null;
}

/** The first project id that starts with the prefix; undefined when none does (the caller lists the ids). */
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
  // The app loads by dynamic import, so the hook can appear after goto: wait for it, then for the tower.
  await page.waitForFunction(() => '__flowTower' in window, undefined, { timeout: 30_000 });
  await page.waitForFunction((pid) => {
    const r = document.querySelector('canvas')?.getBoundingClientRect();
    return window.__flowTower.store.getState().stack[0] === pid && !!r && r.width > 100 && r.height > 100;
  }, id, { timeout: 30_000 });
}

/**
 * Runs one drive in a fresh installed Chrome, as playwright.config.ts does. A failed expectation prints FAIL
 * and is reported back, so the caller still writes the evidence it has. Playwright loads here only.
 */
async function inBrowser(shot, fn) {
  const { chromium } = await import('@playwright/test');
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
 * Reads the run through load(), then resolves the project prefix against the live workspace;
 * null (FAIL printed) when a step fails.
 */
async function projectOf(args, load) {
  const found = load();
  if (!found) return null;
  const ws = await workspaceOf(found.run.url);
  if (!ws) return null;
  const id = args.target && resolveProject(ws.projects, args.target);
  if (!id) {
    console.log(`FAIL no project matches ${args.target ?? '(none given)'}; first 5: ${ws.projects.slice(0, 5).join(', ')}`);
    return null;
  }
  return { ...found, id, ws };
}

/**
 * Shared by open and events: resolves the project, runs fn in one fresh browser on it, and writes the evidence pair.
 * fn fills rec as it goes, so a drive that fails midway still keeps what it recorded.
 */
async function drive(args, load, defaultLabel, fn) {
  const found = await projectOf(args, load);
  if (!found) return 1;
  const { run, id } = found;
  const label = args.name ?? defaultLabel;
  const evidence = evidenceOf(run);
  const rec = { project: id };
  const { error, consoleErrors } = await inBrowser(join(evidence, `${label}.png`), (page) => fn(page, found, rec));
  const failed = error !== undefined;
  writeEvidence(evidence, `${label}.json`, JSON.stringify({ ...rec, consoleErrors, ...(failed && { error }) }, null, 2) + '\n');
  return failed ? 1 : 0;
}

export function openDrive(args, load) {
  return drive(args, load, 'open', async (page, { run, id }, rec) => {
    rec.url = `${run.url}/?quality=eco`;
    rec.steps = [];
    await openAsUser(page, run.url, id);
    rec.steps.push({ action: 'open', state: await readState(page) });
    for (const key of args.keys) {
      await page.keyboard.press(key);
      await page.waitForTimeout(400);
      rec.steps.push({ action: key, state: await readState(page) });
    }
  });
}

/** Posts one event as a Claude Code hook does: the endpoint answers 204 with no body. */
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

export function eventsDrive(args, load) {
  if (!args.node) {
    console.log('FAIL events needs --node <layer.node>');
    return 1;
  }
  return drive(args, load, 'events', async (page, { run, id, ws }, rec) => {
    const tower = ws.towers[id].id;
    const tag = `verify-${Date.now()}`;
    const bodies = [
      { kind: 'tool.start', source: tag, node: args.node, tower, message: `${tag} start`, call: tag },
      { kind: 'tool.end', source: tag, node: args.node, tower, status: 'error', message: `${tag} error`, call: tag },
      { kind: 'tool.start', source: tag, agent: 'nobody-matches-this', message: `${tag} unmapped` },
    ];
    Object.assign(rec, { node: args.node, posts: [], feedRows: undefined, selected: undefined });
    await openAsUser(page, run.url, id);
    await page.keyboard.press('f');
    await page.locator('.livefeed').waitFor({ timeout: 15_000 });
    rec.posts = await Promise.all(bodies.map((b) => postEvent(run.url, b)));
    const bad = rec.posts.filter((p) => p.status !== 204 || p.bodyLength !== 0);
    if (bad.length) throw new Error(`events answered ${JSON.stringify(bad)}, expected 204 with no body`);
    // The row arrives after the server has the event: wait for the error row, then click it as a user does.
    await page.locator('.feed-row', { hasText: `${tag} error` }).first().click({ timeout: 15_000 });
    await page.waitForFunction((n) => window.__flowTower.store.getState().selected === n, args.node, { timeout: 15_000 });
    rec.feedRows = await page.locator('.feed-row').count();
    rec.selected = (await readState(page)).selected;
  });
}

/** Runs the CLI validate on a path and keeps its output. Needs the run folder for evidence, not a server. */
export function validateDrive(args, load, root) {
  const found = load();
  if (!found) return 1;
  if (!args.target) {
    console.log('FAIL validate needs a path');
    return 1;
  }
  const argv = ['bin/flow-tower.js', 'validate', resolve(args.target), '--json'];
  const r = spawnSync(process.execPath, argv, { cwd: root, encoding: 'utf8', timeout: 60_000 });
  const exit = r.status ?? 1;
  const error = exit !== 0 ? `validate exited ${exit}` : undefined;
  writeEvidence(evidenceOf(found.run), `${args.name ?? 'validate'}.json`, JSON.stringify({ command: `node ${argv.join(' ')}`, exit, stdout: r.stdout, stderr: r.stderr, ...(error && { error }) }, null, 2) + '\n');
  if (error) console.log(`FAIL ${error}`);
  return exit;
}

// The Flow Tower tutorial actions. One narration.mark per scene, in manifest order; each scene
// ends by waiting for the rest of its voice clip, so the picture stays on screen as long as the
// narration needs. Overlays are DOM nodes added with page.evaluate, so the capture records them.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHumanCursor, test } from '@argo-video/cli';
import type { Page } from '@playwright/test';
import { cleanHits, codeCard, forbiddenFromEnv, runShown } from './helpers.ts';

// Recording a 55-node tower in one process is slow to lay out; allow the whole demo.
test.setTimeout(30 * 60_000);

const DEV_SQUAD = 'dev-squad/dev-squad.tower.yaml';
const SINGLE_AGENT = 'starters/single-agent/single-agent.tower.yaml';
const SCENE_GAP_MS = 1200;
const KEY_GAP_MS = 700;

// Plain JS only: this string runs in the browser, so no TypeScript syntax here.
const STATE = 'window.__flowTower.store.getState()';

/** Shows an overlay card at the bottom right, replacing any card already there. */
async function showCard(page: Page, html: string) {
  await page.evaluate((inner) => {
    let el = document.getElementById('tutorial-card');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tutorial-card';
      document.body.appendChild(el);
    }
    el.setAttribute(
      'style',
      'position:fixed;right:24px;bottom:24px;max-width:46%;padding:16px 20px;border-radius:8px;' +
        'background:rgba(12,16,22,0.94);color:#e6edf3;font-family:ui-monospace,monospace;font-size:14px;' +
        'line-height:1.45;z-index:2147483000;box-shadow:0 8px 30px rgba(0,0,0,0.5);',
    );
    el.innerHTML = inner;
  }, html);
}

async function hideCard(page: Page) {
  await page.evaluate(() => document.getElementById('tutorial-card')?.remove());
}

/** Waits until a store expression is true; the layout is async, so poll rather than sleep. */
async function waitState(page: Page, expr: string) {
  await page.waitForFunction(expr, undefined, { timeout: 20_000 });
}

/** Presses a key up to `max` times, stopping as soon as the store condition holds. */
async function pressUntilState(page: Page, key: string, expr: string, max: number) {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate(`(${expr})`)) return;
    await page.keyboard.press(key);
    await page.waitForTimeout(KEY_GAP_MS);
  }
  await waitState(page, expr);
}

test('flow-tower', async ({ page, narration }) => {
  const FLOW_TOWER = process.env.FLOW_TOWER;
  if (!FLOW_TOWER) throw new Error('set FLOW_TOWER to the flow-tower checkout');
  const forbidden = forbiddenFromEnv();
  const cursor = await createHumanCursor(page, { seed: 'flow-tower', size: 30 });
  const until = process.env.TUTORIAL_UNTIL;
  let tmp: string | undefined;

  // Before the first mark: the library must not show a user name, machine name or home path.
  await page.goto('/');
  await page.locator('[data-card]').first().waitFor();
  const hits = cleanHits(await page.evaluate(() => document.body.innerText), forbidden);
  if (hits.length > 0) throw new Error(`clean screen: "${hits[0]}" is on the page`);

  await narration.startRecording(page);

  // why-problem: the library is the first thing a viewer sees; scroll it a little and back.
  narration.mark('why-problem');
  for (let i = 0; i < 3; i++) {
    await cursor.moveTo(page.locator('[data-card]').nth(i), { durationMs: 900 });
  }
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(600);
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(narration.durationFor('why-problem'));
  if (until === 'why-problem') return;

  // why-tower: open dev-squad with the cursor, so the eye follows the click.
  narration.mark('why-tower');
  await cursor.click(page.locator(`[data-card="${DEV_SQUAD}"]`));
  await waitState(page, `${STATE}.stack[0] === 'dev-squad'`);
  await page.locator('canvas').first().waitFor({ state: 'visible' });
  await page.waitForTimeout(narration.durationFor('why-tower'));
  if (until === 'why-tower') return;

  // how-layers: PageDown walks from the top layer down.
  narration.mark('how-layers');
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(SCENE_GAP_MS);
  }
  await page.waitForTimeout(narration.durationFor('how-layers'));
  if (until === 'how-layers') return;

  // how-nodes: layer 2 is orchestration; arrow across it to the lead agent.
  narration.mark('how-nodes');
  await page.keyboard.press('2');
  await page.waitForTimeout(SCENE_GAP_MS);
  await pressUntilState(page, 'ArrowRight', `${STATE}.selected === 'orchestration.lead'`, 10);
  await page.waitForTimeout(narration.durationFor('how-nodes'));
  if (until === 'how-nodes') return;

  // how-edges: the selected node's paths are drawn; the panel is where the eye should go.
  narration.mark('how-edges');
  await cursor.moveTo(page.locator('.inspector'), { durationMs: 900 });
  await page.waitForTimeout(narration.durationFor('how-edges'));
  if (until === 'how-edges') return;

  // how-files: switch the panel to its files, open the first one, then close the viewer.
  narration.mark('how-files');
  const fileButton = page.locator('.inspector .filelist button:not([disabled])').first();
  for (let i = 0; i < 5 && !(await fileButton.isVisible()); i++) {
    await page.keyboard.press(']');
    await page.waitForTimeout(KEY_GAP_MS);
  }
  await cursor.click(fileButton);
  await page.waitForTimeout(narration.durationFor('how-files') / 2);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(narration.durationFor('how-files') / 2);
  if (until === 'how-files') return;

  // how-subtower: clear the selection, select a node with its own flow, go in and back out.
  narration.mark('how-subtower');
  for (let i = 0; i < 6 && (await page.evaluate(`${STATE}.selected`)); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(KEY_GAP_MS);
  }
  await pressUntilState(page, 's', `!!${STATE}.selected`, 12);
  await page.keyboard.press('Enter');
  await waitState(page, `${STATE}.stack.length === 2`);
  await page.waitForTimeout(narration.durationFor('how-subtower') / 2);
  for (let i = 0; i < 6 && (await page.evaluate(`${STATE}.stack.length`)) > 1; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(KEY_GAP_MS);
  }
  await waitState(page, `${STATE}.stack.length === 1`);
  await page.waitForTimeout(narration.durationFor('how-subtower') / 2);
  if (until === 'how-subtower') return;

  // how-yaml: the first 20 lines of the single-agent starter, as an overlay.
  narration.mark('how-yaml');
  const yamlLines = readFileSync(join(FLOW_TOWER, 'examples', SINGLE_AGENT), 'utf8').split('\n').slice(0, 20);
  await showCard(page, codeCard(`examples/${SINGLE_AGENT}`, yamlLines));
  await page.waitForTimeout(narration.durationFor('how-yaml'));
  await hideCard(page);
  if (until === 'how-yaml') return;

  // when-design: the map view shows every layer at once.
  narration.mark('when-design');
  await page.keyboard.press('m');
  await waitState(page, `${STATE}.view === 'map'`);
  await cursor.moveTo(page.locator('canvas').first(), { durationMs: 1200 });
  await page.waitForTimeout(narration.durationFor('when-design'));
  await page.keyboard.press('m');
  if (until === 'when-design') return;

  // when-review: the real audit output, cut to the first 14 non-empty lines.
  narration.mark('when-review');
  const audit = runShown(
    'node',
    ['bin/flow-tower.js', 'audit', 'examples/dev-squad'],
    FLOW_TOWER,
    (line) => line.trim() !== '',
    forbidden,
  ).slice(0, 14);
  await showCard(page, codeCard('node bin/flow-tower.js audit examples/dev-squad', audit));
  await page.waitForTimeout(narration.durationFor('when-review'));
  await hideCard(page);
  if (until === 'when-review') return;

  // when-live: the simulator plays a dev-squad run; the live feed shows each node lighting up.
  // It is started by the demo because the feed needs events from a run, and killed when done.
  narration.mark('when-live');
  const simulator = spawn(
    'node',
    ['--experimental-strip-types', 'scripts/simulate.ts', 'dev-squad', '--url', process.env.TUTORIAL_URL ?? ''],
    { cwd: FLOW_TOWER, stdio: 'ignore' },
  );
  try {
    await page.keyboard.press('f');
    await page.waitForTimeout(narration.durationFor('when-live'));
    await page.keyboard.press('f');
  } finally {
    simulator.kill();
  }
  if (until === 'when-live') return;

  // when-not: back to the library, and the single-agent starter as the small, true case.
  narration.mark('when-not');
  await page.keyboard.press('l');
  await cursor.click(page.locator(`[data-card="${SINGLE_AGENT}"]`));
  await page.locator('canvas').first().waitFor({ state: 'visible' });
  await page.waitForTimeout(narration.durationFor('when-not'));
  if (until === 'when-not') return;

  // start-gallery: filter the library by "starter", typed slowly so the viewer reads it.
  narration.mark('start-gallery');
  await page.keyboard.press('l');
  const filter = page.getByPlaceholder('Filter projects');
  await filter.click();
  await filter.pressSequentially('starter', { delay: 180 });
  await page.waitForTimeout(narration.durationFor('start-gallery'));
  await filter.fill('');
  if (until === 'start-gallery') return;

  // start-copy: copy the starter into a fresh folder, and show the copy's own report.
  narration.mark('start-copy');
  tmp = mkdtempSync(join(tmpdir(), 'tutorial-copy-'));
  const copyLines = runShown(
    'node',
    [join(FLOW_TOWER, 'bin', 'flow-tower.js'), 'copy', 'starters/single-agent', 'my-project/tower'],
    tmp,
    (line) => line.startsWith('copied') || line.startsWith('validation'),
    forbidden,
  );
  await showCard(page, codeCard('node bin/flow-tower.js copy starters/single-agent my-project/tower', copyLines));
  await page.waitForTimeout(narration.durationFor('start-copy'));
  await hideCard(page);
  if (until === 'start-copy') return;

  // start-agent: the command is shown, never run; running it would install into the author's agent.
  narration.mark('start-agent');
  await showCard(
    page,
    codeCard('node bin/flow-tower.js install-skill', [
      '# then ask your coding agent:',
      '> map this project as a flow tower',
    ]),
  );
  await page.waitForTimeout(narration.durationFor('start-agent'));
  await hideCard(page);
  if (until === 'start-agent') return;

  // start-validate: the copy validates with zero errors and zero warnings; then the temp folder goes.
  narration.mark('start-validate');
  const validateLines = runShown(
    'node',
    [join(FLOW_TOWER, 'bin', 'flow-tower.js'), 'validate', 'my-project/tower'],
    tmp,
    (line) => line.trim() !== '',
    forbidden,
  );
  await showCard(page, codeCard('node bin/flow-tower.js validate my-project/tower', validateLines));
  await page.waitForTimeout(narration.durationFor('start-validate'));
  await hideCard(page);
  rmSync(tmp, { recursive: true, force: true });
  if (until === 'start-validate') return;

  // close: back to the dev-squad tower, auto-orbit, hold until the clip ends.
  narration.mark('close');
  await page.keyboard.press('l');
  await cursor.click(page.locator(`[data-card="${DEV_SQUAD}"]`));
  await waitState(page, `${STATE}.stack[0] === 'dev-squad'`);
  await page.keyboard.press('o');
  await page.waitForTimeout(narration.durationFor('close'));
});

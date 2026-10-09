import { defineConfig, devices } from '@playwright/test';
import { env } from 'node:process';

/**
 * E2E sweep over every example tower (e2e/). Reuses a running `npm run dev` on 5317, else starts one.
 * WebGL runs in headless Chromium; tests assert on app state (window.__flowTower), not on pixels.
 */
const CI = !!env.CI;

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: CI ? 2 : 3,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e.json' }], ['./e2e/summary-reporter.ts']],
  use: {
    baseURL: 'http://127.0.0.1:5317',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Installed Google Chrome: Playwright's bundled Chromium no longer supports macOS 13, and CI runners ship Chrome.
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'node bin/flow-tower.js examples --no-open --port 5317',
    url: 'http://127.0.0.1:5317/api/workspace',
    reuseExistingServer: !CI,
    timeout: 60_000,
  },
});

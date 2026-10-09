import { env } from 'node:process';
import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against the Vercel preview of the PR (PREVIEW_URL is set by the workflow once the
 * deployment is ready). The Neon preview branch behind it is seeded, Stripe is in test mode.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: true,
  retries: env.CI ? 2 : 0,
  reporter: [['list'], ['html', { outputFolder: 'qa-report', open: 'never' }]],
  use: {
    baseURL: env.PREVIEW_URL,
    trace: 'retain-on-failure',
    // Vercel Deployment Protection bypass for automation; the value is a CI secret.
    extraHTTPHeaders: { 'x-vercel-protection-bypass': env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '' },
  },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' } },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});

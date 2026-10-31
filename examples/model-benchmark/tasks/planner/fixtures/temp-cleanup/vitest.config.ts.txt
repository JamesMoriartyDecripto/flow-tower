import { defineConfig } from 'vitest/config';

// Only the project's own tests: examples/ ships sample *.spec.ts files (e.g. Playwright QA) that are content, not tests.
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
});

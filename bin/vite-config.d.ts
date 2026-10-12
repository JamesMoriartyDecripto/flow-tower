/** Types for bin/vite-config.js, so tests and tooling can import the plain-JS helper. */

import type { InlineConfig } from 'vite';

export function serveConfig(pkgRoot: string, overrides: InlineConfig): Promise<InlineConfig>;

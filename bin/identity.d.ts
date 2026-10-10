/** Types for bin/identity.js, so tests and tooling can import the plain-JS helper. */

export const IDENTITY_MAX: number;

export function clip(v: string, n?: number): string;
export function clipIdentity(event: Record<string, unknown>): Record<string, unknown>;
export function isLoopbackUrl(url: string): boolean;
export function identityDefaults(
  url: string,
  env: Record<string, string | undefined>,
  os: { username?: string; hostname?: string },
): { user?: string; host?: string };

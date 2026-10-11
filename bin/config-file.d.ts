export function stripJsonc(text: string): string;
export function senderConfig(options: {
  env: Record<string, string | undefined>;
  checkout: string;
  flags?: { url?: string; user?: string; machine?: string; token?: string };
  home?: string;
}): { url?: string; user?: string; machine?: string; token?: string };

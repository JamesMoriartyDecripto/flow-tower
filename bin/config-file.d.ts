export function stripJsonc(text: string): string;
export function localServerFile(home: string): string;
export function writeLocalServer(options: { home?: string; url: string; pid: number }): void;
export function clearLocalServer(options: { home?: string; pid: number }): void;
export function localServerUrl(options?: { env?: Record<string, string | undefined>; home?: string }): string | undefined;
export function libraryPaths(options: { env: Record<string, string | undefined>; home?: string }): string[];
export function senderConfig(options: {
  env: Record<string, string | undefined>;
  checkout: string;
  flags?: { url?: string; user?: string; machine?: string; token?: string };
  home?: string;
}): {
  url?: string; user?: string; machine?: string; token?: string;
  /** The config file's own role, url and token, unmerged with flags or the environment. */
  role?: string;
  config: { url?: string; token?: string };
};

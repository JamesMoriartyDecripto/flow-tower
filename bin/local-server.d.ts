export function localServerFile(home: string): string;
export function writeLocalServer(options: { home?: string; url: string; pid: number }): void;
export function clearLocalServer(options: { home?: string; pid: number }): void;
export function localServerUrl(options?: { env?: Record<string, string | undefined>; home?: string }): string | undefined;
export function recordLocalServer(options: { env: Record<string, string | undefined>; bindHost: string; port: string | number }): void;

/**
 * Picks the flow-tower server `simulate` posts to, and says why. Pure, so the choice is testable
 * and importing it runs nothing. The order is the one the simulator has always used:
 * an explicit --url wins, then the library this user folder recorded, then the default port.
 */
export const DEFAULT_SIMULATE_URL = 'http://127.0.0.1:5317';

export function simulateTarget(
  flagUrl: string | undefined,
  recorded: string | undefined,
): { url: string; from: string } {
  if (flagUrl !== undefined) return { url: flagUrl, from: '--url' };
  if (recorded !== undefined) return { url: recorded, from: 'the library running now (recorded in your user folder)' };
  return { url: DEFAULT_SIMULATE_URL, from: 'default port, no running library recorded' };
}

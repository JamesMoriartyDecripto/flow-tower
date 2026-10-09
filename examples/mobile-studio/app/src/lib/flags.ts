// Feature flags and kill switch through Firebase Remote Config (React Native Firebase v26,
// modular API: settings and defaults are properties since v25).
// Defaults are the safe values: if Remote Config is unreachable, risky features stay off.
import { fetchAndActivate, getRemoteConfig, getValue } from '@react-native-firebase/remote-config';

const DEFAULTS = {
  paywall_v2_enabled: false, // new paywall layout in 2.4, ramped with the rollout
  plant_id_enabled: true, // kill switch: turn off if the ID provider degrades
  min_supported_build: 0, // force-update screen below this build number
  reminders_seasonal: true,
} as const;

export type FlagKey = keyof typeof DEFAULTS;

export async function initFlags(): Promise<void> {
  const rc = getRemoteConfig();
  // Short interval so a flipped kill switch reaches users on next foreground.
  rc.settings = { minimumFetchIntervalMillis: __DEV__ ? 0 : 5 * 60 * 1000, fetchTimeoutMillis: 5000 };
  rc.defaultConfig = DEFAULTS;
  try {
    await fetchAndActivate(rc);
  } catch {
    // Offline or quota: keep cached or default values. Never block startup on flags.
  }
}

export function flag(key: Exclude<FlagKey, 'min_supported_build'>): boolean {
  return getValue(getRemoteConfig(), key).asBoolean();
}

export function mustUpdate(currentBuild: number): boolean {
  return currentBuild < getValue(getRemoteConfig(), 'min_supported_build').asNumber();
}

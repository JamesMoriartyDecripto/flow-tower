// The only module that talks to RevenueCat. Screens never read store products directly,
// so a store or SDK change touches one file. Entitlements are decided by RevenueCat
// (receipts validated server-side), never by local flags.
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';

// Public SDK keys (safe to ship). The RevenueCat secret key lives only in the backend.
const API_KEYS = {
  ios: 'appl_PUBLIC_SDK_KEY_PLACEHOLDER',
  android: 'goog_PUBLIC_SDK_KEY_PLACEHOLDER',
} as const;

export const ENTITLEMENT = 'premium';

export function configurePurchases(supabaseUserId: string | null): void {
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({
    apiKey: Platform.OS === 'ios' ? API_KEYS.ios : API_KEYS.android,
    // Same id as Supabase so webhooks can update profiles.premium_until.
    appUserID: supabaseUserId ?? undefined,
  });
}

export function isPremium(info: CustomerInfo): boolean {
  return info.entitlements.active[ENTITLEMENT] !== undefined;
}

export async function currentPackages(): Promise<PurchasesPackage[]> {
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export type PurchaseResult = 'purchased' | 'cancelled' | 'pending' | 'failed';

export async function buy(pkg: PurchasesPackage): Promise<PurchaseResult> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return isPremium(customerInfo) ? 'purchased' : 'pending'; // Ask to Buy, slow card
  } catch (e) {
    const err = e as { userCancelled?: boolean };
    return err.userCancelled ? 'cancelled' : 'failed';
  }
}

// Required by review: restore must be reachable from the paywall and Settings.
export async function restore(): Promise<boolean> {
  return isPremium(await Purchases.restorePurchases());
}

export async function onLogout(): Promise<void> {
  await Purchases.logOut();
}

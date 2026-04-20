import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, PurchasesOffering, CustomerInfo } from 'react-native-purchases';

export const PRODUCT_IDS = {
  android: {
    monthly: 'lumibaby_premium_monthly',
    yearly:  'lumibaby_premium_yearly',
  },
  ios: {
    monthly: 'com.lumibaby.premium.monthly',
    yearly:  'com.lumibaby.premium.yearly',
  },
} as const;

export const ENTITLEMENT_ID = 'premium';

const IOS_API_KEY     = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY     ?? 'test_NEQGTCZprAVYcQdZUYZcAHvMdEd';
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

export function configureRevenueCat(): void {
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
  const apiKey = Platform.OS === 'ios' ? IOS_API_KEY : ANDROID_API_KEY;
  if (!apiKey) return;
  Purchases.configure({ apiKey });
}

// Backward-compat alias — used in app/_layout.tsx
export const initializeRevenueCat = configureRevenueCat;

export async function getOfferings(): Promise<PurchasesOffering | null> {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch {
    return null;
  }
}

export async function purchasePackage(pkg: any): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export async function checkPremiumStatus(): Promise<boolean> {
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

export async function restorePurchases(): Promise<boolean> {
  const info = await Purchases.restorePurchases();
  return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
}

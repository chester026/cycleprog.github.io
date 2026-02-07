/**
 * RevenueCat Configuration and Helpers
 * 
 * Setup:
 * 1. Replace API_KEYS with your RevenueCat public API keys
 * 2. Set ENTITLEMENT_ID to your entitlement identifier
 * 3. Call initRevenueCat() in App.tsx on app start
 */

import Purchases, {
  PurchasesPackage,
  CustomerInfo,
  PurchasesOffering,
  LOG_LEVEL,
} from 'react-native-purchases';

// ============================================
// CONFIGURATION - Replace with your keys
// ============================================

// iOS API Key from RevenueCat Dashboard → API Keys
const IOS_API_KEY = 'appl_VuwBQfmKomNxPSQIECpANByJTLH';

// Entitlement ID from RevenueCat Dashboard → Entitlements
// This is the "access right" users get when they purchase any subscription
export const ENTITLEMENT_ID = 'entl028afd5d73';

// ============================================
// INITIALIZATION
// ============================================

let isInitialized = false;

/**
 * Initialize RevenueCat SDK
 * Call this once when app starts (e.g., in App.tsx)
 */
export const initRevenueCat = async (userId?: string): Promise<void> => {
  if (isInitialized) {
    return;
  }

  try {
    // Enable debug logs in development
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    const apiKey = IOS_API_KEY;

    if (userId) {
      await Purchases.configure({apiKey, appUserID: userId});
    } else {
      await Purchases.configure({apiKey});
    }

    isInitialized = true;
  } catch (error) {
    console.error('[RevenueCat] Init error:', error);
    throw error;
  }
};

// ============================================
// USER MANAGEMENT
// ============================================

/**
 * Login user to RevenueCat (for cross-device subscription sync)
 */
export const loginUser = async (userId: string): Promise<CustomerInfo> => {
  const {customerInfo} = await Purchases.logIn(userId);
  return customerInfo;
};

/**
 * Logout user from RevenueCat
 */
export const logoutUser = async (): Promise<CustomerInfo> => {
  return await Purchases.logOut();
};

// ============================================
// SUBSCRIPTION STATUS
// ============================================

/**
 * Check if user has active premium subscription
 */
export const checkPremiumStatus = async (): Promise<boolean> => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
};

/**
 * Get current customer info
 */
export const getCustomerInfo = async (): Promise<CustomerInfo> => {
  return await Purchases.getCustomerInfo();
};

// ============================================
// OFFERINGS & PACKAGES
// ============================================

/**
 * Get available offerings (subscription plans)
 */
export const getOfferings = async (): Promise<PurchasesOffering | null> => {
  const offerings = await Purchases.getOfferings();
  return offerings.current || null;
};

/**
 * Get all available packages from current offering
 */
export const getPackages = async (): Promise<PurchasesPackage[]> => {
  const offering = await getOfferings();
  return offering?.availablePackages || [];
};

// ============================================
// PURCHASES
// ============================================

/**
 * Purchase a package
 */
export const purchasePackage = async (
  pkg: PurchasesPackage,
): Promise<{success: boolean; customerInfo?: CustomerInfo; error?: any}> => {
  try {
    const {customerInfo} = await Purchases.purchasePackage(pkg);
    const isPremium = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    return {success: isPremium, customerInfo};
  } catch (error: any) {
    if (error.userCancelled) {
      return {success: false, error: 'cancelled'};
    }
    return {success: false, error};
  }
};

/**
 * Restore previous purchases
 */
export const restorePurchases = async (): Promise<{
  success: boolean;
  isPremium: boolean;
  customerInfo?: CustomerInfo;
}> => {
  try {
    const customerInfo = await Purchases.restorePurchases();
    const isPremium = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    return {success: true, isPremium, customerInfo};
  } catch {
    return {success: false, isPremium: false};
  }
};

// ============================================
// LISTENERS
// ============================================

/**
 * Add listener for customer info updates
 */
export const addCustomerInfoListener = (
  callback: (customerInfo: CustomerInfo) => void,
): (() => void) => {
  Purchases.addCustomerInfoUpdateListener(callback);
  // RevenueCat SDK manages listeners internally
  return () => {
    // Cleanup if needed - SDK handles this automatically
  };
};

// ============================================
// HELPERS
// ============================================

/**
 * Format price for display
 */
export const formatPrice = (pkg: PurchasesPackage): string => {
  return pkg.product.priceString;
};

/**
 * Get subscription period text
 */
export const getSubscriptionPeriod = (pkg: PurchasesPackage): string => {
  switch (pkg.packageType) {
    case 'WEEKLY':
      return 'week';
    case 'MONTHLY':
      return 'month';
    case 'TWO_MONTH':
      return '2 months';
    case 'THREE_MONTH':
      return '3 months';
    case 'SIX_MONTH':
      return '6 months';
    case 'ANNUAL':
      return 'year';
    case 'LIFETIME':
      return 'lifetime';
    default:
      return '';
  }
};

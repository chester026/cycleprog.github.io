/**
 * Paywall Component
 * 
 * Shows subscription options using RevenueCat
 * Can be displayed as a modal or full screen
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import {PurchasesPackage} from 'react-native-purchases';
import {
  getPackages,
  purchasePackage,
  restorePurchases,
  formatPrice,
  getSubscriptionPeriod,
} from '../../utils/RevenueCat';

interface PaywallProps {
  visible: boolean;
  onClose: () => void;
  onPurchaseSuccess?: () => void;
}

export const PaywallModal: React.FC<PaywallProps> = ({
  visible,
  onClose,
  onPurchaseSuccess,
}) => {
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<PurchasesPackage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (visible) {
      loadPackages();
    }
  }, [visible]);

  const loadPackages = async () => {
    setIsLoading(true);
    try {
      const availablePackages = await getPackages();
      setPackages(availablePackages);
      
      // Auto-select the first package (usually the best value)
      if (availablePackages.length > 0) {
        // Try to find annual package, otherwise select first
        const annualPkg = availablePackages.find(p => p.packageType === 'ANNUAL');
        setSelectedPackage(annualPkg || availablePackages[0]);
      }
    } catch (error) {
      console.error('Failed to load packages:', error);
      Alert.alert('Error', 'Failed to load subscription options');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!selectedPackage) return;

    setIsPurchasing(true);
    try {
      const result = await purchasePackage(selectedPackage);
      
      if (result.success) {
        Alert.alert('Welcome!', 'You now have premium access!', [
          {text: 'OK', onPress: () => {
            onPurchaseSuccess?.();
            onClose();
          }},
        ]);
      } else if (result.error !== 'cancelled') {
        Alert.alert('Purchase Failed', 'Please try again later');
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      const result = await restorePurchases();
      
      if (result.isPremium) {
        Alert.alert('Restored!', 'Your premium access has been restored!', [
          {text: 'OK', onPress: () => {
            onPurchaseSuccess?.();
            onClose();
          }},
        ]);
      } else {
        Alert.alert('No Subscription Found', 'We couldn\'t find any active subscriptions');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to restore purchases');
    } finally {
      setIsRestoring(false);
    }
  };

  const renderPackageOption = (pkg: PurchasesPackage) => {
    const isSelected = selectedPackage?.identifier === pkg.identifier;
    const isAnnual = pkg.packageType === 'ANNUAL';
    
    return (
      <TouchableOpacity
        key={pkg.identifier}
        style={[styles.packageOption, isSelected && styles.packageSelected]}
        onPress={() => setSelectedPackage(pkg)}
        activeOpacity={0.7}
      >
        {isAnnual && (
          <View style={styles.bestValueBadge}>
            <Text style={styles.bestValueText}>BEST VALUE</Text>
          </View>
        )}
        
        <View style={styles.packageContent}>
          <View style={styles.packageLeft}>
            <View style={[styles.radioButton, isSelected && styles.radioSelected]}>
              {isSelected && <View style={styles.radioInner} />}
            </View>
            <View>
              <Text style={styles.packageTitle}>
                {pkg.packageType === 'ANNUAL' ? 'Yearly' : 
                 pkg.packageType === 'MONTHLY' ? 'Monthly' : 
                 getSubscriptionPeriod(pkg)}
              </Text>
              {isAnnual && (
                <Text style={styles.packageSavings}>Save 50%</Text>
              )}
            </View>
          </View>
          
          <View style={styles.packageRight}>
            <Text style={styles.packagePrice}>{formatPrice(pkg)}</Text>
            <Text style={styles.packagePeriod}>/{getSubscriptionPeriod(pkg)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Section */}
          <View style={styles.heroSection}>
            <Text style={styles.heroEmoji}>🚴‍♂️</Text>
            <Text style={styles.heroTitle}>Unlock Premium</Text>
            <Text style={styles.heroSubtitle}>
              Get access to all features and take your cycling to the next level
            </Text>
          </View>

          {/* Features */}
          <View style={styles.featuresSection}>
            <FeatureItem icon="📊" text="Advanced Analytics & Insights" />
            <FeatureItem icon="🎯" text="Personalized Training Plans" />
            <FeatureItem icon="🤖" text="AI-Powered Ride Analysis" />
            <FeatureItem icon="📈" text="Progress Tracking & Trends" />
            <FeatureItem icon="🏆" text="Goals & Achievements" />
            <FeatureItem icon="☁️" text="Unlimited Cloud Sync" />
          </View>

          {/* Packages */}
          <View style={styles.packagesSection}>
            {isLoading ? (
              <ActivityIndicator size="large" color="#274dd3" />
            ) : packages.length > 0 ? (
              packages.map(renderPackageOption)
            ) : (
              <Text style={styles.errorText}>No subscription options available</Text>
            )}
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.purchaseButton, (!selectedPackage || isPurchasing) && styles.buttonDisabled]}
            onPress={handlePurchase}
            disabled={!selectedPackage || isPurchasing}
            activeOpacity={0.8}
          >
            {isPurchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.purchaseButtonText}>
                Continue
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.restoreButton}
            onPress={handleRestore}
            disabled={isRestoring}
            activeOpacity={0.7}
          >
            {isRestoring ? (
              <ActivityIndicator color="#666" size="small" />
            ) : (
              <Text style={styles.restoreButtonText}>Restore Purchases</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.legalText}>
            Subscription automatically renews unless cancelled at least 24 hours before the end of the current period.
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

// Feature Item Component
const FeatureItem: React.FC<{icon: string; text: string}> = ({icon, text}) => (
  <View style={styles.featureItem}>
    <Text style={styles.featureIcon}>{icon}</Text>
    <Text style={styles.featureText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  heroEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  featuresSection: {
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  featureText: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  packagesSection: {
    gap: 12,
  },
  packageOption: {
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  packageSelected: {
    borderColor: '#274dd3',
    backgroundColor: 'rgba(39, 77, 211, 0.05)',
  },
  bestValueBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#274dd3',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomLeftRadius: 8,
  },
  bestValueText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  packageContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  packageLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    borderColor: '#274dd3',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#274dd3',
  },
  packageTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  packageSavings: {
    fontSize: 12,
    color: '#274dd3',
    fontWeight: '600',
  },
  packageRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  packagePrice: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1a1a1a',
  },
  packagePeriod: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  errorText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 14,
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  purchaseButton: {
    backgroundColor: '#274dd3',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  purchaseButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 12,
  },
  restoreButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  legalText: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    lineHeight: 16,
  },
});

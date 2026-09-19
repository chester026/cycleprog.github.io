import React, {useState, useRef} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ImageBackground,
  StyleSheet,
} from 'react-native';
import {useTranslation} from 'react-i18next';
import {api, userProfile} from '../data/api';
import {logger} from '../lib/logger';
import {queryClient} from '../data/queryClient';
import {queryKeys} from '../data/keys';
import type {AppNavigationProp} from '../navigation/types';
import {makeStyles, useTheme} from '../theme';
import {Step1PersonalInfo} from './Onboarding/Step1PersonalInfo';
import {Step2HrZones} from './Onboarding/Step2HrZones';
import {Step3Experience} from './Onboarding/Step3Experience';
import {INITIAL_FORM_DATA, TOTAL_STEPS, buildProfileData, type OnboardingFormData} from './Onboarding/lib';

// T-5.2 decomposition (docs/audit/00-AUDIT-AND-PLAN.md): this file used to
// hold all three wizard steps' JSX + styles inline (722 lines). Each step
// now lives in `src/screens/Onboarding/StepN*.tsx`, with the shared pure
// helpers (HR-zone estimate, profile-body builder) in `Onboarding/lib.ts` —
// this file keeps only the wizard shell (progress bar, nav buttons, submit).

export const OnboardingScreen: React.FC<{navigation: AppNavigationProp}> = ({navigation}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<OnboardingFormData>(INITIAL_FORM_DATA);
  const scrollRef = useRef<ScrollView>(null);

  const updateField = (field: keyof OnboardingFormData, value: string) => {
    setFormData(prev => ({...prev, [field]: value}));
  };

  // ── Navigation ──────────────────────────────────────

  const goNext = () => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      scrollRef.current?.scrollTo({y: 0, animated: true});
    } else {
      handleSubmit();
    }
  };

  const goBack = () => {
    if (step > 1) {
      setStep(step - 1);
      scrollRef.current?.scrollTo({y: 0, animated: true});
    }
  };

  // ── Submit ──────────────────────────────────────────

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const profileData = buildProfileData(formData);
      await api.call(userProfile.onboarding, {body: profileData});
      logger.debug('✅ Onboarding completed');
      // The onboarding POST changes the profile row (T-5.1/A-17) — every
      // screen reading useProfile() should see the completed profile
      // without a stale cache entry from before onboarding ran.
      queryClient.invalidateQueries({queryKey: queryKeys.profile});
      navigation.reset({index: 0, routes: [{name: 'Main'}]});
    } catch (error) {
      logger.error('Error completing onboarding:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    try {
      await api.call(userProfile.onboarding, {body: {onboarding_completed: true}});
      logger.debug('⏭️ Onboarding skipped');
      queryClient.invalidateQueries({queryKey: queryKeys.profile});
      navigation.reset({index: 0, routes: [{name: 'Main'}]});
    } catch (error) {
      logger.error('Error skipping onboarding:', error);
      // Navigate anyway
      navigation.reset({index: 0, routes: [{name: 'Main'}]});
    } finally {
      setLoading(false);
    }
  };

  // ── Main Render ─────────────────────────────────────

  return (
    <ImageBackground
      source={require('../assets/img/mostrecomended.webp')}
      style={styles.container}
      imageStyle={styles.bgImage}>
      {/* Dark overlay for readability */}
      <View style={styles.overlay} />

      <KeyboardAvoidingView
        style={styles.contentWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[styles.progressFill, {width: `${(step / TOTAL_STEPS) * 100}%`}]}
            />
          </View>
          <Text style={styles.progressText}>
            {t('onboarding.step')}{step}{t('onboarding.of')}{TOTAL_STEPS}
          </Text>
        </View>

        {/* Content */}
        <ScrollView
          ref={scrollRef}
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollContentContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.welcomeText}>{t('onboarding.welcome')}</Text>
            <Text style={styles.headerTitle}>{t('onboarding.setupProfile')}</Text>
          </View>
          {step === 1 && <Step1PersonalInfo formData={formData} updateField={updateField} />}
          {step === 2 && <Step2HrZones formData={formData} updateField={updateField} />}
          {step === 3 && <Step3Experience formData={formData} updateField={updateField} />}
        </ScrollView>

        {/* Bottom Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkip}
            disabled={loading}>
            <Text style={styles.skipButtonText}>{t('onboarding.skip')}</Text>
          </TouchableOpacity>

          <View style={styles.navButtons}>
            {step > 1 && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={goBack}
                disabled={loading}>
                <Text style={styles.backButtonText}>{t('onboarding.back')}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.nextButton, loading && styles.nextButtonDisabled]}
              onPress={goNext}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color={theme.colors.text.inverse} size="small" />
              ) : (
                <Text style={styles.nextButtonText}>
                  {step === TOTAL_STEPS ? t('onboarding.complete') : t('onboarding.next')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
};

// ── Styles ──────────────────────────────────────────────

const styles = makeStyles(theme => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  bgImage: {
    resizeMode: 'cover',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 8, 12, 0.55)',
    zIndex: 1,
  },
  contentWrapper: {
    flex: 1,
    zIndex: 2,
  },
  progressContainer: {
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 0,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.accent,
    borderRadius: 0,
  },
  progressText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 8,
  },
  header: {
    paddingHorizontal: 0,
    paddingTop: 24,
    paddingBottom: 8,
  },
  welcomeText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.text.inverse,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  // Bottom actions
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  skipButton: {
    paddingVertical: 12,
  },
  skipButtonText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
  },
  navButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  backButtonText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  nextButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: 0,
    paddingVertical: 14,
    paddingHorizontal: 32,
    minWidth: 120,
    alignItems: 'center',
  },
  nextButtonDisabled: {
    opacity: 0.6,
  },
  nextButtonText: {
    color: theme.colors.text.inverse,
    fontSize: 16,
    fontWeight: '600',
  },
}));

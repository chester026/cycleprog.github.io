import React, {useState, useRef, useMemo} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ImageBackground,
} from 'react-native';
import {apiFetch} from '../utils/api';

const TOTAL_STEPS = 3;

// ── Types ───────────────────────────────────────────────

interface FormData {
  height: string;
  weight: string;
  age: string;
  gender: string;
  bike_weight: string;
  max_hr: string;
  resting_hr: string;
  lactate_threshold: string;
  experience_level: string;
}

interface HRZones {
  zone1: {min: number; max: number};
  zone2: {min: number; max: number};
  zone3: {min: number; max: number};
  zone4: {min: number; max: number};
  zone5: {min: number; max: number};
}

// ── Constants ───────────────────────────────────────────

const EXPERIENCE_LEVELS = [
  {
    value: 'beginner',
    label: 'Beginner',
    description: 'New to cycling or returning after a long break.',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description: 'Regular cyclist with some training experience.',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    description: 'Experienced cyclist with structured training.',
  },
];

// ── Component ───────────────────────────────────────────

export const OnboardingScreen: React.FC<{navigation: any}> = ({navigation}) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    height: '',
    weight: '',
    age: '',
    gender: '',
    bike_weight: '',
    max_hr: '',
    resting_hr: '',
    lactate_threshold: '',
    experience_level: 'intermediate',
  });
  const scrollRef = useRef<ScrollView>(null);

  const updateField = (field: keyof FormData, value: string) => {
    setFormData(prev => ({...prev, [field]: value}));
  };

  // ── HR Zone calculation ─────────────────────────────

  const hrZones = useMemo((): HRZones | null => {
    const age = parseInt(formData.age) || 0;
    const maxHR = parseInt(formData.max_hr) || (age ? 220 - age : 0);
    let restingHR = parseInt(formData.resting_hr) || 0;

    if (!restingHR && formData.experience_level) {
      switch (formData.experience_level) {
        case 'beginner': restingHR = 75; break;
        case 'intermediate': restingHR = 65; break;
        case 'advanced': restingHR = 55; break;
        default: restingHR = 70;
      }
    }

    const lt = parseInt(formData.lactate_threshold) || 0;

    if (!maxHR || !restingHR) return null;

    if (lt) {
      return {
        zone1: {min: Math.round(lt * 0.75), max: Math.round(lt * 0.85)},
        zone2: {min: Math.round(lt * 0.85), max: Math.round(lt * 0.92)},
        zone3: {min: Math.round(lt * 0.92), max: Math.round(lt * 0.97)},
        zone4: {min: Math.round(lt * 0.97), max: Math.round(lt * 1.03)},
        zone5: {min: Math.round(lt * 1.03), max: maxHR},
      };
    }

    const reserve = maxHR - restingHR;
    return {
      zone1: {min: Math.round(restingHR + reserve * 0.5), max: Math.round(restingHR + reserve * 0.6)},
      zone2: {min: Math.round(restingHR + reserve * 0.6), max: Math.round(restingHR + reserve * 0.7)},
      zone3: {min: Math.round(restingHR + reserve * 0.7), max: Math.round(restingHR + reserve * 0.8)},
      zone4: {min: Math.round(restingHR + reserve * 0.8), max: Math.round(restingHR + reserve * 0.9)},
      zone5: {min: Math.round(restingHR + reserve * 0.9), max: maxHR},
    };
  }, [formData.age, formData.max_hr, formData.resting_hr, formData.lactate_threshold, formData.experience_level]);

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

  const buildProfileData = () => {
    const data: Record<string, any> = {};

    if (formData.height) data.height = parseInt(formData.height);
    if (formData.weight) data.weight = parseFloat(formData.weight);
    if (formData.age) data.age = parseInt(formData.age);
    if (formData.gender) data.gender = formData.gender;
    if (formData.bike_weight) data.bike_weight = parseFloat(formData.bike_weight);
    if (formData.max_hr) data.max_hr = parseInt(formData.max_hr);
    if (formData.resting_hr) data.resting_hr = parseInt(formData.resting_hr);
    if (formData.lactate_threshold) data.lactate_threshold = parseInt(formData.lactate_threshold);
    data.experience_level = formData.experience_level;

    return data;
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const profileData = buildProfileData();
      await apiFetch('/api/user-profile/onboarding', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(profileData),
      });
      console.log('✅ Onboarding completed');
      navigation.reset({index: 0, routes: [{name: 'Main'}]});
    } catch (error) {
      console.error('Error completing onboarding:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    try {
      await apiFetch('/api/user-profile/onboarding', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({onboarding_completed: true}),
      });
      console.log('⏭️ Onboarding skipped');
      navigation.reset({index: 0, routes: [{name: 'Main'}]});
    } catch (error) {
      console.error('Error skipping onboarding:', error);
      // Navigate anyway
      navigation.reset({index: 0, routes: [{name: 'Main'}]});
    } finally {
      setLoading(false);
    }
  };

  // ── Render Steps ────────────────────────────────────

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Personal Information</Text>
      <Text style={styles.stepDescription}>
        This helps us personalize your training insights. You can change it later in settings.
      </Text>

      <View style={styles.row}>
        <View style={[styles.inputGroup, {flex: 1, marginRight: 8}]}>
          <Text style={styles.label}>Height (cm)</Text>
          <TextInput
            style={styles.input}
            value={formData.height}
            onChangeText={v => updateField('height', v)}
            placeholder="175"
            placeholderTextColor="#555"
            keyboardType="numeric"
          />
        </View>
        <View style={[styles.inputGroup, {flex: 1, marginLeft: 8}]}>
          <Text style={styles.label}>Weight (kg)</Text>
          <TextInput
            style={styles.input}
            value={formData.weight}
            onChangeText={v => updateField('weight', v)}
            placeholder="70"
            placeholderTextColor="#555"
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.inputGroup, {flex: 1, marginRight: 8}]}>
          <Text style={styles.label}>Age</Text>
          <TextInput
            style={styles.input}
            value={formData.age}
            onChangeText={v => updateField('age', v)}
            placeholder="30"
            placeholderTextColor="#555"
            keyboardType="numeric"
          />
        </View>
        <View style={[styles.inputGroup, {flex: 1, marginLeft: 8}]}>
          <Text style={styles.label}>Bike Weight (kg)</Text>
          <TextInput
            style={styles.input}
            value={formData.bike_weight}
            onChangeText={v => updateField('bike_weight', v)}
            placeholder="8.5"
            placeholderTextColor="#555"
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Gender</Text>
        <View style={styles.segmentedControl}>
          {['male', 'female', 'other'].map(g => (
            <TouchableOpacity
              key={g}
              style={[
                styles.segment,
                formData.gender === g && styles.segmentActive,
              ]}
              onPress={() => updateField('gender', g)}>
              <Text
                style={[
                  styles.segmentText,
                  formData.gender === g && styles.segmentTextActive,
                ]}>
                {g.charAt(0).toUpperCase() + g.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Heart Rate Zones</Text>
      <Text style={styles.stepDescription}>
        Optional. Leave empty and we will estimate based on your age and experience level.
      </Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Max Heart Rate (bpm)</Text>
        <TextInput
          style={styles.input}
          value={formData.max_hr}
          onChangeText={v => updateField('max_hr', v)}
          placeholder="190"
          placeholderTextColor="#555"
          keyboardType="numeric"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Resting Heart Rate (bpm)</Text>
        <TextInput
          style={styles.input}
          value={formData.resting_hr}
          onChangeText={v => updateField('resting_hr', v)}
          placeholder="60"
          placeholderTextColor="#555"
          keyboardType="numeric"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Lactate Threshold HR (bpm)</Text>
        <TextInput
          style={styles.input}
          value={formData.lactate_threshold}
          onChangeText={v => updateField('lactate_threshold', v)}
          placeholder="165"
          placeholderTextColor="#555"
          keyboardType="numeric"
        />
        <Text style={styles.hint}>From lactate test or FTP test (optional)</Text>
      </View>

      {hrZones && (
        <View style={styles.zonesPreview}>
          <Text style={styles.zonesTitle}>Calculated Zones</Text>
          {[
            {name: 'Z1 Recovery', zone: hrZones.zone1, color: '#4CAF50'},
            {name: 'Z2 Endurance', zone: hrZones.zone2, color: '#8BC34A'},
            {name: 'Z3 Tempo', zone: hrZones.zone3, color: '#FFC107'},
            {name: 'Z4 Threshold', zone: hrZones.zone4, color: '#FF9800'},
            {name: 'Z5 VO2 Max', zone: hrZones.zone5, color: '#F44336'},
          ].map(({name, zone, color}) => (
            <View key={name} style={styles.zoneRow}>
              <View style={[styles.zoneDot, {backgroundColor: color}]} />
              <Text style={styles.zoneName}>{name}</Text>
              <Text style={styles.zoneRange}>
                {zone.min}-{zone.max}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Experience Level</Text>
      <Text style={styles.stepDescription}>
        This helps us calibrate recommendations and training zones for you.
      </Text>

      {EXPERIENCE_LEVELS.map(level => (
        <TouchableOpacity
          key={level.value}
          style={[
            styles.experienceCard,
            formData.experience_level === level.value && styles.experienceCardActive,
          ]}
          onPress={() => updateField('experience_level', level.value)}>
          <View style={styles.experienceHeader}>
            <View
              style={[
                styles.radio,
                formData.experience_level === level.value && styles.radioActive,
              ]}>
              {formData.experience_level === level.value && (
                <View style={styles.radioInner} />
              )}
            </View>
            <Text
              style={[
                styles.experienceLabel,
                formData.experience_level === level.value && styles.experienceLabelActive,
              ]}>
              {level.label}
            </Text>
          </View>
          <Text style={styles.experienceDescription}>{level.description}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

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
            Step {step} of {TOTAL_STEPS}
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
            <Text style={styles.welcomeText}>Welcome to BikeLab</Text>
            <Text style={styles.headerTitle}>Set up your profile</Text>
          </View>
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </ScrollView>

        {/* Bottom Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkip}
            disabled={loading}>
            <Text style={styles.skipButtonText}>Skip for now</Text>
          </TouchableOpacity>

          <View style={styles.navButtons}>
            {step > 1 && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={goBack}
                disabled={loading}>
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.nextButton, loading && styles.nextButtonDisabled]}
              onPress={goNext}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.nextButtonText}>
                  {step === TOTAL_STEPS ? 'Complete' : 'Next'}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
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
    backgroundColor: '#274dd3',
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
    color: '#fff',
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  stepContent: {
    paddingTop: 24,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 20,
    marginBottom: 28,
  },
  row: {
    flexDirection: 'row',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(13, 13, 15, 0.7)',
    borderRadius: 0,
    padding: 16,
    fontSize: 17,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  hint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 6,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(13, 13, 15, 0.7)',
    borderRadius: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  segment: {
    flex: 1,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: '#274dd3',
  },
  segmentText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  segmentTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  // HR Zones preview
  zonesPreview: {
    backgroundColor: 'rgba(13, 13, 15, 0.7)',
    borderRadius: 0,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginTop: 8,
  },
  zonesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  zoneDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  zoneName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  zoneRange: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  // Experience cards
  experienceCard: {
    backgroundColor: 'rgba(21, 21, 24, 0.9)',
    borderRadius: 0,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  experienceCardActive: {
    borderColor: '#274dd3',
    backgroundColor: 'rgba(1, 16, 71, 0.8)',
  },
  experienceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#444',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioActive: {
    borderColor: '#274dd3',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#274dd3',
  },
  experienceLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  experienceLabelActive: {
    color: '#fff',
  },
  experienceDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 20,
    marginLeft: 32,
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
    backgroundColor: '#274dd3',
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
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

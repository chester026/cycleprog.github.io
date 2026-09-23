// Shared styles for the onboarding wizard's step content (T-5.2
// decomposition of OnboardingScreen.tsx). Kept as a single StyleSheet so
// the per-step files don't each redeclare the same input/label/card rules.
import {makeStyles} from '../../theme';

export const onboardingStepStyles = makeStyles(theme => ({
  stepContent: {
    paddingTop: 24,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text.inverse,
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
  // Step1PersonalInfo's side-by-side height/weight fields.
  inputGroupHalfLeft: {
    flex: 1,
    marginRight: 8,
  },
  inputGroupHalfRight: {
    flex: 1,
    marginLeft: 8,
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
    color: theme.colors.text.inverse,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  dateValue: {
    fontSize: 17,
    color: theme.colors.text.inverse,
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
    backgroundColor: theme.colors.accent,
  },
  segmentText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  segmentTextActive: {
    color: theme.colors.text.inverse,
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
    color: theme.colors.text.inverse,
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
    borderColor: theme.colors.accent,
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
    borderColor: theme.colors.share.picker.checkerDark,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioActive: {
    borderColor: theme.colors.accent,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.accent,
  },
  experienceLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.text.inverse,
  },
  experienceLabelActive: {
    color: theme.colors.text.inverse,
  },
  experienceDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 20,
    marginLeft: 32,
  },
}));

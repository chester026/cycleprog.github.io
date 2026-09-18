// Extracted from AnalysisScreen.tsx (T-5.4 screen decomposition): the
// header card — giant faded "ANALYSIS" watermark, 3-column progress row
// (workouts/volume/long rides), plan info below a divider. Pixel-identical
// to the original inline JSX; only the styling now goes through
// `src/theme` tokens instead of raw hex/px literals (A-27).
import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTranslation} from 'react-i18next';
import {PulseIcon} from '../../assets/img/icons/PulseIcon';
import {makeStyles} from '../../theme';
import type {HeroSummary, PlanInfo} from './lib';

interface PeriodHeaderProps {
  heroSummary: HeroSummary | null;
  planInfo: PlanInfo | null;
}

export const PeriodHeader: React.FC<PeriodHeaderProps> = ({heroSummary, planInfo}) => {
  const {t} = useTranslation();

  return (
    <View style={styles.analysisHeader}>
      <Text style={styles.watermarkTitle} numberOfLines={1} pointerEvents="none">
        {t('analysis.title')}
      </Text>

      <View style={styles.headerContent}>
        {heroSummary ? (
          <View style={styles.heroCards}>
            <View style={styles.heroCard}>
              <Text style={styles.cardLabel}>{t('analysis.workouts')}</Text>
              <Text style={styles.cardPercentage}>{heroSummary.progress.rides}%</Text>
              <Text style={styles.cardFraction}>
                {heroSummary.totalRides} / {heroSummary.plan.rides}
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {width: `${Math.min(Math.max(heroSummary.progress.rides, 0), 100)}%`},
                  ]}
                />
              </View>
            </View>

            <View style={styles.heroDivider} />

            <View style={styles.heroCard}>
              <Text style={styles.cardLabel}>{t('analysis.volume')}</Text>
              <Text style={styles.cardPercentage}>{heroSummary.progress.km}%</Text>
              <Text style={styles.cardFraction}>
                {heroSummary.totalKm} / {heroSummary.plan.km}
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {width: `${Math.min(Math.max(heroSummary.progress.km, 0), 100)}%`},
                  ]}
                />
              </View>
            </View>

            <View style={styles.heroDivider} />

            <View style={styles.heroCard}>
              <Text style={styles.cardLabel}>{t('analysis.longRides')}</Text>
              <Text style={styles.cardPercentage}>{heroSummary.progress.long}%</Text>
              <Text style={styles.cardFraction}>
                {heroSummary.longRidesCount} / {heroSummary.plan.long}
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {width: `${Math.min(Math.max(heroSummary.progress.long, 0), 100)}%`},
                  ]}
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{t('analysis.noData')}</Text>
            <Text style={styles.emptyMessage}>{t('analysis.startRiding')}</Text>
          </View>
        )}
      </View>

      {planInfo && (
        <>
          <View style={styles.headerDivider} />
          <View style={styles.planInfoContainer}>
            <View style={styles.planInfoLeft}>
              <PulseIcon size={16} color="#274dd3" />
              <Text style={styles.planDescription}>{planInfo.description}</Text>
            </View>
            <Text style={styles.planDetails}>{planInfo.details}</Text>
          </View>
        </>
      )}
    </View>
  );
};

const styles = makeStyles(theme => ({
  // Solid dark card replacing the old video+blur header. Rounded bottom
  // corners only (screen edge clips the top), background a touch darker
  // than the page so the rounding actually reads against it.
  analysisHeader: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    paddingTop: 72,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  // Giant low-opacity title standing in for a normal heading — same text
  // as before, just rendered huge/faded as a background watermark instead
  // of a small solid-white line.
  watermarkTitle: {
    fontSize: 55,
    fontWeight: theme.typography.fontWeight.black,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.2,
    marginLeft: theme.spacing[16],
    color: '#d6d6d6',
  },
  headerContent: {
    position: 'relative',
    zIndex: 1,
    paddingHorizontal: theme.spacing[16],
    paddingTop: 32,
    paddingBottom: 36,
  },
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    marginHorizontal: theme.spacing[16],
  },
  planInfoContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[16],
    paddingVertical: 30,
    marginBottom: theme.spacing[4],
  },
  planInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
  },
  planDescription: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.inverse,
  },
  planDetails: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.muted,
    fontWeight: '500',
  },
  heroCards: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  heroCard: {
    flex: 1,
  },
  heroDivider: {
    width: StyleSheet.hairlineWidth,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    marginTop: theme.spacing[6],
    marginHorizontal: theme.spacing[12],
  },
  cardPercentage: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.text.inverse,
    marginBottom: theme.spacing[4],
  },
  cardFraction: {
    fontSize: theme.typography.fontSize.md,
    color: '#ccc',
    fontWeight: '500',
    opacity: 0.7,
    marginBottom: theme.spacing[12],
  },
  cardLabel: {
    fontSize: theme.typography.fontSize.md,
    color: '#aaa',
    marginBottom: theme.spacing[4],
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: theme.colors.accent,
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: theme.typography.fontSize.xxl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.inverse,
    marginBottom: theme.spacing[8],
  },
  emptyMessage: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.text.muted,
  },
}));

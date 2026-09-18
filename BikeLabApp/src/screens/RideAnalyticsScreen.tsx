import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { apiFetch } from '../utils/api';
import { useProfile } from '../data/hooks/useProfile';
import { useActivityStreams } from '../data/hooks/useActivityStreams';
import { useActivityMetaGoalsProgress } from '../data/hooks/useActivityMetaGoalsProgress';
import { SparkleIcon } from '../assets/img/icons/SparkleIcon';
import { logger } from '../lib/logger';
import { useAppNavigation, useAppRoute } from '../navigation/hooks';
import { makeStyles } from '../theme';
import { RideHeader } from './RideAnalytics/RideHeader';
import { RideStats } from './RideAnalytics/RideStats';
import { StreamsCharts } from './RideAnalytics/StreamsCharts';
import { formatRideDate, computeRideAnalysis } from './RideAnalytics/lib';

// T-5.4 (screen decomposition): nav bar -> RideAnalytics/RideHeader.tsx,
// ride-quality/HR-zones/goals -> RideAnalytics/RideStats.tsx, mini charts
// -> RideAnalytics/StreamsCharts.tsx, pure math -> RideAnalytics/lib.ts
// (unit-tested there).
// T-5.1 (data layer): streams/meta-goals-progress/profile now come from
// useActivityStreams()/useActivityMetaGoalsProgress()/useProfile() instead
// of useAppData() + utils/streamsCache.ts's getActivityStreams() called
// directly + utils/cache.ts's Cache.get/set (7-day client cache — now that
// query's `staleTime`, see useActivityMetaGoalsProgress.ts). No
// AsyncStorage involved either way (A-04) — this is a data-layer
// migration, not a caching-behaviour change.
export const RideAnalyticsScreen = () => {
  const { t } = useTranslation();
  const navigation = useAppNavigation();
  const route = useAppRoute<'RideAnalytics'>();
  const { activity } = route.params;
  const insets = useSafeAreaInsets();

  const profileQuery = useProfile();
  const streamsQuery = useActivityStreams(activity.id);
  const metaGoalsQuery = useActivityMetaGoalsProgress(activity.id);

  const [refreshing, setRefreshing] = useState(false);
  const [checkingExistingChat, setCheckingExistingChat] = useState(false);

  const userProfile = profileQuery.data ?? null;
  const streams = streamsQuery.data ?? null;
  const metaGoals = metaGoalsQuery.data ?? [];

  const rideDate = useMemo(
    () => formatRideDate(activity.start_date),
    [activity.start_date],
  );

  const rideQualityCopy = useMemo(
    () => ({
      poor: {
        label: t('rideAnalytics.qualityPoor'),
        advice: t('rideAnalytics.qualityPoorAdvice'),
      },
      belowAvg: {
        label: t('rideAnalytics.qualityBelowAvg'),
        advice: t('rideAnalytics.qualityBelowAdvice'),
      },
      average: {
        label: t('rideAnalytics.qualityAverage'),
        advice: t('rideAnalytics.qualityAvgAdvice'),
      },
      good: {
        label: t('rideAnalytics.qualityGood'),
        advice: t('rideAnalytics.qualityGoodAdvice'),
      },
      wellDone: {
        label: t('rideAnalytics.qualityWellDone'),
        advice: t('rideAnalytics.qualityWellAdvice'),
      },
      excellent: {
        label: t('rideAnalytics.qualityExcellent'),
        advice: t('rideAnalytics.qualityExcAdvice'),
      },
      awesome: {
        label: t('rideAnalytics.qualityAwesome'),
        advice: t('rideAnalytics.qualityAwesomeAdvice'),
      },
    }),
    [t],
  );

  const { hrZoneDistribution, rideQuality } = useMemo(
    () => computeRideAnalysis(streams, userProfile, activity, rideQualityCopy),
    [streams, userProfile, activity, rideQualityCopy],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([streamsQuery.refetch(), metaGoalsQuery.refetch()]);
    } catch (err) {
      logger.error('Error refreshing:', err);
    } finally {
      setRefreshing(false);
    }
  }, [streamsQuery, metaGoalsQuery]);

  return (
    <View style={styles.container}>
      <RideHeader
        onBack={() => navigation.goBack()}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#fff"
            colors={['#274dd3']}
          />
        }
      >
        <RideStats
          activity={activity}
          rideDate={rideDate}
          rideQuality={rideQuality}
          hrZoneDistribution={hrZoneDistribution}
          metaGoals={metaGoals}
          chartsSlot={
            <StreamsCharts
              streams={streams}
              loading={streamsQuery.isLoading}
              activity={activity}
            />
          }
        />
      </ScrollView>

      {/* Discuss with Coach — floats over the scrolled content instead of
          sitting in its own opaque bar, but a top-transparent/bottom-dark
          gradient scrim behind it keeps whatever's scrolled underneath
          legible instead of the button looking like it's just stuck on top
          of random content. `pointerEvents="none"` so the scrim itself never
          intercepts touches meant for the content — only the button (a
          separate view on top of it) is actually tappable. Style/shadow on
          the button matches Garage's "Analyze ride" button exactly (see
          analyzeButton in GarageScreen.tsx) for consistency. Strava activity
          id goes as a separate `activityId` param, not baked into the
          visible prompt text — CoachChatScreen threads it through as hidden
          model context so it never shows up as a leaked-looking id in the
          chat bubble the user sees. */}
      <LinearGradient
        colors={['rgba(17, 18, 22, 0)', 'rgba(17, 18, 22, 0.9)', '#111216']}
        locations={[0, 0.55, 1]}
        style={styles.discussGradient}
        pointerEvents="none"
      />
      <View style={[styles.discussButtonWrap, { bottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.discussButton}
          disabled={checkingExistingChat}
          onPress={async () => {
            // Tapping this repeatedly for the SAME ride used to spawn a
            // fresh "Analyse my ride ..." conversation every single time,
            // burying the coach's conversation list in duplicates. Check
            // first whether this activity was already tagged onto an
            // existing conversation (server sets that the first time
            // get_activity_analysis resolves it — see /api/coach/chat) and
            // reopen that thread instead of starting a new one.
            setCheckingExistingChat(true);
            try {
              const existing = await apiFetch(
                `/api/coach/conversations/by-activity/${activity.id}`,
              );
              if (existing?.id) {
                navigation.navigate('Main', {
                  screen: 'GoalsTab',
                  params: {
                    screen: 'CoachChat',
                    // requestId (A-22) — see CoachChatScreen; a fresh id per
                    // tap so it re-opens the conversation even if CoachChat
                    // is already the mounted screen.
                    params: {
                      openConversationId: existing.id,
                      requestId: Date.now(),
                    },
                  },
                });
                return;
              }
            } catch {
              // Fall through to starting a fresh analysis conversation —
              // worst case is a duplicate thread, not a broken button.
            } finally {
              setCheckingExistingChat(false);
            }
            const distKm = (activity.distance / 1000).toFixed(1);
            const elevM = Math.round(activity.total_elevation_gain);
            const prompt = `Analyse my ride "${
              activity.name
            }" from ${rideDate}: ${distKm}km, ${elevM}m elevation, ${Math.floor(
              activity.moving_time / 60,
            )} min`;
            navigation.navigate('Main', {
              screen: 'GoalsTab',
              params: {
                screen: 'CoachChat',
                params: {
                  initialPrompt: prompt,
                  activityId: activity.id,
                  requestId: Date.now(),
                },
              },
            });
          }}
        >
          <View style={styles.sparkleIconContainer}>
            <SparkleIcon size={26} color="#fff" />
          </View>
          <Text style={styles.discussButtonText}>
            {t('rideAnalytics.discussWithCoach')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = makeStyles(theme => ({
  container: {
    flex: 1,
    backgroundColor: '#111216',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 0,
    // Clears the floating "Discuss with Coach" button (~90px incl. its
    // shadow + safe-area offset) so the last section never sits behind it.
    paddingBottom: 110,
  },
  discussGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 150,
  },
  discussButtonWrap: {
    position: 'absolute',
    left: theme.spacing[16],
    right: theme.spacing[16],
  },
  // Matches GarageScreen's analyzeButton exactly (same button, conceptually,
  // just relocated) — flat corners, brand-blue fill, blue-tinted shadow.
  discussButton: {
    flexDirection: 'row',
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[8],
    padding: theme.spacing[20],
    borderRadius: theme.radii.pill,
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  sparkleIconContainer: {
    marginTop: -4,
  },
  discussButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    letterSpacing: 0.5,
  },
}));

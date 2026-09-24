// Home screen (T-5.4/T-5.1, audit A-27/A-17). Split into
// `src/screens/Garage/*` sub-components — this file wires the data
// (TanStack Query hooks, no more per-screen AsyncStorage caches or
// useAppData()) and composes them in the same order as before.
import React, {useState, useEffect, useMemo, useCallback} from 'react';
import {View, ScrollView, RefreshControl} from 'react-native';
import {useProfile} from '../data/hooks/useProfile';
import {useActivities} from '../data/hooks/useActivities';
import {useBikes} from '../data/hooks/useBikes';
import {useAchievements} from '../data/hooks/useAchievements';
import {useLatestSnapshot, useSnapshotHistory} from '../data/hooks/useAnalyticsSnapshot';
import {useRefreshActivities} from '../data/hooks/useRefreshActivities';
import {useMetaGoals} from '../data/hooks/useMetaGoals';
import type {MetaGoal} from '@bikelab/shared/types';
import {computeMetricTrend} from '@bikelab/shared/calc';
import {ShareStudioModal, GoalShareStudioModal, useScreenshotListener} from '../components/ShareStudio';
import {getActivityStreams, type StreamData} from '../utils/streamsCache';
import {PlannedRidesWidget} from '../components/PlannedRidesWidget';
import {VO2maxWidget} from '../components/VO2maxWidget';
import {WeatherBlock} from '../components/WeatherBlock';
import {useHideSplash} from '../components/SplashLoader';
import {logger} from '../lib/logger';
import {useAppNavigation} from '../navigation/hooks';
import {makeStyles, useTheme} from '../theme';

import {LastRideHero} from './Garage/LastRideHero';
import {SnapshotWidgets} from './Garage/SnapshotWidgets';
import {GarageGallery} from './Garage/GarageGallery';
import {OverallStats} from './Garage/OverallStats';
import {NutritionCalculator} from './Garage/NutritionCalculator';
import {AchievementsPreview} from './Garage/AchievementsPreview';
import {ChecklistPreview} from './Garage/ChecklistPreview';
import {CompletedGoals} from './Garage/CompletedGoals';
import {
  computeOverallStats,
  findLastRide,
  decodeTrackCoordinates,
  computeMapRegion,
  pickTopAchievements,
  buildCompletedGoalItems,
} from './Garage/lib';

export const GarageScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const hideSplash = useHideSplash();
  const theme = useTheme();

  const profileQuery = useProfile();
  const activitiesQuery = useActivities();
  const bikesQuery = useBikes();
  const achievementsQuery = useAchievements();
  const latestSnapshotQuery = useLatestSnapshot();
  const snapshotHistoryQuery = useSnapshotHistory(2);
  // Completed goals for the "Goals" strip — deliberately not part of
  // `loading` below: the strip just appears once this resolves.
  const metaGoalsQuery = useMetaGoals();

  const [refreshing, setRefreshing] = useState(false);
  const [shareStudioVisible, setShareStudioVisible] = useState(false);
  const [streams, setStreams] = useState<StreamData | null>(null);
  const [goalToShare, setGoalToShare] = useState<MetaGoal | null>(null);

  // useMemo (not a plain `?? []`) so this array is referentially stable
  // across renders — otherwise every derived useMemo below that depends on
  // it (lastRide, trackCoordinates, overallStats) would recompute on every
  // render regardless of whether the underlying data changed.
  const activities = useMemo(() => activitiesQuery.data ?? [], [activitiesQuery.data]);
  const bikes = useMemo(() => bikesQuery.data ?? [], [bikesQuery.data]);
  const userProfile = profileQuery.data ?? null;
  const snapshot = latestSnapshotQuery.data ?? null;

  const lastRide = useMemo(() => findLastRide(activities), [activities]);
  const trackCoordinates = useMemo(
    () => decodeTrackCoordinates(lastRide?.map?.summary_polyline),
    [lastRide?.map?.summary_polyline],
  );
  const mapRegion = useMemo(() => computeMapRegion(trackCoordinates), [trackCoordinates]);
  const overallStats = useMemo(() => computeOverallStats(activities), [activities]);
  const metricsTrend = useMemo(
    () => computeMetricTrend(snapshotHistoryQuery.data ?? []),
    [snapshotHistoryQuery.data],
  );
  const completedGoals = useMemo(
    () => buildCompletedGoalItems(metaGoalsQuery.data ?? [], activities),
    [metaGoalsQuery.data, activities],
  );
  const topAchievements = useMemo(
    () => pickTopAchievements(achievementsQuery.data?.achievements ?? []),
    [achievementsQuery.data],
  );

  // Streams for the Share Studio charts — in-memory only (see
  // utils/streamsCache.ts's own header), loaded whenever the last ride
  // changes. Not a TanStack Query hook: this is the one remaining
  // consumer-scoped cache from T-3.6, already migrated off AsyncStorage in
  // a previous wave, so it's out of this wave's scope to fold into one
  // more.
  useEffect(() => {
    if (!lastRide) {
      setStreams(null);
      return;
    }
    let cancelled = false;
    getActivityStreams(lastRide.id)
      .then(data => {
        if (!cancelled) setStreams(data);
      })
      .catch(() => {
        logger.debug('⚠️ Could not load streams for Share Studio');
      });
    return () => {
      cancelled = true;
    };
  }, [lastRide]);

  const handleScreenshot = useCallback(() => {
    if (lastRide) {
      setShareStudioVisible(true);
    }
  }, [lastRide]);

  useScreenshotListener({
    onScreenshot: handleScreenshot,
    enabled: !!lastRide,
  });

  const loading =
    profileQuery.isLoading ||
    activitiesQuery.isLoading ||
    bikesQuery.isLoading ||
    achievementsQuery.isLoading;

  useEffect(() => {
    if (!loading) {
      hideSplash();
    }
  }, [loading, hideSplash]);

  // Drops the server's 2h activities cache first, then invalidates every
  // query — a pull-to-refresh right after a ride has to reach Strava, not
  // re-read the same cached set (goals are computed from it server-side on
  // every read, so they were frozen with it). Covers the queries this
  // screen's children own too (GarageGallery/WeatherBlock), which used to
  // need their own invalidate-by-key here.
  const refreshEverything = useRefreshActivities();
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshEverything();
    } catch (error) {
      logger.error('Error refreshing garage data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refreshEverything]);

  if (loading) {
    return <View style={styles.container} />;
  }

  return (
    <ScrollView
      testID="garage-screen"
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.accent}
          colors={[theme.colors.accent]}
        />
      }>
      <LastRideHero
        lastRide={lastRide}
        trackCoordinates={trackCoordinates}
        mapRegion={mapRegion}
        onShare={() => setShareStudioVisible(true)}
        onAnalyze={() => {
          if (lastRide) {
            navigation.navigate('RideAnalytics', {activity: lastRide});
          }
        }}
      />

      <SnapshotWidgets
        bikes={bikes}
        activities={activities}
        snapshot={snapshot}
        metricsTrend={metricsTrend}
      />

      <GarageGallery />

      {/* Completed goals right under the gallery, before Overall stats (owner). */}
      <CompletedGoals
        items={completedGoals}
        onOpen={goal =>
          navigation.navigate('GoalsTab', {
            screen: 'GoalDetails',
            params: {goalId: goal.id},
            // Push on top of the tab's CoachChat so "Back to Goals" lands
            // in the Goals tab rather than popping it (see RideAnalytics).
            initial: false,
          })
        }
        onShare={setGoalToShare}
      />

      <OverallStats stats={overallStats} />

      <PlannedRidesWidget />

      <ChecklistPreview />

      <AchievementsPreview achievements={topAchievements} />

      <NutritionCalculator userProfile={userProfile} />

      <VO2maxWidget userProfile={userProfile} />

      <WeatherBlock />

      {lastRide ? <ShareStudioModal
          visible={shareStudioVisible}
          onClose={() => setShareStudioVisible(false)}
          activity={lastRide}
          trackCoordinates={trackCoordinates}
          streams={streams ?? undefined}
        /> : null}

      {goalToShare ? (
        <GoalShareStudioModal
          visible
          onClose={() => setGoalToShare(null)}
          metaGoal={goalToShare}
          activities={activities}
        />
      ) : null}
    </ScrollView>
  );
};

const styles = makeStyles(theme => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.activities.screenBg,
    marginBottom: 0,
  },
  scrollContent: {
    paddingBottom: 0,
  },
}));

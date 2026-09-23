import React, {useState, useMemo, useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ScrollView, ActivityIndicator, RefreshControl} from 'react-native';
import {useProfile} from '../data/hooks/useProfile';
import {useActivities} from '../data/hooks/useActivities';
import {useAnalyticsSummary} from '../data/hooks/useAnalyticsSummary';
import {useSkills} from '../data/hooks/useSkills';
import {useAnalyticsSnapshotHistory} from '../data/hooks/useAnalyticsSnapshotHistory';
import {computeMetricTrend} from '@bikelab/shared/calc';
import {PeriodHeader} from './Analysis/PeriodHeader';
import {SkillsSection} from './Analysis/SkillsSection';
import {
  calculate4WeekPeriods,
  percentForPeriod,
  computeHeroSummary,
  computePlanInfo,
} from './Analysis/lib';
import {ProgressChart} from '../components/ProgressChart';
import {FTPAnalysis} from '../components/FTPAnalysis';
import {PowerAnalysis} from '../components/PowerAnalysis';
import {HeartAnalysis} from '../components/HeartAnalysis';
import {SpeedAnalysis} from '../components/SpeedAnalysis';
import {CadenceAnalysis} from '../components/CadenceAnalysis';
import {KnowledgeCenterModal} from '../components/KnowledgeCenter';
import {makeStyles, useTheme} from '../theme';

// getISOWeekNumber/getISOYear/getDateOfISOWeek moved to @bikelab/shared/calc
// (T-2.4, reconciled with react-spa/src/pages/AnalysisPage.jsx's copies).
// T-5.4 (screen decomposition): pure period/hero-summary/plan-info math
// moved to ./Analysis/lib.ts (unit-tested there); the header/skills JSX
// moved to ./Analysis/PeriodHeader.tsx + ./Analysis/SkillsSection.tsx.
// T-5.1 (data layer): activities/profile/summary/skills now come from
// useActivities()/useProfile()/useAnalyticsSummary('4w')/useSkills()
// instead of useAppData() + a manual apiFetch/useEffect per query — no more
// AppDataContext or analyticsSnapshot.ts usage in this file.

export const AnalysisScreen = () => {
  const {t} = useTranslation();
  const theme = useTheme();
  const activitiesQuery = useActivities();
  const profileQuery = useProfile();
  const summaryQuery = useAnalyticsSummary('4w');
  const skillsQuery = useSkills();
  const snapshotHistoryQuery = useAnalyticsSnapshotHistory(2);
  const [refreshing, setRefreshing] = useState(false);
  const [knowledgeTopic, setKnowledgeTopic] = useState<string | null>(null);

  // `?? []` allocates a fresh array on every render while activitiesQuery
  // is still loading — memoized so the useMemo hooks below that depend on
  // `activities` don't recompute every render just because of that.
  const activities = useMemo(() => activitiesQuery.data ?? [], [activitiesQuery.data]);
  const userProfile = profileQuery.data ?? null;
  const loading = activitiesQuery.isLoading || profileQuery.isLoading;

  const handleHelpPress = useCallback((topicId: string) => {
    setKnowledgeTopic(topicId);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.allSettled([
      activitiesQuery.refetch(),
      profileQuery.refetch(),
      summaryQuery.refetch(),
      skillsQuery.refetch(),
      snapshotHistoryQuery.refetch(),
    ]).finally(() => setRefreshing(false));
  }, [activitiesQuery, profileQuery, summaryQuery, skillsQuery, snapshotHistoryQuery]);

  // Рассчитываем 4-недельные периоды (как на web)
  const periods = useMemo(() => calculate4WeekPeriods(activities), [activities]);

  // Берем текущий (последний) период
  const currentPeriod = useMemo(() => {
    if (periods.length === 0) return null;
    return periods[periods.length - 1];
  }, [periods]);

  const filteredActivities = useMemo(
    () => (currentPeriod ? currentPeriod.activities : []),
    [currentPeriod],
  );

  // VO2max used to be computed here from raw activities (ported from an
  // inline server.js copy). T-3.2 (docs/audit/00-AUDIT-AND-PLAN.md,
  // docs/audit/layers/04-cross-layer.md §4.3): the server is now the single
  // source of truth for the estimated VO2max (via `@bikelab/shared/calc`'s
  // `estimateVO2maxFromActivities`), same as react-spa's AnalysisPage —
  // this screen just reads `summary.vo2max`/`summary.power` from
  // useAnalyticsSummary('4w') instead of recomputing/refetching it itself.
  const summary = summaryQuery.data?.summary ?? null;

  // Skills radar + trend (T-3.3): server-computed, this screen just reads
  // the result via useSkills().
  const apiSkills = skillsQuery.data?.skills ?? null;
  const riderProfile = skillsQuery.data?.riderProfile ?? null;
  const skillsTrend = skillsQuery.data?.trend ?? null;

  // +/- badge next to Avg Power/HR/Cadence: diffs the two most recent
  // analytics_snapshots rows. Used to go through the deprecated
  // utils/analyticsSnapshot.ts shim's getSnapshotHistory/computeMetricTrend
  // — now a real `src/data/hooks/useAnalyticsSnapshotHistory` query plus
  // `@bikelab/shared/calc`'s computeMetricTrend directly (same function the
  // shim re-exported).
  const metricsTrend = useMemo(
    () => computeMetricTrend(snapshotHistoryQuery.data ?? []),
    [snapshotHistoryQuery.data],
  );

  // Рассчитываем прогресс для каждого периода (для графика).
  // Берем только последние 14 периодов.
  const progressData = useMemo(() => {
    if (!userProfile) return [];
    const allProgress = periods.map(period =>
      percentForPeriod(period.activities, period.startDate, period.endDate, userProfile),
    );
    return allProgress.slice(-14);
  }, [periods, userProfile]);

  // Рассчитываем hero summary
  const heroSummary = useMemo(
    () => computeHeroSummary(filteredActivities, userProfile),
    [filteredActivities, userProfile],
  );

  // Информация о плане пользователя
  const planInfo = useMemo(
    () =>
      computePlanInfo(userProfile, {
        balancedPlan: t('analysis.balancedPlan'),
        hWeek: t('analysis.hWeek'),
        ridesWeek: t('analysis.ridesWeek'),
      }),
    [userProfile, t],
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.loadingText}>{t('analysis.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      testID="analysis-tab"
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.successAlt}
          colors={[theme.colors.successAlt]}
        />
      }>
      <PeriodHeader heroSummary={heroSummary} planInfo={planInfo} />

      {progressData.length > 0 && (
        <View style={styles.chartsContainer}>
          <ProgressChart data={progressData} onHelpPress={handleHelpPress} />
        </View>
      )}

      {activities.length > 0 && (
        <SkillsSection
          skills={apiSkills}
          riderProfile={riderProfile}
          skillsTrend={skillsTrend}
          onHelpPress={handleHelpPress}
        />
      )}

      {activities.length > 0 && userProfile && summary?.vo2max ? <FTPAnalysis
          activities={activities}
          userProfile={userProfile}
          vo2max={summary.vo2max}
          onHelpPress={handleHelpPress}
        /> : null}

      {activities.length > 0 && (
        <PowerAnalysis
          activities={activities}
          // `summary.power` isn't in any shared zod schema yet (see
          // useAnalyticsSummary.ts's own comment) — PowerAnalysis's own
          // `PowerSummary` shape isn't exported either, so this narrows
          // through `unknown` rather than reaching for `any`.
          summary={summary?.power as unknown as React.ComponentProps<typeof PowerAnalysis>['summary']}
          onHelpPress={handleHelpPress}
          trend={metricsTrend?.avg_power}
        />
      )}

      {activities.length > 0 && userProfile ? <HeartAnalysis
          activities={activities}
          userProfile={userProfile}
          onHelpPress={handleHelpPress}
          trend={metricsTrend?.avg_hr}
        /> : null}

      {activities.length > 0 && (
        <SpeedAnalysis activities={activities} onHelpPress={handleHelpPress} />
      )}

      {activities.length > 0 && (
        <CadenceAnalysis
          activities={activities}
          onHelpPress={handleHelpPress}
          trend={metricsTrend?.avg_cadence}
        />
      )}

      <KnowledgeCenterModal
        visible={knowledgeTopic !== null}
        onClose={() => setKnowledgeTopic(null)}
        initialTopic={knowledgeTopic}
      />
    </ScrollView>
  );
};

const styles = makeStyles(theme => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    paddingBottom: 52,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  loadingText: {
    marginTop: theme.spacing[16],
    fontSize: theme.typography.fontSize.xl,
    color: theme.colors.text.muted,
  },
  chartsContainer: {
    backgroundColor: theme.colors.surface,
  },
}));

// GoalDetailsScreen — one meta-goal's Metrics/Trainings/Schedule tabs
// (T-5.4, audit A-27: this file used to be 1377 lines; the tab bodies now
// live in src/screens/GoalDetails/*, pure logic in GoalDetails/lib.ts).
import React, {useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert} from 'react-native';
import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import {makeStyles, useTheme} from '../theme';
import type {AppNavigationProp} from '../navigation/types';
import type {useAppRoute} from '../navigation/hooks';
import {useMetaGoalDetail} from '../data/hooks/useMetaGoals';
import {useReopenMetaGoal} from '../data/hooks/useCompleteMetaGoal';
import {useDeleteMetaGoal} from '../data/hooks/useDeleteMetaGoal';
import {useHealthData} from '../hooks/useHealthData';
import {getDateLocale} from '../i18n/dateLocale';
import {GoalHeader} from './GoalDetails/GoalHeader';
import {MetricsTab} from './GoalDetails/MetricsTab';
import {TrainingsTab} from './GoalDetails/TrainingsTab';
import {ScheduleTab} from './GoalDetails/ScheduleTab';
import {CompleteGoalModal} from './GoalDetails/CompleteGoalModal';
import {GoalRidesSection} from './GoalDetails/GoalRidesSection';
import {isMetaGoalExpired} from '@bikelab/shared/calc';
import {computeOverallProgress} from './GoalDetails/lib';
import {useActivities} from '../data/hooks/useActivities';
import {GoalShareStudioModal} from '../components/ShareStudio';
import {ShareIcon} from '../assets/img/icons/ShareIcon';
import {useTabBarBottomPadding, FLOATING_PILL_CLEARANCE_PX} from '../hooks/useTabBarBottomPadding';

interface GoalDetailsScreenProps {
  navigation: AppNavigationProp;
  route: ReturnType<typeof useAppRoute<'GoalDetails'>>;
}

// From this overall progress the Complete pill turns blue (see render).
const GOAL_COMPLETE_READY_PERCENT = 75;

export const GoalDetailsScreen: React.FC<GoalDetailsScreenProps> = ({route, navigation}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const bottomPadding = useTabBarBottomPadding();
  const tabBarHeight = useBottomTabBarHeight();
  const {goalId} = route.params;
  const [activeTab, setActiveTab] = useState<'metrics' | 'trainings' | 'schedule'>('metrics');
  // Health-source sub-goals never get a fresh current_value from the server
  // (Apple Health data is client-only) — MetricsTab/GoalHeader read the
  // live value from here.
  const {healthContext} = useHealthData();

  const {data, isLoading, isError} = useMetaGoalDetail(goalId);
  const metaGoal = data?.metaGoal ?? null;
  const subGoals = data?.subGoals ?? [];
  const attachedRides = data?.rides;
  // Share Studio reads the attached rides off the goal; the detail envelope
  // carries them beside it.
  const goalWithRides = useMemo(
    () => (metaGoal ? {...metaGoal, rides: attachedRides ?? metaGoal.rides} : null),
    [metaGoal, attachedRides],
  );

  // Activities feed the Share Studio recap (km/climb/rides over the goal's
  // window) — same cached GET /api/activities the rest of the app reads.
  const activitiesQuery = useActivities();
  const [shareVisible, setShareVisible] = useState(false);
  const [completeVisible, setCompleteVisible] = useState(false);

  const reopenMetaGoal = useReopenMetaGoal();
  const deleteMetaGoal = useDeleteMetaGoal();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={styles.loadingText}>{t('goalDetails.loading')}</Text>
        </View>
      </View>
    );
  }

  if (isError || !metaGoal) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>⚠️ {t('goalDetails.notFound')}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>{t('goalDetails.backToGoals')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const overallProgress = computeOverallProgress(subGoals, healthContext);
  const completeReady = overallProgress >= GOAL_COMPLETE_READY_PERCENT;

  const handleAskCoach = (promptKey: 'askCoachBannerPrompt' | 'askCoachPlanPrompt' | 'expiredBannerPrompt') => {
    navigation.navigate('CoachChat', {
      initialPrompt: t(`goalDetails.${promptKey}`, {title: metaGoal.title}),
      // requestId (A-22) — see CoachChatScreen; a fresh id per tap so it
      // fires again even if CoachChat is already mounted.
      requestId: Date.now(),
    });
  };

  const handleReopenGoal = () => {
    Alert.alert(t('goalDetails.reopen'), t('goalDetails.reopenConfirm'), [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('goalDetails.reopen'),
        onPress: () =>
          reopenMetaGoal.mutate(goalId, {
            onError: () => Alert.alert(t('common.error'), t('goalDetails.failedReopen')),
          }),
      },
    ]);
  };

  // RideAnalytics needs the full Activity; a ride that isn't among the synced
  // activities the app holds has nothing to open.
  const handleRidePress = (stravaId: number) => {
    const activity = activitiesQuery.data?.find(a => a.id === stravaId);
    if (activity) navigation.navigate('RideAnalytics', {activity});
  };

  const handleDeleteGoal = () => {
    Alert.alert(t('goalDetails.deleteGoal'), t('goalDetails.deleteGoalConfirm'), [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteMetaGoal.mutate(goalId, {
            onSuccess: () => navigation.goBack(),
            onError: () => Alert.alert(t('common.error'), t('goalDetails.failedDelete')),
          });
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{paddingBottom: bottomPadding + (metaGoal.status === 'completed' || completeReady ? FLOATING_PILL_CLEARANCE_PX : 0)}}>
        <GoalHeader
          metaGoal={metaGoal}
          overallProgress={overallProgress}
          locale={getDateLocale()}
          onBack={() => navigation.goBack()}
          onDelete={handleDeleteGoal}
          onShare={() => setShareVisible(true)}
          onAskCoach={() =>
            handleAskCoach(isMetaGoalExpired(metaGoal) ? 'expiredBannerPrompt' : 'askCoachBannerPrompt')
          }
        />

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'metrics' && styles.tabActive]}
            onPress={() => setActiveTab('metrics')}>
            <Text style={[styles.tabText, activeTab === 'metrics' && styles.tabTextActive]}>
              {t('goalDetails.metrics')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'trainings' && styles.tabActive]}
            onPress={() => setActiveTab('trainings')}>
            <Text style={[styles.tabText, activeTab === 'trainings' && styles.tabTextActive]}>
              {t('goalDetails.trainings')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'schedule' && styles.tabActive]}
            onPress={() => setActiveTab('schedule')}>
            <Text style={[styles.tabText, activeTab === 'schedule' && styles.tabTextActive]}>
              {t('goalDetails.scheduled')}
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'metrics' && <MetricsTab subGoals={subGoals} healthContext={healthContext} />}

        {activeTab === 'trainings' && (
          <TrainingsTab metaGoal={metaGoal} onAskCoachForPlan={() => handleAskCoach('askCoachPlanPrompt')} />
        )}

        {activeTab === 'schedule' && (
          <ScheduleTab
            goalId={goalId}
            locale={getDateLocale()}
            onViewCalendar={() => navigation.navigate('CalendarTab', {screen: 'Calendar'})}
          />
        )}

        {metaGoal.status === 'completed' && (
          <GoalRidesSection rides={attachedRides ?? []} onRidePress={handleRidePress} onReopen={handleReopenGoal} />
        )}

        {/* Far from done: Complete lives at the end of the Metrics content,
            grey with black text — reachable, but not inviting a stray tap.
            From GOAL_COMPLETE_READY_PERCENT it moves to the fixed blue pill
            below (owner, 09.10.2026). */}
        {metaGoal.status !== 'completed' && !completeReady && activeTab === 'metrics' && (
          <View style={styles.completeInlineWrap}>
            <TouchableOpacity
              testID="goal-complete-cta"
              style={[styles.completeBtn, styles.completeBtnIdle]}
              onPress={() => setCompleteVisible(true)}>
              <Text style={[styles.completeBtnText, styles.completeBtnTextIdle]}>{t('goalDetails.completeGoal')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Fixed footer CTA — same treatment as GarageScreen's analyzeButton /
          RideAnalyticsScreen's discussButton: flat brand-blue pill with a
          color-matched shadow, pinned above the floating tab bar rather than
          living inline in the scrolling header. Tab bar is `position:
          absolute` (see DEFAULT_TAB_BAR_STYLE) so it doesn't reserve layout
          space of its own — tabBarHeight has to be added explicitly or the
          button sits underneath it. Active goals always get Complete (any
          progress); completed ones swap it for Share. */}
      {metaGoal.status === 'completed' && (
        <View style={[styles.completeBtnWrap, {bottom: tabBarHeight + 16}]}>
          <TouchableOpacity testID="goal-share-cta" style={styles.completeBtn} onPress={() => setShareVisible(true)}>
            <ShareIcon size={18} color={theme.colors.text.inverse} />
            <Text style={styles.completeBtnText}>{t('goalShare.share')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Nearly there: fixed brand-blue pill over the tab bar — the position
          and colour together say "you can close this now". No check mark. */}
      {metaGoal.status !== 'completed' && completeReady ? (
        <View style={[styles.completeBtnWrap, {bottom: tabBarHeight + 16}]}>
          <TouchableOpacity testID="goal-complete-cta" style={styles.completeBtn} onPress={() => setCompleteVisible(true)}>
            <Text style={styles.completeBtnText}>{t('goalDetails.completeGoal')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <CompleteGoalModal
        visible={completeVisible}
        onClose={() => setCompleteVisible(false)}
        metaGoal={metaGoal}
        activities={activitiesQuery.data ?? []}
        overallProgress={overallProgress}
        onCompleted={() => setShareVisible(true)}
      />

      <GoalShareStudioModal
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        metaGoal={goalWithRides ?? metaGoal}
        activities={activitiesQuery.data ?? []}
      />
    </View>
  );
};

const styles = makeStyles(theme => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.activities.screenBg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    color: theme.colors.text.muted,
    marginTop: theme.spacing[16],
    fontSize: theme.typography.fontSize.base,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorTitle: {
    fontSize: theme.typography.fontSize.xxl,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.danger,
    marginBottom: theme.spacing[24],
    textAlign: 'center',
  },
  backBtn: {
    alignSelf: 'flex-start',
  },
  backBtnText: {
    color: theme.colors.text.primary,
    fontSize: 15,
    fontWeight: theme.typography.fontWeight.medium,
  },
  tabsContainer: {
    paddingVertical: theme.spacing[20],
    marginTop: theme.spacing[16],
    paddingHorizontal: theme.spacing[16],
    flexDirection: 'row',
    marginBottom: theme.spacing[8],
    gap: theme.spacing[4],
  },
  tab: {
    paddingVertical: 0,
    alignItems: 'center',
    marginRight: theme.spacing[8],
  },
  tabActive: {
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: theme.typography.fontSize.xxxl,
    textTransform: 'uppercase',
    fontWeight: '800',
    color: 'rgba(0, 0, 0, 0.2)',
  },
  tabTextActive: {
    color: theme.colors.text.primary,
  },
  // Fixed footer wrapper — bottom set inline via tabBarHeight so the button
  // clears the floating (position: absolute) tab bar; alignItems: 'center'
  // makes the button hug its own content width instead of stretching.
  completeBtnWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  // Matches GarageScreen's analyzeButton / RideAnalyticsScreen's
  // discussButton exactly — flat brand-blue pill, blue-tinted shadow —
  // so every primary CTA in the app reads as the same button.
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[8],
    backgroundColor: theme.colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderRadius: theme.radii.pill,
    ...theme.shadows.buttonPrimary,
  },
  // In-flow placement of the idle (grey) Complete button: after the
  // metric cards, centred, with the same side padding as the cards.
  completeInlineWrap: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing[16],
    paddingTop: theme.spacing[8],
    paddingBottom: theme.spacing[16],
  },
  completeBtnIdle: {
    backgroundColor: theme.colors.goalCompleteIdle.bg,
    shadowColor: theme.colors.goalCompleteIdle.shadow,
    shadowOpacity: 0.12,
  },
  completeBtnText: {
    color: theme.colors.text.inverse,
    fontSize: 15,
    fontWeight: theme.typography.fontWeight.bold,
  },
  completeBtnTextIdle: {
    color: theme.colors.black,
    fontWeight: theme.typography.fontWeight.medium,
  },
}));

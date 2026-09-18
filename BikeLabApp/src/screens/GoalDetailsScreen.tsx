// GoalDetailsScreen — one meta-goal's Metrics/Trainings/Schedule tabs
// (T-5.4, audit A-27: this file used to be 1377 lines; the tab bodies now
// live in src/screens/GoalDetails/*, pure logic in GoalDetails/lib.ts).
import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert} from 'react-native';
import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import {makeStyles} from '../theme';
import type {AppNavigationProp} from '../navigation/types';
import type {useAppRoute} from '../navigation/hooks';
import {useMetaGoalDetail} from '../data/hooks/useMetaGoals';
import {useUpdateMetaGoal} from '../data/hooks/useUpdateMetaGoal';
import {useDeleteMetaGoal} from '../data/hooks/useDeleteMetaGoal';
import {useHealthData} from '../hooks/useHealthData';
import {getDateLocale} from '../i18n/dateLocale';
import {GoalHeader} from './GoalDetails/GoalHeader';
import {MetricsTab} from './GoalDetails/MetricsTab';
import {TrainingsTab} from './GoalDetails/TrainingsTab';
import {ScheduleTab} from './GoalDetails/ScheduleTab';
import {computeOverallProgress} from './GoalDetails/lib';

interface GoalDetailsScreenProps {
  navigation: AppNavigationProp;
  route: ReturnType<typeof useAppRoute<'GoalDetails'>>;
}

export const GoalDetailsScreen: React.FC<GoalDetailsScreenProps> = ({route, navigation}) => {
  const {t} = useTranslation();
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

  const updateMetaGoal = useUpdateMetaGoal();
  const deleteMetaGoal = useDeleteMetaGoal();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#274dd3" />
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

  const handleAskCoach = (promptKey: 'askCoachBannerPrompt' | 'askCoachPlanPrompt') => {
    navigation.navigate('CoachChat', {
      initialPrompt: t(`goalDetails.${promptKey}`, {title: metaGoal.title}),
      // requestId (A-22) — see CoachChatScreen; a fresh id per tap so it
      // fires again even if CoachChat is already mounted.
      requestId: Date.now(),
    });
  };

  const handleCompleteGoal = () => {
    Alert.alert(t('goalDetails.completeGoal'), t('goalDetails.completeGoalConfirm'), [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('goalDetails.complete'),
        onPress: () => {
          updateMetaGoal.mutate(
            {id: goalId, body: {status: 'completed'}},
            {
              onError: () => Alert.alert(t('common.error'), t('goalDetails.failedComplete')),
            },
          );
        },
      },
    ]);
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
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <GoalHeader
          metaGoal={metaGoal}
          subGoals={subGoals}
          overallProgress={overallProgress}
          locale={getDateLocale()}
          onBack={() => navigation.goBack()}
          onDelete={handleDeleteGoal}
          onAskCoach={() => handleAskCoach('askCoachBannerPrompt')}
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
      </ScrollView>

      {/* Fixed footer CTA — same treatment as GarageScreen's analyzeButton /
          RideAnalyticsScreen's discussButton: flat brand-blue pill with a
          color-matched shadow, pinned above the floating tab bar rather than
          living inline in the scrolling header. Tab bar is `position:
          absolute` (see DEFAULT_TAB_BAR_STYLE) so it doesn't reserve layout
          space of its own — tabBarHeight has to be added explicitly or the
          button sits underneath it. Only shows once the rider is actually
          close to done (overallProgress >= 75%) — before that, marking
          complete isn't a real action yet. */}
      {metaGoal.status !== 'completed' && overallProgress >= 75 && (
        <View style={[styles.completeBtnWrap, {bottom: tabBarHeight + 16}]}>
          <TouchableOpacity style={styles.completeBtn} onPress={handleCompleteGoal}>
            <Text style={styles.completeCheck}>✓</Text>
            <Text style={styles.completeBtnText}>{t('goalDetails.complete')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = makeStyles(theme => ({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  // Extra bottom padding so the fixed completeBtnWrap footer never overlaps
  // the last scrollable content (schedule rows / training cards).
  scrollContent: {
    paddingBottom: 120,
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
  completeCheck: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
  },
  completeBtnText: {
    color: theme.colors.text.inverse,
    fontSize: 15,
    fontWeight: theme.typography.fontWeight.bold,
  },
}));

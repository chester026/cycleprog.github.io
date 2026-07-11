import React, {useState, useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import {Goal, MetaGoal} from '../utils/goalsCache';
import {Activity} from '../types/activity';
import {apiFetch} from '../utils/api';
import {useAppData} from '../contexts/AppDataContext';
import {TrainingCard} from '../components/TrainingCard';
import {TrainingDetailsModal} from '../components/TrainingDetailsModal';
import {TrainingLibraryModal} from '../components/TrainingLibraryModal';
import {getDateLocale} from '../i18n/dateLocale';
import {useHealthData} from '../hooks/useHealthData';
import {getHealthMetricValue} from '../utils/healthService';
import {BlurView} from '@react-native-community/blur';
import BlobOrb from '../components/BlobOrb';
import {CalendarIcon} from '../assets/img/icons/CalendarIcon';
import {TrashIcon} from '../assets/img/icons/TrashIcon';
import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import {ProgressRing} from '../components/coach/ProgressRing';

const {width: screenWidth} = Dimensions.get('window');

const TIER_CONFIG: Record<string, {color: string; key: string}> = {
  legendary: {color: '#FC5200', key: 'goalTier.legendary'},
  epic: {color: '#8B5CF6', key: 'goalTier.epic'},
  grand: {color: '#274dd3', key: 'goalTier.grand'},
  base: {color: '#ccc', key: 'goalTier.base'},
};

interface ScheduledEvent {
  id: number;
  type: string;
  title: string;
  start_date: string;
  completed?: boolean;
}

const SCHEDULE_TYPE_COLORS: Record<string, string> = {
  planned_ride: '#274dd3',
  rest_day: '#6B7280',
  maintenance: '#F59E0B',
  purchase: '#10B981',
  event: '#FC5200',
  note: '#8B5CF6',
};

export const GoalDetailsScreen: React.FC<any> = ({route, navigation}) => {
  const {t} = useTranslation();
  const tabBarHeight = useBottomTabBarHeight();
  const {loadActivities: loadActivitiesFromContext} = useAppData();
  const {goalId} = route.params;
  const [metaGoal, setMetaGoal] = useState<MetaGoal | null>(null);
  const [subGoals, setSubGoals] = useState<Goal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'metrics' | 'trainings' | 'schedule'>('metrics');
  const [trainingTypes, setTrainingTypes] = useState<any[]>([]);
  const [selectedTraining, setSelectedTraining] = useState<any>(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [libraryModalVisible, setLibraryModalVisible] = useState(false);
  const [scheduledEvents, setScheduledEvents] = useState<ScheduledEvent[]>([]);
  const [loadingScheduled, setLoadingScheduled] = useState(true);
  // Health-source sub-goals never get a fresh current_value from the server
  // (Apple Health data is client-only) — read the live value from here.
  const {healthContext} = useHealthData();

  useEffect(() => {
    loadGoalDetails();
    loadActivities();
    loadTrainingTypes();
    loadScheduledEvents();
  }, [goalId]);

  // Every calendar_events row linked to this goal (past + future — the
  // server skips its usual date window entirely when goal_id is passed, see
  // GET /api/calendar in server.js) — this is the other half of "how's my
  // goal going": not just metric progress from activities, but the actual
  // training plan built for it.
  const loadScheduledEvents = async () => {
    try {
      setLoadingScheduled(true);
      const data = await apiFetch(`/api/calendar?goal_id=${goalId}`);
      setScheduledEvents(data || []);
    } catch (e) {
      console.error('Error loading scheduled sessions:', e);
    } finally {
      setLoadingScheduled(false);
    }
  };

  const loadGoalDetails = async () => {
    try {
      setLoading(true);
      const data = await apiFetch(`/api/meta-goals/${goalId}`);
      setMetaGoal(data.metaGoal);
      setSubGoals(data.subGoals || []);
    } catch (e) {
      console.error('Error loading goal details:', e);
      setError(t('goalDetails.notFound'));
    } finally {
      setLoading(false);
    }
  };

  const loadActivities = async () => {
    try {
      const data = await loadActivitiesFromContext();
      setActivities(data || []);
    } catch (e) {
      console.error('Error loading activities:', e);
    }
  };

  const loadTrainingTypes = async () => {
    try {
      const types = await apiFetch('/api/training-types');
      setTrainingTypes(types || []);
    } catch (error) {
      console.error('Error loading training types:', error);
    }
  };

  // Группировка тренировок для AI-generated режима
  const groupTrainings = () => {
    if (!metaGoal?.trainingTypes || metaGoal.trainingTypes.length === 0) {
      return {mostRecommended: null, priority: [], all: []};
    }

    // AI-сгенерированные тренировки, отсортированные по priority
    const sortedAITrainings = [...metaGoal.trainingTypes].sort((a: any, b: any) => a.priority - b.priority);
    
    // Преобразуем в формат для компонента
    const formattedTrainings = sortedAITrainings.map((training: any) => {
      const libraryTraining = trainingTypes.find(t => t.key === training.type);
      
      // Преобразуем structure из объекта в массив
      let structureArray: string[] = [];
      if (libraryTraining?.structure) {
        if (Array.isArray(libraryTraining.structure)) {
          structureArray = libraryTraining.structure;
        } else if (typeof libraryTraining.structure === 'object') {
          // Преобразуем объект {warmup, main, cooldown} в массив
          const struct = libraryTraining.structure as any;
          if (struct.warmup) structureArray.push(`Warmup: ${struct.warmup}`);
          if (struct.main) structureArray.push(`Main: ${struct.main}`);
          if (struct.cooldown) structureArray.push(`Cooldown: ${struct.cooldown}`);
        }
      }

      return {
        name: training.title,
        type: libraryTraining?.key || training.type,
        trainingType: libraryTraining?.key || training.type,
        recommendation: training.description,
        details: libraryTraining ? {
          intensity: libraryTraining.intensity,
          duration: libraryTraining.duration,
          cadence: libraryTraining.cadence,
          hr_zones: libraryTraining.hr_zones,
          structure: structureArray.length > 0 ? structureArray : undefined,
          benefits: libraryTraining.benefits,
          technical_aspects: libraryTraining.technical_aspects,
          tips: libraryTraining.tips,
          common_mistakes: libraryTraining.common_mistakes
        } : {
          intensity: 'Variable',
          duration: '60-90 min'
        },
        priorityScore: 10 - training.priority
      };
    });
    
    return {
      mostRecommended: formattedTrainings[0] || null,
      priority: formattedTrainings.slice(1, 4),
      all: formattedTrainings
    };
  };

  const handleTrainingPress = (training: any) => {
    setSelectedTraining(training);
    setDetailsModalVisible(true);
  };

  const handleLibraryTrainingSelect = (training: any) => {
    setLibraryModalVisible(false);
    setSelectedTraining(training);
    setDetailsModalVisible(true);
  };

  const handleCompleteGoal = () => {
    Alert.alert(
      'Complete Goal',
      'Mark this goal as completed?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Complete',
          onPress: async () => {
            try {
              await apiFetch(`/api/meta-goals/${goalId}`, {
                method: 'PUT',
                body: JSON.stringify({status: 'completed'})
              });
              loadGoalDetails();
            } catch (e) {
              console.error('Error completing goal:', e);
              Alert.alert(t('common.error'), t('goalDetails.failedComplete'));
            }
          }
        }
      ]
    );
  };

  const handleDeleteGoal = () => {
    Alert.alert(
      t('goalDetails.deleteGoal'),
      t('goalDetails.deleteGoalConfirm'),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/api/meta-goals/${goalId}`, {method: 'DELETE'});
              navigation.goBack();
            } catch (e) {
              console.error('Error deleting goal:', e);
              Alert.alert(t('common.error'), t('goalDetails.failedDelete'));
            }
          }
        }
      ]
    );
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return t('goalDetails.noDeadline');
    const date = new Date(dateString);
    return date.toLocaleDateString(getDateLocale(), {month: 'short', day: 'numeric', year: 'numeric'});
  };

  // Same local-time-parse trick CalendarScreen uses — a bare "YYYY-MM-DD"
  // parses as UTC midnight per spec, which would then render one day early
  // for anyone west of UTC once .toLocaleDateString formats it back in the
  // device's local zone. Appending "T00:00:00" (no "Z") forces local parsing
  // instead, so a scheduled session shows the same day here as it does in
  // the Calendar tab.
  const formatScheduleDate = (dateString: string) => {
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString(getDateLocale(), {weekday: 'short', month: 'short', day: 'numeric'});
  };

  const getGoalTypeLabel = (goalType: string): string => {
    const labels: {[key: string]: string} = {
      distance: t('goalDetails.metricDistance'),
      elevation: t('goalDetails.metricElevation'),
      time: t('goalDetails.metricTime'),
      speed_flat: t('goalDetails.metricSpeedFlat'),
      speed_hills: t('goalDetails.metricSpeedHills'),
      long_rides: t('goalDetails.metricLongRides'),
      intervals: t('goalDetails.metricIntervals'),
      pulse: t('goalDetails.metricAvgHR'),
      cadence: t('goalDetails.metricCadence'),
      avg_power: t('goalDetails.metricAvgPower'),
      ftp_vo2max: t('goalDetails.metricFTP'),
      recovery: t('goalDetails.metricRecovery')
    };
    return labels[goalType] || goalType;
  };

  const getGoalUnit = (goalType: string): string => {
    const units: {[key: string]: string} = {
      distance: t('common.km'),
      elevation: t('common.m'),
      time: t('common.hours'),
      speed_flat: t('common.kmh'),
      speed_hills: t('common.kmh'),
      long_rides: t('common.rides'),
      intervals: t('analysis.workouts'),
      pulse: t('common.bpm'),
      cadence: t('common.rpm'),
      avg_power: t('common.watts'),
      ftp_vo2max: t('common.min'),
      recovery: t('common.rides')
    };
    return units[goalType] || '';
  };

  // Ahead/behind/on-track badge from the server-computed pace object (only
  // present for goals with both start_date/end_date — see
  // goalCalculator.js's addPaceData). Legacy sliding-window goals have no
  // fixed dates to measure pace against, so goal.pace is null for them.
  const getPaceBadge = (goal: Goal): {label: string; color: string} | null => {
    if (!goal.pace) return null;
    if (goal.pace.onTrack) {
      return {label: t('goalDetails.paceOnTrack'), color: '#10b981'};
    }
    return goal.pace.percentDelta < 0
      ? {label: t('goalDetails.paceBehind'), color: '#ef4444'}
      : {label: t('goalDetails.paceAhead'), color: '#10b981'};
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#274dd3" />
          <Text style={styles.loadingText}>{t('goalDetails.loading')}</Text>
        </View>
      </View>
    );
  }

  if (error || !metaGoal) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>⚠️ {error || 'Goal not found'}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>← Back to Goals</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const tier = metaGoal.tier || 'base';
  const tierCfg = TIER_CONFIG[tier] || TIER_CONFIG.base;
  const isHighTier = tier === 'legendary' || tier === 'epic' || tier === 'grand';

  // Same average-of-sub-goal-percentages logic as MetaGoalCard.tsx (ftp_vo2max
  // excluded — legacy special case with its own target_value semantics), so
  // the "ready to mark complete" gate here agrees with what the goals list
  // shows. Health-source sub-goals read the live value the same way the
  // Metrics tab below does, not the server's stale current_value.
  const overallProgress = (() => {
    const relevant = subGoals.filter(g => g.goal_type !== 'ftp_vo2max');
    if (relevant.length === 0) return 0;
    const percentages = relevant.map(g => {
      const current = g.source === 'health'
        ? getHealthMetricValue(healthContext, g.metric?.health_metric, Number(g.current_value) || 0)
        : (Number(g.current_value) || 0);
      const target = Number(g.target_value) || 1;
      return Math.min((current / target) * 100, 100);
    });
    return percentages.reduce((sum, p) => sum + p, 0) / percentages.length;
  })();

  // metaGoal.target_date is basically never populated by the redesigned AI
  // prompt anymore — deadlines now live per sub-goal as end_date instead of
  // one meta-goal-level field (see md/GOALS_REDESIGN_PLAN_FINAL.md), so the
  // "Due" pill under the title used to always read "No deadline" even when
  // every sub-goal clearly had one. Fall back to the latest sub-goal
  // end_date so the header pill reflects reality; legacy goals that DO set
  // target_date still take priority.
  const derivedDueDate = metaGoal.target_date || subGoals.reduce<string | null>((latest, g) => {
    if (!g.end_date) return latest;
    return !latest || g.end_date > latest ? g.end_date : latest;
  }, null);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Blob + blur backdrop behind the header — same BlobOrb/BlurView
            combo as CoachChatScreen, but scrolls away WITH the header now
            instead of staying pinned — the whole screen scrolls as one
            unit, only the tab bar/footer button stay fixed. */}
        <View style={styles.heroBackground} pointerEvents="none">
          <View style={styles.blobContainer}>
            <BlobOrb size={420} />
          </View>
          <BlurView
            blurType="light"
            blurAmount={25}
            style={StyleSheet.absoluteFill}
            reducedTransparencyFallbackColor="rgba(250, 250, 250, 0.9)"
          />
        </View>

        {/* Header content sits over the blob — title is plain solid black,
            no accent highlight, per explicit design direction. */}
        <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteIconBtn} onPress={handleDeleteGoal}>
            <TrashIcon size={18} color="#ef4444" />
          </TouchableOpacity>
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>{metaGoal.title}</Text>
        </View>

        <View style={styles.metaRow}>
          {isHighTier && (
            <View style={[styles.tierBadge, {backgroundColor: tierCfg.color}]}>
              <Text style={styles.tierBadgeText}>{t(tierCfg.key)}</Text>
            </View>
          )}
          <View style={styles.pill}>
            <CalendarIcon size={14} color="rgba(0, 0, 0, 0.55)" />
            <Text style={styles.pillText}>
              {derivedDueDate ? `${t('goalDetails.due')}${formatDate(derivedDueDate)}` : t('goalDetails.noDeadline')}
            </Text>
          </View>
          <View style={styles.pill}>
            <View
              style={[
                styles.statusDot,
                {backgroundColor: metaGoal.status === 'completed' ? '#9ca3af' : '#22c55e'},
              ]}
            />
            <Text style={styles.pillText}>
              {metaGoal.status === 'completed' ? t('goalDetails.completed') : t('goalDetails.statusActive')}
            </Text>
          </View>
        </View>

        <Text style={styles.description}>{metaGoal.description}</Text>

        {/* Overall progress (avg of all sub-goals) merged into the "ask
            coach" nudge instead of its own row — one card instead of two,
            and the ring sits in a fixed-size slot so it doesn't fight with
            title/pill wrapping the way a standalone bar/ring did. Subtitle
            stays generic (no percent) — the ring itself already carries
            the number, no need to say it twice. */}
        <TouchableOpacity
          style={styles.aiBanner}
          activeOpacity={0.85}
          onPress={() =>
            navigation.navigate('CoachChat', {
              initialPrompt: t('goalDetails.askCoachBannerPrompt', {title: metaGoal.title}),
            })
          }>
          {/* Solid blue badge (same weight/color as the original icon)
              nested inside a thin progress ring — percent in the center
              instead of the sparkle so the number itself carries the
              progress info, ring arc reinforces it visually. */}
          <ProgressRing size={52} strokeWidth={4.5} value={overallProgress} colors={['#274dd3', '#5B7FE8']} gradientId="goalBannerRing" trackColor="rgba(39, 77, 211, 0.12)">
            <View style={styles.aiBannerIconInner}>
              <Text style={styles.aiBannerIconPercent}>{Math.round(overallProgress)}%</Text>
            </View>
          </ProgressRing>
          <View style={styles.aiBannerText}>
            <Text style={styles.aiBannerTitle}>{t('goalDetails.askCoachBannerTitle')}</Text>
            <Text style={styles.aiBannerSubtitle}>{t('goalDetails.askCoachBannerSubtitle')}</Text>
          </View>
          <Text style={styles.aiBannerChevron}>›</Text>
        </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'metrics' && styles.tabActive]}
            onPress={() => setActiveTab('metrics')}
          >
            <Text style={[styles.tabText, activeTab === 'metrics' && styles.tabTextActive]}>
              {t('goalDetails.metrics')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'trainings' && styles.tabActive]}
            onPress={() => setActiveTab('trainings')}
          >
            <Text style={[styles.tabText, activeTab === 'trainings' && styles.tabTextActive]}>
              {t('goalDetails.trainings')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'schedule' && styles.tabActive]}
            onPress={() => setActiveTab('schedule')}
          >
            <Text style={[styles.tabText, activeTab === 'schedule' && styles.tabTextActive]}>
              {t('goalDetails.scheduled')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Metrics Tab */}
        {activeTab === 'metrics' && (
          <View style={styles.section}>

            {subGoals.map((goal) => {
            // Server (GET /api/meta-goals/:id) already computed current_value
            // fresh via goalCalculator — the one exception is health-source
            // goals, which the server can't compute (Apple Health is
            // client-only), so those read the live value from useHealthData().
            const current = goal.source === 'health'
              ? getHealthMetricValue(healthContext, goal.metric?.health_metric, Number(goal.current_value) || 0)
              : (Number(goal.current_value) || 0);
            const target = Number(goal.target_value) || 1;
            const percentage = Math.min((current / target) * 100, 100);
            const safePercentage = isFinite(percentage) ? percentage : 0;
            const label = goal.title || getGoalTypeLabel(goal.goal_type);
            const unit = goal.unit || getGoalUnit(goal.goal_type);
            const paceBadge = getPaceBadge(goal);

            return (
              <View key={goal.id} style={styles.goalCard}>
                <View style={styles.goalHeader}>
                  <Text style={styles.goalTitle}>{label}</Text>
                  {/* Date range used to live here — dropped in favor of the
                      pace badge (the thing that actually matters at a
                      glance); dates are still visible per-goal via the
                      derived "Due" pill up in the header. */}
                  {paceBadge && (
                    <View style={[styles.paceHeaderBadge, {backgroundColor: paceBadge.color + '18'}]}>
                      <Text style={[styles.paceHeaderBadgeText, {color: paceBadge.color}]}>{paceBadge.label}</Text>
                    </View>
                  )}
                </View>

                {goal.description && (
                  <Text style={styles.goalDescription}>{goal.description}</Text>
                )}

                <View style={styles.progressRow}>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${safePercentage}%`,
                          backgroundColor: safePercentage >= 100 ? '#10b981' : safePercentage >= 50 ? '#f59e0b' : '#ef4444'
                        }
                      ]}
                    />
                  </View>
                  <Text style={styles.progressPercentage}>{Math.round(safePercentage)}%</Text>
                </View>

                <View style={styles.statsRow}>
                  <Text style={styles.statText}>
                    {t('goalDetails.current')}<Text style={styles.statValue}>{(Number(current) || 0).toFixed(1)} {unit}</Text>
                  </Text>
                  <Text style={styles.statText}>
                    {t('goalDetails.target')}<Text style={styles.statValue}>{(Number(target) || 1).toFixed(1)} {unit}</Text>
                  </Text>
                </View>
              </View>
            );
          })}
          </View>
        )}

        {/* Trainings Tab */}
        {activeTab === 'trainings' && (
          <View style={styles.section}>
            {renderTrainingCenter()}
          </View>
        )}

        {/* Schedule Tab — calendar_events linked to this goal (goal_id) */}
        {activeTab === 'schedule' && (
          <View style={styles.section}>
            {loadingScheduled ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#274dd3" />
              </View>
            ) : scheduledEvents.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>{t('goalDetails.noScheduled')}</Text>
                <Text style={styles.emptyStateSubtext}>{t('goalDetails.noScheduledHint')}</Text>
              </View>
            ) : (
              <>
                {[...scheduledEvents]
                  .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
                  .map((ev) => (
                    <View key={ev.id} style={styles.scheduleRow}>
                      <View
                        style={[
                          styles.scheduleDot,
                          {backgroundColor: SCHEDULE_TYPE_COLORS[ev.type] || SCHEDULE_TYPE_COLORS.planned_ride},
                        ]}
                      />
                      <View style={styles.scheduleContent}>
                        <Text style={[styles.scheduleTitle, ev.completed && styles.scheduleTitleDone]} numberOfLines={1}>
                          {ev.title}
                        </Text>
                        <Text style={styles.scheduleDate}>{formatScheduleDate(ev.start_date)}</Text>
                      </View>
                      {ev.completed && <Text style={styles.scheduleDoneBadge}>{t('goalDetails.done')}</Text>}
                    </View>
                  ))}
                <TouchableOpacity
                  style={styles.viewCalendarBtn}
                  onPress={() => navigation.navigate('CalendarTab', {screen: 'Calendar'})}>
                  <Text style={styles.viewCalendarBtnText}>{t('coach.viewInCalendar')} →</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Fixed footer CTA — same treatment as GarageScreen's analyzeButton /
          RideAnalyticsScreen's discussButton: flat brand-blue pill with a
          color-matched shadow, pinned above the floating tab bar rather than
          living inline in the scrolling header. Tab bar is `position:
          absolute` (see DEFAULT_TAB_BAR_STYLE) so it doesn't reserve layout
          space of its own — tabBarHeight has to be added explicitly or the
          button sits underneath it. Button hugs its own content width
          (alignItems: 'center' on the wrap) instead of stretching edge to
          edge, per design direction. Only shows once the rider is actually
          close to done (overallProgress >= 50%) — before that, marking
          complete isn't a real action yet. */}
      {metaGoal.status !== 'completed' && overallProgress >= 50 && (
        <View style={[styles.completeBtnWrap, {bottom: tabBarHeight + 16}]}>
          <TouchableOpacity style={styles.completeBtn} onPress={handleCompleteGoal}>
            <Text style={styles.completeCheck}>✓</Text>
            <Text style={styles.completeBtnText}>{t('goalDetails.complete')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modals */}
      <TrainingDetailsModal
        visible={detailsModalVisible}
        training={selectedTraining}
        onClose={() => setDetailsModalVisible(false)}
      />
      
      <TrainingLibraryModal
        visible={libraryModalVisible}
        onClose={() => setLibraryModalVisible(false)}
        onTrainingSelect={handleLibraryTrainingSelect}
      />
    </View>
  );

  // Рендер Training Center (AI-Generated режим)
  function renderTrainingCenter() {
    const grouped = groupTrainings();
    
    if (!grouped.mostRecommended && grouped.priority.length === 0) {
      // Redesigned goals don't get a static trainingTypes list baked in at
      // creation anymore (see md/GOALS_REDESIGN_PLAN_FINAL.md §4, Phase 3) —
      // the coach builds a plan on request instead, through the same chat
      // it already uses for calendar planning. Legacy goals still show the
      // old empty-state copy since they never had trainingTypes to begin
      // with either way, but framing it as "ask the coach" is better for
      // everyone at this point.
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            {t('goalDetails.noTrainings')}
          </Text>
          <Text style={styles.emptyStateSubtext}>
            {t('goalDetails.noTrainingsHint')}
          </Text>
          <TouchableOpacity
            style={styles.askCoachBtn}
            activeOpacity={0.85}
            onPress={() =>
              navigation.navigate('CoachChat', {
                initialPrompt: t('goalDetails.askCoachPlanPrompt', {title: metaGoal?.title}),
              })
            }>
            <Text style={styles.askCoachBtnText}>{t('goalDetails.askCoachPlan')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.trainingCenter}>
        {/* Most Recommended */}
        <Text style={styles.subsectionTitle}>{t('goalDetails.aiTrainings')}</Text>

        {/* Priority Trainings (3 cards) */}
        {grouped.priority.length > 0 && (
         
           <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.prioritySection}
              style={{marginBottom: 16}}>
            <View style={styles.priorityGrid}>
            {grouped.mostRecommended && (
                <View style={styles.mostRecommendedSection}>
                  <TrainingCard
                    title={grouped.mostRecommended.name}
                    description={grouped.mostRecommended.recommendation}
                    intensity={grouped.mostRecommended.details?.intensity}
                    duration={grouped.mostRecommended.details?.duration}
                    trainingType={grouped.mostRecommended.trainingType}
                    size="large"
                    variant="most-recommended"
                    showBadge
                    badgeText={t('goalDetails.mostRecommended')}
                    onPress={() => handleTrainingPress(grouped.mostRecommended)}
                    backgroundImage={require('../assets/img/mostrecomended.webp')}
                  />
                </View>
                )}
              {grouped.priority.map((training: any, index: number) => (
                <TrainingCard
                  key={`priority-${index}`}
                  title={training.name}
                  description={training.recommendation}
                  intensity={training.details?.intensity}
                  duration={training.details?.duration}
                  trainingType={training.trainingType}
                  size="normal"
                  variant="priority"
                  showBadge
                  badgeText={t('common.recommended')}
                  onPress={() => handleTrainingPress(training)}
                  backgroundImage={
                    index % 4 === 0
                      ? require('../assets/img/blob1.png')
                      : index % 4 === 1
                      ? require('../assets/img/blob2.png')
                      : index % 4 === 2
                      ? require('../assets/img/blob3.png')
                      : require('../assets/img/blob4.png')
                  }
                />
              ))}
            </View>
          </ScrollView>
        )}
        <Text style={styles.subsectionTitle}>{t('goalDetails.repeatableTrainings')}</Text>
        {/* Preferable + More section */}
        <View style={styles.preferableSection}>
          <View style={styles.preferableGrid}>
            {/* Recovery Ride */}
            <TrainingCard
              title={t('goalDetails.recoveryRide')}
              description={t('goalDetails.recoveryRideDesc')}
              intensity="50-65% FTP"
              duration="45"
              trainingType="recovery"
              size="small"
              variant="preferable"
              backgroundColor="#f1f0f0"
              textColor="black"
              showOverlay={false}
              showBadge
              badgeText={t('goalDetails.preferable')}
              onPress={() =>
                handleTrainingPress({
                  name: t('goalDetails.recoveryRide'),
                  type: 'recovery',
                  trainingType: 'recovery',
                  recommendation: t('goalDetails.recoveryRideDesc'),
                  details: {
                    intensity: '50-65% FTP',
                    duration: '45 min',
                    cadence: '70-80 rpm',
                    hr_zones: 'Z1-Z2',
                    structure: [
                      'Warmup: 5 minutes easy spin (50% FTP)',
                      'Main: 30-40 minutes easy riding (55-65% FTP)',
                      'Cooldown: 5 minutes very easy (50% FTP)',
                    ],
                    benefits: [
                      'Accelerate recovery',
                      'Improve blood circulation',
                      'Reduce muscle fatigue',
                      'Maintain base fitness',
                    ],
                    technical_aspects: [
                      'Keep cadence smooth and consistent',
                      'Avoid any hard efforts',
                      'Stay in easy gears',
                      'Focus on smooth pedaling technique',
                    ],
                    tips: [
                      'Ride alone or with slower group',
                      'Choose flat route',
                      'Avoid competitive situations',
                      'Stay hydrated',
                    ],
                    common_mistakes: [
                      'Too high intensity',
                      'Too long workout',
                      'Joining fast group rides',
                      'Skipping recovery rides',
                    ],
                  },
                })
              }
              
            />

            {/* Group Ride */}
            <TrainingCard
              title={t('goalDetails.groupRide')}
              description={t('goalDetails.groupRideDesc')}
              intensity="70-90% FTP"
              duration="120"
              trainingType="group_ride"
              size="small"
              variant="preferable"
              backgroundColor="#F1F0F0"
              textColor="black"
              showOverlay={false}
              showBadge
              badgeText={t('goalDetails.preferable')}
              onPress={() =>
                handleTrainingPress({
                  name: t('goalDetails.groupRide'),
                  type: 'group_ride',
                  trainingType: 'group_ride',
                  recommendation: t('goalDetails.groupRideDesc'),
                  details: {
                    intensity: '70-90% FTP',
                    duration: '120 min',
                    cadence: '80-95 rpm',
                    hr_zones: 'Z2-Z4',
                    structure: [
                      'Warmup: 15 minutes easy pace',
                      'Main: 90 minutes group ride with variable intensity',
                      'Cooldown: 15 minutes easy spin',
                    ],
                    benefits: [
                      'Develop group riding skills',
                      'Social aspect of training',
                      'Learn drafting techniques',
                      'Improve tactical awareness',
                    ],
                    technical_aspects: [
                      'Maintain proper positioning in group',
                      'Practice smooth drafting',
                      'Communicate with other riders',
                      'Learn to ride in echelon',
                    ],
                    tips: [
                      'Stay alert and focused',
                      'Keep safe distance from wheel ahead',
                      'Signal your intentions clearly',
                      'Take turns at the front',
                    ],
                    common_mistakes: [
                      'Poor positioning in pack',
                      'Ignoring group dynamics',
                      'Overlapping wheels',
                      'Not communicating',
                    ],
                  },
                })
              }
              
            />
          </View>

          {/* More Trainings Button */}
          <TouchableOpacity
            style={styles.moreTrainingsCard}
            onPress={() => setLibraryModalVisible(true)}
            activeOpacity={0.8}
          >
            <View style={styles.moreTrainingsContent}>
              <Text style={styles.moreTrainingsTitle}>{t('goalDetails.moreTrainings')}</Text>
              <Text style={styles.moreTrainingsDescription}>
                {t('goalDetails.moreTrainingsHint')}
              </Text>
            </View>
            <View style={styles.moreTrainingsButton}>
              <Text style={styles.moreTrainingsButtonText}>{t('goalDetails.exploreMore')}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa'
  },
  // Extra bottom padding so the fixed completeBtnWrap footer never overlaps
  // the last scrollable content (schedule rows / training cards).
  scrollContent: {
    paddingBottom: 120
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40
  },
  loadingText: {
    color: '#888',
    marginTop: 16,
    fontSize: 14
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ef4444',
    marginBottom: 24,
    textAlign: 'center'
  },
  // Fixed backdrop behind the header — a bounded-height absolute layer, same
  // pattern as CoachChatScreen's heroBackgroundFixed: an oversized BlobOrb
  // offset upward so it bleeds off both edges, clipped by overflow:'hidden',
  // then a light BlurView wash softens it into the pastel gradient look.
  heroBackground: {
    ...StyleSheet.absoluteFillObject,
    height: 440,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  blobContainer: {
    position: 'absolute',
    top: -230,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.8,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 8,
  },
  // Back button + delete icon share a row now (delete used to be a text
  // button down in actionsRow) — mirrors the mockup's top-right circular
  // icon button, same rgba-white-glass treatment as CoachChatScreen's
  // iconButton.
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  backBtn: {
    alignSelf: 'flex-start',
  },
  backBtnText: {
    color: '#1a1a1a',
    fontSize: 15,
    fontWeight: '600'
  },
  // Same treatment as CoachChatScreen's iconButton (the chat header's ×/+
  // buttons) — white-glass fill with a hairline border, not just a flat
  // tint, so it reads clearly against the blob background.
  deleteIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1a1a1a',
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.3)',
    marginBottom: 20,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
   
  },
  tierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    lineHeight: 14,
  },
  description: {
    fontSize: 15,
    color: 'rgba(0, 0, 0, 0.5)',
    lineHeight: 21,
    marginBottom: 20,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  // Rounded pills over the blob — same shape language for both the "due
  // date" and "status" chips so they read as one family. Needs to be
  // near-opaque + a hairline border, not just a light tint, or it blends
  // into the pastel blob wash behind it depending on scroll position.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.65)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
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
    gap: 8,
    backgroundColor: '#274dd3',
    paddingVertical: 20,
    paddingHorizontal: 22,
    borderRadius: 100,
    shadowColor: '#274dd3',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  completeCheck: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  completeBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700'
  },
  section: {
    paddingHorizontal: 0
  },
  aiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.16)',
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    shadowColor: '#10101E',
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 3,
  },
  aiBannerIconInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiBannerIconPercent: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800',
  },
  aiBannerText: {
    flex: 1,
  },
  aiBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  aiBannerSubtitle: {
    fontSize: 13,
    color: 'rgba(0, 0, 0, 0.45)',
  },
  aiBannerChevron: {
    fontSize: 22,
    fontWeight: '700',
    color: 'rgba(0, 0, 0, 0.25)',
  },
  sectionTitle: {
    fontSize: 24,
    textTransform: 'uppercase',
    fontWeight: '800',
    opacity: 0.2,
    color: '#1a1a1a',
    marginTop: 16,
    marginBottom: 24
  },
  goalCard: {
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ECECEC',
    borderRadius: 16,
   
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32
  },
  goalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1
  },
  // Tinted pace pill in the metric card's header — replaces the old date
  // range badge (goalPeriod), moved here per design direction since pace
  // is the thing worth a glance, not the raw dates.
  paceHeaderBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
  paceHeaderBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  goalDescription: {
    fontSize: 13,
    color: '#888',
    marginBottom: 16,
    lineHeight: 18
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#ddd',
    overflow: 'hidden',
    marginRight: 8
  },
  progressFill: {
    height: '100%',

  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1a1a1a',
    minWidth: 40,
    textAlign: 'right'
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  statText: {
    fontSize: 13,
    color: '#888'
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a'
  },
  // Tabs
  tabsContainer: {
    paddingVertical: 20,
    marginTop: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    marginBottom: 8,
    gap: 4,
  },
  tab: {
    paddingVertical: 0,
    alignItems: 'center',
    marginRight: 8
  },
  tabActive: {
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 24,
    textTransform: 'uppercase',
    fontWeight: '800',
    color: 'rgba(0, 0, 0, 0.2)',
  },
  tabTextActive: {
    color: '#1a1a1a',
  },
  // Training Center
  trainingCenter: {
    gap: 0,
  },
  mostRecommendedSection: {
    marginBottom: 0,
    width: 290,
  },
  prioritySection: {
    marginBottom: 16,
    marginLeft: 16,
    paddingRight: 16,
  },
  priorityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  preferableSection: {
    marginBottom: 16,
    marginHorizontal: 16,
  },
  preferableGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 0,
  },
  moreTrainingsCard: {
    backgroundColor: '#274dd3',
    padding: 24,
    borderRadius: 0,
    justifyContent: 'space-between',
    minHeight: 160,
    marginBottom: 32,
  },
  moreTrainingsContent: {
    flex: 1,
    marginBottom: 16,
  },
  moreTrainingsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  moreTrainingsDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 18,
  },
  moreTrainingsButton: {
    backgroundColor: 'rgba(37, 37, 37, 0.15)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',

  },
  moreTrainingsButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
  },
  askCoachBtn: {
    backgroundColor: '#274dd3',
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 20,
  },
  askCoachBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ECECEC',
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 10,
  },
  scheduleDot: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  scheduleContent: {
    flex: 1,
  },
  scheduleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  scheduleTitleDone: {
    color: '#999',
    textDecorationLine: 'line-through',
  },
  scheduleDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 1,
    textTransform: 'capitalize',
  },
  scheduleDoneBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10b981',
  },
  viewCalendarBtn: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  viewCalendarBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#274dd3',
  },
});


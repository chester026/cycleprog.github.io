// "Trainings" tab of GoalDetailsScreen — Training Center (AI-generated
// trainings from the meta-goal + a couple of static "repeatable" cards +
// the full training library modal) (T-5.4, audit A-27).
import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ScrollView, TouchableOpacity} from 'react-native';
import type {MetaGoal} from '@bikelab/shared/types';
import {useTrainingTypes} from '../../data/hooks/useTrainingTypes';
import {TrainingCard} from '../../components/TrainingCard';
import {TrainingDetailsModal, type TrainingDetails} from '../../components/TrainingDetailsModal';
import {TrainingLibraryModal} from '../../components/TrainingLibraryModal';
import {makeStyles} from '../../theme';
import {groupTrainings} from './lib';

interface TrainingsTabProps {
  metaGoal: MetaGoal;
  onAskCoachForPlan: () => void;
}

export const TrainingsTab: React.FC<TrainingsTabProps> = ({metaGoal, onAskCoachForPlan}) => {
  const {t} = useTranslation();
  const {data: trainingTypes = []} = useTrainingTypes();
  const [selectedTraining, setSelectedTraining] = useState<TrainingDetails | null>(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [libraryModalVisible, setLibraryModalVisible] = useState(false);

  const handleTrainingPress = (training: TrainingDetails) => {
    setSelectedTraining(training);
    setDetailsModalVisible(true);
  };

  const handleLibraryTrainingSelect = (training: TrainingDetails) => {
    setLibraryModalVisible(false);
    setSelectedTraining(training);
    setDetailsModalVisible(true);
  };

  const grouped = groupTrainings(metaGoal, trainingTypes);

  return (
    <View style={styles.section}>
      {!grouped.mostRecommended && grouped.priority.length === 0 ? (
        // Redesigned goals don't get a static trainingTypes list baked in at
        // creation anymore (see md/GOALS_REDESIGN_PLAN_FINAL.md §4, Phase 3) —
        // the coach builds a plan on request instead, through the same chat
        // it already uses for calendar planning. Legacy goals still show the
        // old empty-state copy since they never had trainingTypes to begin
        // with either way, but framing it as "ask the coach" is better for
        // everyone at this point.
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>{t('goalDetails.noTrainings')}</Text>
          <Text style={styles.emptyStateSubtext}>{t('goalDetails.noTrainingsHint')}</Text>
          <TouchableOpacity style={styles.askCoachBtn} activeOpacity={0.85} onPress={onAskCoachForPlan}>
            <Text style={styles.askCoachBtnText}>{t('goalDetails.askCoachPlan')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.trainingCenter}>
          <Text style={styles.subsectionTitle}>{t('goalDetails.aiTrainings')}</Text>

          {grouped.priority.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.prioritySection}
              style={styles.priorityScroll}>
              <View style={styles.priorityGrid}>
                {grouped.mostRecommended ? <View style={styles.mostRecommendedSection}>
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
                      onPress={() => handleTrainingPress(grouped.mostRecommended as TrainingDetails)}
                      backgroundImage={require('../../assets/img/mostrecomended.webp')}
                    />
                  </View> : null}
                {grouped.priority.map((training, index) => (
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
                        ? require('../../assets/img/blob1.png')
                        : index % 4 === 1
                        ? require('../../assets/img/blob2.png')
                        : index % 4 === 2
                        ? require('../../assets/img/blob3.png')
                        : require('../../assets/img/blob4.png')
                    }
                  />
                ))}
              </View>
            </ScrollView>
          )}

          <Text style={styles.subsectionTitle}>{t('goalDetails.repeatableTrainings')}</Text>
          <View style={styles.preferableSection}>
            <View style={styles.preferableGrid}>
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

            <TouchableOpacity
              style={styles.moreTrainingsCard}
              onPress={() => setLibraryModalVisible(true)}
              activeOpacity={0.8}>
              <View style={styles.moreTrainingsContent}>
                <Text style={styles.moreTrainingsTitle}>{t('goalDetails.moreTrainings')}</Text>
                <Text style={styles.moreTrainingsDescription}>{t('goalDetails.moreTrainingsHint')}</Text>
              </View>
              <View style={styles.moreTrainingsButton}>
                <Text style={styles.moreTrainingsButtonText}>{t('goalDetails.exploreMore')}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      )}

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
};

const styles = makeStyles(theme => ({
  section: {
    paddingHorizontal: 0,
  },
  subsectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.medium,
    color: 'rgba(0, 0, 0, 0.3)',
    marginBottom: theme.spacing[20],
    textTransform: 'uppercase',
    paddingHorizontal: theme.spacing[16],
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginBottom: theme.spacing[8],
  },
  emptyStateSubtext: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.muted,
    textAlign: 'center',
  },
  askCoachBtn: {
    backgroundColor: theme.colors.accent,
    paddingVertical: theme.spacing[12],
    paddingHorizontal: theme.spacing[24],
    marginTop: theme.spacing[20],
  },
  askCoachBtnText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
  },
  trainingCenter: {
    gap: 0,
  },
  mostRecommendedSection: {
    marginBottom: 0,
    width: 290,
  },
  priorityScroll: {
    marginBottom: theme.spacing[16],
  },
  prioritySection: {
    marginBottom: theme.spacing[16],
    marginLeft: theme.spacing[16],
    paddingRight: theme.spacing[16],
  },
  priorityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[8],
  },
  preferableSection: {
    marginBottom: theme.spacing[16],
    marginHorizontal: theme.spacing[16],
  },
  preferableGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[8],
    marginBottom: 0,
  },
  moreTrainingsCard: {
    backgroundColor: theme.colors.accent,
    padding: theme.spacing[24],
    borderRadius: theme.radii.none,
    justifyContent: 'space-between',
    minHeight: 160,
    marginBottom: theme.spacing[32],
  },
  moreTrainingsContent: {
    flex: 1,
    marginBottom: theme.spacing[16],
  },
  moreTrainingsTitle: {
    fontSize: theme.typography.fontSize.xxl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.inverse,
    marginBottom: theme.spacing[8],
  },
  moreTrainingsDescription: {
    fontSize: theme.typography.fontSize.base,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 18,
  },
  moreTrainingsButton: {
    backgroundColor: 'rgba(37, 37, 37, 0.15)',
    paddingVertical: theme.spacing[12],
    paddingHorizontal: theme.spacing[24],
    alignItems: 'center',
  },
  moreTrainingsButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
  },
}));

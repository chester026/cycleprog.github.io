import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  ImageBackground
} from 'react-native';
import {Goal, MetaGoal, calculateGoalProgress} from '../utils/goalsCache';
import {Activity} from '../types/activity';
import {apiFetch} from '../utils/api';
import {TrainingCard} from '../components/TrainingCard';
import {TrainingDetailsModal} from '../components/TrainingDetailsModal';
import {TrainingLibraryModal} from '../components/TrainingLibraryModal';

const {width: screenWidth} = Dimensions.get('window');

export const GoalDetailsScreen: React.FC<any> = ({route, navigation}) => {
  const {goalId} = route.params;
  const [metaGoal, setMetaGoal] = useState<MetaGoal | null>(null);
  const [subGoals, setSubGoals] = useState<Goal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'metrics' | 'trainings'>('metrics');
  const [trainingTypes, setTrainingTypes] = useState<any[]>([]);
  const [selectedTraining, setSelectedTraining] = useState<any>(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [libraryModalVisible, setLibraryModalVisible] = useState(false);

  useEffect(() => {
    loadGoalDetails();
    loadActivities();
    loadTrainingTypes();
  }, [goalId]);

  const loadGoalDetails = async () => {
    try {
      setLoading(true);
      const data = await apiFetch(`/api/meta-goals/${goalId}`);
      setMetaGoal(data.metaGoal);
      setSubGoals(data.subGoals || []);
    } catch (e) {
      console.error('Error loading goal details:', e);
      setError('Failed to load goal details');
    } finally {
      setLoading(false);
    }
  };

  const loadActivities = async () => {
    try {
      const data = await apiFetch('/api/activities');
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
              Alert.alert('Error', 'Failed to complete goal');
            }
          }
        }
      ]
    );
  };

  const handleDeleteGoal = () => {
    Alert.alert(
      'Delete Goal',
      'Delete this goal and all sub-goals? This cannot be undone.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/api/meta-goals/${goalId}`, {method: 'DELETE'});
              navigation.goBack();
            } catch (e) {
              console.error('Error deleting goal:', e);
              Alert.alert('Error', 'Failed to delete goal');
            }
          }
        }
      ]
    );
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'No deadline';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
  };

  const getGoalTypeLabel = (goalType: string): string => {
    const labels: {[key: string]: string} = {
      distance: 'Distance',
      elevation: 'Elevation',
      time: 'Time',
      speed_flat: 'Speed (Flat)',
      speed_hills: 'Speed (Hills)',
      long_rides: 'Long Rides',
      intervals: 'Intervals',
      pulse: 'Average HR',
      cadence: 'Cadence',
      avg_power: 'Average Power',
      ftp_vo2max: 'FTP/VO2max',
      recovery: 'Recovery Rides'
    };
    return labels[goalType] || goalType;
  };

  const getGoalUnit = (goalType: string): string => {
    const units: {[key: string]: string} = {
      distance: 'km',
      elevation: 'm',
      time: 'hours',
      speed_flat: 'km/h',
      speed_hills: 'km/h',
      long_rides: 'rides',
      intervals: 'workouts',
      pulse: 'bpm',
      cadence: 'rpm',
      avg_power: 'W',
      ftp_vo2max: 'min',
      recovery: 'rides'
    };
    return units[goalType] || '';
  };

  const getPeriodLabel = (period: string): string => {
    const labels: {[key: string]: string} = {
      '4w': '4 weeks',
      '3m': '3 months',
      'year': 'Year'
    };
    return labels[period] || period;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#274dd3" />
          <Text style={styles.loadingText}>Loading goal details...</Text>
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

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <ImageBackground 
          source={require('../assets/img/morebg.webp')}
          style={styles.header}
          imageStyle={styles.headerImage}
        >
          <View style={styles.headerOverlay}>
            <View style={styles.headerActions}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
           
              </View>
            <View style={styles.headerContent}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{metaGoal.title}</Text>
                {metaGoal.status === 'completed' && (
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeText}>Completed</Text>
                  </View>
                )}
              </View>
              <View style={styles.metaRow}>
                <View style={styles.metaBadge}>
                  <Text style={styles.metaBadgeText}>Due: {formatDate(metaGoal.target_date)}</Text>
                </View>
                <View style={styles.metaBadge}>
                  <Text style={styles.metaBadgeText}>Status: {metaGoal.status}</Text>
                </View>
              </View>

              <Text style={styles.description}>{metaGoal.description}</Text>

              <View style={styles.actionsRow}>
                {metaGoal.status !== 'completed' && (
                  <TouchableOpacity style={styles.completeBtn} onPress={handleCompleteGoal}>
                    <Text style={styles.completeBtnText}>Complete</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteGoal}>
                  <Text style={styles.deleteBtnText}>Delete Goal</Text>
                </TouchableOpacity>
              </View>

             
            </View>
          </View>
        </ImageBackground>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'metrics' && styles.tabActive]}
            onPress={() => setActiveTab('metrics')}
          >
            <Text style={[styles.tabText, activeTab === 'metrics' && styles.tabTextActive]}>
              Metrics
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'trainings' && styles.tabActive]}
            onPress={() => setActiveTab('trainings')}
          >
            <Text style={[styles.tabText, activeTab === 'trainings' && styles.tabTextActive]}>
              Trainings
            </Text>
          </TouchableOpacity>
        </View>

        {/* Metrics Tab */}
        {activeTab === 'metrics' && (
          <View style={styles.section}>
            
            {subGoals.map((goal) => {
            const progress = calculateGoalProgress(goal, activities);
            const current = typeof progress === 'number' ? progress : 0;
            const target = Number(goal.target_value) || 1;
            const percentage = Math.min((current / target) * 100, 100);
            const safePercentage = isFinite(percentage) ? percentage : 0;

            return (
              <View key={goal.id} style={styles.goalCard}>
                <View style={styles.goalHeader}>
                  <Text style={styles.goalTitle}>{goal.metric_name || getGoalTypeLabel(goal.goal_type)}</Text>
                  <Text style={styles.goalPeriod}>{getPeriodLabel(goal.period)}</Text>
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
                    Current: <Text style={styles.statValue}>{(Number(current) || 0).toFixed(1)} {getGoalUnit(goal.goal_type)}</Text>
                  </Text>
                  <Text style={styles.statText}>
                    Target: <Text style={styles.statValue}>{(Number(target) || 1).toFixed(1)} {getGoalUnit(goal.goal_type)}</Text>
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
      </ScrollView>

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
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            No training recommendations available yet.
          </Text>
          <Text style={styles.emptyStateSubtext}>
            Training recommendations will be generated based on your goals.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.trainingCenter}>
        {/* Most Recommended */}
        <Text style={styles.subsectionTitle}>AI Generated Trainings</Text>

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
                    badgeText="Most Recommended"
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
                  badgeText="Recommended"
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
        <Text style={styles.subsectionTitle}>Repeateable Trainings</Text>
        {/* Preferable + More section */}
        <View style={styles.preferableSection}>
          <View style={styles.preferableGrid}>
            {/* Recovery Ride */}
            <TrainingCard
              title="Recovery Ride"
              description="Easy spinning for active recovery"
              intensity="50-65% FTP"
              duration="45"
              trainingType="recovery"
              size="small"
              variant="preferable"
              backgroundColor="#f1f0f0"
              textColor="black"
              showOverlay={false}
              showBadge
              badgeText="+ Preferable"
              onPress={() =>
                handleTrainingPress({
                  name: 'Recovery',
                  type: 'recovery',
                  trainingType: 'recovery',
                  recommendation: 'Easy spinning for active recovery',
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
              title="Group Ride"
              description="Social training with variable intensity"
              intensity="70-90% FTP"
              duration="120"
              trainingType="group_ride"
              size="small"
              variant="preferable"
              backgroundColor="#F1F0F0"
              textColor="black"
              showOverlay={false}
              showBadge
              badgeText="+ Preferable"
              onPress={() =>
                handleTrainingPress({
                  name: 'Group Ride',
                  type: 'group_ride',
                  trainingType: 'group_ride',
                  recommendation: 'Social training with variable intensity',
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
              <Text style={styles.moreTrainingsTitle}>More Trainings</Text>
              <Text style={styles.moreTrainingsDescription}>
                If you feel frustrated about recommended trainings you can find many more here
              </Text>
            </View>
            <View style={styles.moreTrainingsButton}>
              <Text style={styles.moreTrainingsButtonText}>EXPLORE MORE →</Text>
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
  scrollContent: {
    paddingBottom: 40
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
  header: {
    backgroundColor: '#1a1a1a',
    padding: 0,
    paddingTop: 0,
    overflow: 'hidden'
  },
  headerImage: {
    resizeMode: 'cover'
  },
  headerOverlay: {
    backgroundColor: '#f1f0f0',
    padding: 16,
    paddingTop: 60
  },
  backBtn: {
    marginBottom: 16
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  backBtnText: {
    color: '#1a1a1a',
    fontSize: 15,
    fontWeight: '600'
  },
  headerContent: {
    gap: 12
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap'
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1a1a1a',
    flex: 1,
    marginBottom: 12,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.3)',
    marginBottom: 20,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
   
  },
  statusBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    opacity: 0.6,
    paddingVertical: 6,
    borderRadius: 6
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  },
  description: {
    fontSize: 15,
    color: '#1a1a1a',
    opacity: 0.5,
    lineHeight: 22
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  metaBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    opacity: 0.8,
    borderColor: 'rgba(0, 0, 0, 0.1)'
  },
  metaBadgeText: {
    color: 'rgba(0, 0, 0, 0.6)',
    fontSize: 13,
    fontWeight: '500'
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 0,
    width: '50%',
    marginLeft: -14,
    marginTop: 8,
    marginBottom: 12,
  
  },
  completeBtn: {
    flex: 1,
    paddingVertical: 4,
    alignItems: 'center',
  },
  completeBtnText: {
    color: '#1a1a1a',
    fontSize: 15,
    fontWeight: '700'
  },
  deleteBtn: {
    flex: 1,
    paddingVertical: 4,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  deleteBtnText: {
    color: '#1a1a1a',
    fontSize: 15,
    fontWeight: '500'
  },
  section: {
    paddingHorizontal: 0
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
    borderColor: '#ECECEC'
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
  goalPeriod: {
    fontSize: 12,
    color: '#888',
    backgroundColor: '#eaeaea',
    paddingHorizontal: 8,
    paddingVertical: 4,
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
});


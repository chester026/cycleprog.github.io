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

const {width: screenWidth} = Dimensions.get('window');

export const GoalDetailsScreen: React.FC<any> = ({route, navigation}) => {
  const {goalId} = route.params;
  const [metaGoal, setMetaGoal] = useState<MetaGoal | null>(null);
  const [subGoals, setSubGoals] = useState<Goal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGoalDetails();
    loadActivities();
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
          source={require('../assets/img/mostrecomended.webp')}
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

        {/* Sub-Goals */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Metrics ({subGoals.length})</Text>
          
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
      </ScrollView>
    </View>
  );
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 20,
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
    color: '#fff',
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    marginBottom: 12,
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
    color: '#fff',
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
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    opacity: 0.8,
    borderColor: '#333'
  },
  metaBadgeText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500'
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 16,
    width: '50%',
    marginLeft: -6,
    marginTop: 8,
    marginBottom: 12,
  
  },
  completeBtn: {
    flex: 1,
    paddingVertical: 4,
    alignItems: 'center',
  },
  completeBtnText: {
    color: '#10b981',
    fontSize: 15,
    fontWeight: '600'
  },
  deleteBtn: {
    flex: 1,
    paddingVertical: 4,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  deleteBtnText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '600'
  },
  section: {
    padding: 20
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
  }
});


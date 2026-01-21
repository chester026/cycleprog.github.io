import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ActivityIndicator} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import {MetaGoal, Goal} from '../utils/goalsCache';
import {Activity} from '../types/activity';
import {apiFetch} from '../utils/api';

interface MetaGoalCardProps {
  metaGoal: MetaGoal;
  activities: Activity[];
  onPress: () => void;
  onStatusChange: () => void;
}

export const MetaGoalCard: React.FC<MetaGoalCardProps> = ({
  metaGoal,
  activities,
  onPress,
  onStatusChange
}) => {
  const [subGoals, setSubGoals] = useState<Goal[]>([]);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadSubGoals();
  }, [metaGoal.id]);

  useEffect(() => {
    if (subGoals.length > 0 && activities.length > 0) {
      calculateProgress();
    }
  }, [subGoals, activities]);

  const loadSubGoals = async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/api/goals');
      // Filter only sub-goals of this meta-goal
      const filtered = data.filter((g: Goal) => g.meta_goal_id === metaGoal.id);
      setSubGoals(filtered);
    } catch (e) {
      console.error('Error loading sub-goals:', e);
    } finally {
      setLoading(false);
    }
  };

  const calculateProgress = () => {
    // Exclude FTP goals - they are now in Analytics
    const relevantGoals = subGoals.filter(g => g.goal_type !== 'ftp_vo2max');

    if (relevantGoals.length === 0) {
      setProgress(0);
      return;
    }

    // Calculate progress for each sub-goal
    const progressValues = relevantGoals.map(goal => {
      const current = goal.current_value || 0;
      const target = goal.target_value || 1;
      return Math.min((current / target) * 100, 100);
    });

    // Average progress
    const avgProgress = progressValues.reduce((sum, p) => sum + p, 0) / progressValues.length;
    setProgress(Math.round(avgProgress));
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
  };

  const getStatusColor = () => {
    if (progress >= 80) return '#10b981'; // green
    if (progress >= 50) return '#f59e0b'; // yellow
    return '#ef4444'; // red
  };

  // Truncate description to first sentence
  const getTruncatedDescription = (text: string) => {
    if (!text) return '';
    const match = text.match(/^[^.!?]+[.!?]/);
    return match ? match[0].trim() : text;
  };

  const handleMarkAsCompleted = async (e: any) => {
    e.stopPropagation();

    if (updating) return;

    try {
      setUpdating(true);
      await apiFetch(`/api/meta-goals/${metaGoal.id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          ...metaGoal,
          status: 'completed'
        })
      });

      // Call callback to reload meta-goals
      if (onStatusChange) {
        onStatusChange();
      }
    } catch (error) {
      console.error('Error updating status:', error);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color="#274dd3" />
      </View>
    );
  }

  // Параметры кругового прогресса
  const size = 70;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.content}>
        {/* Circular Progress - Left */}
        <View style={styles.progressCircleContainer}>
          <Svg width={size} height={size}>
            {/* Background Circle */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#e5e5e5"
              strokeWidth={strokeWidth}
              fill="none"
            />
            {/* Progress Circle */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={getStatusColor()}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              rotation="-90"
              origin={`${size / 2}, ${size / 2}`}
            />
          </Svg>
          <View style={styles.progressPercentage}>
            <Text style={styles.progressText}>{progress}<Text style={styles.progressTextPercent}>%</Text></Text>
          </View>
        </View>

        {/* Content - Right */}
        <View style={styles.rightContent}>
          <Text style={styles.title}>{metaGoal.title}</Text>
          
          {metaGoal.target_date && (
            <Text style={styles.date}>🎯 {formatDate(metaGoal.target_date)}</Text>
          )}
          
          <Text style={styles.description}>
            {getTruncatedDescription(metaGoal.description)}
          </Text>

          {metaGoal.status === 'active' && (
            <TouchableOpacity
              style={styles.completeBtn}
              onPress={handleMarkAsCompleted}
              disabled={updating}
            >
              {updating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.completeBtnText}>Complete</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
        
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    padding: 16,
    paddingBottom: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ECECEC'
   
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16
  },
  // Circular Progress - Left
  progressCircleContainer: {
    position: 'relative',
    width: 70,
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 0,
  },
  progressPercentage: {
    position: 'absolute',
    width: 70,
    height: 70,
    justifyContent: 'center',
    alignItems: 'center'
  },
  progressText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1a1a1a',
    marginLeft: 4,
  },
  progressTextPercent: {
    fontSize: 10,
    color: '#888',
    fontWeight: '900',
  },
  // Right Content
  rightContent: {
    flex: 1,
    justifyContent: 'space-between'
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8
  },
  date: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8
  },
  description: {
    fontSize: 13,
    color: '#aaa',
    marginBottom: 12,
    lineHeight: 18
  },
  completeBtn: {
    
    paddingHorizontal: 0,
    paddingVertical: 8,
    alignSelf: 'flex-start'
  },
  completeBtnText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '700'
  }
});


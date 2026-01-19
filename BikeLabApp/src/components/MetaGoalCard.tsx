import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ActivityIndicator} from 'react-native';
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

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{metaGoal.title}</Text>
          {metaGoal.target_date && (
            <Text style={styles.date}>🎯 {formatDate(metaGoal.target_date)}</Text>
          )}
        </View>
        {metaGoal.status === 'active' && (
          <TouchableOpacity
            style={styles.completeBtn}
            onPress={handleMarkAsCompleted}
            disabled={updating}
          >
            {updating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.completeBtnText}>✓ Complete</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Description */}
      <Text style={styles.description}>{getTruncatedDescription(metaGoal.description)}</Text>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {width: `${progress}%`, backgroundColor: getStatusColor()}
            ]}
          />
        </View>
        <Text style={styles.progressText}>{progress}%</Text>
      </View>

      {/* Sub-goals count */}
      <Text style={styles.subGoalsCount}>
        {subGoals.filter(g => g.goal_type !== 'ftp_vo2max').length} metrics
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ededed'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8
  },
  headerLeft: {
    flex: 1,
    marginRight: 12
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4
  },
  date: {
    fontSize: 13,
    color: '#888',
    marginTop: 2
  },
  completeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 0,
    minWidth: 80,
    alignItems: 'center'
  },
  completeBtnText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '600'
  },
  description: {
    fontSize: 13,
    color: '#aaa',
    marginBottom: 12,
    lineHeight: 20
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#ccc',
    overflow: 'hidden',
    marginRight: 8
  },
  progressFill: {
    height: '100%',
   
  },
  progressText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
    minWidth: 40,
    textAlign: 'right'
  },
  subGoalsCount: {
    fontSize: 1,
    color: '#666',
    marginTop: 0
  }
});


import React, {useState, useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {getDateLocale} from '../i18n/dateLocale';
import {View, Text, StyleSheet, TouchableOpacity, ActivityIndicator} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import {MetaGoal, Goal} from '../utils/goalsCache';
import {Activity} from '../types/activity';
import {apiFetch} from '../utils/api';

const TIER_CONFIG: Record<string, {color: string; key: string}> = {
  legendary: {color: '#FC5200', key: 'goalTier.legendary'},
  epic: {color: '#8B5CF6', key: 'goalTier.epic'},
  grand: {color: '#274dd3', key: 'goalTier.grand'},
  base: {color: '#F0F0F0', key: 'goalTier.base'},
};

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
  const {t} = useTranslation();
  const [subGoals, setSubGoals] = useState<Goal[]>([]);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const tier = metaGoal.tier || 'base';
  const tierCfg = TIER_CONFIG[tier] || TIER_CONFIG.base;
  const hasTierBorder = tier !== 'base';

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
      const filtered = data.filter((g: Goal) => g.meta_goal_id === metaGoal.id);
      setSubGoals(filtered);
    } catch (e) {
      console.error('Error loading sub-goals:', e);
    } finally {
      setLoading(false);
    }
  };

  const calculateProgress = () => {
    const relevantGoals = subGoals.filter(g => g.goal_type !== 'ftp_vo2max');
    if (relevantGoals.length === 0) { setProgress(0); return; }

    const progressValues = relevantGoals.map(goal => {
      const current = goal.current_value || 0;
      const target = goal.target_value || 1;
      return Math.min((current / target) * 100, 100);
    });

    const avgProgress = progressValues.reduce((sum, p) => sum + p, 0) / progressValues.length;
    setProgress(Math.round(avgProgress));
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString(getDateLocale(), {month: 'short', day: 'numeric', year: 'numeric'});
  };

  const getStatusColor = () => '#ccc';

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
        body: JSON.stringify({...metaGoal, status: 'completed'})
      });
      if (onStatusChange) onStatusChange();
    } catch (error) {
      console.error('Error updating status:', error);
    } finally {
      setUpdating(false);
    }
  };

  const size = 70;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const cardBody = (
    <View style={styles.cardInner}>
      {loading ? (
        <ActivityIndicator color="#274dd3" />
      ) : (
        <View style={styles.content}>
          <View style={styles.progressCircleContainer}>
            <Svg width={size} height={size}>
              <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#eee" strokeWidth={strokeWidth} fill="none" />
              <Circle
                cx={size / 2} cy={size / 2} r={radius}
                stroke={getStatusColor()} strokeWidth={strokeWidth} fill="none"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                strokeLinecap="round" rotation="-90" origin={`${size / 2}, ${size / 2}`}
              />
            </Svg>
            <View style={styles.progressPercentage}>
              <Text style={styles.progressText}>{progress}<Text style={styles.progressTextPercent}>%</Text></Text>
            </View>
          </View>

          <View style={styles.rightContent}>
            <Text style={styles.title}>{metaGoal.title}</Text>
            {metaGoal.target_date && <Text style={styles.date}>{formatDate(metaGoal.target_date)}</Text>}
            <Text style={styles.description}>{getTruncatedDescription(metaGoal.description)}</Text>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <TouchableOpacity style={styles.cardOuter} onPress={onPress} activeOpacity={0.7}>
      {cardBody}
      <View style={[styles.tierFooterWrap, hasTierBorder && {shadowColor: tierCfg.color}]}>
        <View style={[styles.tierFooter, {backgroundColor: tierCfg.color}]}>
          <Text style={[styles.tierFooterText, !hasTierBorder && styles.tierFooterTextBase]}>
            {t(tierCfg.key)}
          </Text>
          {metaGoal.status === 'active' && (
            <TouchableOpacity onPress={handleMarkAsCompleted} disabled={updating} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              {updating ? (
                <ActivityIndicator size="small" color={hasTierBorder ? 'rgba(255,255,255,0.7)' : '#999'} />
              ) : (
                <Text style={[styles.tierCompleteText, !hasTierBorder && styles.tierCompleteTextBase]}>
                  {t('metaGoal.complete')}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardOuter: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  cardInner: {
    backgroundColor: '#fff',
    padding: 16,
    paddingBottom: 12,
  },
  tierFooterWrap: {
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 10,
  },
  tierFooter: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tierFooterText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  tierCompleteText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
  },
  tierFooterTextBase: {
    color: '#999',
  },
  tierCompleteTextBase: {
    color: '#666',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  progressCircleContainer: {
    position: 'relative',
    width: 70,
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressPercentage: {
    position: 'absolute',
    width: 70,
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
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
  rightContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  date: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  description: {
    fontSize: 13,
    color: '#aaa',
    marginBottom: 12,
    lineHeight: 18,
  },
});

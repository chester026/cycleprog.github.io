import React, {useCallback, useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {MetaGoalCard} from '../MetaGoalCard';
import {MetaGoal} from '../../utils/goalsCache';
import {Activity} from '../../types/activity';
import {apiFetch} from '../../utils/api';
import {useAppData} from '../../contexts/AppDataContext';

// The "Goals" half of the Goals tab's new AI Coach / Goals tab switcher (see
// CoachChatScreen). This used to be the entire GoalAssistantScreen, but that
// screen's whole reason for a big hero section was the free-text "describe
// your goal" AI input — which the coach chat's create_goal tool already
// covers conversationally now. All that's left worth keeping here is the
// list itself: view, mark complete, and delete, exactly like before.
export const GoalsPanel: React.FC<{navigation: any; headerExtra?: React.ReactNode}> = ({
  navigation,
  headerExtra,
}) => {
  const {t} = useTranslation();
  const {loadActivities} = useAppData();
  const [metaGoals, setMetaGoals] = useState<MetaGoal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');

  const loadMetaGoals = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await apiFetch('/api/meta-goals');
      setMetaGoals(data || []);
    } catch (e) {
      console.error('Error loading meta goals:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetaGoals();
    loadActivities()
      .then(setActivities)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadMetaGoals(true),
        loadActivities(true)
          .then(setActivities)
          .catch(() => {}),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadMetaGoals, loadActivities]);

  const filteredGoals = metaGoals.filter(mg => mg.status === activeTab);

  return (
    <FlatList
      data={filteredGoals}
      keyExtractor={item => item.id.toString()}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#274dd3" colors={['#274dd3']} />
      }
      ListHeaderComponent={
        <>
          {headerExtra}
          <View style={styles.tabs}>
            <TouchableOpacity style={[styles.tab, activeTab === 'active' && styles.tabActive]} onPress={() => setActiveTab('active')}>
              <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>{t('goals.active')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'completed' && styles.tabActive]}
              onPress={() => setActiveTab('completed')}>
              <Text style={[styles.tabText, activeTab === 'completed' && styles.tabTextActive]}>{t('goals.completed')}</Text>
            </TouchableOpacity>
          </View>
        </>
      }
      renderItem={({item}) => (
        <MetaGoalCard
          metaGoal={item}
          activities={activities}
          onPress={() => navigation.navigate('GoalDetails', {goalId: item.id})}
        />
      )}
      ListEmptyComponent={
        loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#274dd3" />
            <Text style={styles.loadingText}>{t('goals.loadingGoals')}</Text>
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>{activeTab === 'active' ? t('goals.noActiveGoals') : t('goals.noCompletedGoals')}</Text>
            <Text style={styles.emptyText}>
              {activeTab === 'active' ? t('goals.noActiveGoalsHint') : t('goals.noCompletedGoalsHint')}
            </Text>
          </View>
        )
      }
      contentContainerStyle={styles.listContent}
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    flexGrow: 1,
    paddingBottom: 80,
  },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
  },
  tab: {
    paddingVertical: 4,
    marginRight: 8,
  },
  tabActive: {},
  tabText: {
    fontSize: 20,
    textTransform: 'uppercase',
    fontWeight: '800',
    color: 'rgba(0, 0, 0, 0.2)',
  },
  tabTextActive: {
    color: '#191b20',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
});

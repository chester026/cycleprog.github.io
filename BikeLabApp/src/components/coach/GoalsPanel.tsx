import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ActivityIndicator, FlatList, RefreshControl, Text, TouchableOpacity, View} from 'react-native';
import {MetaGoalCard} from '../MetaGoalCard';
import {useMetaGoals} from '../../data/hooks/useMetaGoals';
import {useRefreshActivities} from '../../data/hooks/useRefreshActivities';
import type {AppNavigationProp} from '../../navigation/types';
import {makeStyles, useTheme, withOpacity} from '../../theme';

// The "Goals" half of the Goals tab's new AI Coach / Goals tab switcher (see
// CoachChatScreen). This used to be the entire GoalAssistantScreen, but that
// screen's whole reason for a big hero section was the free-text "describe
// your goal" AI input — which the coach chat's create_goal tool already
// covers conversationally now. All that's left worth keeping here is the
// list itself: view, mark complete, and delete, exactly like before.
//
// GET /api/meta-goals now returns each meta-goal's sub_goals inline (with
// server-computed current_value/percent) — MetaGoalCard reads them straight
// off `item.sub_goals`, so this panel no longer needs to separately load
// activities just to hand them down (T-3.4, A-13).
export const GoalsPanel: React.FC<{navigation: AppNavigationProp; headerExtra?: React.ReactNode}> = ({
  navigation,
  headerExtra,
}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const {data: metaGoals = [], isLoading: loading} = useMetaGoals();
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  // Sub-goal progress is computed server-side from the rider's activities on
  // every read, so refreshing goals means refreshing activities first — a
  // plain refetch() re-read the server's 2h activities cache and the numbers
  // never moved after a ride.
  const refreshEverything = useRefreshActivities();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshEverything();
    } finally {
      setRefreshing(false);
    }
  };

  const filteredGoals = metaGoals.filter(mg => mg.status === activeTab);

  return (
    <FlatList
      testID="goal-list"
      data={filteredGoals}
      keyExtractor={item => item.id.toString()}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.accent}
          colors={[theme.colors.accent]}
        />
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
          onPress={() => navigation.navigate('GoalDetails', {goalId: item.id})}
        />
      )}
      ListEmptyComponent={
        loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
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

const styles = makeStyles(theme => ({
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
    color: withOpacity(theme.colors.black, 0.2),
  },
  tabTextActive: {
    color: theme.colors.ink,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: theme.colors.text.muted,
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
    color: theme.colors.text.primary,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.text.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
}));

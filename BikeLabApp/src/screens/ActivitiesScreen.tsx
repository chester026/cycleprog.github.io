import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
} from 'react-native';
import {ActivityCard} from '../components/ActivityCard';
import {VideoHeaderWithStats} from '../components/VideoHeaderWithStats';
import {ActivityDetailsModal} from '../components/ActivityDetailsModal';
import {AIAnalysisModal} from '../components/AIAnalysisModal';
import type {Activity} from '../types/activity';
import {useActivities} from '../data/hooks/useActivities';
import {useAppNavigation} from '../navigation/hooks';
import {makeStyles, useTheme} from '../theme';

export const ActivitiesScreen = () => {
  const navigation = useAppNavigation();
  const {t} = useTranslation();
  const theme = useTheme();
  // T-5.1/A-17 (docs/audit/layers/02-bikelabapp.md): this screen used to own
  // its own loading/error/fromCache useState around a manual fetch via
  // useAppData().loadActivities — now it just reads the shared
  // useActivities() query/cache entry like every other activities consumer.
  const activitiesQuery = useActivities();
  const activities = activitiesQuery.data ?? [];
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(
    null,
  );
  const [aiAnalysisActivityId, setAiAnalysisActivityId] = useState<number | null>(
    null,
  );
  const [aiAnalysisActivityName, setAiAnalysisActivityName] = useState<string>('');

  const onRefresh = async () => {
    await activitiesQuery.refetch();
  };

  // Получаем список доступных годов
  const getAvailableYears = (): number[] => {
    const years = new Set<number>();
    activities.forEach(activity => {
      const year = new Date(activity.start_date).getFullYear();
      years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a); // от новых к старым
  };

  // Фильтруем активности по выбранному году
  const filteredActivities =
    selectedYear === 'all'
      ? activities
      : activities.filter(
          activity =>
            new Date(activity.start_date).getFullYear() === selectedYear,
        );

  if (activitiesQuery.isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.chart.series3} />
        <Text style={styles.loadingText}>{t('activities.loading')}</Text>
      </View>
    );
  }

  if (activitiesQuery.isError && activities.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>😕</Text>
        <Text style={styles.errorTitle}>{t('activities.failedLoadTitle')}</Text>
        <Text style={styles.errorMessage}>
          {activitiesQuery.error instanceof Error
            ? activitiesQuery.error.message
            : t('activities.failedLoad')}
        </Text>
        <Text style={styles.errorHint}>
          {t('activities.failedLoadHint')}
        </Text>
      </View>
    );
  }

  const availableYears = getAvailableYears();

  const getYearLabel = (): string => {
    return selectedYear === 'all' ? t('activities.allYears') : selectedYear.toString();
  };

  const handleYearSelect = (year: number | 'all') => {
    setSelectedYear(year);
    setShowYearPicker(false);
  };

  const handleActivityPress = (activity: Activity) => {
    setSelectedActivity(activity);
  };

  const handleCloseModal = () => {
    setSelectedActivity(null);
  };

  const handleAIAnalysisPress = (activityId: number, activityName: string) => {
    setAiAnalysisActivityId(activityId);
    setAiAnalysisActivityName(activityName);
  };

  const handleCloseAIModal = () => {
    setAiAnalysisActivityId(null);
    setAiAnalysisActivityName('');
  };

  const handleAnalyzeRide = (act: Activity) => {
    navigation.navigate('RideAnalytics', {activity: act});
  };

  return (
    <View style={styles.container}>
      {/* Year Picker Modal */}
      <Modal
        visible={showYearPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowYearPicker(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowYearPicker(false)}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={[
                styles.modalItem,
                selectedYear === 'all' && styles.modalItemSelected,
              ]}
              onPress={() => handleYearSelect('all')}>
              <Text
                style={[
                  styles.modalItemText,
                  selectedYear === 'all' && styles.modalItemTextSelected,
                ]}>
                {t('activities.allYears')}
              </Text>
              {selectedYear === 'all' && (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </TouchableOpacity>
            {availableYears.map((year, index) => (
              <TouchableOpacity
                key={year}
                style={[
                  styles.modalItem,
                  selectedYear === year && styles.modalItemSelected,
                  index === availableYears.length - 1 && styles.modalItemLast,
                ]}
                onPress={() => handleYearSelect(year)}>
                <Text
                  style={[
                    styles.modalItemText,
                    selectedYear === year && styles.modalItemTextSelected,
                  ]}>
                  {year}
                </Text>
                {selectedYear === year && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Whole screen scrolls as one: header + stats + ride list all live
          inside this single FlatList (via ListHeaderComponent) instead of
          a pinned hero sitting above an inner list-only scroll. */}
      <FlatList
        data={filteredActivities}
        keyExtractor={item => item.id.toString()}
        renderItem={({item}) => (
          <ActivityCard
            activity={item}
            onPress={() => handleActivityPress(item)}
            onAIAnalysisPress={handleAIAnalysisPress}
          />
        )}
        ListHeaderComponent={
          <VideoHeaderWithStats
            selectedYear={selectedYear}
            getYearLabel={getYearLabel}
            onYearPress={() => setShowYearPicker(true)}
            filteredActivities={filteredActivities}
            // Was always `false` in the pre-migration code too (the old
            // `setFromCache(true)` call site had been removed but the prop
            // wiring hadn't) — kept as-is rather than reintroducing it with
            // new (untested) semantics; behaviour is unchanged.
            fromCache={false}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>🚴‍♂️</Text>
            <Text style={styles.emptyTitle}>
              {selectedYear === 'all'
                ? t('activities.noActivities')
                : t('activities.noActivitiesIn') + selectedYear}
            </Text>
            <Text style={styles.emptyMessage}>
              {selectedYear === 'all'
                ? t('activities.startRiding')
                : t('activities.tryDifferentYear')}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={activitiesQuery.isFetching && !activitiesQuery.isLoading}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
          />
        }
        contentContainerStyle={styles.listContent}
      />

      {/* Activity Details Modal */}
      <ActivityDetailsModal
        activity={selectedActivity}
        visible={selectedActivity !== null}
        onClose={handleCloseModal}
        onAnalyzeRide={handleAnalyzeRide}
      />

      {/* AI Analysis Modal */}
      <AIAnalysisModal
        visible={aiAnalysisActivityId !== null}
        activityId={aiAnalysisActivityId}
        activityName={aiAnalysisActivityName}
        onClose={handleCloseAIModal}
      />
    </View>
  );
};

const styles = makeStyles(theme => ({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    paddingHorizontal: 32,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    minWidth: 200,
    maxWidth: 300,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  modalItemSelected: {
    backgroundColor: 'rgba(0, 0, 255, 0.06)',
  },
  modalItemLast: {
    borderBottomWidth: 0,
  },
  modalItemText: {
    fontSize: 16,
    color: theme.colors.text.inverse,
  },
  modalItemTextSelected: {
    color: theme.colors.accent,
    fontWeight: '600',
  },
  checkmark: {
    fontSize: 18,
    color: theme.colors.accent,
  },
  listContent: {
    paddingBottom: 16,
  },
  loadingText: {
    color: theme.colors.text.muted,
    fontSize: 16,
    marginTop: 16,
  },
  errorText: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text.inverse,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: theme.colors.chart.series3,
    marginBottom: 16,
    textAlign: 'center',
  },
  errorHint: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 48,
  },
  emptyText: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyMessage: {
    fontSize: 14,
    color: theme.colors.text.muted,
    textAlign: 'center',
  },
}));

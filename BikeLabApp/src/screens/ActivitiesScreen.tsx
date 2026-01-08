import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TouchableOpacity,
  Modal,
} from 'react-native';
import {ActivityCard} from '../components/ActivityCard';
import {VideoHeaderWithStats} from '../components/VideoHeaderWithStats';
import {ActivityDetailsModal} from '../components/ActivityDetailsModal';
import {AIAnalysisModal} from '../components/AIAnalysisModal';
import type {Activity} from '../types/activity';
import {apiFetch} from '../utils/api';
import {Cache, CACHE_TTL} from '../utils/cache';

const ACTIVITIES_CACHE_KEY = 'activities_list';

export const ActivitiesScreen = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(
    null,
  );
  const [aiAnalysisActivityId, setAiAnalysisActivityId] = useState<number | null>(
    null,
  );
  const [aiAnalysisActivityName, setAiAnalysisActivityName] = useState<string>('');

  useEffect(() => {
    loadActivities(false);
  }, []);

  const loadActivities = async (forceRefresh: boolean = false) => {
    let hasCache = false;

    try {
      setError(null);

      // 1. Пытаемся загрузить из кеша (если не force refresh)
      if (!forceRefresh) {
        const cached = await Cache.get<Activity[]>(ACTIVITIES_CACHE_KEY);
        if (cached && cached.length > 0) {
          setActivities(cached);
          setFromCache(true);
          setLoading(false);
          hasCache = true;
          // Продолжаем загрузку свежих данных в фоне
        }
      }

      // 2. Загружаем свежие данные из API
      const data = await apiFetch('/api/activities');

      setActivities(data);
      setFromCache(false);

      // 3. Сохраняем в кеш (30 минут)
      // Активности редко меняются, pull-to-refresh всегда доступен
      await Cache.set(ACTIVITIES_CACHE_KEY, data, CACHE_TTL.HALF_HOUR);
    } catch (error: any) {
      // Логируем по-разному в зависимости от наличия кеша
      if (hasCache) {
        console.log('⚠️ Background refresh failed (using cache):', error.message);
      } else {
        console.error('❌ Error loading activities:', error);
      }
      
      setError(error.message || 'Failed to load activities');

      // Показываем alert только если:
      // - Это не истекшая сессия
      // - И у нас нет кешированных данных (не было загружено из кеша)
      if (
        !error.message?.includes('Session expired') &&
        !hasCache
      ) {
        Alert.alert(
          'Error',
          'Failed to load activities. Please check your internet connection.',
        );
      }
    } finally {
      setLoading(false);
      // setRefreshing управляется в onRefresh
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // При pull-to-refresh игнорируем кеш и загружаем свежие данные
      await loadActivities(true);
    } catch (error) {
      console.error('❌ onRefresh error:', error);
    } finally {
      // Гарантируем что loader остановится
      setRefreshing(false);
    }
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

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF5E00" />
        <Text style={styles.loadingText}>Loading activities...</Text>
      </View>
    );
  }

  if (error && activities.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>😕</Text>
        <Text style={styles.errorTitle}>Failed to load activities</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <Text style={styles.errorHint}>
          Make sure you're logged in and have an internet connection
        </Text>
      </View>
    );
  }

  const availableYears = getAvailableYears();

  const getYearLabel = (): string => {
    return selectedYear === 'all' ? 'All Years' : selectedYear.toString();
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

  return (
    <View style={styles.container}>
      {/* Video Header with Stats */}
      <VideoHeaderWithStats
        selectedYear={selectedYear}
        getYearLabel={getYearLabel}
        onYearPress={() => setShowYearPicker(true)}
        filteredActivities={filteredActivities}
        fromCache={fromCache}
      />

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
                All Years
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

      {/* Activities List */}
      {filteredActivities.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>🚴‍♂️</Text>
          <Text style={styles.emptyTitle}>
            {selectedYear === 'all'
              ? 'No activities yet'
              : `No activities in ${selectedYear}`}
          </Text>
          <Text style={styles.emptyMessage}>
            {selectedYear === 'all'
              ? 'Start riding and sync with Strava!'
              : 'Try selecting a different year'}
          </Text>
        </View>
      ) : (
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FF5E00"
            />
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Activity Details Modal */}
      <ActivityDetailsModal
        activity={selectedActivity}
        visible={selectedActivity !== null}
        onClose={handleCloseModal}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 32,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
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
    backgroundColor: 'rgba(255, 94, 0, 0.1)',
  },
  modalItemLast: {
    borderBottomWidth: 0,
  },
  modalItemText: {
    fontSize: 16,
    color: '#fff',
  },
  modalItemTextSelected: {
    color: '#FF5E00',
    fontWeight: '600',
  },
  checkmark: {
    fontSize: 18,
    color: '#FF5E00',
  },
  listContent: {
    paddingBottom: 16,
  },
  loadingText: {
    color: '#888',
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
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#FF5E00',
    marginBottom: 16,
    textAlign: 'center',
  },
  errorHint: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyMessage: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  }
});


import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import {Activity} from '../types/activity';
import {apiFetch} from '../utils/api';
import {Cache, CACHE_TTL} from '../utils/cache';
import {getActivityStreams} from '../utils/streamsCache';
import {LineChart} from 'react-native-gifted-charts';

export const RideAnalyticsScreen = ({route, navigation}: any) => {
  const {activity} = route.params;
  const [loading, setLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);
  const [skillsChanges, setSkillsChanges] = useState<any[]>([]);
  const [metricsChanges, setMetricsChanges] = useState<any[]>([]);
  const [similarActivity, setSimilarActivity] = useState<Activity | null>(null);
  const [metaGoals, setMetaGoals] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [streams, setStreams] = useState<any>(null);
  const [streamsLoading, setStreamsLoading] = useState(false);

  // Форматирование даты
  const rideDate = new Date(activity.start_date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Функция для очистки кеша и перезагрузки данных
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Очищаем все кеши для этой активности
      await Cache.remove(`ride_ai_analysis_${activity.id}`);
      await Cache.remove(`ride_changes_${activity.id}`);
      await Cache.remove(`ride_meta_goals_${activity.id}`);
      console.log('🗑️ Cache cleared, reloading...');
      
      // Перезагружаем страницу (навигация назад и вперед)
      navigation.goBack();
      setTimeout(() => {
        (navigation as any).navigate('RideAnalytics', {activity});
      }, 100);
    } catch (err) {
      console.error('Error refreshing:', err);
      setRefreshing(false);
    }
  };

  // Загружаем streams для графиков (с кешированием)
  useEffect(() => {
    const loadStreams = async () => {
      setStreamsLoading(true);
      try {
        const streamsData = await getActivityStreams(activity.id);
        if (streamsData) {
          setStreams(streamsData);
          console.log('✅ Streams loaded for charts');
        }
      } catch (err) {
        console.error('Error loading streams:', err);
      } finally {
        setStreamsLoading(false);
      }
    };

    loadStreams();
  }, [activity.id]);

  // Загружаем AI анализ (с кешированием)
  useEffect(() => {
    const loadAIAnalysis = async () => {
      const cacheKey = `ride_ai_analysis_${activity.id}`;
      
      // Проверяем кеш
      const cached = await Cache.get<string>(cacheKey);
      if (cached) {
        console.log('✅ Using cached AI analysis');
        setAiAnalysis(cached);
        return;
      }

      setLoading(true);
      try {
        const response = await apiFetch(`/api/activities/${activity.id}/ai-analysis`);
        setAiAnalysis(response.analysis);
        // Кешируем на 7 дней
        await Cache.set(cacheKey, response.analysis, CACHE_TTL.WEEK);
      } catch (err) {
        console.error('AI Analysis error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAIAnalysis();
  }, [activity.id]);

  // Загружаем Meta Goals (с кешированием)
  useEffect(() => {
    const loadMetaGoals = async () => {
      const cacheKey = `ride_meta_goals_${activity.id}`;
      
      // Проверяем кеш
      const cached = await Cache.get<any[]>(cacheKey);
      if (cached) {
        console.log('✅ Using cached meta goals');
        setMetaGoals(cached);
        return;
      }

      try {
        const goals = await apiFetch('/api/meta-goals');
        const activeGoals = (goals || []).filter((g: any) => g.status === 'active');
        
        // Для каждой goal загружаем sub-goals и вычисляем прогресс + вклад тренировки
        const goalsWithProgress = await Promise.all(
          activeGoals.map(async (goal: any) => {
            try {
              // Load all goals and filter by meta_goal_id
              const allGoals = await apiFetch('/api/goals');
              const subGoals = (allGoals || []).filter((g: any) => g.meta_goal_id === goal.id);
              const relevantGoals = subGoals.filter((sg: any) => sg.goal_type !== 'ftp_vo2max');
              
              if (relevantGoals.length === 0) {
                return {...goal, progress: 0, progressGain: 0};
              }

              // Вычисляем текущий прогресс
              const progressValues = relevantGoals.map((sg: any) => {
                const current = sg.current_value || 0;
                const target = sg.target_value || 1;
                return Math.min((current / target) * 100, 100);
              });

              const avgProgress = Math.round(
                progressValues.reduce((sum: number, p: number) => sum + p, 0) / progressValues.length
              );

              // Вычисляем вклад текущей тренировки и собираем метаинформацию
              let totalGain = 0;
              let countGoals = 0;
              const contributions: any[] = []; // Что именно выросло

              for (const sg of relevantGoals) {
                const target = sg.target_value || 1;
                let gain = 0;
                let contributionValue = '';

                // Для разных типов целей вычисляем по-разному
                if (sg.goal_type === 'distance') {
                  const distanceKm = activity.distance / 1000;
                  gain = (distanceKm / target) * 100;
                  if (distanceKm > 0.1) {
                    contributionValue = `+${distanceKm.toFixed(1)} km`;
                  }
                } else if (sg.goal_type === 'elevation') {
                  const elevation = activity.total_elevation_gain;
                  gain = (elevation / target) * 100;
                  if (elevation > 1) {
                    contributionValue = `+${Math.round(elevation)} m`;
                  }
                } else if (sg.goal_type === 'rides_count') {
                  gain = (1 / target) * 100;
                  contributionValue = '+1 ride';
                } else if (sg.goal_type === 'time') {
                  const timeMin = activity.moving_time / 60;
                  gain = (timeMin / target) * 100;
                  if (timeMin > 1) {
                    contributionValue = `+${Math.round(timeMin)} min`;
                  }
                } else {
                  gain = (1 / target) * 100;
                }

                if (contributionValue && gain > 0) {
                  contributions.push({
                    type: sg.goal_type,
                    label: sg.goal_type === 'distance' ? 'Distance' :
                           sg.goal_type === 'elevation' ? 'Elevation' :
                           sg.goal_type === 'rides_count' ? 'Rides' :
                           sg.goal_type === 'time' ? 'Time' : 'Progress',
                    value: contributionValue,
                  });
                }

                totalGain += Math.min(gain, 100);
                countGoals++;
              }

              const avgGain = countGoals > 0 ? Math.round(totalGain / countGoals) : 0;

              return {...goal, progress: avgProgress, progressGain: avgGain, contributions};
            } catch (err) {
              console.error(`Error loading sub-goals for goal ${goal.id}:`, err);
              return {...goal, progress: 0, progressGain: 0};
            }
          })
        );

        setMetaGoals(goalsWithProgress);
        
        // Кешируем на 7 дней
        await Cache.set(cacheKey, goalsWithProgress, CACHE_TTL.WEEK);

      } catch (err) {
        console.error('Error loading meta goals:', err);
      }
    };

    loadMetaGoals();
  }, [activity.id]);

  // Получаем первый абзац для preview
  const getPreviewText = (text: string) => {
    const paragraphs = text.split('\n\n');
    return paragraphs[0] || text.substring(0, 200);
  };

  // Подготовка данных для мини-графиков
  const prepareChartData = (dataArray: number[]) => {
    if (!dataArray || dataArray.length === 0) return [];
    
    // Для небольших графиков показываем максимум 200 точек
    const maxPoints = 40;
    const step = Math.max(1, Math.floor(dataArray.length / maxPoints));
    const sampledData = dataArray.filter((_, index) => index % step === 0);
    
    return sampledData.map((value, index) => ({
      value,
      index,
      dataPointText: value.toFixed(0),
    }));
  };

  // Рендер мини-графика
  const renderMiniChart = (title: string, data: number[], color: string, unit: string) => {
    if (!data || data.length === 0) return null;

    const chartData = prepareChartData(data);
    const maxValue = Math.max(...data) * 1.1;
    const avgValue = data.reduce((sum, v) => sum + v, 0) / data.length;

    return (
      <View key={title} style={styles.miniChartCard}>
        <View style={styles.miniChartHeader}>
          <Text style={styles.miniChartTitle}>{title}</Text>
          <Text style={styles.miniChartAvg}>
            {avgValue.toFixed(0)} <Text style={styles.miniChartUnit}>{unit}</Text>
          </Text>
        </View>
         <View style={styles.miniChartContent}>
          <LineChart
            data={chartData}
            width={231}
            height={100}
            maxValue={maxValue}
            spacing={Math.max(1, Math.floor(250 / chartData.length))}
            curved
            areaChart
            startFillColor={color}
            startOpacity={0.2}
            endOpacity={0}
            color={color}
            thickness={2}
            hideDataPoints={true}
            hideRules
            hideYAxisText
            hideAxesAndRules
          pointerConfig={{
            pointerStripColor: color,
            pointerStripWidth: 2,
            pointerColor: color,
            radius: 4,
            pointerLabelWidth: 55,
            pointerLabelHeight: 30,
            pointerLabelComponent: (items: any) => {
              return (
                <View style={styles.tooltipContainer}>
                  <Text style={styles.tooltipText}>
                    {items[0].value.toFixed(0)} {unit}
                  </Text>
                </View>
              );
            },
          }}
        />
        </View>
      </View>
    );
  };

  // Загружаем изменения скиллов и метрик (с кешированием)
  useEffect(() => {
    const loadChanges = async () => {
      const cacheKey = `ride_changes_${activity.id}`;
      
      // Проверяем кеш
      const cached = await Cache.get<{
        skillsChanges: any[];
        metricsChanges: any[];
        similarActivity: Activity | null;
      }>(cacheKey);
      
      if (cached) {
        console.log('✅ Using cached changes data');
        setSkillsChanges(cached.skillsChanges || []);
        setMetricsChanges(cached.metricsChanges || []);
        setSimilarActivity(cached.similarActivity || null);
        return;
      }

      try {
        // Инициализируем переменные для кеширования
        let skillsChanges: any[] = [];
        let metricChanges: any[] = [];
        let similarActivity: Activity | null = null;

        // Загружаем историю скиллов (последние 2 снепшота)
        const skillsHistory = await apiFetch('/api/skills-history/range?limit=2');
        
        if (skillsHistory && skillsHistory.length >= 2) {
          const currentSkills = skillsHistory[0]; // Последний снепшот (с этой тренировкой)
          const previousSkills = skillsHistory[1]; // Предыдущий снепшот
          
          // Сравниваем скиллы
          const skillNames = ['climbing', 'sprint', 'endurance', 'tempo', 'power', 'consistency'];
          const skillEmojis: Record<string, string> = {
            climbing: '⛰️',
            sprint: '⚡',
            endurance: '🔋',
            tempo: '⏱️',
            power: '💪',
            consistency: '📊',
          };
          const skillLabels: Record<string, string> = {
            climbing: 'Climbing',
            sprint: 'Sprint',
            endurance: 'Endurance',
            tempo: 'Tempo',
            power: 'Power',
            consistency: 'Discipline',
          };

          for (const skill of skillNames) {
            const current = Math.round(currentSkills[skill] || 0);
            const previous = Math.round(previousSkills[skill] || 0);
            const diff = current - previous;

            if (diff !== 0) {
              skillsChanges.push({
                type: 'skill',
                name: skillLabels[skill],
                emoji: skillEmojis[skill],
                current,
                previous,
                diff,
              });
            }
          }

          setSkillsChanges(skillsChanges);
        }

        // Загружаем предыдущие тренировки для сравнения метрик
        const allActivities = await apiFetch('/api/activities');
        // Берем только первые 50 для лучшего поиска
        const recentActivities = allActivities.slice(0, 50);
        const currentActivityIndex = recentActivities.findIndex((a: Activity) => a.id === activity.id);
        
        if (currentActivityIndex >= 0) {
          // Берем все тренировки КРОМЕ текущей
          const previousActivities = recentActivities.filter((a: Activity) => a.id !== activity.id);
          
          // Находим похожую тренировку (более мягкие условия)
          // ВАЖНО: присваиваем в существующую переменную, а не создаем новую!
          similarActivity = previousActivities.find((a: Activity) => {
            const distanceDiff = Math.abs(a.distance - activity.distance);
            const elevationDiff = Math.abs(a.total_elevation_gain - activity.total_elevation_gain);
            
            // Дистанция должна быть в пределах ±40% ИЛИ набор в пределах ±60%
            const distanceMatch = distanceDiff < activity.distance * 0.4;
            const elevationMatch = elevationDiff < Math.max(activity.total_elevation_gain * 0.6, 200); // минимум 200м допуск
            
            return distanceMatch && elevationMatch;
          });

          if (similarActivity) {
            // similarActivity уже присвоена из find()
            
            const metricsToCompare = [
              {key: 'average_watts', label: 'Avg Power', unit: 'W', emoji: '⚡'},
              {key: 'average_cadence', label: 'Avg Cadence', unit: 'rpm', emoji: '🔄'},
              {key: 'average_speed', label: 'Avg Speed', unit: 'km/h', emoji: '🚴', multiplier: 3.6},
              {key: 'average_heartrate', label: 'Avg HR', unit: 'bpm', emoji: '❤️'},
            ];
            for (const metric of metricsToCompare) {
              const current = activity[metric.key as keyof Activity];
              const previous = similarActivity[metric.key as keyof Activity];

              if (current && previous) {
                const currentValue = metric.multiplier ? (current as number) * metric.multiplier : current;
                const previousValue = metric.multiplier ? (previous as number) * metric.multiplier : previous;
                const diff = (currentValue as number) - (previousValue as number);

                if (Math.abs(diff) > 0.5) {
                  metricChanges.push({
                    type: 'metric',
                    name: metric.label,
                    emoji: metric.emoji,
                    unit: metric.unit,
                    current: currentValue,
                    previous: previousValue,
                    diff,
                  });
                }
              }
            }
          }
        }

        // Обновляем state
        setSimilarActivity(similarActivity);
        setMetricsChanges(metricChanges);

        // Кешируем все данные на 7 дней
        const dataToCache = {
          skillsChanges,
          metricsChanges: metricChanges,
          similarActivity: similarActivity,
        };
        
        await Cache.set(cacheKey, dataToCache, CACHE_TTL.WEEK);

      } catch (err) {
        console.error('Error loading changes:', err);
      }
    };

    loadChanges();
  }, [activity.id]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ride Analytics</Text>
        <TouchableOpacity
          onPress={handleRefresh}
          style={styles.refreshButton}
          disabled={refreshing}>
          <Text style={styles.refreshButtonText}>
            {refreshing ? '⏳' : '🔄'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Ride Title */}
        <View style={styles.titleSection}>
          <Text style={styles.rideTitle}>{activity.name}</Text>
          <Text style={styles.rideDate}>{rideDate}</Text>
        </View>

        {/* Stats Summary */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              {(activity.distance / 1000).toFixed(1)}
            </Text>
            <Text style={styles.statLabel}>km</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              {Math.round(activity.total_elevation_gain)}
            </Text>
            <Text style={styles.statLabel}>m</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              {Math.floor(activity.moving_time / 60)}
            </Text>
            <Text style={styles.statLabel}>min</Text>
          </View>
        </View>

        {/* Mini Charts - Speed, HR, Cadence */}
        {streams && !streamsLoading && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.miniChartsContainer}
            style={{marginBottom: 16}}>
            {streams.velocity_smooth?.data && renderMiniChart(
              'Speed, avg.',
              streams.velocity_smooth.data.map((v: number) => v * 3.6), // m/s to km/h
              '#10b981',
              'km/h'
            )}
            {streams.heartrate?.data && renderMiniChart(
              'Heart Rate, avg.',
              streams.heartrate.data,
              '#FF5E00',
              'bpm'
            )}
            {streams.cadence?.data && renderMiniChart(
              'Cadence, avg.',
              streams.cadence.data,
              '#8B5CF6',
              'rpm'
            )}
          </ScrollView>
        )}

          {/* AI Analysis Section */}
          <View style={styles.section}>
           <Text style={styles.sectionTitle}>AI-Analysis</Text>
          {loading && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#274dd3" />
              <Text style={styles.loadingText}>Analyzing your ride...</Text>
            </View>
          )}
          
          {aiAnalysis && !loading && (
            <View style={styles.aiBox}>
              <Text style={styles.aiText}>{getPreviewText(aiAnalysis)}</Text>
              {aiAnalysis.split('\n\n').length > 1 && (
                <TouchableOpacity
                  style={styles.showMoreButton}
                  onPress={() => setShowFullAnalysis(true)}>
                  <Text style={styles.showMoreText}>Show more →</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          
          {!loading && !aiAnalysis && (
            <View style={styles.placeholderBox}>
              <Text style={styles.placeholderText}>
                No AI analysis available
              </Text>
            </View>
          )}
        </View>

         {/* Meta Goals Impact */}
       
         <View style={styles.section}>
          <Text style={styles.sectionTitle}>Impact on Goals</Text>
         
          {metaGoals.length > 0 ? (
            <ScrollView
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.scrollViewContainer}
            >
              {metaGoals.map((goal, index) => (
                <View key={goal.id} style={styles.goalCard}>
                  {/* Заголовок и прирост */}
                  <View style={styles.goalHeader}>
                    <Text style={styles.goalTitle} numberOfLines={1}>
                      {goal.title}
                    </Text>
                  </View>

                  {/* Процент и прирост */}
                  <View style={styles.goalStatsRow}>
                    <Text style={styles.goalProgressLarge}>
                      {goal.progress}%
                    </Text>
                    {goal.progressGain > 0 && (
                      <View style={styles.goalBadge}>
                        <Text style={styles.goalBadgeText}>+{goal.progressGain}%</Text>
                      </View>
                    )}
                  </View>

                  {/* Что именно выросло */}
                  {goal.contributions && goal.contributions.length > 0 && (
                    <View style={styles.contributionsContainer}>
                      {goal.contributions.map((contrib: any, idx: number) => (
                        <View key={idx} style={styles.contributionItem}>
                          <Text style={styles.contributionLabel}>{contrib.label}:</Text>
                          <Text style={styles.contributionValue}>{contrib.value}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.placeholderBox}>
              <Text style={styles.placeholderText}>
                No active goals found
              </Text>
            </View>
          )}
         
        </View>

        {/* Changes Feed */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Impact on Your Stats</Text>
          
          {(skillsChanges.length > 0 || metricsChanges.length > 0) ? (
            <View>
              {/* Skills Section */}
              {skillsChanges.length > 0 && (
                <View style={styles.subsection}>
                  <Text style={styles.subsectionTitle}>Skills</Text>
                  <View style={styles.changesGrid}>
                    {skillsChanges.map((change, index) => (
                      <View key={`skill-${index}`} style={styles.changeCardSmall}>
                        <View style={styles.changeHeader}>
                          <Text style={styles.changeName}>{change.name}</Text>
                        </View>
                        <View style={styles.changeValues}>
                          <Text style={styles.changeValueSmall}>
                            {change.previous} → {change.current}
                          </Text>
                          <View style={[styles.changeBadge, change.diff > 0 ? styles.changePositive : styles.changeNegative]}>
                            <Text style={[styles.changeDiff, change.diff < 0 && {color: '#ef4444'}]}>
                              {change.diff > 0 ? '+' : ''}{change.diff}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}


  {/* Similar Ride Comparison */}
  <View style={styles.section}>
          <Text style={styles.sectionTitle}>Similar Ride Comparison</Text>
          
          {similarActivity ? (
            <View style={styles.comparisonBox}>
              <Text style={styles.comparisonTitle}>
                Compared with: {similarActivity.name}
              </Text>
              <Text style={styles.comparisonDate}>
                {new Date(similarActivity.start_date).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>

              <View style={styles.comparisonGrid}>
                <View style={styles.comparisonRow}>
                  <Text style={styles.comparisonLabel}>Distance</Text>
                  <View style={styles.comparisonValues}>
                    <Text style={styles.comparisonOld}>
                      {(similarActivity.distance / 1000).toFixed(1)} km
                    </Text>
                    <Text style={styles.comparisonArrow}>→</Text>
                    <Text style={styles.comparisonNew}>
                      {(activity.distance / 1000).toFixed(1)} km
                    </Text>
                  </View>
                </View>

                <View style={styles.comparisonRow}>
                  <Text style={styles.comparisonLabel}>Elevation</Text>
                  <View style={styles.comparisonValues}>
                    <Text style={styles.comparisonOld}>
                      {Math.round(similarActivity.total_elevation_gain)} m
                    </Text>
                    <Text style={styles.comparisonArrow}>→</Text>
                    <Text style={styles.comparisonNew}>
                      {Math.round(activity.total_elevation_gain)} m
                    </Text>
                  </View>
                </View>

                <View style={styles.comparisonRow}>
                  <Text style={styles.comparisonLabel}>Time</Text>
                  <View style={styles.comparisonValues}>
                    <Text style={styles.comparisonOld}>
                      {Math.floor(similarActivity.moving_time / 60)} min
                    </Text>
                    <Text style={styles.comparisonArrow}>→</Text>
                    <Text style={styles.comparisonNew}>
                      {Math.floor(activity.moving_time / 60)} min
                    </Text>
                  </View>
                </View>

                {activity.average_speed && similarActivity.average_speed && (
                  <View style={styles.comparisonRow}>
                    <Text style={styles.comparisonLabel}>Avg Speed</Text>
                    <View style={styles.comparisonValues}>
                      <Text style={styles.comparisonOld}>
                        {(similarActivity.average_speed * 3.6).toFixed(1)} km/h
                      </Text>
                      <Text style={styles.comparisonArrow}>→</Text>
                      <Text style={[
                        styles.comparisonNew,
                        activity.average_speed > similarActivity.average_speed && styles.comparisonBetter
                      ]}>
                        {(activity.average_speed * 3.6).toFixed(1)} km/h
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.placeholderBox}>
              <Text style={styles.placeholderText}>
                No similar rides found for comparison
              </Text>
            </View>
          )}
        </View>



              {/* Metrics Section */}
              {metricsChanges.length > 0 && (
                <View style={styles.subsection}>
                  <Text style={styles.subsectionTitle}>Metrics</Text>
                  <View style={styles.changesGrid}>
                    {metricsChanges.map((change, index) => (
                      <View key={`metric-${index}`} style={styles.changeCardSmall}>
                        <View style={styles.changeHeader}>
                          <Text style={styles.changeName}>{change.name}</Text>
                        </View>
                        <View style={styles.changeValues}>
                          <Text style={styles.changeValueSmall}>
                            {change.previous.toFixed(0)} → {change.current.toFixed(0)}
                          </Text>
                          <View style={[styles.changeBadge, change.diff > 0 ? styles.changePositive : styles.changeNegative]}>
                            <Text style={[styles.changeDiff, change.diff < 0 && {color: '#ef4444'}]}>
                              {change.diff > 0 ? '+' : ''}{change.diff.toFixed(0)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.placeholderBox}>
              <Text style={styles.placeholderText}>
                No significant changes detected
              </Text>
            </View>
          )}
        </View>

      

       

      </ScrollView>

      {/* Full Analysis Modal */}
      <Modal
        visible={showFullAnalysis}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFullAnalysis(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Full AI Analysis</Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowFullAnalysis(false)}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent}>
            <Text style={styles.modalText}>{aiAnalysis}</Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#131519',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 55,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: {
    padding: 8,
    marginRight: 0,
  },
  backButtonText: {
    fontSize: 20,
    color: 'rgb(255, 255, 255, 0.75)',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgb(255, 255, 255, 0.75)',
    flex: 1,
  },
  refreshButton: {
    padding: 8,
  },
  refreshButtonText: {
    fontSize: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 0,
  },
  titleSection: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  rideTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: 'rgb(255, 255, 255, 0.75)',
    marginBottom: 8,
    marginTop: 24,
  },
  rideDate: {
    fontSize: 14,
    color: '#888',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 16,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 36,
  },
  statBox: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    
    gap: 4,
},
  statValue: {
    fontSize: 38,
    fontWeight: '800',
    color: 'rgb(255, 255, 255, 0.75)',
    marginBottom: 0,
  },
  statLabel: {
    fontSize: 11,
    color: '#888',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 24,
    textTransform: 'uppercase',
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 16,
    marginTop: 24,
    paddingHorizontal: 16,
  },
  placeholderBox: {
    backgroundColor: '#1a1a1a',
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  placeholderText: {
    color: '#666',
    fontSize: 14,
  },
  loadingBox: {
    backgroundColor: '#1a1a1a',
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
    marginTop: 16,
  },
  aiBox: {
    paddingHorizontal: 16,
    padding: 0,
    
  },
  aiText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#e0e0e0',
    marginBottom: 16,
  },
  showMoreButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  showMoreText: {
    color: '#274dd3',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'rgb(255, 255, 255, 0.75)',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 24,
    color: '#888',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  modalText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#e0e0e0',
  },
  subsection: {
    marginBottom: 20,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgb(255, 255, 255, 0.3)',
    marginBottom: 12,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
  },
  changesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    paddingHorizontal: 16,
  },
  changeCard: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  changeCardSmall: {

    paddingVertical: 12,
    width: '49.46%',
  },
  changeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  changeEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  changeName: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgb(255, 255, 255, 0.75)',
  },
  changeValues: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 8,
  },
  changeValue: {
    fontSize: 14,
    color: '#888',

  },
  changeValueSmall: {
    fontSize: 14,
    color: '#888',
  },
  changeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
  },
  changePositive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  changeNegative: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  changeDiff: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10b981',
  },
  comparisonBox: {
    backgroundColor:'rgba(255, 255, 255, 0.03)',
    padding: 20,
    margin: 16,
    
  },
  comparisonTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgb(255, 255, 255, 0.8)',
    marginBottom: 8,
  },
  comparisonDate: {
    fontSize: 12,
    color: '#888',
    marginBottom: 24,
  },
  comparisonGrid: {
    gap: 16,
  },
  comparisonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  comparisonLabel: {
    fontSize: 14,
    color: '#888',
    flex: 1,
  },
  comparisonValues: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  comparisonOld: {
    fontSize: 14,
    color: '#666',
  },
  comparisonArrow: {
    fontSize: 14,
    color: '#666',
  },
  comparisonNew: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgb(255, 255, 255, 0.75)',
  },
  comparisonBetter: {
    color: '#10b981',
  },
  scrollViewContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 16,
  },
  goalCard: {
    backgroundColor:'rgba(255, 255, 255, 0.03)',
    padding: 16,
    marginBottom: 12,
    width: 212,
    height: 180,
    marginRight: 8,
    justifyContent: 'space-between',
  },
  goalHeader: {
    marginBottom: 8,
  },
  goalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgb(255, 255, 255, 0.75)',
  },
  goalStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  goalProgressLarge: {
    fontSize: 30,
    fontWeight: '900',
    color: 'rgb(255, 255, 255, 0.75)',
  },
  goalBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
  },
  goalBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10b981',
  },
  contributionsContainer: {
    gap: 8,
  },
  contributionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contributionLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  contributionValue: {
    fontSize: 12,
    color: 'rgb(21, 143, 102)',
    fontWeight: '700',
  },
  miniChartsContainer: {
    flexDirection: 'row',
    gap: 0,
    paddingLeft: 16,
    paddingHorizontal:0,
  },
  miniChartCard: {
    width: 212,
    height: 180,
    backgroundColor:'rgba(255, 255, 255, 0.03)',
    padding: 0,
    marginRight: 8,
    
   
   
  },
  miniChartContent: {
    position: 'relative',
    left: -30,
    top: 10,
  },
  miniChartHeader: {
    marginBottom: 8,
    padding: 16,
    paddingBottom: 0,
  },
  miniChartTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  miniChartAvg: {
    fontSize: 20,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  miniChartUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
  },
  tooltipContainer: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 2,
    paddingVertical: 4,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#333',
    position: 'relative',
    top: 25,
    alignItems: 'center',
    zIndex: 9999,
  },
  tooltipText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
});

import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import {useFocusEffect} from '@react-navigation/native';
import {Activity} from '../types/activity';
import {apiFetch} from '../utils/api';
import {Cache, CACHE_TTL} from '../utils/cache';
import {getActivityStreams} from '../utils/streamsCache';
import {LineChart} from 'react-native-gifted-charts';
import {TrainingCard} from '../components/TrainingCard';
import {TrainingDetailsModal} from '../components/TrainingDetailsModal';

// Типы предлагаемых целей
interface SuggestedGoal {
  id: string;
  title: string;
  description: string;
  prompt: string;
  icon: string;
  color: string;
}

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
  const [suggestedGoals, setSuggestedGoals] = useState<SuggestedGoal[]>([]);
  const [allParsedGoals, setAllParsedGoals] = useState<SuggestedGoal[]>([]); // все распарсенные цели (без фильтрации)
  const [suggestedTrainings, setSuggestedTrainings] = useState<any[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<any[]>([]);
  const [selectedTraining, setSelectedTraining] = useState<any>(null);
  const [trainingModalVisible, setTrainingModalVisible] = useState(false);
  const [userGoals, setUserGoals] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [rideScore, setRideScore] = useState<number | null>(null);
  const [rideScoreLabel, setRideScoreLabel] = useState('');
  const [rideQuality, setRideQuality] = useState<number | null>(null);
  const [rideQualityLabel, setRideQualityLabel] = useState('');
  const [rideQualityAdvice, setRideQualityAdvice] = useState('');
  const [hrZoneDistribution, setHrZoneDistribution] = useState<
    {zone: string; minutes: number; percent: number; color: string; rangeMin: number; rangeMax: number}[]
  >([]);
  const [highlights, setHighlights] = useState<
    {title: string; text: string}[]
  >([]);

  const rideDate = (() => {
    const d = new Date(activity.start_date);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}.${d.getFullYear()}`;
  })();

  // Парсим рекомендации из AI анализа
  const parseRecommendations = (analysis: string): string[] => {
    const recommendationsSection = analysis.match(/Recommendations?:?\s*\n([\s\S]*?)(\n\n|$)/i);
    if (!recommendationsSection) return [];
    
    const recommendations = recommendationsSection[1]
      .split('\n')
      .filter(line => line.trim().match(/^\d+\./))
      .map(line => line.replace(/^\d+\.\s*/, '').trim());
    
    return recommendations;
  };

  // Mapping рекомендаций на предлагаемые цели
  const mapRecommendationsToGoals = (recommendations: string[]): SuggestedGoal[] => {
    const goalTemplates: {[key: string]: SuggestedGoal} = {
      cadence: {
        id: 'cadence',
        title: 'Improve Cadence Efficiency',
        description: 'Optimize your pedaling technique and cadence consistency',
        prompt: 'I want to improve my cadence efficiency and pedaling technique to maintain 90-95 rpm consistently',
        icon: '🔄',
        color: 'rgba(164, 88, 252, 0.15)',
      },
      power: {
        id: 'power',
        title: 'Increase Power Output',
        description: 'Build functional threshold power and sustained power',
        prompt: 'I want to increase my FTP and overall power output for better performance',
        icon: '⚡',
        color: 'rgba(252, 88, 203, 0.16)',   
      },
      climbing: {
        id: 'climbing',
        title: 'Improve Climbing Performance',
        description: 'Enhance climbing strength and elevation gain capacity',
        prompt: 'I want to improve my climbing performance and handle more elevation gain',
        icon: '⛰️',
        color: 'rgba(118, 252, 88, 0.15)',
      },
      endurance: {
        id: 'endurance',
        title: 'Build Endurance Base',
        description: 'Increase aerobic capacity for longer rides',
        prompt: 'I want to build my endurance base to handle longer rides comfortably',
        icon: '🏃',
        color: 'rgba(88, 216, 252, 0.15)',
      },
      recovery: {
        id: 'recovery',
        title: 'Better Recovery Management',
        description: 'Optimize recovery and prevent overtraining',
        prompt: 'I want to improve my recovery management and avoid overtraining',
        icon: '😴',
        color: 'rgba(88, 216, 252, 0.15)',
      },
      hrZones: {
        id: 'hrZones',
        title: 'Heart Rate Zone Training',
        description: 'Master HR zone control and cardiovascular efficiency',
        prompt: 'I want to improve my heart rate zone control and cardiovascular efficiency',
        icon: '❤️',
        color: 'rgba(88, 99, 252, 0.17)',
      },

      pacing: {
        id: 'pacing',
        title: 'Consistent Pacing',
        description: 'Develop better pacing strategy and consistency',
        prompt: 'I want to improve my pacing strategy and maintain consistent power output',
        icon: '📊',
        color: 'rgba(88, 154, 252, 0.15)',
      },
    };

    const suggestedGoals: SuggestedGoal[] = [];
    const addedGoalIds = new Set<string>();

    recommendations.forEach(rec => {
      const lowerRec = rec.toLowerCase();
      
      // Cadence
      if ((lowerRec.includes('cadence') || lowerRec.includes('pedaling')) && !addedGoalIds.has('cadence')) {
        suggestedGoals.push(goalTemplates.cadence);
        addedGoalIds.add('cadence');
      }
      
      // Power / FTP
      if ((lowerRec.includes('power') || lowerRec.includes('ftp') || lowerRec.includes('watt')) && !addedGoalIds.has('power')) {
        suggestedGoals.push(goalTemplates.power);
        addedGoalIds.add('power');
      }
      
      // Climbing
      if ((lowerRec.includes('climb') || lowerRec.includes('elevation') || lowerRec.includes('hill')) && !addedGoalIds.has('climbing')) {
        suggestedGoals.push(goalTemplates.climbing);
        addedGoalIds.add('climbing');
      }
      
      // Endurance
      if ((lowerRec.includes('endurance') || lowerRec.includes('aerobic') || lowerRec.includes('longer rides')) && !addedGoalIds.has('endurance')) {
        suggestedGoals.push(goalTemplates.endurance);
        addedGoalIds.add('endurance');
      }
      
      // Recovery
      if ((lowerRec.includes('recovery') || lowerRec.includes('rest') || lowerRec.includes('fatigue')) && !addedGoalIds.has('recovery')) {
        suggestedGoals.push(goalTemplates.recovery);
        addedGoalIds.add('recovery');
      }
      
      // HR Zones
      if ((lowerRec.includes('hr') || lowerRec.includes('heart rate') || lowerRec.includes('zone')) && !addedGoalIds.has('hrZones')) {
        suggestedGoals.push(goalTemplates.hrZones);
        addedGoalIds.add('hrZones');
      }
      
     
      
      // Pacing
      if ((lowerRec.includes('pacing') || lowerRec.includes('pace') || lowerRec.includes('consistent') || lowerRec.includes('steady')) && !addedGoalIds.has('pacing')) {
        suggestedGoals.push(goalTemplates.pacing);
        addedGoalIds.add('pacing');
      }
    });

    return suggestedGoals;
  };

  // Mapping рекомендаций на типы тренировок
  const mapRecommendationsToTrainings = (recommendations: string[], allTrainingTypes: any[]): any[] => {
    const trainingMapping: {[key: string]: string[]} = {
      // Cadence -> Cadence training
      cadence: ['cadence'],
      // Power/FTP -> Sweet Spot, Threshold, Intervals
      power: ['sweet_spot', 'threshold', 'intervals'],
      ftp: ['sweet_spot', 'threshold', 'intervals'],
      // Climbing -> Hill Climbing, Strength
      climbing: ['hill_climbing', 'strength'],
      elevation: ['hill_climbing', 'strength'],
      hill: ['hill_climbing'],
      // Endurance -> Endurance, Group Ride
      endurance: ['endurance', 'group_ride'],
      aerobic: ['endurance'],
      // Recovery -> Recovery
      recovery: ['recovery'],
      rest: ['recovery'],
      fatigue: ['recovery'],
      // HR Zones -> Tempo, Threshold
      'heart rate': ['tempo', 'threshold'],
      'hr': ['tempo', 'threshold'],
      zone: ['tempo', 'threshold'],
      // Nutrition -> no specific training, skip
      // Pacing -> Tempo, Time Trial
      pacing: ['tempo', 'time_trial'],
      pace: ['tempo', 'time_trial'],
      steady: ['tempo'],
      consistent: ['tempo'],
    };

    const suggestedTrainingKeys = new Set<string>();

    recommendations.forEach(rec => {
      const lowerRec = rec.toLowerCase();
      
      Object.keys(trainingMapping).forEach(keyword => {
        if (lowerRec.includes(keyword)) {
          trainingMapping[keyword].forEach(trainingKey => {
            suggestedTrainingKeys.add(trainingKey);
          });
        }
      });
    });

    // Конвертируем ключи в полные объекты тренировок
    const trainings = Array.from(suggestedTrainingKeys)
      .map(key => allTrainingTypes.find(t => t.key === key))
      .filter(Boolean) // Удаляем undefined
      .slice(0, 5); // Ограничиваем до 5

    return trainings;
  };

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

  // Загружаем активные МЕТА-цели пользователя (перезагружаем при фокусе на экране)
  useFocusEffect(
    useCallback(() => {
      const loadUserGoals = async () => {
        try {
          const goals = await apiFetch('/api/meta-goals');
          const activeGoals = (goals || []).filter((g: any) => g.status === 'active');
          setUserGoals(activeGoals);
        } catch (err) {
          console.error('Error loading user meta-goals:', err);
        }
      };

      loadUserGoals();
    }, [])
  );

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

  // Загружаем training types
  useEffect(() => {
    const loadTrainingTypes = async () => {
      try {
        const types = await apiFetch('/api/training-types');
        setTrainingTypes(types || []);
      } catch (err) {
        console.error('Error loading training types:', err);
      }
    };

    loadTrainingTypes();
  }, []);

  // Парсим рекомендации из AI анализа и генерируем предлагаемые цели (БЕЗ фильтрации)
  useEffect(() => {
    if (aiAnalysis && trainingTypes.length > 0) {
      const recommendations = parseRecommendations(aiAnalysis);
      
      if (recommendations.length > 0) {
        // Предлагаемые цели (все, без фильтрации)
        const allGoals = mapRecommendationsToGoals(recommendations);
        setAllParsedGoals(allGoals);

        // Предлагаемые тренировки
        const trainings = mapRecommendationsToTrainings(recommendations, trainingTypes);
        setSuggestedTrainings(trainings);
      }
    }
  }, [aiAnalysis, trainingTypes]);

  // Фильтруем цели при изменении userGoals (отдельный useEffect!)
  useEffect(() => {
    if (allParsedGoals.length > 0) {
      const filteredGoals = allParsedGoals.filter(suggestedGoal => {
        // Проверяем, есть ли уже такая цель
        const alreadyExists = userGoals.some(userGoal => {
          // Сравниваем по prompt (основной критерий)
          if (userGoal.prompt && suggestedGoal.prompt) {
            const userPromptLower = userGoal.prompt.toLowerCase();
            const suggestedPromptLower = suggestedGoal.prompt.toLowerCase();
            
            // Проверяем наличие ключевых слов
            const keywords = suggestedGoal.id.toLowerCase();
            return userPromptLower.includes(keywords) || suggestedPromptLower.includes(keywords);
          }
          
          // Дополнительно проверяем по title
          if (userGoal.title && suggestedGoal.title) {
            const userTitleLower = userGoal.title.toLowerCase();
            const suggestedTitleLower = suggestedGoal.title.toLowerCase();
            const keywords = suggestedGoal.id.toLowerCase();
            return userTitleLower.includes(keywords);
          }
          
          return false;
        });
        
        return !alreadyExists;
      });
      
      setSuggestedGoals(filteredGoals);
    }
  }, [allParsedGoals, userGoals]);

  // Загружаем Meta Goals (кеш на клиенте 7 дней + БД на сервере)
  // В БД хранится только последний просмотренный заезд для каждой мета-цели
  useEffect(() => {
    const loadMetaGoals = async () => {
      const cacheKey = `ride_meta_goals_${activity.id}`;
      
      // Проверяем кеш на клиенте (7 дней)
      const cached = await Cache.get<any[]>(cacheKey);
      if (cached) {
        console.log('✅ Using cached meta goals from client');
        setMetaGoals(cached);
        return;
      }

      try {
        // API проверит БД, если нет - вычислит и сохранит (перезапишет для этой мета-цели)
        const goals = await apiFetch(`/api/activities/${activity.id}/meta-goals-progress`);
        
        setMetaGoals(goals || []);
        
        // Кешируем на клиенте на 7 дней
        if (goals) {
          await Cache.set(cacheKey, goals, CACHE_TTL.WEEK);
        }

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
  const renderMiniChart = (title: string, data: number[], color: string, unit: string, excludeZeros = false) => {
    if (!data || data.length === 0) return null;

    const chartData = prepareChartData(data);
    const maxValue = Math.max(...data) * 1.1;
    
    // Для каденса исключаем нули (когда не крутим педали)
    const filteredData = excludeZeros ? data.filter(v => v > 0) : data;
    const avgValue = filteredData.length > 0 
      ? filteredData.reduce((sum, v) => sum + v, 0) / filteredData.length 
      : 0;

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

  // Load user profile for HR zones
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await apiFetch('/api/user-profile');
        setUserProfile(profile);
      } catch (err) {
        console.error('Error loading user profile:', err);
      }
    };
    loadProfile();
  }, []);

  // Compute Ride Score + HR Zone Distribution
  useEffect(() => {
    if (!streams?.heartrate?.data || !streams?.time?.data) return;

    const hrData = streams.heartrate.data;
    const timeData = streams.time.data;
    const maxHR = userProfile?.max_hr || activity.max_heartrate || 190;
    const restHR = userProfile?.resting_hr || 60;
    const hrReserve = maxHR - restHR;

    if (hrReserve <= 0) return;

    const zoneColors = ['#C5CEEF', '#9FB4FF', '#708EF7', '#4B6DE4', '#274DD3'];
    const lt = userProfile?.lactate_threshold || 0;

    // Same formula as OnboardingScreen: LT-based if available, otherwise Karvonen (HRR)
    let zones: {zone: string; min: number; max: number; color: string}[];
    if (lt) {
      zones = [
        {zone: 'Z1', min: Math.round(lt * 0.75), max: Math.round(lt * 0.85), color: zoneColors[0]},
        {zone: 'Z2', min: Math.round(lt * 0.85), max: Math.round(lt * 0.92), color: zoneColors[1]},
        {zone: 'Z3', min: Math.round(lt * 0.92), max: Math.round(lt * 0.97), color: zoneColors[2]},
        {zone: 'Z4', min: Math.round(lt * 0.97), max: Math.round(lt * 1.03), color: zoneColors[3]},
        {zone: 'Z5', min: Math.round(lt * 1.03), max: maxHR, color: zoneColors[4]},
      ];
    } else {
      zones = [
        {zone: 'Z1', min: Math.round(restHR + hrReserve * 0.5), max: Math.round(restHR + hrReserve * 0.6), color: zoneColors[0]},
        {zone: 'Z2', min: Math.round(restHR + hrReserve * 0.6), max: Math.round(restHR + hrReserve * 0.7), color: zoneColors[1]},
        {zone: 'Z3', min: Math.round(restHR + hrReserve * 0.7), max: Math.round(restHR + hrReserve * 0.8), color: zoneColors[2]},
        {zone: 'Z4', min: Math.round(restHR + hrReserve * 0.8), max: Math.round(restHR + hrReserve * 0.9), color: zoneColors[3]},
        {zone: 'Z5', min: Math.round(restHR + hrReserve * 0.9), max: maxHR, color: zoneColors[4]},
      ];
    }

    const zoneTimes = [0, 0, 0, 0, 0];
    for (let i = 1; i < hrData.length; i++) {
      const hr = hrData[i];
      const dt = timeData[i] - timeData[i - 1];
      for (let z = zones.length - 1; z >= 0; z--) {
        if (hr >= zones[z].min) {
          zoneTimes[z] += dt;
          break;
        }
      }
    }

    const totalTime = zoneTimes.reduce((a, b) => a + b, 0);
    if (totalTime === 0) return;

    setHrZoneDistribution(
      zones.map((z, i) => ({
        zone: z.zone,
        minutes: Math.round(zoneTimes[i] / 60),
        percent: Math.round((zoneTimes[i] / totalTime) * 100),
        color: z.color,
        rangeMin: Math.round(z.min),
        rangeMax: z.max === 999 ? Math.round(maxHR) : Math.round(z.max),
      })),
    );

    const avgHR =
      hrData.reduce((a: number, b: number) => a + b, 0) / hrData.length;
    const intensity = Math.max(0, Math.min(1, (avgHR - restHR) / hrReserve));
    const durationHours = (activity.moving_time || totalTime) / 3600;
    const rawScore = intensity * intensity * durationHours * 100;
    const score = Math.min(100, Math.round(rawScore));

    setRideScore(score);
    if (score <= 20) setRideScoreLabel('Recovery ride');
    else if (score <= 40) setRideScoreLabel('Easy ride');
    else if (score <= 55) setRideScoreLabel('Moderate ride');
    else if (score <= 70) setRideScoreLabel('Tempo ride');
    else if (score <= 80) setRideScoreLabel('Hard ride');
    else if (score <= 85) setRideScoreLabel('Heavy ride');
    else setRideScoreLabel('Outstanding');

    // Ride Quality calculation
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    const speedKmh = (activity.average_speed || 0) * 3.6;
    const maxSpeedKmh = (activity.max_speed || 0) * 3.6;
    const hrIntensity = clamp(intensity, 0.01, 1);

    // A. Cardiac Efficiency (40%): speed per unit of HR effort
    const efficiencyRaw = speedKmh / (hrIntensity * 50);
    const cardiacScore = clamp(efficiencyRaw * 80, 0, 100);

    // B. Cadence Score (25%): peak at 87.5 rpm, penalty for deviation
    const cadenceData = streams.cadence?.data;
    let avgCadence = 0;
    if (cadenceData) {
      const nonZero = cadenceData.filter((c: number) => c > 0);
      avgCadence = nonZero.length > 0
        ? nonZero.reduce((a: number, b: number) => a + b, 0) / nonZero.length
        : 0;
    }
    const cadenceScore = avgCadence > 0
      ? clamp(100 - Math.abs(avgCadence - 87.5) * 3, 0, 100)
      : 50;

    // C. Speed Performance (20%): avg + max speed bonus
    const avgSpeedScore = clamp(speedKmh / 35 * 100, 0, 100);
    const maxSpeedBonus = clamp(maxSpeedKmh / 55, 0, 1) * 20;
    const speedScore = clamp(avgSpeedScore + maxSpeedBonus, 0, 100);

    // D. HR Zone Efficiency (15%): time in productive zones (Z2-Z3)
    const productiveTime = zoneTimes[1] + zoneTimes[2];
    const overloadTime = zoneTimes[4];
    const zoneEfficiency = totalTime > 0
      ? clamp(((productiveTime / totalTime) * 120 - (overloadTime / totalTime) * 40), 0, 100)
      : 50;

    // Elevation correction multiplier
    const distKm = activity.distance / 1000;
    const gradient = distKm > 0 ? activity.total_elevation_gain / distKm : 0;
    const elevationMultiplier = clamp(1 + gradient * 0.02, 1.0, 1.4);

    const rawQuality = (cardiacScore * 0.4 + cadenceScore * 0.25 + speedScore * 0.20 + zoneEfficiency * 0.15) * elevationMultiplier;
    const quality = clamp(Math.round(rawQuality), 0, 100);

    setRideQuality(quality);
    if (quality <= 20) {
      setRideQualityLabel('Poor');
      setRideQualityAdvice('Rest day recommended. Sleep more, try yoga.');
    } else if (quality <= 35) {
      setRideQualityLabel('Below Avg');
      setRideQualityAdvice('Take it easy. Focus on recovery.');
    } else if (quality <= 50) {
      setRideQualityLabel('Average');
      setRideQualityAdvice('Room for improvement. Check your pacing.');
    } else if (quality <= 65) {
      setRideQualityLabel('Good');
      setRideQualityAdvice('Solid effort. Building consistency.');
    } else if (quality <= 75) {
      setRideQualityLabel('Well done');
      setRideQualityAdvice('Strong ride. Keep pushing!');
    } else if (quality <= 85) {
      setRideQualityLabel('Excellent');
      setRideQualityAdvice('Great efficiency. You\'re in form!');
    } else {
      setRideQualityLabel('Awesome!');
      setRideQualityAdvice('Peak performance. Machine mode!');
    }
  }, [streams, userProfile, activity]);

  // Parse AI analysis into structured highlights
  useEffect(() => {
    if (!aiAnalysis) return;

    const parsed: {title: string; text: string}[] = [];
    const textLines = aiAnalysis.split('\n').filter((l: string) => l.trim());

    if (textLines.length > 0) {
      const firstLine = textLines[0].trim();
      if (!firstLine.match(/^[A-Z][a-z]+.*:/) || firstLine.length < 60) {
        parsed.push({title: 'Summary', text: firstLine});
      }
    }

    const sectionPatterns = [
      {key: /^Intensity/i, title: 'Intensity'},
      {key: /^Speed/i, title: 'Pacing'},
      {key: /^Power/i, title: 'Power'},
      {key: /^Climbing/i, title: 'Climbing'},
      {key: /^Technique/i, title: 'Technique'},
      {key: /^Nutrition/i, title: 'Nutrition'},
      {key: /^Recovery/i, title: 'Recovery'},
    ];

    for (const sp of sectionPatterns) {
      const sectionIdx = textLines.findIndex((l: string) =>
        sp.key.test(l.trim()),
      );
      if (sectionIdx < 0) continue;

      const contentLines: string[] = [];
      for (let i = sectionIdx + 1; i < textLines.length; i++) {
        const line = textLines[i].trim();
        if (/^[A-Z][a-z]+.*:/.test(line) && !line.startsWith('-')) break;
        if (line.startsWith('-') || line.startsWith('\u2022')) {
          contentLines.push(line.replace(/^[-\u2022]\s*/, ''));
        } else if (line) {
          contentLines.push(line);
        }
        if (contentLines.length >= 2) break;
      }

      if (contentLines.length > 0) {
        parsed.push({
          title: sp.title,
          text: contentLines.join('. ').substring(0, 140),
        });
      }
    }

    setHighlights(parsed);
  }, [aiAnalysis]);

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

        {/* Ride Quality + Title */}
        <View style={styles.rideScoreSection}>
          {rideQuality !== null && (() => {
            const qualityColor =
              rideQuality <= 20 ? '#6A4CCF'
              : rideQuality <= 35 ? '#EF6C00'
              : rideQuality <= 50 ? '#F9A825'
              : rideQuality <= 65 ? '#7CB342'
              : rideQuality <= 75 ? '#2BB673'
              : rideQuality <= 85 ? '#5B8DEF'
              : '#6A4CCF';
            return (
              <View style={styles.rideScoreBlock}>
                <View style={styles.rideScoreHeaderRow}>
                  <View style={[styles.rideScoreDot, {backgroundColor: qualityColor}]} />
                  <Text style={[styles.rideScoreHeaderText, {color: qualityColor}]}>{rideQualityLabel}</Text>
                </View>
                <Text style={styles.rideScoreNumber}>Ride Quality: {rideQuality}<Text style={styles.rideScoreOf}> /100</Text></Text>
                <Text style={styles.rideQualityHeaderAdvice}>{rideQualityAdvice}</Text>
              </View>
            );
          })()}
          <Text style={styles.rideTitle}>{activity.name}</Text>
          <Text style={styles.rideDate}>{rideDate}</Text>
        </View>

        {/* Mini Charts */}
        {streams && !streamsLoading && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.miniChartsContainer}
            style={{marginBottom: 16}}>
            {streams.velocity_smooth?.data && renderMiniChart(
              'Speed',
              streams.velocity_smooth.data.map((v: number) => v * 3.6),
              '#10b981',
              'km/h',
            )}
            {streams.heartrate?.data && renderMiniChart(
              'Heart Rate',
              streams.heartrate.data,
              '#FF5E00',
              'bpm',
            )}
            {streams.cadence?.data && renderMiniChart(
              'Cadence',
              streams.cadence.data,
              '#8B5CF6',
              'rpm',
              true,
            )}
            {streams.watts?.data && renderMiniChart(
              'Power',
              streams.watts.data,
              '#f59e0b',
              'W',
            )}
            {streams.altitude?.data && (() => {
              const altData = streams.altitude.data;
              const chartData = prepareChartData(altData);
              const maxVal = Math.max(...altData) * 1.1;
              const elevGain = Math.round(activity.total_elevation_gain);
              return (
                <View key="elevation" style={styles.miniChartCard}>
                  <View style={styles.miniChartHeader}>
                    <Text style={styles.miniChartTitle}>Elevation</Text>
                    <Text style={styles.miniChartAvg}>
                      {elevGain} <Text style={styles.miniChartUnit}>m gain</Text>
                    </Text>
                  </View>
                  <View style={styles.miniChartContent}>
                    <LineChart
                      data={chartData}
                      width={231}
                      height={100}
                      maxValue={maxVal}
                      spacing={Math.max(1, Math.floor(250 / chartData.length))}
                      curved
                      areaChart
                      startFillColor="#6b7280"
                      startOpacity={0.2}
                      endOpacity={0}
                      color="#6b7280"
                      thickness={2}
                      hideDataPoints={true}
                      hideRules
                      hideYAxisText
                      hideAxesAndRules
                      pointerConfig={{
                        pointerStripColor: '#6b7280',
                        pointerStripWidth: 2,
                        pointerColor: '#6b7280',
                        radius: 4,
                        pointerLabelWidth: 55,
                        pointerLabelHeight: 30,
                        pointerLabelComponent: (items: any) => (
                          <View style={styles.tooltipContainer}>
                            <Text style={styles.tooltipText}>
                              {items[0].value.toFixed(0)} m
                            </Text>
                          </View>
                        ),
                      }}
                    />
                  </View>
                </View>
              );
            })()}
          </ScrollView>
        )}

 {/* AI Highlights */}
 <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Analysis</Text>
          {loading && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#274dd3" />
              <Text style={styles.loadingText}>Analyzing your ride...</Text>
            </View>
          )}

          {(highlights.length > 0 || rideScore !== null) && !loading && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.highlightsContainer}>
              {rideScore !== null && (() => {
                const scoreColor =
                  rideScore <= 20 ? '#8FA3AD'
                  : rideScore <= 35 ? '#EF6C00'
                  : rideScore <= 50 ? '#F9A825'
                  : rideScore <= 65 ? '#7CB342'
                  : rideScore <= 75 ? '#2BB673'
                  : rideScore <= 85 ? '#6A4CCF'
                  : '#D84343';
                const pieSize = 80;
                const pieStroke = 4;
                const pieRadius = (pieSize - pieStroke) / 2;
                const pieCircumference = 2 * Math.PI * pieRadius;
                const pieOffset = pieCircumference * (1 - rideScore / 100);
                return (
                  <View style={styles.effortScoreCard}>
                    <Text style={styles.effortPieSubtitle}>Effort Score</Text>
                    <View style={styles.effortPieWrap}>
                      <Svg width={pieSize} height={pieSize}>
                        <Circle
                          cx={pieSize / 2}
                          cy={pieSize / 2}
                          r={pieRadius}
                          stroke="rgba(255,255,255,0.06)"
                          strokeWidth={pieStroke}
                          fill="none"
                        />
                        <Circle
                          cx={pieSize / 2}
                          cy={pieSize / 2}
                          r={pieRadius}
                          stroke={scoreColor}
                          strokeWidth={pieStroke}
                          fill="none"
                          strokeDasharray={`${pieCircumference}`}
                          strokeDashoffset={pieOffset}
                          strokeLinecap="butt"
                          rotation="-90"
                          origin={`${pieSize / 2}, ${pieSize / 2}`}
                        />
                      </Svg>
                      <View style={styles.effortPieCenter}>
                        <Text style={styles.effortPieValue}>
                          {rideScore}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.effortPieLabel, {color: scoreColor}]}>
                      {rideScoreLabel}
                    </Text>
                  </View>
                );
              })()}
              {highlights.map((h, i) => (
                <View key={i} style={styles.highlightCard}>
                  <Text style={styles.highlightTitle}>{h.title}</Text>
                  <Text style={styles.highlightText} numberOfLines={7}>
                    {h.text}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}

          {aiAnalysis && !loading && (
            <TouchableOpacity
              style={styles.showMoreButton}
              onPress={() => setShowFullAnalysis(true)}>
              <Text style={styles.showMoreText}>Full analysis →</Text>
            </TouchableOpacity>
          )}

          {!loading && !aiAnalysis && (
            <View style={styles.placeholderBox}>
              <Text style={styles.placeholderText}>
                No AI analysis available
              </Text>
            </View>
          )}
        </View>

          {/* Suggested Goals */}
          {suggestedGoals.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Suggested Goals</Text>
            <Text style={styles.subsectionTitle}>Based on AI recommendations</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestedGoalsContainer}>
              {suggestedGoals.map(goal => (
                <View key={goal.id} style={[styles.suggestedGoalCard, {backgroundColor: goal.color}]}>
                  <View style={styles.suggestedGoalHeader}>
                    <View style={styles.suggestedGoalBadge}>
                      <Text style={styles.suggestedGoalBadgeText}>AI Suggestion</Text>
                    </View>
                  </View>
                  <Text style={styles.suggestedGoalTitle}>{goal.title}</Text>
                  <Text style={styles.suggestedGoalDescription}>{goal.description}</Text>
                  <TouchableOpacity
                    style={styles.createGoalButton}
                    onPress={() => {
                      navigation.navigate('Main', {
                        screen: 'GoalsTab',
                        params: {screen: 'GoalAssistant', params: {initialPrompt: goal.prompt}},
                      });
                    }}>
                    <Text style={styles.createGoalButtonText}>Create Goal →</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* HR Zone Distribution - Bar Charts */}
        {hrZoneDistribution.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>HR Zones</Text>
            <View style={styles.hrZoneBarList}>
              {hrZoneDistribution.map(z => (
                <View key={z.zone} style={styles.hrZoneBarRow}>
                  <Text style={styles.hrZoneBarLabel}>
                    {z.zone} {z.rangeMin}-{z.rangeMax}
                  </Text>
                  <View style={styles.hrZoneBarTrack}>
                    <View
                      style={[
                        styles.hrZoneBarFill,
                        {width: `${Math.max(z.percent, 2)}%`, backgroundColor: z.color},
                      ]}
                    />
                  </View>
                  <Text style={styles.hrZoneBarPercent}>{z.percent}%</Text>
                </View>
              ))}
            </View>
          </View>
        )}

       


        {/* Impact on Goals */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Impact on Goals</Text>
          {metaGoals.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.scrollViewContainer}>
              {metaGoals.map((goal: any) => (
                <View key={goal.id} style={styles.goalCard}>
                  <View style={styles.goalHeader}>
                    <Text style={styles.goalTitle} numberOfLines={1}>
                      {goal.title}
                    </Text>
                  </View>
                  <View style={styles.goalStatsRow}>
                    <Text style={styles.goalProgressLarge}>
                      {goal.progress}%
                    </Text>
                    {goal.progressGain > 0 && (
                      <View style={styles.goalBadge}>
                        <Text style={styles.goalBadgeText}>
                          +{goal.progressGain}%
                        </Text>
                      </View>
                    )}
                  </View>
                  {goal.contributions && goal.contributions.length > 0 && (
                    <View style={styles.contributionsContainer}>
                      {goal.contributions.map((contrib: any, idx: number) => (
                        <View key={idx} style={styles.contributionItem}>
                          <Text style={styles.contributionLabel}>
                            {contrib.label}:
                          </Text>
                          <Text style={styles.contributionValue}>
                            {contrib.value}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.placeholderBox}>
              <Text style={styles.placeholderText}>No active goals found</Text>
            </View>
          )}
        </View>


        {/* Recommended Trainings */}
        {suggestedTrainings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recommended Trainings</Text>
            <Text style={styles.subsectionTitle}>Based on AI recommendations</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestedTrainingsContainer}>
              {suggestedTrainings.map((training, index) => (
                <View key={training.key || index} style={styles.trainingCardWrapper}>
                  <TrainingCard
                    title={training.name}
                    description={training.description}
                    intensity={training.intensity}
                    duration={training.duration}
                    trainingType={training.key}
                    onPress={() => {
                      setSelectedTraining({
                        name: training.name,
                        recommendation: training.description,
                        details: {
                          intensity: training.intensity,
                          duration: training.duration,
                          cadence: training.cadence,
                          hr_zones: training.hr_zones,
                          structure: training.structure ? Object.values(training.structure) : [],
                          benefits: training.benefits || [],
                          technical_aspects: training.technical_aspects || [],
                          tips: training.tips || [],
                          common_mistakes: training.common_mistakes || [],
                        },
                      });
                      setTrainingModalVisible(true);
                    }}
                    size="normal"
                    variant="priority"
                    showBadge={false}
                    badgeText="Recommended"
                    backgroundImage={
                      index % 4 === 0
                        ? require('../assets/img/blob1.png')
                        : index % 4 === 1
                        ? require('../assets/img/blob2.png')
                        : index % 4 === 2
                        ? require('../assets/img/blob3.png')
                        : require('../assets/img/mostrecomended.webp')
                    }
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Impact on Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Impact on Stats</Text>
          {skillsChanges.length > 0 ? (
            <View>
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
          ) : (
            <View style={styles.placeholderBox}>
              <Text style={styles.placeholderText}>
                No significant changes detected
              </Text>
            </View>
          )}
        </View>

        {/* Similar Ride Comparison */}
        {similarActivity && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Similar Ride</Text>
            <View style={styles.comparisonBox}>
              <Text style={styles.comparisonTitle}>
                vs {similarActivity.name}
              </Text>
              <Text style={styles.comparisonDate}>
                {new Date(similarActivity.start_date).toLocaleDateString('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'})}
              </Text>
              <View style={styles.comparisonGrid}>
                <View style={styles.comparisonRow}>
                  <Text style={styles.comparisonLabel}>Distance</Text>
                  <View style={styles.comparisonValues}>
                    <Text style={styles.comparisonOld}>{(similarActivity.distance / 1000).toFixed(1)} km</Text>
                    <Text style={styles.comparisonArrow}>→</Text>
                    <Text style={styles.comparisonNew}>{(activity.distance / 1000).toFixed(1)} km</Text>
                  </View>
                </View>
                <View style={styles.comparisonRow}>
                  <Text style={styles.comparisonLabel}>Elevation</Text>
                  <View style={styles.comparisonValues}>
                    <Text style={styles.comparisonOld}>{Math.round(similarActivity.total_elevation_gain)} m</Text>
                    <Text style={styles.comparisonArrow}>→</Text>
                    <Text style={styles.comparisonNew}>{Math.round(activity.total_elevation_gain)} m</Text>
                  </View>
                </View>
                <View style={styles.comparisonRow}>
                  <Text style={styles.comparisonLabel}>Time</Text>
                  <View style={styles.comparisonValues}>
                    <Text style={styles.comparisonOld}>{Math.floor(similarActivity.moving_time / 60)} min</Text>
                    <Text style={styles.comparisonArrow}>→</Text>
                    <Text style={styles.comparisonNew}>{Math.floor(activity.moving_time / 60)} min</Text>
                  </View>
                </View>
                {activity.average_speed && similarActivity.average_speed && (
                  <View style={styles.comparisonRow}>
                    <Text style={styles.comparisonLabel}>Avg Speed</Text>
                    <View style={styles.comparisonValues}>
                      <Text style={styles.comparisonOld}>{(similarActivity.average_speed * 3.6).toFixed(1)} km/h</Text>
                      <Text style={styles.comparisonArrow}>→</Text>
                      <Text style={[styles.comparisonNew, activity.average_speed > similarActivity.average_speed && styles.comparisonBetter]}>
                        {(activity.average_speed * 3.6).toFixed(1)} km/h
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
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
        )}

      


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

      {/* Training Details Modal */}
      <TrainingDetailsModal
        visible={trainingModalVisible}
        training={selectedTraining}
        onClose={() => {
          setTrainingModalVisible(false);
          setSelectedTraining(null);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111216',
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
    color: 'rgba(255, 255, 255, 0.9)',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
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
  rideScoreSection: {
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 16,
  },
  rideScoreBlock: {
    marginBottom: 32,
  },
  rideScoreHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  rideScoreDot: {
    width: 12,
    height: 12,
    borderRadius: 20,
  },
  rideScoreHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rideScoreNumber: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  rideScoreOf: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.2)',
  },
  rideQualityHeaderAdvice: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.3)',
    marginTop: 6,
  },
  rideTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 4,
  },
  rideDate: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.3)',
  },
  effortScoreCard: {
    width: 140,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: 14,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  effortPieWrap: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  effortPieCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  effortPieValue: {
    fontSize: 28,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  effortPieLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  effortPieSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 24,
    textTransform: 'uppercase',
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 8,
    marginTop: 8,
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
  hrZoneBarList: {
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 16,
    gap: 10,
  },
  hrZoneBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hrZoneBarLabel: {
    width: 70,
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.45)',
  },
  hrZoneBarTrack: {
    flex: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.025)',
    borderRadius: 0,
    overflow: 'hidden',
  },
  hrZoneBarFill: {
    height: '100%',
    borderRadius: 0,
  },
  hrZoneBarPercent: {
    width: 36,
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'right',
  },
  highlightsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
    marginTop: 16,
  },
  highlightCard: {
    width: 180,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: 14,
    gap: 6,
  },
  highlightTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  highlightText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  showMoreButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
    marginTop: 8,
  },
  showMoreText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 14,
    fontWeight: '500',
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
    color: 'rgba(255, 255, 255, 0.9)',
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
    color: 'rgba(255, 255, 255, 0.3)',
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
    color: 'rgba(255, 255, 255, 0.9)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 20,
    margin: 16,
  },
  comparisonTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
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
    color: 'rgba(255, 255, 255, 0.9)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 16,
    marginBottom: 12,
    marginTop: 16,
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
    color: 'rgba(255, 255, 255, 0.9)',
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
    color: 'rgba(255, 255, 255, 0.9)',
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
    paddingHorizontal: 0,
    marginBottom: 16,
    marginTop: 4,
  },
  miniChartCard: {
    width: 212,
    height: 180,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
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
    color: 'rgba(255, 255, 255, 0.9)',
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
  suggestedGoalsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 0,
  },
  suggestedGoalCard: {
    width: 212,
    height: 260,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: 16,
    marginRight: 8,
    marginTop: 12,
  },
  suggestedGoalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  suggestedGoalBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  suggestedGoalBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  suggestedGoalTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
    color: '#fff',
    marginBottom: 8,
  },
  suggestedGoalDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 20,
    marginBottom: 20,
  },
  createGoalButton: {
    paddingVertical: 12,
    paddingBottom: 4,
    paddingHorizontal: 0,
    borderRadius: 10,
    alignItems: 'flex-start',
  },
  createGoalButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  suggestedTrainingsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 16,
  },
  trainingCardWrapper: {
    marginRight: 8,
  },
});

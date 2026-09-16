// Анализ FTP Workload (High-Intensity Intervals)
import {getActivityStreams, StreamData} from './streamsCache';
import {Activity} from '../types/activity';
import {logger} from '../lib/logger';

export interface FTPSettings {
  hr_threshold?: number; // Пороговый пульс (default: 160 bpm)
  duration_threshold?: number; // Минимальная длительность интервала (default: 120 сек)
}

export interface FTPResult {
  totalTimeMin: number; // Общее время в высокоинтенсивной зоне (минуты)
  totalIntervals: number; // Количество интервалов
  highIntensitySessions: number; // Количество тренировок с интервалами
  activitiesAnalyzed: number; // Всего активностей проанализировано
  activitiesWithStreams: number; // Активностей с точными stream data
  activitiesEstimated: number; // Активностей с упрощенной оценкой
}

/**
 * Анализ времени в высокоинтенсивной зоне по stream data
 * Точный расчет: анализирует каждую секунду пульса
 */
const analyzeStreamsData = (
  streams: StreamData,
  settings: FTPSettings,
): {minutes: number; intervals: number} => {
  const hrThreshold = settings.hr_threshold || 160;
  const durationThreshold = settings.duration_threshold || 120;

  const hr = streams.heartrate?.data || [];

  let intervals = 0;
  let totalTimeSec = 0;
  let inInterval = false;
  let startIdx = 0;

  for (let i = 0; i < hr.length; i++) {
    const currentHR = hr[i] || 0;

    if (currentHR >= hrThreshold) {
      if (!inInterval) {
        inInterval = true;
        startIdx = i;
      }
    } else {
      if (inInterval && i - startIdx >= durationThreshold) {
        intervals++;
        totalTimeSec += i - startIdx;
      }
      inInterval = false;
    }
  }

  // Проверяем последний интервал (если достиг конца активности)
  if (inInterval && hr.length - startIdx >= durationThreshold) {
    intervals++;
    totalTimeSec += hr.length - startIdx;
  }

  const minutes = Math.round(totalTimeSec / 60);
  return {minutes, intervals};
};

/**
 * Анализ High-Intensity Time для массива активностей
 * Использует только точные stream data, пропускает активности без streams
 * @param skipAPILoad - если true, загружает streams только из кеша (не делает API запросы)
 */
export const analyzeHighIntensityTime = async (
  activities: Activity[],
  periodDays: number = 28,
  settings: FTPSettings = {},
  skipAPILoad: boolean = true, // По умолчанию только из кеша
): Promise<FTPResult> => {
  const hrThreshold = settings.hr_threshold || 160;
  const durationThreshold = settings.duration_threshold || 120;

  logger.debug(
    `🔥 FTP Analysis: analyzing ${activities.length} activities (period: ${periodDays} days)`,
  );
  logger.debug(`   HR threshold: ${hrThreshold} bpm`);
  logger.debug(`   Duration threshold: ${durationThreshold} sec`);
  logger.debug(`   Skip API load: ${skipAPILoad}`);

  // Фильтруем по периоду
  const now = new Date();
  const periodAgo = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const filtered = activities.filter(
    a => new Date(a.start_date) > periodAgo,
  );

  logger.debug(`   Filtered: ${filtered.length} activities in last ${periodDays} days`);

  let totalTimeMin = 0;
  let totalIntervals = 0;
  let highIntensitySessions = 0;
  let activitiesWithStreams = 0;
  let activitiesEstimated = 0;

  for (const activity of filtered) {
    // Пропускаем активности без пульса
    if (!activity.average_heartrate) {
      continue;
    }

    try {
      // Пытаемся загрузить streams (только из кеша, если skipAPILoad=true)
      const streams = await getActivityStreams(activity.id, skipAPILoad);

      if (streams?.heartrate?.data && streams.heartrate.data.length > 0) {
        const result = analyzeStreamsData(streams, {
          hr_threshold: hrThreshold,
          duration_threshold: durationThreshold,
        });

        totalTimeMin += result.minutes;
        totalIntervals += result.intervals;
        activitiesWithStreams++;

        if (result.intervals > 0) {
          highIntensitySessions++;
        }

        logger.debug(
          `   ✅ Activity ${activity.id}: ${result.minutes} min, ${result.intervals} intervals (streams)`,
        );
      } else {
        activitiesEstimated++;
        logger.debug(
          `   ⏭️ Activity ${activity.id}: skipped (no streams available)`,
        );
      }
    } catch (error) {
      logger.error(`   ❌ Error analyzing activity ${activity.id}:`, error);
      // Продолжаем анализ других активностей
    }
  }

  logger.debug(`📊 FTP Analysis results:`);
  logger.debug(`   Total time: ${totalTimeMin} minutes`);
  logger.debug(`   Total intervals: ${totalIntervals}`);
  logger.debug(`   High-intensity sessions: ${highIntensitySessions}`);
  logger.debug(`   Analyzed: ${filtered.length} activities`);
  logger.debug(`   With streams: ${activitiesWithStreams}`);
  logger.debug(`   Estimated: ${activitiesEstimated}`);

  return {
    totalTimeMin,
    totalIntervals,
    highIntensitySessions,
    activitiesAnalyzed: filtered.length,
    activitiesWithStreams,
    activitiesEstimated,
  };
};

/**
 * Получить уровень FTP Workload на основе минут в высокоинтенсивной зоне
 */
export const getFTPLevel = (minutes: number): {
  level: string;
  color: string;
  description: string;
} => {
  if (minutes < 30)
    return {level: 'Low', color: '#10b981', description: 'Increase intensity'};
  if (minutes < 60)
    return {level: 'Normal', color: '#3FE3CA', description: 'Good baseline'};
  if (minutes < 120)
    return {level: 'Keep going!', color: '#3F50E3', description: 'Strong fitness'};
  if (minutes < 180)
    return {
      level: 'Overwhelmed',
      color: '#3227D3',
      description: 'Very high fitness',
    };
  return {level: 'Outstanding', color: '#8b5cf6', description: 'Elite level'};
};

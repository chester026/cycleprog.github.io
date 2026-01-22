import AsyncStorage from '@react-native-async-storage/async-storage';
import {Activity} from '../types/activity';
import {apiFetch} from './api';

const GOALS_CACHE_PREFIX = 'goals_progress_v2_';
const CACHE_TTL_GOALS = 5 * 60 * 1000; // 5 минут

// Simple hash function
const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

// Create activities hash
export const createActivitiesHash = (activities: Activity[]): string => {
  const signature = activities.slice(0, 5).map(a => `${a.id}-${a.distance}`).join('_');
  const count = activities.length;
  const totalDistance = activities.reduce((sum, a) => sum + (a.distance || 0), 0);
  return simpleHash(`${count}_${totalDistance}_${signature}`);
};

// Goal interface
export interface Goal {
  id: number;
  meta_goal_id?: number;
  goal_type: string;
  target_value: number;
  current_value: number;
  period: '4w' | '3m' | 'year';
  metric_name?: string;
  description?: string;
  hr_threshold?: number;
  duration_threshold?: number;
}

// Meta Goal interface
export interface MetaGoal {
  id: number;
  title: string;
  description: string;
  status: 'active' | 'completed';
  target_date?: string;
  created_at: string;
  trainingTypes?: Array<{
    type: string;
    title: string;
    description: string;
    priority: number;
  }>;
}

// Calculate goal progress
export const calculateGoalProgress = (
  goal: Goal,
  activities: Activity[],
  userProfile: any = null
): number | {minutes: number; intervals: number} => {
  try {
    if (!activities || activities.length === 0) return 0;

    // Filter activities by period
    let filteredActivities = activities;
    const now = new Date();

    if (goal.period === '4w') {
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
    } else if (goal.period === '3m') {
      const threeMonthsAgo = new Date(now.getTime() - 92 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > threeMonthsAgo);
    } else if (goal.period === 'year') {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > yearAgo);
    }

    // Calculate progress based on goal type
    switch (goal.goal_type) {
      case 'distance':
        return filteredActivities.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000; // km

      case 'elevation':
        return filteredActivities.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0);

      case 'time':
        const totalMovingTime = filteredActivities.reduce((sum, a) => sum + (a.moving_time || 0), 0);
        return totalMovingTime / 3600; // hours

      case 'speed_flat':
        const flatActivities = filteredActivities.filter(a => {
          const distance = a.distance || 0;
          const elevation = a.total_elevation_gain || 0;
          return distance > 3000 && elevation < distance * 0.02 && elevation < 500;
        });
        if (flatActivities.length === 0) return 0;
        const flatSpeeds = flatActivities.map(a => (a.average_speed || 0) * 3.6);
        return flatSpeeds.reduce((sum, speed) => sum + speed, 0) / flatSpeeds.length;

      case 'speed_hills':
        const hillActivities = filteredActivities.filter(a => {
          const distance = a.distance || 0;
          const elevation = a.total_elevation_gain || 0;
          const speed = (a.average_speed || 0) * 3.6;
          return distance > 3000 && (elevation >= distance * 0.015 || elevation >= 500) && speed < 25;
        });
        if (hillActivities.length === 0) return 0;
        const hillSpeeds = hillActivities.map(a => (a.average_speed || 0) * 3.6);
        return hillSpeeds.reduce((sum, speed) => sum + speed, 0) / hillSpeeds.length;

      case 'long_rides':
        return filteredActivities.filter(a =>
          (a.distance || 0) > 50000 ||
          (a.moving_time || 0) > 2.5 * 3600
        ).length;

      case 'intervals':
        const intervalActivities = filteredActivities.filter(a => {
          if (a.type === 'Workout' || a.workout_type === 3) return true;

          const name = (a.name || '').toLowerCase();
          const intervalKeywords = [
            'интервал', 'interval', 'tempo', 'темпо', 'threshold', 'порог',
            'vo2max', 'vo2', 'анаэробный', 'anaerobic', 'фартлек', 'fartlek',
            'спринт', 'sprint', 'ускорение', 'acceleration', 'повтор', 'repeat',
            'серия', 'series', 'блок', 'block', 'пирамида', 'pyramid'
          ];

          if (intervalKeywords.some(keyword => name.includes(keyword))) return true;

          if (a.average_speed && a.max_speed) {
            const avgSpeed = a.average_speed * 3.6;
            const maxSpeed = a.max_speed * 3.6;
            const speedVariation = maxSpeed / avgSpeed;
            if (speedVariation > 1.4 && avgSpeed > 25) return true;
          }

          return false;
        });
        return intervalActivities.length;

      case 'pulse':
        const pulseActivities = filteredActivities.filter(a => a.average_heartrate && a.average_heartrate > 0);
        if (pulseActivities.length === 0) return 0;
        const totalPulse = pulseActivities.reduce((sum, a) => sum + (a.average_heartrate || 0), 0);
        return totalPulse / pulseActivities.length;

      case 'cadence':
        const cadenceActivities = filteredActivities.filter(a => a.average_cadence && a.average_cadence > 0);
        if (cadenceActivities.length === 0) return 0;
        const cadenceValues = cadenceActivities.map(a => a.average_cadence || 0);
        return Math.round(cadenceValues.reduce((sum, cadence) => sum + cadence, 0) / cadenceValues.length);

      default:
        return parseFloat(goal.current_value?.toString() || '0') || 0;
    }
  } catch (error) {
    console.error('Error in calculateGoalProgress:', error);
    return 0;
  }
};

// Get cached goals
export const getCachedGoals = async (activities: Activity[], goals: Goal[]): Promise<Goal[] | null> => {
  try {
    const activitiesHash = createActivitiesHash(activities);
    const cacheKey = GOALS_CACHE_PREFIX + activitiesHash;
    const cachedProgress = await AsyncStorage.getItem(cacheKey);

    if (cachedProgress) {
      const cachedData = JSON.parse(cachedProgress);
      if (Date.now() - cachedData.timestamp < CACHE_TTL_GOALS) {
        // Check if cache contains all current goals
        const currentGoalIds = goals.map(g => g.id).sort();
        const cachedGoalIds = cachedData.goals.map((g: Goal) => g.id).sort();

        if (JSON.stringify(currentGoalIds) === JSON.stringify(cachedGoalIds)) {
          return cachedData.goals;
        } else {
          await AsyncStorage.removeItem(cacheKey);
          return null;
        }
      } else {
        await AsyncStorage.removeItem(cacheKey);
      }
    }

    return null;
  } catch (error) {
    console.warn('Error getting cached goals:', error);
    return null;
  }
};

// Cache goals
export const cacheGoals = async (activities: Activity[], goals: Goal[]): Promise<void> => {
  try {
    const activitiesHash = createActivitiesHash(activities);
    const cacheKey = GOALS_CACHE_PREFIX + activitiesHash;

    const cacheData = {
      goals: goals,
      timestamp: Date.now()
    };

    await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData));
  } catch (error) {
    console.warn('Error caching goals:', error);
  }
};

// Update goals with cache
export const updateGoalsWithCache = async (
  activities: Activity[],
  goals: Goal[],
  userProfile: any = null
): Promise<Goal[]> => {
  try {
    // Check cache
    const cachedGoals = await getCachedGoals(activities, goals);
    if (cachedGoals) {
      console.log('📦 Goals from cache');
      return cachedGoals;
    }

    // Calculate progress
    const updatedGoals = goals.map(goal => {
      try {
        const currentValue = calculateGoalProgress(goal, activities, userProfile);
        return { ...goal, current_value: currentValue as number };
      } catch (error) {
        console.error('Error calculating progress for goal:', goal.id, error);
        return { ...goal, current_value: 0 };
      }
    });

    // Check if there are changes
    const hasChanges = updatedGoals.some((updatedGoal, index) => {
      const originalGoal = goals[index];
      return updatedGoal.current_value !== originalGoal.current_value;
    });

    if (hasChanges) {
      // Cache results
      await cacheGoals(activities, updatedGoals);
      console.log('✅ Goals updated and cached');
      return updatedGoals;
    }

    return goals;
  } catch (error) {
    console.error('Error updating goals with cache:', error);
    return goals;
  }
};


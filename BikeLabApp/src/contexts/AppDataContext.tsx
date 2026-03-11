import React, {createContext, useContext, useState, useCallback, useRef} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {apiFetch} from '../utils/api';
import {Activity} from '../types/activity';

interface UserProfile {
  weight?: number;
  age?: number;
  gender?: 'male' | 'female';
  experience_level?: 'beginner' | 'intermediate' | 'advanced';
  max_hr?: number;
  resting_hr?: number;
  lactate_threshold?: number;
  [key: string]: any;
}

interface AppDataContextType {
  activities: Activity[];
  loadActivities: (force?: boolean) => Promise<Activity[]>;
  userProfile: UserProfile | null;
  loadUserProfile: (force?: boolean) => Promise<UserProfile | null>;
  clearAll: () => void;
}

const AppDataContext = createContext<AppDataContextType>({
  activities: [],
  loadActivities: async () => [],
  userProfile: null,
  loadUserProfile: async () => null,
  clearAll: () => {},
});

export const useAppData = () => useContext(AppDataContext);

const ACTIVITIES_CACHE_KEY = 'activities_cache';
const ACTIVITIES_TTL = 60 * 60 * 1000; // 1 hour — activities change only after rides
const PROFILE_TTL = 30 * 60 * 1000; // 30 min

export const AppDataProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const activitiesLoadedAt = useRef<number>(0);
  const profileLoadedAt = useRef<number>(0);
  const activitiesPromise = useRef<Promise<Activity[]> | null>(null);
  const profilePromise = useRef<Promise<UserProfile | null> | null>(null);

  const loadActivities = useCallback(async (force = false): Promise<Activity[]> => {
    // Return in-memory if fresh
    if (!force && activities.length > 0 && Date.now() - activitiesLoadedAt.current < ACTIVITIES_TTL) {
      return activities;
    }

    // Deduplicate concurrent calls
    if (activitiesPromise.current) return activitiesPromise.current;

    const promise = (async () => {
      try {
        // Check AsyncStorage cache
        if (!force) {
          const cached = await AsyncStorage.getItem(ACTIVITIES_CACHE_KEY);
          if (cached) {
            const {data, timestamp} = JSON.parse(cached);
            if (Date.now() - timestamp < ACTIVITIES_TTL) {
              setActivities(data);
              activitiesLoadedAt.current = timestamp;
              return data;
            }
          }
        }

        const data = await apiFetch('/api/activities');
        const ts = Date.now();
        setActivities(data);
        activitiesLoadedAt.current = ts;

        await AsyncStorage.setItem(ACTIVITIES_CACHE_KEY, JSON.stringify({data, timestamp: ts}));
        return data;
      } catch (err) {
        console.error('Error loading activities:', err);
        return activities;
      } finally {
        activitiesPromise.current = null;
      }
    })();

    activitiesPromise.current = promise;
    return promise;
  }, [activities]);

  const loadUserProfile = useCallback(async (force = false): Promise<UserProfile | null> => {
    if (!force && userProfile && Date.now() - profileLoadedAt.current < PROFILE_TTL) {
      return userProfile;
    }

    if (profilePromise.current) return profilePromise.current;

    const promise = (async () => {
      try {
        const data = await apiFetch('/api/user-profile');
        setUserProfile(data);
        profileLoadedAt.current = Date.now();
        return data;
      } catch (err) {
        console.error('Error loading user profile:', err);
        return userProfile;
      } finally {
        profilePromise.current = null;
      }
    })();

    profilePromise.current = promise;
    return promise;
  }, [userProfile]);

  const clearAll = useCallback(() => {
    setActivities([]);
    setUserProfile(null);
    activitiesLoadedAt.current = 0;
    profileLoadedAt.current = 0;
    AsyncStorage.removeItem(ACTIVITIES_CACHE_KEY).catch(() => {});
  }, []);

  return (
    <AppDataContext.Provider value={{activities, loadActivities, userProfile, loadUserProfile, clearAll}}>
      {children}
    </AppDataContext.Provider>
  );
};

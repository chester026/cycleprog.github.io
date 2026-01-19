import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {apiFetch} from '../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface WeatherData {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_sum: number[];
  wind_speed_10m_max: number[];
  weather_code: number[];
  uv_index_max?: number[];
}

const CACHE_KEY = 'weather_data_cache';
const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours

export const WeatherBlock: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'coast' | 'mountain'>('coast');
  const [coastWeather, setCoastWeather] = useState<WeatherData | null>(null);
  const [mountainWeather, setMountainWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWeatherData();
  }, []);

  const loadWeatherData = async () => {
    try {
      setLoading(true);

      // Check cache first
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const {data, timestamp} = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION) {
          setCoastWeather(data.coast);
          setMountainWeather(data.mountain);
          setLoading(false);
          return;
        }
      }

      // Load weather for coast (Nicosia)
      const coastData = await apiFetch(
        '/api/weather/forecast?latitude=35.1264&longitude=33.4299',
      );

      // Load weather for mountains (Troodos)
      const mountainData = await apiFetch(
        '/api/weather/forecast?latitude=34.9333&longitude=32.8667',
      );

      const weatherData = {
        coast: coastData.daily,
        mountain: mountainData.daily,
      };

      // Save to cache
      await AsyncStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          data: weatherData,
          timestamp: Date.now(),
        }),
      );

      setCoastWeather(coastData.daily);
      setMountainWeather(mountainData.daily);
    } catch (err: any) {
      console.error('Error loading weather data:', err);
      setError(err.message || 'Failed to load weather');
    } finally {
      setLoading(false);
    }
  };

  const weatherEmoji = (code: number): string => {
    if (code === 0) return '☀️';
    if ([1, 2, 3].includes(code)) return '⛅';
    if ([45, 48].includes(code)) return '🌫️';
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code))
      return '🌧️';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return '🌨️';
    if ([95, 96, 99].includes(code)) return '⛈️';
    return '❓';
  };

  const renderWeatherCards = (weatherData: WeatherData | null) => {
    if (!weatherData || !weatherData.time) return null;

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardsContainer}>
        {weatherData.time.map((date, i) => {
          const tmax = weatherData.temperature_2m_max[i];
          const tmin = weatherData.temperature_2m_min[i];
          const prec = weatherData.precipitation_sum[i];
          const wind = weatherData.wind_speed_10m_max[i];
          const code = weatherData.weather_code[i];
          const uv = weatherData.uv_index_max
            ? weatherData.uv_index_max[i]
            : null;

          const dateObj = new Date(date);
          const weekday = dateObj
            .toLocaleDateString('ru-RU', {weekday: 'short'})
            .charAt(0)
            .toUpperCase() +
            dateObj.toLocaleDateString('ru-RU', {weekday: 'short'}).slice(1);
          const day = dateObj.getDate();
          const month = dateObj
            .toLocaleDateString('ru-RU', {month: 'short'})
            .charAt(0)
            .toUpperCase() +
            dateObj.toLocaleDateString('ru-RU', {month: 'short'}).slice(1);

          return (
            <View key={date} style={styles.weatherCard}>
              <Text style={styles.cardDate}>
                {weekday} {day} {month}
              </Text>
              <Text style={styles.cardEmoji}>{weatherEmoji(code)}</Text>
              <View style={styles.cardTemp}>
                <Text style={styles.tempMax}>{Math.round(tmax)}°</Text>
                <Text style={styles.tempMin}>/{Math.round(tmin)}°</Text>
              </View>
              <Text style={styles.cardMeta}>
                Осадки: <Text style={styles.cardMetaBold}>{prec} мм</Text>
              </Text>
              <Text style={styles.cardMeta}>
                Ветер: <Text style={styles.cardMetaBold}>{wind} м/с</Text>
              </Text>
              <Text style={styles.cardMeta}>
                UV: <Text style={styles.cardMetaBold}>{uv !== null ? uv : '—'}</Text>
              </Text>
            </View>
          );
        })}
      </ScrollView>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#274DD3" />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            Ошибка загрузки прогноза погоды: {error}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'coast' && styles.tabActive]}
          onPress={() => setActiveTab('coast')}>
          <Text
            style={[
              styles.tabText,
              activeTab === 'coast' && styles.tabTextActive,
            ]}>
            Coast
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'mountain' && styles.tabActive]}
          onPress={() => setActiveTab('mountain')}>
          <Text
            style={[
              styles.tabText,
              activeTab === 'mountain' && styles.tabTextActive,
            ]}>
            Mountains
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'coast' && renderWeatherCards(coastWeather)}
      {activeTab === 'mountain' && renderWeatherCards(mountainWeather)}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#191b20',
    overflow: 'hidden',
    paddingBottom: 72,
  },
  tabsContainer: {
    flexDirection: 'row',
 
  },
  tab: {
    paddingVertical: 4,
    
    marginLeft: 16,
    marginTop: 32,
  },
  tabActive: {
    backgroundColor: 'transparent',
  },
  tabText: {
    fontSize: 28,
    textTransform: 'uppercase',
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.2)',
  },
  tabTextActive: {
    color: '#ddd',
    fontWeight: '800',
  },
  cardsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  weatherCard: {
    width: 130,
    backgroundColor: 'rgba(153, 153, 153, 0.04)',
    padding: 12,
    alignItems: 'center',
    
    borderWidth: 1,
    borderColor: 'rgba(60, 60, 60, 0.03)',
  },
  cardDate: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 8,
  },
  cardEmoji: {
    fontSize: 52,
    textAlign: 'center',
    marginBottom: 8,
  },
  cardTemp: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 12,
  },
  tempMax: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ddd',
  },
  tempMin: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.2)',
  },
  cardMeta: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 4,
  },
  cardMetaBold: {
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    padding: 24,
  },
  errorText: {
    color: '#e53935',
    textAlign: 'center',
    fontSize: 14,
  },
});

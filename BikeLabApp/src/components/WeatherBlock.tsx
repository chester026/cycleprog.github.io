import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {getDateLocale} from '../i18n/dateLocale';
import {View, Text, ScrollView, TouchableOpacity, ActivityIndicator} from 'react-native';
import {useWeather, type WeatherDaily} from '../data/hooks/useWeather';
import {makeStyles, useTheme} from '../theme';

// Coast (Nicosia) / mountain (Troodos) forecast coordinates — unchanged
// from the old hard-coded fetch.
const COAST_COORDS = {latitude: 35.1264, longitude: 33.4299};
const MOUNTAIN_COORDS = {latitude: 34.9333, longitude: 32.8667};

export const WeatherBlock: React.FC = () => {
  const {t} = useTranslation();
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<'coast' | 'mountain'>('coast');
  // T-5.4/A-27: this used to own a `weather_data_cache` AsyncStorage entry
  // with a 2h TTL it managed by hand. useWeather() now backs that with the
  // shared TanStack Query cache (same 2h `staleTime`) — one cache, one
  // sign-out-clear path, like every other query in the app.
  const coast = useWeather(COAST_COORDS.latitude, COAST_COORDS.longitude);
  const mountain = useWeather(MOUNTAIN_COORDS.latitude, MOUNTAIN_COORDS.longitude);

  const loading = coast.isLoading || mountain.isLoading;
  const error = coast.error || mountain.error;

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

  const renderWeatherCards = (weatherData: WeatherDaily | undefined) => {
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
            .toLocaleDateString(getDateLocale(), {weekday: 'short'})
            .charAt(0)
            .toUpperCase() +
            dateObj.toLocaleDateString(getDateLocale(), {weekday: 'short'}).slice(1);
          const day = dateObj.getDate();
          const month = dateObj
            .toLocaleDateString(getDateLocale(), {month: 'short'})
            .charAt(0)
            .toUpperCase() +
            dateObj.toLocaleDateString(getDateLocale(), {month: 'short'}).slice(1);

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
                {t('weather.precipitation')} <Text style={styles.cardMetaBold}>{prec} {t('weather.mm')}</Text>
              </Text>
              <Text style={styles.cardMeta}>
                {t('weather.wind')} <Text style={styles.cardMetaBold}>{wind} {t('weather.ms')}</Text>
              </Text>
              <Text style={styles.cardMeta}>
                {t('weather.uv')} <Text style={styles.cardMetaBold}>{uv !== null ? uv : '—'}</Text>
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
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {t('weather.forecastError')} {error instanceof Error ? error.message : String(error)}
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
            {t('weather.coast')}
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
            {t('weather.mountains')}
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'coast' && renderWeatherCards(coast.data)}
      {activeTab === 'mountain' && renderWeatherCards(mountain.data)}
    </View>
  );
};

const styles = makeStyles(theme => ({
  container: {
    backgroundColor: theme.colors.ink,
    overflow: 'hidden',
    paddingBottom: 72,
  },
  tabsContainer: {
    flexDirection: 'row',
  },
  tab: {
    paddingVertical: theme.spacing[4],
    marginLeft: theme.spacing[16],
    marginTop: theme.spacing[32],
  },
  tabActive: {
    backgroundColor: 'transparent',
  },
  tabText: {
    fontSize: 28,
    textTransform: 'uppercase',
    fontWeight: '800', // not in the typography scale yet — kept literal
    color: 'rgba(255, 255, 255, 0.2)',
  },
  tabTextActive: {
    color: theme.colors.bikes.statDivider,
    fontWeight: '800', // not in the typography scale yet — kept literal
  },
  cardsContainer: {
    paddingHorizontal: theme.spacing[16],
    paddingVertical: theme.spacing[16],
    gap: theme.spacing[8],
  },
  weatherCard: {
    width: 130,
    backgroundColor: 'rgba(153, 153, 153, 0.04)',
    padding: theme.spacing[12],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(60, 60, 60, 0.03)',
  },
  cardDate: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: theme.spacing[8],
  },
  cardEmoji: {
    fontSize: 52,
    textAlign: 'center',
    marginBottom: theme.spacing[8],
  },
  cardTemp: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: theme.spacing[12],
  },
  tempMax: {
    fontSize: 32,
    fontWeight: '800', // not in the typography scale yet — kept literal
    color: theme.colors.bikes.statDivider,
  },
  tempMin: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: '500', // not in the typography scale yet — kept literal
    color: 'rgba(255, 255, 255, 0.2)',
  },
  cardMeta: {
    fontSize: theme.typography.fontSize.sm,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: theme.spacing[4],
  },
  cardMetaBold: {
    fontWeight: theme.typography.fontWeight.bold,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    padding: theme.spacing[24],
  },
  errorText: {
    color: theme.colors.weatherErrorText,
    textAlign: 'center',
    fontSize: theme.typography.fontSize.lg,
  },
}));

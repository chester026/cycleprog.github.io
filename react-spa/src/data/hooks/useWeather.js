import { useQuery } from '@tanstack/react-query';
import { call, weather } from '../api';
import { queryKeys } from '../keys';

/**
 * GET /api/weather/forecast?latitude=<lat>&longitude=<lon> — replaces
 * WeatherBlock's own `weather_data_cache` localStorage entry. `staleTime`
 * matches that cache's old 30-min TTL.
 */
export function useWeather(lat, lon) {
  return useQuery({
    queryKey: queryKeys.weather(lat, lon),
    queryFn: () => call(weather.forecast, { query: { latitude: lat, longitude: lon } }),
    staleTime: 30 * 60 * 1000,
    enabled: lat != null && lon != null,
  });
}

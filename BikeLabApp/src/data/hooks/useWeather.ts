import {useQuery} from '@tanstack/react-query';
import {api, weather} from '../api';
import {queryKeys} from '../keys';

export interface WeatherDaily {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_sum: number[];
  wind_speed_10m_max: number[];
  weather_code: number[];
  uv_index_max?: number[];
}

interface WeatherForecastResponse {
  daily: WeatherDaily;
  [key: string]: unknown;
}

/**
 * GET /api/weather/forecast?latitude=<lat>&longitude=<lon> (T-5.4/A-27;
 * replaces WeatherBlock's own `weather_data_cache` AsyncStorage entry).
 * `staleTime` matches that cache's old 2h TTL — a forecast doesn't need to
 * be much fresher than that.
 */
export function useWeather(latitude: number, longitude: number) {
  return useQuery({
    queryKey: queryKeys.weather(latitude, longitude),
    queryFn: () =>
      api.call(weather.forecast, {query: {latitude, longitude}}) as Promise<WeatherForecastResponse>,
    staleTime: 2 * 60 * 60 * 1000, // 2h
    select: data => data.daily,
  });
}

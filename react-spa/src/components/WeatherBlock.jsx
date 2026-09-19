import React, { useState } from 'react';
import './WeatherBlock.css';
import { useWeather } from '../data/hooks';

// Nicosia (coast) and Троодос (mountains) — fixed reference points, same as
// before.
const COAST = { lat: 35.1264, lon: 33.4299 };
const MOUNTAIN = { lat: 34.9333, lon: 32.8667 };

export default function WeatherBlock() {
  const [activeTab, setActiveTab] = useState('coast');

  // T-6.2 (audit W-22): the page's own `weather_data_cache` localStorage
  // entry (2h TTL) is gone — both forecasts now go through the shared
  // TanStack Query cache (see src/data/hooks/useWeather.js), which already
  // carries the same 30-min staleTime.
  const coastQuery = useWeather(COAST.lat, COAST.lon);
  const mountainQuery = useWeather(MOUNTAIN.lat, MOUNTAIN.lon);

  const loading = coastQuery.isLoading || mountainQuery.isLoading;
  const error = coastQuery.error || mountainQuery.error;
  const coastWeather = coastQuery.data?.daily;
  const mountainWeather = mountainQuery.data?.daily;

  const weatherEmoji = (code) => {
    if (code === 0) return '☀️';
    if ([1,2,3].includes(code)) return '⛅';
    if ([45,48].includes(code)) return '🌫️';
    if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return '🌧️';
    if ([71,73,75,77,85,86].includes(code)) return '🌨️';
    if ([95,96,99].includes(code)) return '⛈️';
    return '❓';
  };

  const renderWeatherCards = (weatherData) => {
    if (!weatherData || !weatherData.time) return null;

    return (
      <div className="weather-week-cards">
        {weatherData.time.map((date, i) => {
          const tmax = weatherData.temperature_2m_max[i];
          const tmin = weatherData.temperature_2m_min[i];
          const prec = weatherData.precipitation_sum[i];
          const wind = weatherData.wind_speed_10m_max[i];
          const code = weatherData.weather_code[i];
          const uv = weatherData.uv_index_max ? weatherData.uv_index_max[i] : null;
          const dateStr = new Date(date).toLocaleDateString('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
          });
          const dateStrCap = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

          return (
            <div key={date} className="weather-card total-card">
              <div className="weather-card-date">{dateStrCap}</div>
              <div className="weather-card-emoji">{weatherEmoji(code)}</div>
              <div className="weather-card-temp metric-value">
                <span className="big-number">{Math.round(tmax)}°</span>
                <span className="unit">/{Math.round(tmin)}°</span>
              </div>
              <div className="weather-card-meta">Precipitation: <b>{prec} mm</b></div>
              <div className="weather-card-meta">Wind: <b>{wind} m/s</b></div>
              <div className="weather-card-meta">UV: <b>{uv !== null ? uv : '—'}</b></div>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="weather-tabs-wrap">
        <div className="weather-week-block">
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2em' }}>
            <div style={{ width: 40, height: 40, border: '4px solid #f3f3f3', borderTop: '4px solid #274DD3', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="weather-tabs-wrap">
        <div className="weather-week-block">
          <div style={{ color: '#e53935', textAlign: 'center', padding: '2em' }}>
            Failed to load weather forecast: {error.message}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="weather-tabs-wrap">
      <div className="weather-tabs">
        <button
          className={`weather-tab ${activeTab === 'coast' ? 'weather-tab-active' : ''}`}
          onClick={() => setActiveTab('coast')}
        >
          Coast
        </button>
        <button
          className={`weather-tab ${activeTab === 'mountain' ? 'weather-tab-active' : ''}`}
          onClick={() => setActiveTab('mountain')}
        >
          Mountains
        </button>
      </div>

      <div className="weather-week-block" style={{ display: activeTab === 'coast' ? 'block' : 'none' }}>
        {renderWeatherCards(coastWeather)}
      </div>

      <div className="weather-week-block" style={{ display: activeTab === 'mountain' ? 'block' : 'none' }}>
        {renderWeatherCards(mountainWeather)}
      </div>
    </div>
  );
}

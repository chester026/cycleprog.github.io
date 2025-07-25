import React, { useState, useEffect } from 'react';
import './WeatherBlock.css';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';

export default function WeatherBlock() {
  const [activeTab, setActiveTab] = useState('coast');
  const [coastWeather, setCoastWeather] = useState(null);
  const [mountainWeather, setMountainWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);



  useEffect(() => {

    loadWeatherData();
  }, []);

  const loadWeatherData = async () => {

    try {
      setLoading(true);
      
      // Сначала проверяем кэш
      const cachedWeather = cacheUtils.get(CACHE_KEYS.WEATHER_DATA);
      if (cachedWeather) {
        setCoastWeather(cachedWeather.coast);
        setMountainWeather(cachedWeather.mountain);
        setLoading(false);
        return;
      }
      
      // Загружаем данные для побережья (Nicosia)
      const coastRes = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=35.1264&longitude=33.4299&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code,uv_index_max&temperature_unit=celsius&wind_speed_unit=ms&precipitation_unit=mm&timezone=auto'
      );
      
      // Загружаем данные для гор (Тродос)
      const mountainRes = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=34.9333&longitude=32.8667&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code,uv_index_max&temperature_unit=celsius&wind_speed_unit=ms&precipitation_unit=mm&timezone=auto'
      );

      if (coastRes.ok && mountainRes.ok) {
        const coastData = await coastRes.json();
        const mountainData = await mountainRes.json();
        
        const weatherData = {
          coast: coastData.daily,
          mountain: mountainData.daily
        };
        
        // Сохраняем в кэш на 2 часа (погода обновляется редко)
        cacheUtils.set(CACHE_KEYS.WEATHER_DATA, weatherData, 2 * 60 * 60 * 1000);
        
        setCoastWeather(coastData.daily);
        setMountainWeather(mountainData.daily);
      } else {
        throw new Error('Failed to load weather data');
      }
    } catch (err) {
      console.error('Error loading weather data:', err);
      setError(err.message);
    } finally {

      setLoading(false);
    }
  };

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
          const dateStr = new Date(date).toLocaleDateString('ru-RU', {
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
              <div className="weather-card-meta">Осадки: <b>{prec} мм</b></div>
              <div className="weather-card-meta">Ветер: <b>{wind} м/с</b></div>
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
            Ошибка загрузки прогноза погоды: {error}
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
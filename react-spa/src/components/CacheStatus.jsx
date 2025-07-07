import React, { useState, useEffect } from 'react';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import './CacheStatus.css';

export default function CacheStatus() {
  const [cacheInfo, setCacheInfo] = useState({});
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    updateCacheInfo();
    // Обновляем информацию каждые 30 секунд
    const interval = setInterval(updateCacheInfo, 30000);
    return () => clearInterval(interval);
  }, []);

  const updateCacheInfo = () => {
    const info = {};
    Object.values(CACHE_KEYS).forEach(key => {
      const lastUpdate = cacheUtils.getLastUpdate(key);
      const hasData = cacheUtils.has(key);
      info[key] = {
        hasData,
        lastUpdate: lastUpdate ? new Date(lastUpdate) : null,
        isExpired: lastUpdate ? (Date.now() - lastUpdate > 30 * 60 * 1000) : true
      };
    });
    setCacheInfo(info);
  };

  const getStatusText = () => {
    const activities = cacheInfo[CACHE_KEYS.ACTIVITIES];
    if (!activities || !activities.hasData) {
      return 'Нет кэшированных данных';
    }
    
    if (activities.isExpired) {
      return 'Кэш устарел';
    }
    
    const minutesAgo = Math.floor((Date.now() - activities.lastUpdate.getTime()) / 60000);
    return `Кэш обновлен ${minutesAgo} мин назад`;
  };

  const getStatusColor = () => {
    const activities = cacheInfo[CACHE_KEYS.ACTIVITIES];
    if (!activities || !activities.hasData) {
      return '#ff6b6b'; // Красный - нет данных
    }
    
    if (activities.isExpired) {
      return '#ffa726'; // Оранжевый - устарел
    }
    
    return '#4caf50'; // Зеленый - актуален
  };

  // Показываем индикатор только если есть кэшированные данные
  useEffect(() => {
    const activities = cacheInfo[CACHE_KEYS.ACTIVITIES];
    setIsVisible(activities && activities.hasData);
  }, [cacheInfo]);

  if (!isVisible) return null;

  return (
    <div className="cache-status" style={{ backgroundColor: getStatusColor() }}>
      <span className="cache-status-text">{getStatusText()}</span>
    </div>
  );
} 
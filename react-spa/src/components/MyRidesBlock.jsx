import React, { useState, useEffect } from 'react';
import './MyRidesBlock.css';
import { apiFetch } from '../utils/api';
// import { cacheUtils, CACHE_KEYS } from '../utils/cache';

export default function MyRidesBlock() {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadRides();
  }, []);

  const loadRides = async () => {
    try {
      setLoading(true);
      // Убираем кэш: всегда делаем свежий запрос
      const response = await apiFetch('/api/rides');
      if (response.status === 429) {
        console.warn('Rate limit exceeded');
        setError('Слишком много запросов. Попробуйте позже.');
        setLoading(false);
        return;
      }
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setRides(data);
    } catch (err) {
      console.error('Error loading rides:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteRide = async (id) => {
    if (!confirm('Удалить этот заезд?')) return;
    try {
      const response = await apiFetch(`/rides/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setRides(rides.filter(ride => ride.id !== id));
        // cacheUtils.clear('rides'); // больше не нужно
      }
    } catch (err) {
      console.error('Error deleting ride:', err);
    }
  };

  if (loading) {
    return (
      <div className="my-rides-loading">
        <div className="loading-spinner"></div>
        <span>Загрузка поездок...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-rides-error">
        <span>Ошибка загрузки: {error}</span>
      </div>
    );
  }

  if (rides.length === 0) {
    return (
      <div className="my-rides-empty">
        <span>Пока нет запланированных поездок</span>
        <a href="/admin" className="add-ride-link">Добавить поездку</a>
      </div>
    );
  }

  return (
    <div className="rides-dynamic-block">
      {rides.map((ride) => {
        const startDate = new Date(ride.start);
        const dateStr = startDate.toLocaleDateString('ru-RU', { 
          weekday: 'long', 
          day: 'numeric', 
          month: 'long' 
        });
        const dateStrCap = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
        const timeStr = startDate.toLocaleTimeString('ru-RU', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });

        return (
          <div key={ride.id} className="ride-card" data-ride-id={ride.id}>
            <button 
              className="ride-card-del" 
              title="Удалить заезд"
              onClick={() => deleteRide(ride.id)}
            >
              &times;
            </button>
            <b className="ride-card-date">{dateStrCap}, {timeStr}</b><br />
            <span className="ride-card-place">
              Место: {ride.location}
              {ride.locationLink && (
                <>, <a href={ride.locationLink} target="_blank" rel="noopener noreferrer">локация</a></>
              )}
            </span><br />
            {ride.details && (
              <div className="ride-card-details">{ride.details}</div>
            )}
          </div>
        );
      })}
    </div>
  );
} 
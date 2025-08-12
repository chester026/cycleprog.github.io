import React, { useState, useEffect } from 'react';
import './MyRidesBlock.css';
import { apiFetch } from '../utils/api';
import RideAddModal from './RideAddModal';
// import { cacheUtils, CACHE_KEYS } from '../utils/cache';

export default function MyRidesBlock() {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadRides();
  }, []);

  const loadRides = async () => {
    try {
      setLoading(true);
      // Убираем кэш: всегда делаем свежий запрос
      const data = await apiFetch('/api/rides');
      
      // Сортируем заезды по дате и времени - сверху ближайшие
      const sortedRides = data.sort((a, b) => {
        return new Date(a.start) - new Date(b.start);
      });
      
      setRides(sortedRides);
    } catch (err) {
      console.error('Error loading rides:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteRide = async (id) => {
    if (!confirm('Delete this ride?')) return;
    try {
      await apiFetch(`/api/rides/${id}`, { method: 'DELETE' });
      setRides(rides.filter(ride => ride.id !== id));
      // cacheUtils.clear('rides'); // больше не нужно
    } catch (err) {
      console.error('Error deleting ride:', err);
    }
  };

  const handleAddRide = (newRide) => {
    setRides(prev => {
      const updatedRides = [newRide, ...prev];
      // Сортируем по дате - ближайшие сверху
      return updatedRides.sort((a, b) => new Date(a.start) - new Date(b.start));
    });
  };

  if (loading) {
    return (
      <div className="my-rides-loading">
        <div className="loading-spinner"></div>
        <span>Loading rides...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-rides-error">
        <span>Loading error: {error}</span>
      </div>
    );
  }

  if (rides.length === 0) {
    return (
      <div className="my-rides-empty">
        <span>No planned rides yet</span>
        <button 
          className="add-ride-btn" 
          onClick={() => setAddModalOpen(true)}
        >
          Add Ride
        </button>
        
        <RideAddModal
          isOpen={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          onAdd={handleAddRide}
        />
      </div>
    );
  }

  return (
    <div className="rides-dynamic-block">
      <div className="rides-header">
        <button 
          className="add-ride-btn" 
          onClick={() => setAddModalOpen(true)}
        >
          + Add ride
        </button>
      </div>
      
      {rides.map((ride) => {
        const startDate = new Date(ride.start);
        const dateStr = startDate.toLocaleDateString('en-US', { 
          weekday: 'long', 
          day: 'numeric', 
          month: 'long' 
        });
        const timeStr = startDate.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false // 24-hour format
        });

        return (
          <div key={ride.id} className="ride-card" data-ride-id={ride.id}>
            <button 
              className="ride-card-del" 
              title="Delete ride"
              onClick={() => deleteRide(ride.id)}
            >
              &times;
            </button>
            <b className="ride-card-date">{dateStr}, {timeStr}</b><br />
            <span className="ride-card-place">
              Location: {ride.location}
              {ride.locationLink && (
                <>, <a href={ride.locationLink} target="_blank" rel="noopener noreferrer">location</a></>
              )}
            </span><br />
            {ride.details && (
              <div className="ride-card-details">{ride.details}</div>
            )}
          </div>
        );
      })}
      
      <RideAddModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdd={handleAddRide}
      />
    </div>
  );
} 
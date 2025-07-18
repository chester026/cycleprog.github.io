import React, { useState, useEffect } from 'react';
import './AdminPage.css';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import { apiFetch } from '../utils/api';

// Компонент уведомлений
function Notification({ message, type = 'info', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success': return '✓';
      case 'error': return '✕';
      case 'warning': return '⚠';
      default: return 'ℹ';
    }
  };

  return (
    <div className={`admin-notification admin-notification-${type}`}>
      <span className="admin-notification-icon">{getIcon()}</span>
      <span className="admin-notification-message">{message}</span>
      <button className="admin-notification-close" onClick={onClose}>×</button>
    </div>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('rides');
  const [rides, setRides] = useState([]);
  const [garageImages, setGarageImages] = useState({});
  const [stravaTokens, setStravaTokens] = useState({
    access_token: '',
    refresh_token: '',
    expires_at: ''
  });
  const [loading, setLoading] = useState(true);
  const [editingRide, setEditingRide] = useState(null);
  const [rideForm, setRideForm] = useState({
    title: '',
    location: '',
    locationLink: '',
    details: '',
    start: ''
  });
  const [stravaLimits, setStravaLimits] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all, upcoming, past
  const [heroImages, setHeroImages] = useState({});

  // Добавить уведомление
  const addNotification = (message, type = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
  };

  // Удалить уведомление
  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Фильтрация и поиск заездов
  const getFilteredRides = () => {
    let filtered = rides;
    
    // Фильтр по статусу
    const now = new Date();
    switch (filterStatus) {
      case 'upcoming':
        filtered = filtered.filter(ride => new Date(ride.start) > now);
        break;
      case 'past':
        filtered = filtered.filter(ride => new Date(ride.start) <= now);
        break;
      default:
        break;
    }
    
    // Поиск по тексту
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(ride => 
        ride.title.toLowerCase().includes(term) ||
        ride.location.toLowerCase().includes(term) ||
        (ride.details && ride.details.toLowerCase().includes(term))
      );
    }
    
    return filtered;
  };

  useEffect(() => {
    loadData();
    fetchStravaLimits();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      console.log('Loading data...');
      
      const [ridesRes, garageRes, tokensRes, heroRes] = await Promise.all([
        apiFetch('/api/rides'),
        apiFetch('/api/garage/positions'),
        apiFetch('/api/strava/tokens'),
        apiFetch('/api/hero/positions')
      ]);
      
      console.log('Rides response status:', ridesRes.status);
      console.log('Garage response status:', garageRes.status);
      console.log('Tokens response status:', tokensRes.status);
      
      if (ridesRes.ok) {
        const ridesData = await ridesRes.json();
        console.log('Rides data:', ridesData);
        setRides(ridesData);
      }
      
      if (garageRes.ok) {
        const garageData = await garageRes.json();
        console.log('Garage data:', garageData);
        setGarageImages(garageData);
      }

      if (tokensRes.ok) {
        const tokensData = await tokensRes.json();
        console.log('Tokens data:', tokensData);
        setStravaTokens(tokensData);
        // Автоматически обновляем лимиты Strava, если есть токены
        if (tokensData.access_token) {
          fetchStravaLimits();
        }
      }

      if (heroRes.ok) {
        const heroData = await heroRes.json();
        console.log('Hero data:', heroData);
        setHeroImages(heroData);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      addNotification('Error loading data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const clearRideForm = () => {
    setRideForm({
      title: '',
      location: '',
      locationLink: '',
      details: '',
      start: ''
    });
    setEditingRide(null);
  };

  const handleRideSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = editingRide ? `/api/rides/${editingRide}` : '/api/rides';
      const method = editingRide ? 'PUT' : 'POST';
      
      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rideForm)
      });
      
      if (response.ok) {
        addNotification(
          editingRide ? 'Ride updated!' : 'Ride added!', 
          'success'
        );
        clearRideForm();
        loadData();
      } else {
        addNotification('Error saving ride', 'error');
      }
    } catch (err) {
      console.error('Error saving ride:', err);
      addNotification('Error saving ride', 'error');
    }
  };

  const editRide = (ride) => {
    setRideForm({
      title: ride.title,
      location: ride.location,
      locationLink: ride.locationLink || '',
      details: ride.details || '',
      start: ride.start
    });
    setEditingRide(ride.id);
  };

  const deleteRide = async (id) => {
    if (!confirm('Delete this ride?')) return;
    try {
      const response = await apiFetch(`/api/rides/${id}`, { method: 'DELETE' });
      if (response.ok) {
        addNotification('Ride deleted!', 'success');
        loadData();
      } else {
        addNotification('Error deleting ride', 'error');
      }
    } catch (err) {
      console.error('Error deleting ride:', err);
      addNotification('Error deleting ride', 'error');
    }
  };

  const deleteAllRides = async () => {
    if (!confirm('Delete ALL rides? This action cannot be undone!')) return;
    try {
      const response = await apiFetch('/api/rides/all', { method: 'DELETE' });
      if (response.ok) {
        addNotification('All rides deleted!', 'warning');
        loadData();
      } else {
        addNotification('Error deleting rides', 'error');
      }
    } catch (err) {
      console.error('Error deleting all rides:', err);
      addNotification('Error deleting rides', 'error');
    }
  };

  // Drag & Drop для заездов
  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('text/plain', index);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (e, dropIndex) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
    
    if (dragIndex === dropIndex) return;
    
    const newRides = [...rides];
    const draggedRide = newRides[dragIndex];
    newRides.splice(dragIndex, 1);
    newRides.splice(dropIndex, 0, draggedRide);
    
    try {
      const response = await apiFetch('/api/rides/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRides)
      });
      
      if (response.ok) {
        setRides(newRides);
        addNotification('Ride order updated!', 'success');
      } else {
        addNotification('Error updating order', 'error');
      }
    } catch (err) {
      console.error('Error reordering rides:', err);
      addNotification('Error updating order', 'error');
    }
  };

  const deleteGarageImage = async (name) => {
    if (!confirm('Delete this image?')) return;
    try {
      console.log('Deleting image:', name);
      const response = await apiFetch(`/api/garage/images/${name}`, { method: 'DELETE' });
      console.log('Delete response status:', response.status);
      
      if (response.ok) {
        console.log('Image deleted successfully');
        addNotification('Image deleted!', 'success');
        loadData();
      } else {
        const errorText = await response.text();
        console.error('Delete failed:', errorText);
        addNotification(`Error deleting (${response.status}): ${errorText}`, 'error');
      }
    } catch (err) {
      console.error('Error deleting garage image:', err);
      addNotification('Error deleting image: ' + err.message, 'error');
    }
  };

  const deleteHeroImage = async (name, position) => {
    const usedInOtherPositions = Object.entries(heroImages)
      .filter(([otherPos, otherFilename]) => 
        otherFilename === name && otherPos !== position
      ).map(([otherPos]) => otherPos);

    const confirmMessage = usedInOtherPositions.length > 0 
      ? `Delete image from "${position}"? File will remain in: ${usedInOtherPositions.join(', ')}`
      : 'Delete this image?';

    if (!confirm(confirmMessage)) return;

    try {
      console.log('Deleting hero image from position:', position);
      const response = await apiFetch(`/api/hero/positions/${position}`, { method: 'DELETE' });
      console.log('Delete response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('Hero image deleted successfully:', result.message);
        addNotification(result.message, 'success');
        loadData();
      } else {
        const errorText = await response.text();
        console.error('Delete failed:', errorText);
        addNotification(`Error deleting (${response.status}): ${errorText}`, 'error');
      }
    } catch (err) {
      console.error('Error deleting hero image:', err);
      addNotification('Error deleting hero image: ' + err.message, 'error');
    }
  };

  const clearAllHeroImages = async () => {
    if (!confirm('Delete all hero images? This action cannot be undone.')) return;
    try {
      console.log('Clearing all hero images');
      
      // Получаем список всех изображений
      const response = await apiFetch('/api/hero/positions');
      if (!response.ok) {
        addNotification('Error getting image list', 'error');
        return;
      }
      
      const heroData = await response.json();
      const uniqueImageNames = [...new Set(Object.values(heroData).filter(name => name !== null))];
      
      if (uniqueImageNames.length === 0) {
        addNotification('No images to delete', 'info');
        return;
      }
      
      // Удаляем уникальные изображения
      const deletePromises = uniqueImageNames.map(name => 
        apiFetch(`/api/hero/images/${name}`, { method: 'DELETE' })
      );
      
      const results = await Promise.all(deletePromises);
      const successCount = results.filter(r => r.ok).length;
      
      if (successCount === uniqueImageNames.length) {
        addNotification(`All hero images deleted (${successCount}/${uniqueImageNames.length} unique files)`, 'success');
      } else {
        addNotification(`Deleted ${successCount}/${uniqueImageNames.length} images`, 'warning');
      }
      
      loadData();
    } catch (err) {
      console.error('Error clearing hero images:', err);
      addNotification('Error deleting hero images: ' + err.message, 'error');
    }
  };

  const formatDT = (dt) => {
    return new Date(dt).toLocaleString('ru-RU');
  };

  const handleStravaTokensSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await apiFetch('/api/strava/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stravaTokens)
      });
      
      if (response.ok) {
        addNotification('Strava API keys updated!', 'success');
        loadData();
      } else {
        addNotification('Error updating keys', 'error');
      }
    } catch (err) {
      console.error('Error saving Strava tokens:', err);
      addNotification('Error saving keys: ' + err.message, 'error');
    }
  };

  const clearStravaTokens = () => {
    if (confirm('Clear all Strava tokens?')) {
      setStravaTokens({
        access_token: '',
        refresh_token: '',
        expires_at: ''
      });
      addNotification('Strava tokens cleared', 'warning');
    }
  };

  // Экспорт данных
  const exportData = () => {
    const data = {
      rides: rides,
      garageImages: garageImages,
      stravaTokens: stravaTokens,
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cycleprog-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addNotification('Data exported!', 'success');
  };

  // Импорт данных
  const importData = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        
        if (confirm('Import data? This may overwrite existing data.')) {
          // Импортируем заезды
          if (data.rides && Array.isArray(data.rides)) {
            const response = await apiFetch('/api/rides/import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data.rides)
            });
            
            if (response.ok) {
              addNotification('Rides imported!', 'success');
            } else {
              addNotification('Error importing rides', 'error');
            }
          }
          
          // Импортируем токены Strava
          if (data.stravaTokens) {
            setStravaTokens(data.stravaTokens);
            addNotification('Strava tokens imported!', 'success');
          }
          
          loadData();
        }
      } catch (err) {
        addNotification('Error reading file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    
    // Очищаем input
    event.target.value = '';
  };

  // Валидация формы заезда
  const validateRideForm = () => {
    const errors = [];
    
    if (!rideForm.title.trim()) {
      errors.push('Title is required');
    }
    
    if (!rideForm.location.trim()) {
      errors.push('Location is required');
    }
    
    if (!rideForm.start) {
      errors.push('Date and time are required');
    } else {
      const startDate = new Date(rideForm.start);
      if (isNaN(startDate.getTime())) {
        errors.push('Invalid date');
      }
    }
    
    if (rideForm.locationLink && !isValidUrl(rideForm.locationLink)) {
      errors.push('Invalid location link');
    }
    
    return errors;
  };

  const isValidUrl = (string) => {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  };

  // Функции для управления кэшем
  const getCacheInfo = () => {
    const cacheKeys = Object.values(CACHE_KEYS);
    const cacheInfo = {};
    
    cacheKeys.forEach(key => {
      const lastUpdate = cacheUtils.getLastUpdate(key);
      const hasData = cacheUtils.has(key);
      cacheInfo[key] = {
        hasData,
        lastUpdate: lastUpdate ? new Date(lastUpdate).toLocaleString('ru-RU') : null
      };
    });
    
    return cacheInfo;
  };

  const clearCache = (key = null) => {
    if (key) {
      cacheUtils.clear(key);
      addNotification(`Cache "${key}" cleared`, 'success');
    } else {
      cacheUtils.clear();
      addNotification('All cache cleared', 'success');
    }
  };

  // Получить лимиты Strava
  const fetchStravaLimits = async () => {
    try {
      // Сначала пробуем получить текущие лимиты
      const res = await apiFetch('/strava/limits');
      if (res.ok) {
        const data = await res.json();
        setStravaLimits(data);
      }
      
      // Затем принудительно обновляем лимиты
      const refreshRes = await apiFetch('/strava/limits/refresh', { method: 'POST' });
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        setStravaLimits(refreshData.limits);
        addNotification('Strava limits updated', 'success');
      } else {
        const errorData = await refreshRes.json();
        addNotification(`Error updating limits: ${errorData.message}`, 'error');
      }
    } catch (e) {
      console.error('Error fetching Strava limits:', e);
      setStravaLimits(null);
      addNotification('Error getting Strava limits', 'error');
    }
  };

  if (loading) {
    return (
      <div className="admin-wrap">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2em' }}>
          <div style={{ width: 40, height: 40, border: '4px solid #f3f3f3', borderTop: '4px solid #274DD3', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-wrap">
      {/* Уведомления */}
      <div className="admin-notifications">
        {notifications.map(notification => (
          <Notification
            key={notification.id}
            message={notification.message}
            type={notification.type}
            onClose={() => removeNotification(notification.id)}
          />
        ))}
      </div>

      <div className="admin-layout">
        {/* Вертикальная боковая панель с табами */}
        <div className="admin-sidebar">
          <div className="admin-tabs">
            <button 
              className={`admin-tab-btn ${activeTab === 'rides' ? 'admin-tab-active' : ''}`}
              onClick={() => setActiveTab('rides')}
            >
              <span className="tab-text">Manage Rides</span>
            </button>
            <button 
              className={`admin-tab-btn ${activeTab === 'garage' ? 'admin-tab-active' : ''}`}
              onClick={() => setActiveTab('garage')}
            >
              <span className="tab-text">Bike Garage Images</span>
            </button>
            <button 
              className={`admin-tab-btn ${activeTab === 'api' ? 'admin-tab-active' : ''}`}
              onClick={() => setActiveTab('api')}
            >
              <span className="tab-text">API Keys</span>
            </button>
            <button 
              className={`admin-tab-btn ${activeTab === 'cache' ? 'admin-tab-active' : ''}`}
              onClick={() => setActiveTab('cache')}
            >
              <span className="tab-text">Cache</span>
            </button>
            <button 
              className={`admin-tab-btn ${activeTab === 'hero' ? 'admin-tab-active' : ''}`}
              onClick={() => setActiveTab('hero')}
            >
              <span className="tab-text">Hero Images</span>
            </button>
          </div>
        </div>

        {/* Основной контент */}
        <div className="admin-content">
          {activeTab === 'rides' && (
            <div id="rides-tab-block">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1>Manage Rides</h1>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="admin-btn" onClick={exportData} style={{ background: '#28a745' }}>
                    📤 Export
                  </button>
                  <label className="admin-btn" style={{ background: '#17a2b8', cursor: 'pointer' }}>
                    📥 Import
                    <input 
                      type="file" 
                      accept=".json"
                      onChange={importData}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>
              
              <form onSubmit={handleRideSubmit}>
                <input type="hidden" value={editingRide || ''} />
                <label>Title:<br />
                  <input 
                    value={rideForm.title}
                    onChange={(e) => setRideForm({...rideForm, title: e.target.value})}
                    required
                    placeholder="Enter ride title"
                  />
                </label><br />
                <label>Location:<br />
                  <input 
                    value={rideForm.location}
                    onChange={(e) => setRideForm({...rideForm, location: e.target.value})}
                    required
                    placeholder="Enter location"
                  />
                </label><br />
                <label>Location Link:<br />
                  <input 
                    type="url" 
                    placeholder="https://..."
                    value={rideForm.locationLink}
                    onChange={(e) => setRideForm({...rideForm, locationLink: e.target.value})}
                  />
                </label><br />
                <label>Details:<br />
                  <textarea 
                    rows="2"
                    value={rideForm.details}
                    onChange={(e) => setRideForm({...rideForm, details: e.target.value})}
                    placeholder="Additional ride information"
                  />
                </label><br />
                <label>Start Date and Time:<br />
                  <input 
                    type="datetime-local"
                    value={rideForm.start}
                    onChange={(e) => setRideForm({...rideForm, start: e.target.value})}
                    required
                  />
                </label><br />
                <button className="btn" type="submit">
                  {editingRide ? 'Update' : 'Save'}
                </button>
                {editingRide && (
                  <button className="btn cancel" type="button" onClick={clearRideForm}>
                    Cancel
                  </button>
                )}
              </form>
              
              <button className="btn del" type="button" onClick={deleteAllRides} style={{float: 'right', marginBottom: '1em'}}>
                Delete all records
              </button>
              
              {/* Поиск и фильтры */}
              <div style={{ marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Search by title, location, or details..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ flex: 1, minWidth: '250px', padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px' }}
                />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px' }}
                >
                  <option value="all">All rides</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="past">Past</option>
                </select>
                <span style={{ color: '#6c757d', fontSize: '14px' }}>
                  Found: {getFilteredRides().length} of {rides.length}
                </span>
              </div>
              
              <table id="rides-table">
                <thead>
                  <tr>
                    <th style={{ width: '30px' }}></th>
                    <th>Title</th>
                    <th>Location</th>
                    <th>Location</th>
                    <th>Start</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {getFilteredRides().map((ride, index) => {
                    const startDate = new Date(ride.start);
                    const now = new Date();
                    const isUpcoming = startDate > now;
                    const isToday = startDate.toDateString() === now.toDateString();
                    
                    return (
                      <tr 
                        key={ride.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, index)}
                        style={{ cursor: 'grab' }}
                      >
                        <td style={{ textAlign: 'center', color: '#6c757d' }}>⋮⋮</td>
                        <td>{ride.title}</td>
                        <td>{ride.location}</td>
                        <td>
                          {ride.locationLink ? (
                            <a href={ride.locationLink} target="_blank" rel="noopener noreferrer">
                              Link
                            </a>
                          ) : ''}
                        </td>
                        <td>{formatDT(ride.start)}</td>
                        <td>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: '500',
                            background: isToday ? '#ffc107' : (isUpcoming ? '#28a745' : '#6c757d'),
                            color: isToday ? '#000' : '#fff'
                          }}>
                            {isToday ? 'Today' : (isUpcoming ? 'Upcoming' : 'Past')}
                          </span>
                        </td>
                        <td className="row-actions">
                          <button className="btn" onClick={() => editRide(ride)} title="Edit">✎</button>
                          <button className="btn del" onClick={() => deleteRide(ride.id)} title="Delete">✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              
              {getFilteredRides().length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6c757d' }}>
                  {rides.length === 0 ? 'No rides' : 'No rides found'}
                </div>
              )}
            </div>
          )}

          {activeTab === 'garage' && (
            <div id="garage-tab-block">
              <h2>Bike Garage Images</h2>
              <GarageUploadForm onUpload={loadData} />
              <div id="garage-images-list">
                {Object.keys(garageImages).length === 0 ? (
                  <span style={{color: '#888'}}>No images</span>
                ) : (
                  <>
                    {/* Загруженные изображения */}
                    {Object.entries(garageImages)
                      .filter(([position, filename]) => filename !== null)
                      .map(([position, filename]) => (
                        <div key={position} className="garage-image-item">
                          <div className="garage-image-position">{position}</div>
                          <img src={`/img/garage/${filename}`} alt="garage-img" />
                          <button 
                            title="Delete" 
                            onClick={() => deleteGarageImage(filename)}
                            className="garage-image-delete"
                          >
                            ×
                          </button>
                        </div>
                      ))
                    }
                    
                    {/* Пустые позиции */}
                    {Object.entries(garageImages)
                      .filter(([position, filename]) => filename === null)
                      .map(([position, filename]) => (
                        <div key={position} className="garage-image-item garage-image-empty">
                          <div className="garage-image-position">{position}</div>
                          <div className="garage-image-placeholder">Empty</div>
                        </div>
                      ))
                    }
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === 'api' && (
            <div id="api-tab-block">
              <h1>Manage Strava API Keys</h1>
              <div style={{ marginBottom: '1em', padding: '1em', background: '#f8f9fa', borderRadius: '4px', border: '1px solid #e9ecef' }}>
                <strong>Instructions:</strong><br />
                1. Get keys in <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener noreferrer">Strava API settings</a><br />
                2. Enter access_token and refresh_token<br />
                3. expires_at - token expiration time (timestamp)<br />
                4. Click "Save Keys"
              </div>
              
              <form onSubmit={handleStravaTokensSubmit}>
                <label>Access Token:<br />
                  <input 
                    type="text"
                    value={stravaTokens.access_token}
                    onChange={(e) => setStravaTokens({...stravaTokens, access_token: e.target.value})}
                    placeholder="Enter access token"
                    style={{ width: '100%', maxWidth: '400px' }}
                    required
                  />
                </label><br /><br />
                
                <label>Refresh Token:<br />
                  <input 
                    type="text"
                    value={stravaTokens.refresh_token}
                    onChange={(e) => setStravaTokens({...stravaTokens, refresh_token: e.target.value})}
                    placeholder="Enter refresh token"
                    style={{ width: '100%', maxWidth: '400px' }}
                    required
                  />
                </label><br /><br />
                
                <label>Expires At (timestamp):<br />
                  <input 
                    type="number"
                    value={stravaTokens.expires_at}
                    onChange={(e) => setStravaTokens({...stravaTokens, expires_at: e.target.value})}
                    placeholder="Enter expiration timestamp"
                    style={{ width: '100%', maxWidth: '400px' }}
                    required
                  />
                </label><br /><br />
                
                <button type="submit" className="admin-btn">Save Keys</button>
                <button type="button" onClick={clearStravaTokens} className="admin-btn" style={{ marginLeft: '1em', background: '#6c757d' }}>
                  Clear
                </button>
              </form>

              {stravaTokens.access_token && (
                <div style={{ marginTop: '2em', padding: '1em', background: '#e8f5e8', borderRadius: '4px', border: '1px solid #28a745' }}>
                  <strong>Current Keys:</strong><br />
                  Access Token: {stravaTokens.access_token.substring(0, 10)}...<br />
                  Refresh Token: {stravaTokens.refresh_token.substring(0, 10)}...<br />
                  Expires At: {stravaTokens.expires_at ? new Date(stravaTokens.expires_at * 1000).toLocaleString() : 'Not specified'}
                </div>
              )}
            </div>
          )}

          {activeTab === 'cache' && (
            <div id="cache-tab-block">
              <h1>Manage Cache</h1>
              <div style={{ marginBottom: '1em', padding: '1em', background: '#f8f9fa', borderRadius: '4px', border: '1px solid #e9ecef' }}>
                <strong>Information:</strong><br />
                Cache stores data in the browser's localStorage to reduce server requests.<br />
                Data is automatically updated when the TTL expires.
              </div>

              {/* Strava Limits Block */}
              <div style={{ marginBottom: '2em', padding: '1em', background: '#fffbe8', borderRadius: '4px', border: '1px solid #ffe082' }}>
                <strong>Strava API Rate Limits:</strong><br />
                {stravaLimits ? (
                  <>
                    <div>15 min: <b>{stravaLimits.usage15min ?? '—'}</b> / <b>{stravaLimits.limit15min ?? '—'}</b></div>
                    <div>Day: <b>{stravaLimits.usageDay ?? '—'}</b> / <b>{stravaLimits.limitDay ?? '—'}</b></div>
                    <div style={{ fontSize: '12px', color: '#888' }}>Last updated: {stravaLimits.lastUpdate ? new Date(stravaLimits.lastUpdate).toLocaleString('ru-RU') : '—'}</div>
                  </>
                ) : (
                  <span style={{ color: '#888' }}>No Strava limits data</span>
                )}
                <button onClick={fetchStravaLimits} className="admin-btn" style={{ marginLeft: 16, fontSize: 12, background: '#ffd54f', color: '#333' }}>Update Limits</button>
              </div>

              <div style={{ marginBottom: '2em' }}>
                <button 
                  onClick={() => clearCache()} 
                  className="admin-btn" 
                  style={{ background: '#dc3545' }}
                >
                  Clear all cache
                </button>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #dee2e6' }}>Data Type</th>
                    <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #dee2e6' }}>Status</th>
                    <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #dee2e6' }}>Last Updated</th>
                    <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #dee2e6' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(getCacheInfo()).map(([key, info]) => (
                    <tr key={key}>
                      <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
                        <strong>{key}</strong>
                      </td>
                      <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
                        <span style={{ 
                          color: info.hasData ? '#28a745' : '#6c757d',
                          fontWeight: 'bold'
                        }}>
                          {info.hasData ? '✓ Data exists' : '✗ No data'}
                        </span>
                      </td>
                      <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
                        {info.lastUpdate || '—'}
                      </td>
                      <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
                        {info.hasData && (
                          <button 
                            onClick={() => clearCache(key)} 
                            className="admin-btn" 
                            style={{ background: '#ffc107', color: '#000', fontSize: '12px' }}
                          >
                            Clear
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'hero' && (
            <div id="hero-tab-block">
              <h2>Hero Background Images</h2>
              <HeroUploadForm onUpload={loadData} />
              <div style={{ marginBottom: '20px' }}>
                <button 
                  onClick={clearAllHeroImages}
                  className="admin-btn" 
                  style={{ background: '#6c757d', color: 'white' }}
                >
                  Clear all hero images
                </button>
              </div>
              <div id="hero-images-list">
                {Object.keys(heroImages).length === 0 ? (
                  <span style={{color: '#888'}}>No images</span>
                ) : (
                  <>
                    {/* Загруженные изображения */}
                    {Object.entries(heroImages)
                      .filter(([position, filename]) => filename !== null)
                      .map(([position, filename]) => {
                        // Проверяем, используется ли файл в других позициях
                        const usedInOtherPositions = Object.entries(heroImages)
                          .filter(([otherPos, otherFilename]) => 
                            otherFilename === filename && otherPos !== position
                          ).map(([otherPos]) => otherPos);
                        
                        return (
                          <div key={position} className="hero-image-item">
                            <div className="hero-image-position">
                              {position}
                              {usedInOtherPositions.length > 0 && (
                                <span className="shared-indicator" title={`Also used in: ${usedInOtherPositions.join(', ')}`}>
                                  🔗
                                </span>
                              )}
                            </div>
                            <img src={`/img/hero/${filename}`} alt="hero-img" />
                            <button 
                              title={usedInOtherPositions.length > 0 ? 
                                `Delete from ${position} (file remains in others)` : 
                                "Delete"
                              }
                              onClick={() => deleteHeroImage(filename, position)}
                              className="hero-image-delete"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })
                    }
                    
                    {/* Пустые позиции */}
                    {Object.entries(heroImages)
                      .filter(([position, filename]) => filename === null)
                      .map(([position, filename]) => (
                        <div key={position} className="hero-image-item hero-image-empty">
                          <div className="hero-image-position">{position}</div>
                          <div className="hero-image-placeholder">Empty</div>
                        </div>
                      ))
                    }
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Компонент для загрузки изображений
function GarageUploadForm({ onUpload }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [position, setPosition] = useState('right');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      
      // Создаем предпросмотр
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      alert('Select a file');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', selectedFile);
      formData.append('pos', position);
      
      console.log('Uploading file:', selectedFile.name, 'to position:', position);
      console.log('File size:', selectedFile.size, 'bytes');
      console.log('File type:', selectedFile.type);
      
      const response = await apiFetch('/garage/upload', { 
        method: 'POST', 
        body: formData 
      });
      
      console.log('Upload response status:', response.status);
      console.log('Upload response headers:', Object.fromEntries(response.headers.entries()));
      
      if (response.ok) {
        const result = await response.json();
        console.log('Upload successful:', result);
        alert('Image uploaded successfully!');
        setSelectedFile(null);
        setPosition('right');
        setPreview(null);
        onUpload();
      } else {
        const errorText = await response.text();
        console.error('Upload failed:', errorText);
        alert(`Error uploading (${response.status}): ${errorText}`);
      }
    } catch (e) {
      console.error('Error uploading image:', e);
      alert('Error uploading image: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="garage-upload-container">
      <form onSubmit={handleSubmit} className="garage-upload-form">
        <div className="upload-inputs">
          <input 
            type="file" 
            accept="image/*"
            onChange={handleFileSelect}
          />
          <select 
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          >
            <option value="right">Right (main)</option>
            <option value="left-top">Left Top</option>
            <option value="left-bottom">Left Bottom</option>
          </select>
          <button className="btn" type="submit" disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
        
        {preview && (
          <div className="upload-preview">
            <h4>Preview:</h4>
            <img src={preview} alt="Preview" style={{ maxWidth: '200px', maxHeight: '200px', objectFit: 'cover' }} />
            <div className="file-info">
              <strong>File:</strong> {selectedFile.name}<br />
              <strong>Size:</strong> {(selectedFile.size / 1024).toFixed(1)} KB<br />
              <strong>Type:</strong> {selectedFile.type}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

// Компонент для загрузки hero изображений
function HeroUploadForm({ onUpload }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [position, setPosition] = useState('garage');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [uploadToAll, setUploadToAll] = useState(false);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      
      // Создаем предпросмотр
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      alert('Select a file');
      return;
    }

    setUploading(true);
    try {
      if (uploadToAll) {
        // Загружаем одно изображение и назначаем во все позиции
        const formData = new FormData();
        formData.append('image', selectedFile);
        
        console.log('Uploading hero file to all positions:', selectedFile.name);
        console.log('File size:', selectedFile.size, 'bytes');
        console.log('File type:', selectedFile.type);
        
        const response = await apiFetch('/hero/assign-all', { 
          method: 'POST', 
          body: formData 
        });
        
        console.log('Upload response status:', response.status);
        
        if (response.ok) {
          const result = await response.json();
          console.log('Upload successful:', result);
          alert(`Image successfully assigned to all hero blocks! Deleted old files: ${result.deletedFiles}`);
        } else {
          const errorText = await response.text();
          console.error('Upload failed:', errorText);
          alert(`Error uploading (${response.status}): ${errorText}`);
        }
      } else {
        // Загружаем в одну позицию
        const formData = new FormData();
        formData.append('image', selectedFile);
        formData.append('pos', position);
        
        console.log('Uploading hero file:', selectedFile.name, 'to position:', position);
        console.log('File size:', selectedFile.size, 'bytes');
        console.log('File type:', selectedFile.type);
        
        const response = await apiFetch('/hero/upload', { 
          method: 'POST', 
          body: formData 
        });
        
        console.log('Upload response status:', response.status);
        console.log('Upload response headers:', Object.fromEntries(response.headers.entries()));
        
        if (response.ok) {
          const result = await response.json();
          console.log('Upload successful:', result);
          alert('Hero image uploaded successfully!');
        } else {
          const errorText = await response.text();
          console.error('Upload failed:', errorText);
          alert(`Error uploading (${response.status}): ${errorText}`);
        }
      }
      
      setSelectedFile(null);
      setPosition('garage');
      setPreview(null);
      setUploadToAll(false);
      onUpload();
    } catch (e) {
      console.error('Error uploading hero image:', e);
      alert('Error uploading hero image: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="hero-upload-container">
      <form onSubmit={handleSubmit} className="hero-upload-form">
        <div className="upload-inputs">
          <input 
            type="file" 
            accept="image/*"
            onChange={handleFileSelect}
          />
          <div className="upload-options">
            <label className="upload-to-all-label">
              <input 
                type="checkbox" 
                checked={uploadToAll}
                onChange={(e) => setUploadToAll(e.target.checked)}
              />
              <span>Upload to all hero blocks</span>
            </label>
            {!uploadToAll && (
              <select 
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              >
                <option value="garage">Garage Hero</option>
                <option value="plan">Plan Hero</option>
                <option value="trainings">Trainings Hero</option>
                <option value="checklist">Checklist Hero</option>
                <option value="nutrition">Nutrition Hero</option>
              </select>
            )}
          </div>
          <button className="btn" type="submit" disabled={uploading}>
            {uploading ? 'Uploading...' : (uploadToAll ? 'Upload to all' : 'Upload')}
          </button>
        </div>
        
        {preview && (
          <div className="upload-preview">
            <h4>Preview:</h4>
            <img src={preview} alt="Preview" style={{ maxWidth: '200px', maxHeight: '200px', objectFit: 'cover' }} />
            <div className="file-info">
              <strong>File:</strong> {selectedFile.name}<br />
              <strong>Size:</strong> {(selectedFile.size / 1024).toFixed(1)} KB<br />
              <strong>Type:</strong> {selectedFile.type}
            </div>
          </div>
        )}
      </form>
    </div>
  );
} 
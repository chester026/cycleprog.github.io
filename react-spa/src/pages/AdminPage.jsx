import React, { useState, useEffect } from 'react';
import './AdminPage.css';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import { apiFetch } from '../utils/api';
import DatabaseMemoryInfo from '../components/DatabaseMemoryInfo';
import Footer from '../components/Footer';
import { imageCacheUtils } from '../utils/imageCache.jsx';
import CacheStatus from '../components/CacheStatus';

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
  const [activeTab, setActiveTab] = useState('api');
  const [garageImages, setGarageImages] = useState({});
  const [stravaTokens, setStravaTokens] = useState({
    access_token: '',
    refresh_token: '',
    expires_at: ''
  });
  const [loading, setLoading] = useState(true);
  const [stravaLimits, setStravaLimits] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [heroImages, setHeroImages] = useState({});
  const [users, setUsers] = useState([]);

  // Добавить уведомление
  const addNotification = (message, type = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
  };

  // Удалить уведомление
  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };



  useEffect(() => {
    loadData();
    // Убираем автоматическую загрузку лимитов - только по кнопке
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      const [tokensRes, heroRes, usersRes] = await Promise.all([
        apiFetch('/api/strava/tokens'),
        apiFetch('/api/hero/images'),
        apiFetch('/api/admin/users')
      ]);

      const tokensData = await tokensRes;
      setStravaTokens(tokensData);
      // Убираем автоматическое обновление лимитов - теперь только вручную

      const heroData = await heroRes;
      setHeroImages(heroData);

      const usersData = await usersRes;
      setUsers(usersData.users);
    } catch (err) {
      addNotification('Error loading data', 'error');
    } finally {
      setLoading(false);
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
      const response = await apiFetch(`/api/hero/positions/${position}`, { method: 'DELETE' });
      
      if (response.ok) {
        const result = await response.json();
        addNotification(result.message, 'success');
        loadData();
      } else {
        const errorText = await response.text();
        addNotification(`Error deleting (${response.status}): ${errorText}`, 'error');
      }
    } catch (err) {
      addNotification('Error deleting hero image: ' + err.message, 'error');
    }
  };

  const clearAllHeroImages = async () => {
    if (!confirm('Delete all hero images? This action cannot be undone.')) return;
    try {
      
      // Получаем список всех изображений
      const response = await apiFetch('/api/hero/images');
      if (!response.ok) {
        addNotification('Error getting image list', 'error');
        return;
      }
      
      const heroData = await response.json();
      const positions = Object.keys(heroData).filter(pos => heroData[pos] !== null);
      
      if (positions.length === 0) {
        addNotification('No images to delete', 'info');
        return;
      }
      
      // Удаляем изображения по позициям
      const deletePromises = positions.map(pos => 
        apiFetch(`/api/hero/positions/${pos}`, { method: 'DELETE' })
      );
      
      const results = await Promise.all(deletePromises);
      const successCount = results.filter(r => r.ok).length;
      
      if (successCount === positions.length) {
        addNotification(`All hero images deleted (${successCount}/${positions.length} positions)`, 'success');
      } else {
        addNotification(`Deleted ${successCount}/${positions.length} images`, 'warning');
      }
      
      loadData();
    } catch (err) {
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

  // Отключить Strava от пользователя
  const unlinkUserStrava = async (userId, userEmail) => {
    if (!confirm(`Отключить Strava от пользователя ${userEmail}?`)) {
      return;
    }

    try {
      await apiFetch(`/api/admin/users/${userId}/unlink-strava`, {
        method: 'POST'
      });
      
      // Обновляем пользователя в state
      setUsers(prev => prev.map(user => 
        user.id === userId 
          ? { ...user, has_strava_token: false, strava_id: null }
          : user
      ));
      
      addNotification(`Strava отключен от ${userEmail}`, 'success');
    } catch (err) {
      addNotification(`Ошибка отключения Strava: ${err.message}`, 'error');
    }
  };

  // Удалить пользователя
  const deleteUser = async (userId, userEmail) => {
    if (!confirm(`ВНИМАНИЕ! Это полностью удалит пользователя ${userEmail} и ВСЕ связанные данные (активности, цели, события, профиль). Это действие нельзя отменить!\n\nПродолжить?`)) {
      return;
    }

    try {
      const response = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'DELETE'
      });
      
      // Удаляем пользователя из state
      setUsers(prev => prev.filter(user => user.id !== userId));
      
      let message = `Пользователь ${userEmail} удален`;
      if (response.deletedRecords) {
        const totalDeleted = Object.values(response.deletedRecords).reduce((sum, count) => sum + count, 0);
        message += ` (удалено ${totalDeleted} записей)`;
      }
      
      addNotification(message, 'success');
    } catch (err) {
      addNotification(`Ошибка удаления пользователя: ${err.message}`, 'error');
    }
  };

  // Экспорт данных
  const exportData = () => {
    const data = {
      stravaTokens: stravaTokens,
      heroImages: heroImages,
      users: users,
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
      clearPowerAnalysisCache(); // Очищаем также Power Analysis кэш
      addNotification('All cache cleared', 'success');
    }
  };

  const clearImageCache = () => {
    imageCacheUtils.clearImageCache();
    addNotification('Image cache cleared', 'success');
  };

  const getImageCacheInfo = () => {
    return {
      size: imageCacheUtils.getCacheSize(),
      hasData: imageCacheUtils.getCacheSize() > 0
    };
  };

  const getPowerAnalysisCacheInfo = () => {
    try {
      // Получаем все ключи из localStorage, которые относятся к Power Analysis
      const powerCacheKeys = Object.keys(localStorage).filter(key => 
        key.startsWith('powerAnalysis_') || 
        key.includes('_75_8_asphalt_wind_v') ||
        key.includes('_75_8_asphalt_nowind_v')
      );
      
      const powerCacheSize = powerCacheKeys.length;
      
      return {
        size: powerCacheSize,
        hasData: powerCacheSize > 0,
        keys: powerCacheKeys
      };
    } catch (error) {
      return {
        size: 0,
        hasData: false,
        keys: []
      };
    }
  };

  const clearPowerAnalysisCache = () => {
    try {
      // Очищаем все ключи Power Analysis из localStorage
      const powerCacheKeys = Object.keys(localStorage).filter(key => 
        key.startsWith('powerAnalysis_') || 
        key.includes('_75_8_asphalt_wind_v') ||
        key.includes('_75_8_asphalt_nowind_v')
      );
      
      powerCacheKeys.forEach(key => {
        localStorage.removeItem(key);
      });
      
      addNotification(`Power Analysis cache cleared (${powerCacheKeys.length} items)`, 'success');
    } catch (error) {
      addNotification('Error clearing Power Analysis cache', 'error');
    }
  };

  // Получить лимиты Strava
  const fetchStravaLimits = async () => {
    if (!confirm('⚠️ ВНИМАНИЕ!\n\nЭто действие использует лимиты Strava API и может повлиять на работу приложения.\n\nВы уверены, что хотите обновить лимиты?')) {
      return;
    }

    try {
      addNotification('Обновляем лимиты Strava (использует API)...', 'warning');
      
      // Сначала пробуем получить текущие лимиты
      const res = await apiFetch('/api/strava/limits');
      const data = await res;
      setStravaLimits(data);
      
      // Затем принудительно обновляем лимиты
      const refreshData = await apiFetch('/api/strava/limits/refresh', { method: 'POST' });
      setStravaLimits(refreshData.limits);
      addNotification('Strava limits updated (API used)', 'success');
    } catch (e) {
      console.error('Error with Strava limits:', e);
      setStravaLimits(null);
      addNotification(`Error getting Strava limits: ${e.message}`, 'error');
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
              className={`admin-tab-btn ${activeTab === 'users' ? 'admin-tab-active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              <span className="tab-text">Users</span>
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
            <button 
              className={`admin-tab-btn ${activeTab === 'database' ? 'admin-tab-active' : ''}`}
              onClick={() => setActiveTab('database')}
            >
              <span className="tab-text">Database</span>
            </button>
           
          </div>
        </div>

        {/* Основной контент */}
        <div className="admin-content">

          {activeTab === 'api' && (
            <div id="api-tab-block">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1>Manage Strava API Keys</h1>
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
                  Expires At: {stravaTokens.expires_at ? new Date(stravaTokens.expires_at * 1000).toLocaleString('ru-RU') : 'Not specified'}
                </div>
              )}
            </div>
          )}

          {activeTab === 'cache' && (
            <div id="cache-tab-block">
              <h1>Manage Cache</h1>
              
              {/* Компонент статуса кэша */}
              <div style={{ marginBottom: '2em' }}>
                <CacheStatus />
              </div>
              
              <div style={{ marginBottom: '1em', padding: '1em', background: '#f8f9fa', borderRadius: '4px', border: '1px solid #e9ecef' }}>
                <strong>Information:</strong><br />
                Cache stores data in the browser's localStorage to reduce server requests.<br />
                Data is automatically updated when the TTL expires.
              </div>

              {/* Strava Limits Block */}
              <div style={{ marginBottom: '2em', padding: '1em', background: '#fff3cd', borderRadius: '4px', border: '1px solid #ffeaa7' }}>
                <div style={{ fontSize: '14px', color: '#856404', marginBottom: '8px' }}>
                  ℹ️ <strong>Info:</strong> Strava limits are not updated automatically to save API quota. Use button only when needed.
                </div>
                <strong>Strava API Rate Limits:</strong><br />
                {stravaLimits ? (
                  <>
                    <div>15 min: <b>{stravaLimits.usage15min ?? '—'}</b> / <b>{stravaLimits.limit15min ?? '—'}</b></div>
                    <div>Day: <b>{stravaLimits.usageDay ?? '—'}</b> / <b>{stravaLimits.limitDay ?? '—'}</b></div>
                    <div style={{ fontSize: '12px', color: '#888' }}>Last updated: {stravaLimits.lastUpdate ? new Date(stravaLimits.lastUpdate).toLocaleString('ru-RU') : '—'}</div>
                  </>
                ) : (
                  <span style={{ color: '#888' }}>No data - click update to load (uses API)</span>
                )}
                <button 
                  onClick={fetchStravaLimits} 
                  className="admin-btn" 
                  style={{ marginLeft: 16, fontSize: 12, background: '#dc3545', color: '#fff' }}
                  title="⚠️ ВНИМАНИЕ: Использует Strava API лимиты!"
                >
                  ⚠️ Update Limits (Uses API!)
                </button>
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
                  {/* Power Analysis Cache Row */}
                  {(() => {
                    const powerCacheInfo = getPowerAnalysisCacheInfo();
                    return (
                      <tr>
                        <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
                          <strong>Power Analysis Cache</strong>
                        </td>
                        <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
                          <span style={{ 
                            color: powerCacheInfo.hasData ? '#28a745' : '#6c757d',
                            fontWeight: 'bold'
                          }}>
                            {powerCacheInfo.hasData ? `✓ ${powerCacheInfo.size} power calculations cached` : '✗ No power calculations cached'}
                          </span>
                        </td>
                        <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
                          —
                        </td>
                        <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
                          {powerCacheInfo.hasData && (
                            <button 
                              onClick={clearPowerAnalysisCache} 
                              className="admin-btn" 
                              style={{ background: '#ffc107', color: '#000', fontSize: '12px' }}
                            >
                              Clear
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })()}
                  {/* Image Cache Row */}
                  {(() => {
                    const imageCacheInfo = getImageCacheInfo();
                    return (
                      <tr>
                        <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
                          <strong>Image Cache</strong>
                        </td>
                        <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
                          <span style={{ 
                            color: imageCacheInfo.hasData ? '#28a745' : '#6c757d',
                            fontWeight: 'bold'
                          }}>
                            {imageCacheInfo.hasData ? `✓ ${imageCacheInfo.size} images cached` : '✗ No images cached'}
                          </span>
                        </td>
                        <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
                          —
                        </td>
                        <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
                          {imageCacheInfo.hasData && (
                            <button 
                              onClick={clearImageCache} 
                              className="admin-btn" 
                              style={{ background: '#ffc107', color: '#000', fontSize: '12px' }}
                            >
                              Clear
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })()}
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
                {!heroImages || Object.keys(heroImages).length === 0 ? (
                  <span style={{color: '#888'}}>No images</span>
                ) : (
                  <>
                    {/* Загруженные изображения */}
                    {Object.entries(heroImages || {})
                      .filter(([position, imageData]) => imageData !== null)
                      .map(([position, imageData]) => {
                        // Дополнительная проверка на null
                        if (!imageData) return null;
                        
                        // Поддержка старого и нового формата
                        const isImageKit = typeof imageData === 'object' && imageData.url;
                        const imageUrl = isImageKit ? `${imageData.url.split('?')[0]}?tr=q-100,f-webp` : `/img/hero/${imageData}`;
                        const imageName = isImageKit ? imageData.name : imageData;
                        
                        // Проверяем, используется ли файл в других позициях
                        const usedInOtherPositions = Object.entries(heroImages || {})
                          .filter(([otherPos, otherImageData]) => {
                            if (otherImageData === null) return false;
                            if (isImageKit && typeof otherImageData === 'object' && otherImageData.url) {
                              return otherImageData.file_id === imageData.file_id && otherPos !== position;
                            }
                            return otherImageData === imageData && otherPos !== position;
                          }).map(([otherPos]) => otherPos);
                        
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
                            <img src={imageUrl} alt="hero-img" />
                            <button 
                              title={usedInOtherPositions.length > 0 ? 
                                `Delete from ${position} (file remains in others)` : 
                                "Delete"
                              }
                              onClick={() => deleteHeroImage(imageName, position)}
                              className="hero-image-delete"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })
                    }
                    
                    {/* Пустые позиции */}
                    {Object.entries(heroImages || {})
                      .filter(([position, imageData]) => imageData === null)
                      .map(([position, imageData]) => (
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

          {activeTab === 'database' && (
            <div id="database-tab-block">
              <DatabaseMemoryInfo />
            </div>
          )}

          {activeTab === 'users' && (
            <div id="users-tab-block">
              <div className="admin-section">
                <h2>👥 User Management</h2>
                <p>Manage application users, unlink Strava accounts, and delete users with all related data.</p>
                
                <div className="users-stats">
                  <div className="stat-item">
                    <span className="stat-label">Total Users:</span>
                    <span className="stat-value">{users.length}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Email Verified:</span>
                    <span className="stat-value">{users.filter(u => u.email_verified).length}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">With Strava:</span>
                    <span className="stat-value">{users.filter(u => u.has_strava_token).length}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Without Strava:</span>
                    <span className="stat-value">{users.filter(u => !u.has_strava_token).length}</span>
                  </div>
                </div>

                <div className="users-table-container">
                  <table className="users-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Email</th>
                        <th>Verified</th>
                        <th>Strava ID</th>
                        <th>Level</th>
                        <th>Rides</th>
                        <th>Goals</th>
                        <th>Events</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(user => (
                        <tr key={user.id} className={`${!user.has_strava_token ? 'user-no-strava' : ''} ${!user.email_verified ? 'user-unverified' : ''}`.trim()}>
                          <td>{user.id}</td>
                          <td className="user-email">{user.email}</td>
                          <td className="user-verified">
                            {user.email_verified ? (
                              <span className="verified-yes">✓</span>
                            ) : (
                              <span className="verified-no">✗</span>
                            )}
                          </td>
                          <td className="user-strava">
                            {user.strava_id ? (
                              <span className="strava-connected">
                                {user.strava_id}
                              </span>
                            ) : (
                              <span className="strava-disconnected">Not connected</span>
                            )}
                          </td>
                          <td className="user-level">
                            <span className={`level-badge level-${user.experience_level || 'unknown'}`}>
                              {user.experience_level || '—'}
                            </span>
                          </td>
                          <td className="user-count">{user.rides_count || 0}</td>
                          <td className="user-count">{user.goals_count || 0}</td>
                          <td className="user-count">{user.events_count || 0}</td>
                          <td className="user-date">
                            {user.created_at ? formatDT(user.created_at) : '—'}
                          </td>
                          <td className="user-actions">
                            {user.has_strava_token && (
                              <button
                                className="user-action-btn unlink-btn"
                                onClick={() => unlinkUserStrava(user.id, user.email)}
                                title="Unlink Strava"
                              >
                                🔗
                              </button>
                            )}
                            <button
                              className="user-action-btn delete-btn"
                              onClick={() => deleteUser(user.id, user.email)}
                              title="Delete User"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {users.length === 0 && (
                    <div className="no-users">
                      <p>No users found</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <Footer />
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
        

        
        const response = await apiFetch('/api/hero/assign-all', { 
          method: 'POST', 
          body: formData 
        });
        
        if (response.ok) {
          const result = await response.json();
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
        

        
        const response = await apiFetch('/api/hero/upload', { 
          method: 'POST', 
          body: formData 
        });
        
        if (response.ok) {
          const result = await response.json();
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

 
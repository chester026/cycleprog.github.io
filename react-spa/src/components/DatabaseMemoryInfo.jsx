import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import './DatabaseMemoryInfo.css';

export default function DatabaseMemoryInfo() {
  const [memoryInfo, setMemoryInfo] = useState(null);
  const [tableStats, setTableStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState('low-end');
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);

  const fetchMemoryInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/database/memory');
      if (response.ok) {
        const data = await response.json();
        setMemoryInfo(data);
      } else {
        setError('Failed to fetch memory info');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTableStats = async () => {
    try {
      const response = await apiFetch('/api/database/table-stats');
      if (response.ok) {
        const data = await response.json();
        setTableStats(data.tableStats);
      }
    } catch (err) {
      console.error('Failed to fetch table stats:', err);
    }
  };

  const fetchProfiles = async () => {
    try {
      const response = await apiFetch('/api/database/profiles');
      if (response.ok) {
        const data = await response.json();
        setProfiles(data.profiles);
      }
    } catch (err) {
      console.error('Failed to fetch profiles:', err);
    }
  };

  const clearCache = async () => {
    try {
      const response = await apiFetch('/api/database/clear-cache', {
        method: 'POST'
      });
      if (response.ok) {
        alert('PostgreSQL cache cleared successfully!');
        fetchMemoryInfo(); // Обновляем данные
      } else {
        alert('Failed to clear cache');
      }
    } catch (err) {
      alert('Error clearing cache: ' + err.message);
    }
  };

  const optimizeDatabase = async () => {
    if (!confirm(`Это применит настройки профиля "${profiles.find(p => p.id === selectedProfile)?.name}". Продолжить?`)) {
      return;
    }

    try {
      const response = await apiFetch('/api/database/optimize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ profile: selectedProfile })
      });
      if (response.ok) {
        const data = await response.json();
        let message = `${data.message}!\n\n`;
        
        if (data.results) {
          const successCount = data.results.filter(r => r.status === 'success').length;
          const errorCount = data.results.filter(r => r.status === 'error').length;
          message += `✅ Applied: ${successCount}\n❌ Failed: ${errorCount}\n\n`;
          
          // Показываем детали ошибок
          if (errorCount > 0) {
            message += 'Детали ошибок:\n';
            data.results.filter(r => r.status === 'error').slice(0, 5).forEach(result => {
              message += `• ${result.name}: ${result.error}\n`;
            });
            if (errorCount > 5) {
              message += `... и еще ${errorCount - 5} ошибок\n`;
            }
            message += '\n';
          }
        }
        
        if (data.recommendations) {
          message += 'Рекомендации:\n' + data.recommendations.join('\n');
        }
        
        alert(message);
        fetchMemoryInfo(); // Обновляем данные
        setShowOptimizeModal(false);
      } else {
        alert('Failed to optimize database');
      }
    } catch (err) {
      alert('Error optimizing database: ' + err.message);
    }
  };

  useEffect(() => {
    fetchMemoryInfo();
    fetchTableStats();
    fetchProfiles();
  }, []);

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatPercentage = (value) => {
    return value ? `${value}%` : 'N/A';
  };

  if (loading) {
    return (
      <div className="database-memory-info">
        <div className="loading">Loading database memory information...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="database-memory-info">
        <div className="error">Error: {error}</div>
        <button onClick={fetchMemoryInfo} className="retry-btn">Retry</button>
      </div>
    );
  }

  if (!memoryInfo) {
    return (
      <div className="database-memory-info">
        <div className="no-data">No memory information available</div>
      </div>
    );
  }

  return (
    <div className="database-memory-info">
      <div className="header">
        <h2>📊 PostgreSQL Memory Information</h2>
        <div className="actions">
          <button onClick={fetchMemoryInfo} className="refresh-btn">🔄 Refresh</button>
          <button onClick={clearCache} className="clear-cache-btn">🧹 Clear Cache</button>
          <button onClick={() => setShowOptimizeModal(true)} className="optimize-btn">⚡ Optimize</button>
        </div>
      </div>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`tab ${activeTab === 'tables' ? 'active' : ''}`}
          onClick={() => setActiveTab('tables')}
        >
          Tables & Indexes
        </button>
        <button 
          className={`tab ${activeTab === 'processes' ? 'active' : ''}`}
          onClick={() => setActiveTab('processes')}
        >
          Active Processes
        </button>
        <button 
          className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      <div className="content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Database Size</h3>
                <div className="stat-value">
                  {memoryInfo.databaseSize?.database_size || 'N/A'}
                </div>
                <div className="stat-label">
                  {memoryInfo.databaseSize?.database_name}
                </div>
              </div>

              <div className="stat-card">
                <h3>Active Connections</h3>
                <div className="stat-value">
                  {memoryInfo.activeConnections?.active_connections || 0}
                </div>
                <div className="stat-label">
                  ~{formatBytes(memoryInfo.activeConnections?.estimated_memory_usage_bytes || 0)}
                </div>
              </div>

              <div className="stat-card">
                <h3>Cache Hit Ratio</h3>
                <div className="stat-value">
                  {formatPercentage(memoryInfo.cacheStats?.cache_hit_ratio)}
                </div>
                <div className="stat-label">
                  {memoryInfo.cacheStats?.heap_blocks_hit || 0} hits / {memoryInfo.cacheStats?.heap_blocks_read || 0} reads
                </div>
              </div>

              <div className="stat-card">
                <h3>Tables Count</h3>
                <div className="stat-value">
                  {memoryInfo.tableSizes?.length || 0}
                </div>
                <div className="stat-label">
                  User tables
                </div>
              </div>
            </div>

            <div className="memory-settings">
              <h3>Memory Settings</h3>
              <div className="settings-grid">
                {memoryInfo.generalSettings?.map((setting, index) => (
                  <div key={index} className="setting-item">
                    <span className="setting-name">{setting.name}</span>
                    <span className="setting-value">
                      {setting.setting} {setting.unit || ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tables' && (
          <div className="tables-tab">
            <h3>Table Sizes</h3>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Schema</th>
                    <th>Table</th>
                    <th>Total Size</th>
                    <th>Table Size</th>
                    <th>Index Size</th>
                  </tr>
                </thead>
                <tbody>
                  {memoryInfo.tableSizes?.map((table, index) => (
                    <tr key={index}>
                      <td>{table.schemaname}</td>
                      <td>{table.tablename}</td>
                      <td>{table.total_size}</td>
                      <td>{table.table_size}</td>
                      <td>{table.index_size}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>Largest Indexes</h3>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Schema</th>
                    <th>Table</th>
                    <th>Index</th>
                    <th>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {memoryInfo.indexSizes?.map((index, indexKey) => (
                    <tr key={indexKey}>
                      <td>{index.schemaname}</td>
                      <td>{index.tablename}</td>
                      <td>{index.indexname}</td>
                      <td>{index.index_size}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'processes' && (
          <div className="processes-tab">
            <h3>Active Processes ({memoryInfo.activeProcesses?.length || 0})</h3>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>PID</th>
                    <th>User</th>
                    <th>Application</th>
                    <th>State</th>
                    <th>Query Start</th>
                    <th>Query</th>
                  </tr>
                </thead>
                <tbody>
                  {memoryInfo.activeProcesses?.map((process, index) => (
                    <tr key={index}>
                      <td>{process.pid}</td>
                      <td>{process.usename}</td>
                      <td>{process.application_name}</td>
                      <td>{process.state}</td>
                      <td>{process.query_start ? new Date(process.query_start).toLocaleString('ru-RU') : 'N/A'}</td>
                      <td className="query-cell">
                        {process.query ? process.query.substring(0, 100) + '...' : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="settings-tab">
            <h3>WAL Settings</h3>
            <div className="settings-grid">
              {memoryInfo.walStats?.map((setting, index) => (
                <div key={index} className="setting-item">
                  <span className="setting-name">{setting.name}</span>
                  <span className="setting-value">
                    {setting.setting} {setting.unit || ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Модальное окно выбора профиля */}
      {showOptimizeModal && (
        <div className="optimize-modal-overlay">
          <div className="optimize-modal">
            <div className="optimize-modal-header">
              <h3>Выберите профиль оптимизации</h3>
              <button 
                onClick={() => setShowOptimizeModal(false)}
                className="optimize-modal-close"
              >
                ×
              </button>
            </div>
            
            <div className="optimize-modal-content">
              <div className="profile-selection">
                {profiles.map(profile => (
                  <div 
                    key={profile.id}
                    className={`profile-option ${selectedProfile === profile.id ? 'selected' : ''}`}
                    onClick={() => setSelectedProfile(profile.id)}
                  >
                    <div className="profile-name">{profile.name}</div>
                    <div className="profile-description">{profile.description}</div>
                  </div>
                ))}
              </div>
              
              <div className="optimize-modal-actions">
                <button 
                  onClick={() => setShowOptimizeModal(false)}
                  className="cancel-btn"
                >
                  Отмена
                </button>
                <button 
                  onClick={optimizeDatabase}
                  className="apply-btn"
                >
                  Применить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 
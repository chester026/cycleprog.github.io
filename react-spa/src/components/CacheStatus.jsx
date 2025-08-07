import React, { useState, useEffect } from 'react';
import { cacheCheckup, CHECKUP_STATUS } from '../utils/cacheCheckup';
import './CacheStatus.css';

export default function CacheStatus() {
  const [status, setStatus] = useState(CHECKUP_STATUS.PENDING);
  const [results, setResults] = useState({});
  const [recommendations, setRecommendations] = useState([]);
  const [executionResults, setExecutionResults] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);

  // Выполнить чек-ап при загрузке компонента
  useEffect(() => {
    performCheckup();
  }, []);

  const performCheckup = async () => {
    try {
      setStatus(CHECKUP_STATUS.IN_PROGRESS);
      const checkupResults = await cacheCheckup.performFullCheckup();
      setResults(checkupResults);
      
      const recs = cacheCheckup.getOptimizationRecommendations();
      setRecommendations(recs);
      
      setStatus(CHECKUP_STATUS.COMPLETED);
    } catch (error) {
      setStatus(CHECKUP_STATUS.ERROR);
      console.error('Ошибка чек-апа:', error);
    }
  };

  const executeOptimizations = async () => {
    try {
      const results = await cacheCheckup.executeRecommendations();
      setExecutionResults(results);
      
      // Перезапускаем чек-ап после оптимизации
      setTimeout(performCheckup, 1000);
    } catch (error) {
      console.error('Ошибка выполнения оптимизаций:', error);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'valid':
      case 'use_cache':
        return '✅';
      case 'missing':
      case 'fetch_from_api':
        return '⚠️';
      case 'expired':
      case 'refresh_cache':
        return '🔄';
      case 'error':
      case 'clear_and_refetch':
        return '❌';
      case 'mixed':
        return '🔄';
      case 'large':
        return '💾';
      case 'normal':
        return '✅';
      default:
        return '❓';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'valid':
      case 'use_cache':
      case 'normal':
        return 'green';
      case 'missing':
      case 'fetch_from_api':
        return 'orange';
      case 'expired':
      case 'refresh_cache':
      case 'mixed':
        return 'yellow';
      case 'error':
      case 'clear_and_refetch':
      case 'large':
        return 'red';
      default:
        return 'gray';
    }
  };

  if (status === CHECKUP_STATUS.PENDING) {
    return (
      <div className="cache-status">
        <div className="cache-status-header">
          <span>🔍 Проверка кэша...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="cache-status">
      <div 
        className="cache-status-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span>💾 Статус кэша</span>
        <span className="cache-status-toggle">
          {isExpanded ? '▼' : '▶'}
        </span>
      </div>

      {isExpanded && (
        <div className="cache-status-content">
          {/* Результаты чек-апа */}
          <div className="cache-results">
            <h4>Результаты проверки:</h4>
            
            {results.activities && results.activities.message && (
              <div className={`cache-result-item ${getStatusColor(results.activities.status)}`}>
                <span className="cache-result-icon">
                  {getStatusIcon(results.activities.status)}
                </span>
                <span className="cache-result-text">
                  {results.activities.message}
                </span>
              </div>
            )}

            {results.streams && results.streams.message && (
              <div className={`cache-result-item ${getStatusColor(results.streams.status)}`}>
                <span className="cache-result-icon">
                  {getStatusIcon(results.streams.status)}
                </span>
                <span className="cache-result-text">
                  {results.streams.message}
                </span>
              </div>
            )}

            {results.goals && results.goals.message && (
              <div className={`cache-result-item ${getStatusColor(results.goals.status)}`}>
                <span className="cache-result-icon">
                  {getStatusIcon(results.goals.status)}
                </span>
                <span className="cache-result-text">
                  {results.goals.message}
                </span>
              </div>
            )}

            {results.size && results.size.message && (
              <div className={`cache-result-item ${getStatusColor(results.size.status)}`}>
                <span className="cache-result-icon">
                  {getStatusIcon(results.size.status)}
                </span>
                <span className="cache-result-text">
                  {results.size.message}
                </span>
              </div>
            )}
          </div>

          {/* Рекомендации */}
          {recommendations.length > 0 && (
            <div className="cache-recommendations">
              <h4>Рекомендации по оптимизации:</h4>
              
              {recommendations.map((rec, index) => (
                <div key={index} className={`cache-recommendation ${rec.priority}`}>
                  <div className="cache-recommendation-header">
                    <span className="cache-recommendation-priority">
                      {rec.priority === 'high' ? '🔴' : '🟡'} {rec.priority.toUpperCase()}
                    </span>
                  </div>
                  <div className="cache-recommendation-action">
                    {rec.action}
                  </div>
                  <div className="cache-recommendation-impact">
                    💡 {rec.impact}
                  </div>
                </div>
              ))}

              <button 
                className="cache-optimize-btn"
                onClick={executeOptimizations}
                disabled={status === CHECKUP_STATUS.IN_PROGRESS}
              >
                {status === CHECKUP_STATUS.IN_PROGRESS ? 'Выполняется...' : 'Выполнить оптимизацию'}
              </button>
            </div>
          )}

          {/* Результаты выполнения */}
          {executionResults.length > 0 && (
            <div className="cache-execution-results">
              <h4>Результаты оптимизации:</h4>
              
              {executionResults.map((result, index) => (
                <div key={index} className={`cache-execution-result ${result.status}`}>
                  <span className="cache-execution-icon">
                    {result.status === 'success' ? '✅' : '❌'}
                  </span>
                  <span className="cache-execution-text">
                    {result.message}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Кнопки управления */}
          <div className="cache-actions">
            <button 
              className="cache-refresh-btn"
              onClick={performCheckup}
              disabled={status === CHECKUP_STATUS.IN_PROGRESS}
            >
              {status === CHECKUP_STATUS.IN_PROGRESS ? 'Проверка...' : 'Обновить статус'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 
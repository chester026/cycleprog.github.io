import React, { useState, useEffect, useRef } from 'react';

const ChartErrorBoundary = ({ children, fallback, onError, ...props }) => {
  const [error, setError] = useState(null);
  const [key, setKey] = useState(0);
  const prevDataRef = useRef(null);

  useEffect(() => {
    // Сбрасываем ошибку при изменении данных
    setError(null);
    
    // Обновляем ключ только если данные действительно изменились
    const currentData = JSON.stringify(props.data);
    if (prevDataRef.current !== currentData) {
      prevDataRef.current = currentData;
      setKey(prev => prev + 1);
    }
  }, [props.data]);

  const handleError = (error) => {
    console.error('Chart error:', error);
    setError(error);
    if (onError) {
      onError(error);
    }
  };

  if (error) {
    return fallback ? fallback(error) : (
      <div style={{ 
        color: '#ef4444', 
        textAlign: 'center', 
        padding: '20px',
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '8px',
        margin: '10px 0'
      }}>
        Ошибка отображения графика: {error.message || 'Неизвестная ошибка'}
      </div>
    );
  }

  return React.cloneElement(children, {
    key,
    onError: handleError,
    ...props
  });
};

export default ChartErrorBoundary; 
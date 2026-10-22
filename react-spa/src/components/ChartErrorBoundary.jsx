import React, { useState, useEffect, useRef } from 'react';
import { logError } from '../lib/log';

const ChartErrorBoundary = ({ children, fallback, onError, ...props }) => {
  const [error, setError] = useState(null);
  const [key, setKey] = useState(0);
  const prevDataRef = useRef(null);

  useEffect(() => {
    setError(null);
    
    // Remount the chart only when the data actually changed.
    const currentData = JSON.stringify(props.data);
    if (prevDataRef.current !== currentData) {
      prevDataRef.current = currentData;
      setKey(prev => prev + 1);
    }
  }, [props.data]);

  const handleError = (error) => {
    logError(error, 'Chart error');
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
        Chart rendering error: {error.message || 'Unknown error'}
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
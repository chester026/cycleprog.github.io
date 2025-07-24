import React, { useState, useEffect } from 'react';
import './PageLoadingOverlay.css';

const PageLoadingOverlay = ({ isLoading, loadingText = "Featching data & Analyzing..." }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setIsVisible(true);
      setIsFading(false);
    } else {
      setIsFading(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsFading(false);
      }, 500); // Wait for fade animation
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  if (!isVisible) return null;

  return (
    <div className={`page-loading-overlay ${isFading ? 'fade-out' : ''}`}>
      <div className="page-loading-content">
        <div className="page-loading-spinner"></div>
        <div className="page-loading-text">{loadingText}</div>
      </div>
    </div>
  );
};

export default PageLoadingOverlay; 
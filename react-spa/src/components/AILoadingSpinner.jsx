import React, { useState, useEffect } from 'react';
import './AILoadingSpinner.css';

const AILoadingSpinner = ({ isLoading = true, compact = false }) => {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  
  const messages = [
    { text: 'Processing your workout metrics'},
    { text: 'Finding patterns and trends'},
    { text: 'Building personalized advice'},
    { text: 'Preparing your report'}
  ];

  useEffect(() => {
    if (!isLoading) return;

    const interval = setInterval(() => {
      setCurrentMessageIndex((prevIndex) => 
        (prevIndex + 1) % messages.length
      );
    }, 2500); // Смена сообщения каждые 2 секунды

    return () => clearInterval(interval);
  }, [isLoading, messages.length]);

  if (!isLoading) return null;

  const currentMessage = messages[currentMessageIndex];

  return (
    <div className={`ai-loading-container ${compact ? 'ai-loading-compact' : ''}`}>
            <div className="ai-loading-text">
        <div className="ai-loading-spinner">
          <div className="ai-loading-dot"></div>
          <div className="ai-loading-dot"></div>
          <div className="ai-loading-dot"></div>
        </div>
        <span>{currentMessage.text}</span>
      </div>
     
    </div>
  );
};

export default AILoadingSpinner; 
import React from 'react';
import './TrainingCard.css';

const TrainingCard = ({ 
  title, 
  description, 
  intensity, 
  trainingType, 
  duration,
  onClick,
  size = 'normal', // 'normal' | 'large' (recovery) | 'small' (preferable)
  variant = 'priority', // 'priority', 'recovery', 'preferable', 'most-recommended'
  showBadge = false,
  badgeText = '',
  cardId = '',
  cardClass = ''
}) => {
  return (
    <div 
      id={cardId}
      className={`training-card training-card-${size} training-card-${variant} ${cardClass}`.trim()}
      data-training-type={trainingType}
    >
      <div className="training-card-content">
        {showBadge && badgeText && (
          <div className="training-card-badge">{badgeText}</div>
        )}
        <h3 className="training-card-title">{title}</h3>
        
        {description && (
          <p className="training-card-description">{description}</p>
        )}
        
        <div className="training-card-details">
          {intensity && (
            <div className="training-card-intensity">
              <span className="detail-label">Intensity:</span>
              <span className="detail-value">{intensity}</span>
            </div>
          )}
          {duration && (
            <div className="training-card-duration">
              <span className="detail-label">Duration:</span>
              <span className="detail-value">{duration} min</span>
            </div>
          )}
        </div>
        
        <button type="button" 
          className="training-card-btn"
          onClick={onClick}
        >
          How to train →
        </button>
      </div>
    </div>
  );
};

export default TrainingCard;


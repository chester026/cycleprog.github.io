import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import EventsManager from './EventsManager';
import './EventsHero.css';

export default function EventsHero({ children }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showManager, setShowManager] = useState(false);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [autoSlideEnabled, setAutoSlideEnabled] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const intervalRef = React.useRef(null);

  useEffect(() => {
    loadEvents();
  }, []);

  // Автоматическое переключение карусели
  useEffect(() => {
    if (events.length > 1 && autoSlideEnabled && !isHovered && !isTransitioning) {
      intervalRef.current = setInterval(() => {
        setIsTransitioning(true);
        setTimeout(() => {
          setCurrentEventIndex((prev) => {
            const newIndex = (prev + 1) % events.length;
            setTimeout(() => setIsTransitioning(false), 150);
            return newIndex;
          });
        }, 150);
      }, 10000); // 10 секунд
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    // Очистка интервала при размонтировании
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [events.length, autoSlideEnabled, isHovered, isTransitioning]);

  const loadEvents = async () => {
    try {
      const data = await apiFetch('/api/events');
      setEvents(data);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManagerClose = () => {
    setShowManager(false);
    loadEvents(); // Refresh events after closing manager
  };

  const animatedTransition = (newIndex) => {
    if (isTransitioning) return; // Предотвращаем множественные переключения
    
    setIsTransitioning(true);
    
    // Fade out
    setTimeout(() => {
      setCurrentEventIndex(newIndex);
      // Fade in
      setTimeout(() => {
        setIsTransitioning(false);
      }, 150);
    }, 150);
  };

  const nextEvent = () => {
    const newIndex = (currentEventIndex + 1) % events.length;
    animatedTransition(newIndex);
    // Временно отключаем автопрокрутку при ручном управлении
    setAutoSlideEnabled(false);
    setTimeout(() => setAutoSlideEnabled(true), 15000); // Возобновляем через 15 секунд
  };

  const prevEvent = () => {
    const newIndex = (currentEventIndex - 1 + events.length) % events.length;
    animatedTransition(newIndex);
    // Временно отключаем автопрокрутку при ручном управлении
    setAutoSlideEnabled(false);
    setTimeout(() => setAutoSlideEnabled(true), 15000); // Возобновляем через 15 секунд
  };

  const goToEvent = (index) => {
    if (index === currentEventIndex) return; // Не переключаемся на тот же слайд
    animatedTransition(index);
    // Временно отключаем автопрокрутку при ручном управлении
    setAutoSlideEnabled(false);
    setTimeout(() => setAutoSlideEnabled(true), 15000); // Возобновляем через 15 секунд
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="gfc-event-hero-row">
        <div className="gfc-event-hero" style={{ background: '#274DD3' }}>
          <div className="gfc-event-hero-content">
            <div className="loading-events">Loading events...</div>
          </div>
        </div>
        <div className="gfc-event-side">
          <h2 className="gfc-event-title-big">MY RIDES</h2>
          <div className="gfc-event-my-rides-block">
            {children}
          </div>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <>
        <div className="events-manage-btn-container">
          <button 
            className="accent-btn events-manage-btn"
            onClick={() => setShowManager(true)}
          >
            Manage events
          </button>
        </div>
        
        <div className="gfc-event-hero-row">
          <div className="gfc-event-hero" style={{ background: '#f8f9fa' }}>
            <div className="gfc-event-hero-content">
              <div className="empty-events-state">
                <h3>No upcoming events</h3>
                <p>Сюда можно добавлять предстоящие путешествия или соревнования</p>
                <button 
                  className="accent-btn"
                  onClick={() => setShowManager(true)}
                >
                  Add Event
                </button>
              </div>
            </div>
          </div>
          <div className="gfc-event-side">
            <h2 className="gfc-event-title-big">MY RIDES</h2>
            <div className="gfc-event-my-rides-block">
              {children}
            </div>
          </div>
        </div>

        <EventsManager 
          isOpen={showManager} 
          onClose={handleManagerClose}
        />
      </>
    );
  }

  const currentEvent = events[currentEventIndex];

  return (
    <>
     
      
      <div className="gfc-event-hero-row">
        <div 
          className="gfc-event-hero" 
          style={{ background: currentEvent.background_color }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >


          <div className={`gfc-event-hero-content ${isTransitioning ? 'transitioning' : ''}`}>
           
            
            <div className="gfc-event-title">{currentEvent.title}</div>
            <div className="gfc-event-date">{formatDate(currentEvent.start_date)}</div>
            
            {currentEvent.description && (
              <div className="gfc-event-desc">
                {currentEvent.description.split('\n').map((line, index) => (
                  <span key={index}>
                    {line}
                    {index < currentEvent.description.split('\n').length - 1 && <br />}
                  </span>
                ))}
              </div>
            )}
            
            {currentEvent.link && (
              <a 
                href={currentEvent.link} 
                target="_blank" 
                rel="noopener noreferrer"
                className="gfc-event-link"
              >
                View Details →
              </a>
            )}
            
           
          </div>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: '#00000017', marginTop: '32px'}}>

             <div className="events-manage-btn-container">
                <button 
                className="accent-btn events-manage-btn"
                onClick={() => setShowManager(true)}
                >
                Manage events
                </button>
            </div>

            {events.length > 1 && (
              <div className="event-dots">
                {events.map((_, index) => (
                  <button
                    key={index}
                    className={`event-dot ${index === currentEventIndex ? 'active' : ''}`}
                    onClick={() => goToEvent(index)}
                    aria-label={`Go to event ${index + 1}`}
                  />
                ))}
              </div>
            )}

            {events.length > 1 && (
              <div className="event-carousel-controls">
              
                <span className="carousel-indicator">
                  {currentEventIndex + 1} <span style={{ fontSize: '45px', opacity: '0.5' }}> / </span>{events.length}
                 
                </span>
               
              </div>
            )}
             {autoSlideEnabled && !isHovered && (
                    <span className="auto-indicator" title="Auto-sliding every 10 seconds">●</span>
                  )}
            </div>
        </div>
        
        <div className="gfc-event-side">
          <h2 className="gfc-event-title-big">MY RIDES</h2>
          <div className="gfc-event-my-rides-block">
            {children}
          </div>
        </div>
      </div>

      <EventsManager 
        isOpen={showManager} 
        onClose={handleManagerClose}
      />
    </>
  );
}

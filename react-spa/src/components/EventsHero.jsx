import React, { useState, useEffect } from 'react';
import { useEvents } from '../data/hooks';
import EventsManager from './EventsManager';
import { ErrorMessage, Skeleton } from '../ui';
import './EventsHero.css';

const AUTO_SLIDE_INTERVAL_MS = 10000;
const MANUAL_NAV_PAUSE_MS = 15000;
const FADE_MS = 150;

export default function EventsHero() {
  const { data: events = [], isLoading, isError, error } = useEvents();
  const [showManager, setShowManager] = useState(false);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [autoSlideEnabled, setAutoSlideEnabled] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const intervalRef = React.useRef(null);

  // Auto-advance the carousel; paused while hovered or mid-transition.
  useEffect(() => {
    if (events.length > 1 && autoSlideEnabled && !isHovered && !isTransitioning) {
      intervalRef.current = setInterval(() => {
        setIsTransitioning(true);
        setTimeout(() => {
          setCurrentEventIndex((prev) => {
            const newIndex = (prev + 1) % events.length;
            setTimeout(() => setIsTransitioning(false), FADE_MS);
            return newIndex;
          });
        }, FADE_MS);
      }, AUTO_SLIDE_INTERVAL_MS);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [events.length, autoSlideEnabled, isHovered, isTransitioning]);

  const handleManagerClose = () => {
    setShowManager(false);
    // Events refetch on their own via the shared query cache (EventsManager's
    // mutations invalidate `queryKeys.events`) — no manual reload needed.
  };

  const animatedTransition = (newIndex) => {
    if (isTransitioning) return;
    
    setIsTransitioning(true);
    
    // Fade out
    setTimeout(() => {
      setCurrentEventIndex(newIndex);
      // Fade in
      setTimeout(() => {
        setIsTransitioning(false);
      }, FADE_MS);
    }, FADE_MS);
  };

  // T-6.3 (audit W-26): dropped `nextEvent`/`prevEvent` — dead code, no
  // prev/next arrow buttons call them (only the dot navigation via
  // `goToEvent` is rendered).
  const goToEvent = (index) => {
    if (index === currentEventIndex) return;
    animatedTransition(index);
    // Manual navigation pauses auto-slide for a while so the slide the user
    // picked isn't swapped out from under them.
    setAutoSlideEnabled(false);
    setTimeout(() => setAutoSlideEnabled(true), MANUAL_NAV_PAUSE_MS);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="gfc-event-hero-row">
        <div className="gfc-event-hero" style={{ background: 'var(--accent)' }}>
          <div className="gfc-event-hero-content">
            <Skeleton label="Loading events" width="60%" height={44} radius={8} />
            <Skeleton width="35%" height={20} radius={6} style={{ marginTop: 12 }} />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="gfc-event-hero-row">
        <div className="gfc-event-hero" style={{ background: '#f8f9fa' }}>
          <div className="gfc-event-hero-content">
            <ErrorMessage>Couldn&apos;t load events: {error?.message || 'unknown error'}</ErrorMessage>
          </div>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <>
        <div className="events-manage-btn-container">
          <button type="button" 
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
                <p>Add upcoming trips or races here</p>
                <button type="button" 
                  className="accent-btn"
                  onClick={() => setShowManager(true)}
                >
                  Add Event
                </button>
              </div>
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
                <button type="button" 
                className="accent-btn events-manage-btn"
                onClick={() => setShowManager(true)}
                >
                Manage events
                </button>
            </div>

            {events.length > 1 && (
              <div className="event-dots">
                {events.map((_, index) => (
                  <button type="button"
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
      </div>

      <EventsManager
        isOpen={showManager} 
        onClose={handleManagerClose}
      />
    </>
  );
}

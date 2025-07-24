import React, { useEffect, useState, useRef, lazy, Suspense } from 'react';
import './HeroTrackBanner.css';
import { MapContainer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import polyline from '@mapbox/polyline';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import { heroImagesUtils } from '../utils/heroImages';
import { apiFetch } from '../utils/api';
import { jwtDecode } from 'jwt-decode';
import defaultHeroImage from '../assets/img/hero/bike_bg.webp';

// Lazy load TileLayer to reduce initial bundle size
const TileLayer = lazy(() => import('react-leaflet').then(module => ({ default: module.TileLayer })));

// Map loading component
const MapLoader = () => (
  <div style={{
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    color: '#666',
    fontSize: '14px'
  }}>
    Loading map...
  </div>
);

// Component for automatic map scaling
function MapBounds({ positions }) {
  const map = useMap();
  
  useEffect(() => {
    if (positions && positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [18, 18] });
    }
  }, [positions, map]);
  
  return null;
}

const AnalysisModal = React.memo(({ open, onClose, lastRide }) => {
  if (!open) return null;
  if (!lastRide) return (
    <div className="analysis-modal-overlay" onClick={onClose}>
      <div className="analysis-modal" onClick={e => e.stopPropagation()}>
        <h2>Analysis</h2>
        <div style={{color:'#888'}}>No data for analysis</div>
        <button className="modal-close-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );

  // Determine workout type
  let type = 'Regular';
  if (lastRide.distance && lastRide.distance/1000 > 60) type = 'Long';
  else if (lastRide.average_speed && lastRide.average_speed*3.6 < 20 && lastRide.moving_time && lastRide.moving_time/60 < 60) type = 'Recovery';
  else if (lastRide.total_elevation_gain && lastRide.total_elevation_gain > 800) type = 'Mountain';
  else if ((lastRide.name||'').toLowerCase().includes('интервал') || (lastRide.type||'').toLowerCase().includes('interval')) type = 'Interval';

  // Generate advice
  const generateAdvice = () => {
    const advice = [];
    if (lastRide.average_speed && lastRide.average_speed*3.6 < 25) {
      advice.push('Average speed below 25 km/h. To improve speed, include interval training (e.g., 4×4 min in Z4-Z5 with 4 min rest), work on pedaling technique (cadence 90-100), monitor body position on the bike and aerodynamics.');
    }
    if (lastRide.average_heartrate && lastRide.average_heartrate > 155) {
      advice.push('Heart rate above 155 bpm. This may indicate high intensity or insufficient recovery. Check sleep quality, stress levels, add recovery workouts, monitor hydration and nutrition.');
    }
    if (lastRide.total_elevation_gain && lastRide.total_elevation_gain > 500 && lastRide.average_speed*3.6 < 18) {
      advice.push('Mountain workout with low speed. To improve results, add strength training off the bike and hill intervals (e.g., 5×5 min in Z4).');
    }
    if (!lastRide.average_heartrate) {
      advice.push('No heart rate data. Add a heart rate sensor for more accurate intensity and recovery monitoring.');
    }
    if (!lastRide.distance || lastRide.distance/1000 < 30) {
      advice.push('Short distance. For endurance development, plan at least one long ride (60+ km) per week. Gradually increase distance, don\'t forget nutrition and hydration on the road.');
    }
    if (type === 'Recovery') {
      advice.push('Recovery workout. Excellent! Don\'t forget to alternate such workouts with interval and long rides for progress.');
    }
    if (type === 'Interval' && lastRide.average_heartrate && lastRide.average_heartrate < 140) {
      advice.push('Interval workout with low heart rate. Intervals should be performed with higher intensity (Z4-Z5) to get maximum training effect.');
    }
    if (!lastRide.average_cadence) {
      advice.push('No cadence data. Using a cadence sensor will help track pedaling technique and avoid excessive fatigue.');
    }
    if (advice.length === 0) {
      advice.push('Workout completed excellently! Keep up the good work and gradually increase load for further progress.');
    }
    return advice;
  };

  const advice = generateAdvice();

  return (
    <div className="analysis-modal-overlay" onClick={onClose}>
      <div className="analysis-modal" onClick={e => e.stopPropagation()}>
        <h2 style={{marginTop: 0, color: '#333'}}>Ride Analysis</h2>
        <div style={{marginBottom: '0.7em', color: '#888'}}>
          {lastRide.start_date ? new Date(lastRide.start_date).toLocaleString() : ''}
        </div>
        
        {/* Metrics */}
        <div style={{marginBottom: '1em'}}>
          <b style={{color: '#333'}}>Distance:</b> <span style={{color: '#333'}}>{lastRide.distance ? (lastRide.distance/1000).toFixed(1) + ' km' : '—'}</span><br/>
          <b style={{color: '#333'}}>Time:</b> <span style={{color: '#333'}}>{lastRide.moving_time ? (lastRide.moving_time/60).toFixed(0) + ' min' : '—'}</span><br/>
          <b style={{color: '#333'}}>Average speed:</b> <span style={{color: '#333'}}>{lastRide.average_speed ? (lastRide.average_speed*3.6).toFixed(1) + ' km/h' : '—'}</span><br/>
          <b style={{color: '#333'}}>Max speed:</b> <span style={{color: '#333'}}>{lastRide.max_speed ? (lastRide.max_speed*3.6).toFixed(1) + ' km/h' : '—'}</span><br/>
          <b style={{color: '#333'}}>Elevation gain:</b> <span style={{color: '#333'}}>{lastRide.total_elevation_gain ? Math.round(lastRide.total_elevation_gain) + ' m' : '—'}</span><br/>
          <b style={{color: '#333'}}>Average heart rate:</b> <span style={{color: lastRide.average_heartrate ? (lastRide.average_heartrate < 145 ? '#4caf50' : lastRide.average_heartrate < 160 ? '#ff9800' : '#e53935') : '#888', fontWeight: '600'}}>{lastRide.average_heartrate ? Math.round(lastRide.average_heartrate) + ' bpm' : '—'}</span><br/>
          <b style={{color: '#333'}}>Max heart rate:</b> <span style={{color: '#333'}}>{lastRide.max_heartrate ? Math.round(lastRide.max_heartrate) + ' bpm' : '—'}</span><br/>
          <b style={{color: '#333'}}>Cadence:</b> <span style={{color: '#333'}}>{lastRide.average_cadence ? Math.round(lastRide.average_cadence) + ' rpm' : '—'}</span><br/>
          <b style={{color: '#333'}}>Type:</b> <span style={{color: '#333'}}>{type}</span><br/>
        </div>
        
        {/* Advice */}
        <hr style={{margin: '1em 0', borderColor: '#ddd'}}/>
        <b style={{color: '#333'}}>What to improve:</b>
        <ul style={{margin: '0.5em 0 0 1.2em', padding: 0, color: '#333'}}>
          {advice.map((item, index) => (
            <li key={index} style={{color: '#333', marginBottom: '0.5em'}}><b>{item.split('.')[0]}.</b> {item.split('.').slice(1).join('.')}</li>
          ))}
        </ul>
        
        <button className="modal-close-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
});

export default function HeroTrackBanner() {
  const [lastRide, setLastRide] = useState(null);
  const [trackCoords, setTrackCoords] = useState(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [heroImage, setHeroImage] = useState(null);
  const [period, setPeriod] = useState(null);
  const [summary, setSummary] = useState(null);

  console.log('HeroTrackBanner: Component rendered');

  useEffect(() => {
    console.log('HeroTrackBanner: useEffect triggered');
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    let userId = null, stravaId = null;
    try {
      const decoded = jwtDecode(token);
      userId = decoded.userId;
      stravaId = decoded.strava_id;
    } catch {}
    if (userId && !stravaId) {
      localStorage.removeItem(`cycleprog_cache_activities_${userId}`);
    }
    fetchLastRide();
    fetchHeroImage();
    fetchPeriodAndSummary();
  }, []);

  const fetchPeriodAndSummary = async () => {
    try {
      const res = await apiFetch('/api/analytics/summary');
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.period) setPeriod(data.period);
      if (data && data.summary) setSummary(data.summary);
    } catch (e) {
      console.error('Error loading period and summary:', e);
    } finally {
      // setLoadingState('analytics', false); // Removed as per edit hint
    }
  };

  // Get userId from token
  function getUserId() {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) return null;
    try {
      const decoded = jwtDecode(token);
      return decoded.userId;
    } catch {
      return null;
    }
  }

  const fetchLastRide = async () => {
    try {
      const userId = getUserId();
      const cacheKey = userId ? `activities_${userId}` : CACHE_KEYS.ACTIVITIES;
      // First check cache
      const cachedActivities = cacheUtils.get(cacheKey);
      
      if (cachedActivities && cachedActivities.length > 0) {
        // Use cached data
        const last = cachedActivities.slice().sort((a, b) => new Date(b.start_date) - new Date(a.start_date))[0];
        setLastRide(last);
        if (last && last.map && last.map.summary_polyline) {
          const coords = polyline.decode(last.map.summary_polyline);
          setTrackCoords(coords.map(([lat, lng]) => [lat, lng]));
        }
        // setLoadingState('activities', false); // Removed as per edit hint
        return;
      }

      // If no cache, make request to server
      const res = await apiFetch('/api/activities');
      
      if (res.status === 429) {
        console.warn('Rate limit exceeded, using cached data if available');
        // setLoadingState('activities', false); // Removed as per edit hint
        return;
      }
      
      if (!res.ok) {
        console.error('Error loading data:', res.status);
        // setLoadingState('activities', false); // Removed as per edit hint
        return;
      }
      
      const activities = await res.json();
      if (!activities.length) {
        // setLoadingState('activities', false); // Removed as per edit hint
        return;
      }
      
      // Save to cache for 30 minutes
      cacheUtils.set(cacheKey, activities, 30 * 60 * 1000);
      
      // Find the most recent workout
      const last = activities.slice().sort((a, b) => new Date(b.start_date) - new Date(a.start_date))[0];
      setLastRide(last);
      if (last && last.map && last.map.summary_polyline) {
        const coords = polyline.decode(last.map.summary_polyline);
        setTrackCoords(coords.map(([lat, lng]) => [lat, lng]));
      }
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      console.log('HeroTrackBanner: fetchLastRide finished');
      // setLoadingState('activities', false); // Removed as per edit hint
    }
  };

  const fetchHeroImage = async () => {
    try {
      const imageFilename = await heroImagesUtils.getHeroImage('garage');
      if (imageFilename) {
        setHeroImage(heroImagesUtils.getImageUrl(imageFilename));
      }
    } catch (error) {
      console.error('Error loading hero image:', error);
    } finally {
      // setLoadingState('heroImages', false); // Removed as per edit hint
    }
  };

  // Metrics now only from last ride (lastRide)
  const distance = lastRide?.distance ? (lastRide.distance / 1000).toFixed(1) : '—';
  const elev = lastRide?.total_elevation_gain ? Math.round(lastRide.total_elevation_gain) : '—';
  const speed = lastRide?.average_speed ? (lastRide.average_speed * 3.6).toFixed(1) : '—';
  // const dateStr = lastRide?.start_date ? new Date(lastRide.start_date).toLocaleDateString() : '—';

  // Period formatting
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Map center
  const mapCenter = trackCoords && trackCoords.length ? trackCoords[0] : [34.776, 32.424]; // Cyprus by default

  return (
    <div id="garage-hero-track-banner" className="plan-hero garage-hero" style={{
      backgroundImage: heroImage ? `url(${heroImage})` : `url(${defaultHeroImage})`, 
      minHeight: 480, 
      display: 'flex', 
      alignItems: 'center', 
      gap: 0, 
      padding: 0
    }}>
      <div style={{flex: '1 1 658px', minWidth: 520, maxWidth: 765}}>
        <div className="garage-hero-map" style={{width: '100%', height: 440, background: 'transparent', borderRadius: 0}}>
          {lastRide && trackCoords ? (
            <Suspense fallback={<MapLoader />}>
              <MapContainer
                center={mapCenter}
                zoom={13}
                style={{ width: '100%', height: '100%', borderRadius: 0 }}
                scrollWheelZoom={false}
                dragging={false}
                doubleClickZoom={false}
                boxZoom={false}
                keyboard={false}
                zoomControl={false}
                attributionControl={false}
                touchZoom={false}
              >
                <Polyline positions={trackCoords} color="#fff" weight={3} />
                <MapBounds positions={trackCoords} />
                {trackCoords && trackCoords.length > 0 && (
                  <CircleMarker center={trackCoords[0]} radius={7} color="#fff" fillColor="#274DD3" fillOpacity={1} />
                )}
              </MapContainer>
            </Suspense>
          ) : (
            <MapLoader />
          )}
        </div>
      </div>
      <div style={{flex: '2 1 320px', minWidth: 260, alignItems: 'flex-start', display: 'flex', flexDirection: 'column'}}>
        {/* 4-WEEK CYCLE PERIOD */}
        <div style={{display: 'flex', alignItems: 'center', gap: '0.5em', marginBottom: '1.2em'}}>
          <h1 style={{fontSize: '0.9em', fontWeight: 600, margin: 0, color: '#fff', textAlign: 'left'}}>Last ride track</h1>
          <div className="garage-hero-date" style={{fontSize: '1.1em', color: '#fff', opacity: 0.85}}>
            {lastRide?.start_date ? new Date(lastRide.start_date).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
          </div>
        </div>
        <div className="hero-track-cards" style={{display: 'flex', gap: '2em', marginTop: '16px', marginBottom: '1.2em', alignItems: 'flex-end', justifyContent: 'flex-start'}}>
          <div className="total-card" style={{padding: '0 0px', textAlign: 'left'}}>
            <div className="total-label" style={{textAlign: 'left'}}>Distance</div>
            <span className="metric-value"><span className="big-number" style={{fontSize: 40, textAlign: 'left'}}>{distance}</span><span className="unit">km</span></span>
          </div>
          <div className="total-card" style={{padding: '0 0px', textAlign: 'left'}}>
            <div className="total-label" style={{textAlign: 'left'}}>Avg speed</div>
            <span className="metric-value"><span className="big-number" style={{fontSize: 40, textAlign: 'left'}}>{speed}</span><span className="unit">km/h</span></span>
          </div>
          <div className="total-card" style={{padding: '0 0px', textAlign: 'left'}}>
            <div className="total-label" style={{textAlign: 'left'}}>Elevation</div>
            <span className="metric-value"><span className="big-number" style={{fontSize: 40, textAlign: 'left'}}>{elev}</span><span className="unit">m</span></span>
          </div>
        </div>
        {/* Analysis button */}
        <button className="analysis-btn" onClick={() => setShowAnalysis(true)}>
          Analyze
        </button>
        {/* Modal */}
        <AnalysisModal open={showAnalysis} onClose={() => setShowAnalysis(false)} lastRide={lastRide} />
      </div>
    </div>
  );
} 
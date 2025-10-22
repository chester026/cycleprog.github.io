import React, { useEffect, useState, useRef, lazy, Suspense } from 'react';
import './HeroTrackBanner.css';
import { MapContainer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import polyline from '@mapbox/polyline';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import { heroImagesUtils } from '../utils/heroImages';
import { apiFetch } from '../utils/api';
import { jwtDecode } from 'jwt-decode';
import StravaLogo from './StravaLogo';
import PartnersLogo from './PartnersLogo';
import garminLogoSvg from '../assets/img/logo/garmin_white.png';
import defaultHeroImage from '../assets/img/hero/bike_bg.webp';


// Lazy load TileLayer to reduce initial bundle size
const TileLayer = lazy(() => import('react-leaflet').then(module => ({ default: module.TileLayer })));

// Map loading component
const MapLoader = () => (
  <div className="map-loader">
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
        <div className="analysis-modal-no-data">No data for analysis</div>
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
        <h2 className="analysis-modal-title">Ride Analysis</h2>
        <div className="analysis-modal-date">
                      {lastRide.start_date ? new Date(lastRide.start_date).toLocaleString('ru-RU') : ''}
        </div>
        
        {/* Metrics */}
        <div className="analysis-modal-metrics">
          <b>Distance:</b> <span>{lastRide.distance ? (lastRide.distance/1000).toFixed(1) + ' km' : '—'}</span><br/>
          <b>Time:</b> <span>{lastRide.moving_time ? (lastRide.moving_time/60).toFixed(0) + ' min' : '—'}</span><br/>
          <b>Average speed:</b> <span>{lastRide.average_speed ? (lastRide.average_speed*3.6).toFixed(1) + ' km/h' : '—'}</span><br/>
          <b>Max speed:</b> <span>{lastRide.max_speed ? (lastRide.max_speed*3.6).toFixed(1) + ' km/h' : '—'}</span><br/>
          <b>Elevation gain:</b> <span>{lastRide.total_elevation_gain ? Math.round(lastRide.total_elevation_gain) + ' m' : '—'}</span><br/>
          <b>Average heart rate:</b> <span className="analysis-modal-hr-value" style={{color: lastRide.average_heartrate ? (lastRide.average_heartrate < 145 ? '#4caf50' : lastRide.average_heartrate < 160 ? '#ff9800' : '#e53935') : '#888'}}>{lastRide.average_heartrate ? Math.round(lastRide.average_heartrate) + ' bpm' : '—'}</span><br/>
          <b>Max heart rate:</b> <span>{lastRide.max_heartrate ? Math.round(lastRide.max_heartrate) + ' bpm' : '—'}</span><br/>
          <b>Cadence:</b> <span>{lastRide.average_cadence ? Math.round(lastRide.average_cadence) + ' rpm' : '—'}</span><br/>
          <b>Type:</b> <span>{type}</span><br/>
        </div>
        
        {/* Advice */}
        <hr className="analysis-modal-hr"/>
        <b className="analysis-modal-advice-title">What to improve:</b>
        <ul className="analysis-modal-advice-list">
          {advice.map((item, index) => (
            <li key={index} className="analysis-modal-advice-item"><b>{item.split('.')[0]}.</b> {item.split('.').slice(1).join('.')}</li>
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
  const [activities, setActivities] = useState([]);



  useEffect(() => {

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
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    try {
      const getUserId = () => {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) return null;
        try {
          const decoded = jwtDecode(token);
          return decoded.userId;
        } catch {
          return null;
        }
      };

      const userId = getUserId();
      const cacheKey = userId ? `activities_${userId}` : CACHE_KEYS.ACTIVITIES;
      
      // Проверяем кэш
      const cachedActivities = cacheUtils.get(cacheKey);
      if (cachedActivities && cachedActivities.length > 0) {
        setActivities(cachedActivities);
        return;
      }

      const data = await apiFetch('/api/activities');
      
      // Сохраняем в кэш на 30 минут
      cacheUtils.set(cacheKey, data, 30 * 60 * 1000);
      
      setActivities(data);
    } catch (err) {
      console.error('Error fetching activities:', err);
    }
  };

  const fetchPeriodAndSummary = async () => {
    try {
      const data = await apiFetch('/api/analytics/summary');
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
        // Use cached data - filter only rides
        const rides = cachedActivities.filter(activity => activity.type === 'Ride');
        if (rides.length > 0) {
          const last = rides.slice().sort((a, b) => new Date(b.start_date) - new Date(a.start_date))[0];
          setLastRide(last);
          if (last && last.map && last.map.summary_polyline) {
            const coords = polyline.decode(last.map.summary_polyline);
            setTrackCoords(coords.map(([lat, lng]) => [lat, lng]));
          }
        }
        // setLoadingState('activities', false); // Removed as per edit hint
        return;
      }

      // If no cache, make request to server
      const activities = await apiFetch('/api/activities');
      
      if (!activities.length) {
        // setLoadingState('activities', false); // Removed as per edit hint
        return;
      }
      
      // Save to cache for 30 minutes
      cacheUtils.set(cacheKey, activities, 30 * 60 * 1000);
      
      // Filter only rides and find the most recent one
      const rides = activities.filter(activity => activity.type === 'Ride');
      if (rides.length > 0) {
        const last = rides.slice().sort((a, b) => new Date(b.start_date) - new Date(a.start_date))[0];
        setLastRide(last);
        if (last && last.map && last.map.summary_polyline) {
          const coords = polyline.decode(last.map.summary_polyline);
          setTrackCoords(coords.map(([lat, lng]) => [lat, lng]));
        }
      }
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {

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
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Map center
  const mapCenter = trackCoords && trackCoords.length ? trackCoords[0] : [34.776, 32.424]; // Cyprus by default

  return (
    <div id="garage-hero-track-banner" className="plan-hero garage-hero" style={{
      backgroundImage: heroImage ? `url(${heroImage})` : `url(${defaultHeroImage})`
    }}>
      <PartnersLogo
              logoSrc={garminLogoSvg}
              alt="Powered by Garmin"
              height="32px"
              position="absolute"
              top="57px"
              right="auto"
              style={{ right: '8px' }}
              opacity={1}
              hoverOpacity={1}
              activities={activities}
              showOnlyForBrands={['Garmin']}
            />
      <StravaLogo />
      <div className="garage-hero-map-container">
        <div className="garage-hero-map">
          {lastRide && trackCoords ? (
            <Suspense fallback={<MapLoader />}>
              <MapContainer
                center={mapCenter}
                zoom={13}
                className="map-container-style"
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
      <div className="garage-hero-content">
        {/* 4-WEEK CYCLE PERIOD */}
        <div className="garage-hero-header">
          <h1 className="garage-hero-title">Last ride track</h1>
          <div className="garage-hero-date garage-hero-date-text">
            {lastRide?.start_date ? new Date(lastRide.start_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
          </div>
        </div>
        <div className="hero-track-cards">
          <div className="total-card">
            <div className="total-label">Distance<span className="unit">, km</span></div>
            <span className="metric-value"><span className="big-number">{distance}</span></span>
          </div>
          <div className="total-card">
            <div className="total-label">Avg speed<span className="unit">, km/h</span></div>
            <span className="metric-value"><span className="big-number">{speed}</span></span>
          </div>
          <div className="total-card">
            <div className="total-label">Elevation<span className="unit">, m</span></div>
            <span className="metric-value"><span className="big-number">{elev}</span></span>
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
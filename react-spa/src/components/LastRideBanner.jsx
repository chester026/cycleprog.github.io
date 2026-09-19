import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './LastRideBanner.css';
import { useActivities } from '../data/hooks';

// T-6.4 (audit W-18): replaces the old localStorage `cycleprog_cache_*`
// TTL cache + manual setTimeout retry loop with the shared `useActivities()`
// query. Retry/429 handling is now whatever `queryClient.js` already does
// (retry: 1) — no bespoke retry-count state here; a failed/rate-limited
// fetch just leaves the banner hidden until the query succeeds.
export default function LastRideBanner() {
  const navigate = useNavigate();
  const { data: activities } = useActivities();

  const lastRide = useMemo(() => {
    if (!activities?.length) return null;
    const rides = activities.filter((activity) => ['Ride', 'VirtualRide'].includes(activity.type));
    if (!rides.length) return null;
    return rides.slice().sort((a, b) => new Date(b.start_date) - new Date(a.start_date))[0] || null;
  }, [activities]);

  if (!lastRide) return null;

  const dateStr = lastRide.start_date ? new Date(lastRide.start_date).toLocaleDateString('en-GB') : '—';
  const dist = lastRide.distance ? (lastRide.distance / 1000).toFixed(1) + ' km' : '—';
  const speed = lastRide.average_speed ? (lastRide.average_speed * 3.6).toFixed(1) + ' km/h' : '—';
  const hr = lastRide.average_heartrate ? Math.round(lastRide.average_heartrate) + ' bpm' : '—';
  const cd = lastRide.average_cadence ? Math.round(lastRide.average_cadence) + ' rpm' : '—';

  return (
    <div id="last-ride-banner">
      <div className="banner-img-block">
        <div className="banner-img-title">New ride</div>
        <div style={{ position: 'relative', fontSize: '10px', fontWeight: 600, top: '45px', left: '20px' }}><span className='banner-meta'>Date:</span> <span className='banner-value'>{dateStr}</span></div>
      </div>
      <div className="banner-black-block">

        <div><span className='banner-meta'>Distance:</span> <span className='banner-value'>{dist}</span></div>
        <div><span className='banner-meta'>Avg. speed:</span> <span className='banner-value'>{speed}</span></div>
        <div><span className='banner-meta'>Heart:</span> <span className='banner-value'>{hr}</span></div>
        <div><span className='banner-meta'>Cadence:</span> <span className='banner-value'>{cd}</span></div>
      </div>
      <div className="banner-btn-block">
        <button
          className="last-ride-more-btn"
          onClick={() => navigate('/garage')}
        >
          More
        </button>
      </div>
    </div>
  );
}

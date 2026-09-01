import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import polyline from '@mapbox/polyline';

import GarageLastRideCard from '../components/GarageLastRideCard';
import GarageWidgets from '../components/GarageWidgets';
import GarageAchievements from '../components/GarageAchievements';
import GarageCalculators from '../components/GarageCalculators';
import RideAnalysisModal from '../components/RideAnalysisModal';

import MyRidesBlock from '../components/MyRidesBlock';
import WeatherBlock from '../components/WeatherBlock';
import EventsHero from '../components/EventsHero';
import Footer from '../components/Footer';

import { apiFetch } from '../utils/api';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import {
  getUserId,
  loadActivities,
  pickLastRide,
  monthlyAvgSpeed,
  metricsFromActivities,
  loadSnapshot,
  loadSnapshotHistory,
  loadSummaryVo2max,
  mergeMetrics,
  computeMetricTrend,
  loadAchievements,
  pickGarageAchievements,
  loadUserProfile
} from '../utils/garageData';

import '../components/GarageApp.css';
import './GaragePage.css';

export default function GaragePage() {
  const navigate = useNavigate();

  const [lastRide, setLastRide] = useState(null);
  const [trackCoords, setTrackCoords] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [metricsTrend, setMetricsTrend] = useState(null);
  const [bikes, setBikes] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [showAnalysis, setShowAnalysis] = useState(false);

  // One /api/activities read feeds the ride card, the monthly speed chart and
  // the metric fallbacks, so the page does not fetch the same list three times.
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const activities = await loadActivities();
        if (!alive) return;

        const ride = pickLastRide(activities);
        setLastRide(ride);
        if (ride?.map?.summary_polyline) {
          setTrackCoords(polyline.decode(ride.map.summary_polyline).map(([lat, lng]) => [lat, lng]));
        }
        setMonthly(monthlyAvgSpeed(activities));

        const computed = metricsFromActivities(activities);
        const [snapshot, vo2max, snapshotHistory] = await Promise.all([
          loadSnapshot(),
          loadSummaryVo2max(),
          loadSnapshotHistory(2)
        ]);
        if (!alive) return;
        setMetrics(mergeMetrics(snapshot, computed, vo2max));
        setMetricsTrend(computeMetricTrend(snapshotHistory));
      } catch (e) {
        console.error('Garage: failed to load activities', e);
      }
    })();

    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      const userId = getUserId();
      const bikesKey = userId ? `${CACHE_KEYS.BIKES}_${userId}` : CACHE_KEYS.BIKES;

      const cachedBikes = cacheUtils.get(bikesKey);
      if (cachedBikes) {
        if (alive) setBikes(cachedBikes);
      } else {
        try {
          const data = await apiFetch('/api/bikes');
          const list = Array.isArray(data) ? data : [];
          cacheUtils.set(bikesKey, list, 6 * 60 * 60 * 1000);
          if (alive) setBikes(list);
        } catch (e) {
          console.error('Garage: failed to load bikes', e);
        }
      }

      const [ach, profile] = await Promise.all([loadAchievements(), loadUserProfile()]);
      if (!alive) return;
      setAchievements(pickGarageAchievements(ach));
      setUserProfile(profile);
    })();

    return () => { alive = false; };
  }, []);

  return (
    <div className="main-layout">
      <div className="main garage-app">
        <div className="garage-hero-row">
          <GarageLastRideCard
            lastRide={lastRide}
            trackCoords={trackCoords}
            onAnalyze={() => setShowAnalysis(true)}
          />
        </div>
        <h2 className="garage-title">Bike garage</h2>
        <GarageWidgets
          bikes={bikes}
          monthly={monthly}
          metrics={metrics}
          metricsTrend={metricsTrend}
          onOpenBikes={() => navigate('/analysis')}
        />

        <h2 className="garage-title">My Rides</h2>
        <div className="garage-myrides">
          <MyRidesBlock />
        </div>

        {achievements.length > 0 && (
          <>
            <h2 className="garage-title">Achieves</h2>
            <GarageAchievements achievements={achievements} />
          </>
        )}

        <GarageCalculators userProfile={userProfile} />

        <EventsHero />

        <WeatherBlock />
      </div>

      <Footer />

      <RideAnalysisModal
        open={showAnalysis}
        onClose={() => setShowAnalysis(false)}
        lastRide={lastRide}
      />
    </div>
  );
}

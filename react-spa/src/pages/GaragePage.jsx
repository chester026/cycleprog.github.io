import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import polyline from '@mapbox/polyline';

import GarageLastRideCard from '../components/GarageLastRideCard';
import GarageWidgets from '../components/GarageWidgets';
import GarageAchievements from '../components/GarageAchievements';
import GarageCalculators from '../components/GarageCalculators';
import RideAnalysisModal from '../components/RideAnalysisModal';

import MyRidesBlock from '../components/MyRidesBlock';
import ChecklistPreview from './garage/ChecklistPreview';
import WeatherBlock from '../components/WeatherBlock';
import EventsHero from '../components/EventsHero';
import Footer from '../components/Footer';

import {
  useActivities,
  useBikes,
  useAchievements,
  useProfile,
  useAnalyticsSummary,
  useAnalyticsSnapshotHistory,
} from '../data/hooks';
import {
  pickLastRide,
  monthlyAvgSpeed,
  metricsFromActivities,
  mergeMetrics,
  computeMetricTrend,
  pickGarageAchievements,
} from '../utils/garageData';

import '../components/GarageApp.css';
import './GaragePage.css';

export default function GaragePage() {
  const navigate = useNavigate();
  const [showAnalysis, setShowAnalysis] = useState(false);

  // T-6.2 (audit W-18): one shared `useActivities()` cache entry feeds the
  // ride card, the monthly speed chart and the metric fallbacks — this page
  // no longer keeps its own `activities_${userId}` localStorage copy (the
  // "10 Wind Adjusted" stale-data bug this audit item names came from every
  // page keeping such a copy independently).
  const { data: activitiesData } = useActivities();
  const activities = useMemo(() => activitiesData || [], [activitiesData]);
  const { data: bikesData } = useBikes();
  const bikes = bikesData || [];
  const { data: achievementsData } = useAchievements();
  const { data: userProfile } = useProfile();
  const { data: summaryData } = useAnalyticsSummary();
  // history[0] doubles as "the latest snapshot" (see useAnalyticsSnapshotHistory) —
  // no separate /api/analytics-snapshot/latest request.
  const { data: snapshotHistory } = useAnalyticsSnapshotHistory(2);

  const lastRide = useMemo(() => pickLastRide(activities), [activities]);
  const trackCoords = useMemo(() => {
    if (!lastRide?.map?.summary_polyline) return null;
    return polyline.decode(lastRide.map.summary_polyline).map(([lat, lng]) => [lat, lng]);
  }, [lastRide]);
  const monthly = useMemo(() => monthlyAvgSpeed(activities), [activities]);

  const metrics = useMemo(() => {
    const computed = metricsFromActivities(activities);
    const snapshot = snapshotHistory?.[0] ?? null;
    const vo2max = typeof summaryData?.summary?.vo2max === 'number' ? summaryData.summary.vo2max : null;
    return mergeMetrics(snapshot, computed, vo2max);
  }, [activities, snapshotHistory, summaryData]);

  const metricsTrend = useMemo(() => computeMetricTrend(snapshotHistory || []), [snapshotHistory]);

  const achievements = useMemo(
    () => pickGarageAchievements(achievementsData?.achievements),
    [achievementsData],
  );

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

        <h2 className="garage-title">Checklist</h2>
        <ChecklistPreview />

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

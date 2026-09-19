import React, { useState, useEffect } from 'react';
import './TrainingsPage.css';
import { useActivities, useAnalyticsSummary, useAiAnalysis, useActivityAnalysis } from '../data/hooks';
import Footer from '../components/Footer';
import AILoadingSpinner from '../components/AILoadingSpinner';
import PartnersLogo from '../components/PartnersLogo';
import BlobOrb from '../components/BlobOrb';
import { ErrorMessage } from '../ui';
import garminLogoSvg from '../assets/img/logo/garmin_tag_black.png';
import stravaBlackSvg from '../assets/img/logo/api_logo_pwrdBy_strava_stack_black.svg';
import { ActivityFilters } from './trainings/ActivityFilters';
import { ActivityList } from './trainings/ActivityList';
import { DEFAULT_FILTERS, useActivityView, buildAiSummary } from './trainings/lib';

export default function TrainingsPage() {
  // T-6.2 (audit W-18): the page's own `activities_${userId}` localStorage
  // cache + jwtDecode-derived userId is gone — activities now come from the
  // shared TanStack Query cache, invalidated together everywhere instead
  // of leaving this page's copy stale.
  const { data: activitiesData, isLoading: loading, error: activitiesError } = useActivities();
  const activities = activitiesData || [];
  const [selectedYear, setSelectedYear] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [activityAnalysis, setActivityAnalysis] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const activityAnalysisMutation = useActivityAnalysis();
  const analysisLoading = activityAnalysisMutation.isPending;
  const aiAnalysisMutation = useAiAnalysis();
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  // T-6.3 (audit W-26): filtering/sorting/grouping moved to
  // `./trainings/lib.js` (a single `useMemo`) so this component only wires
  // state to the filter form and the table.
  const { years, types, groupedYears } = useActivityView(activities, selectedYear, filters);

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const showActivityModal = async (activity) => {
    setSelectedActivity(activity);
    setActivityAnalysis(null);
    setAnalysisError(null);
    try {
      const data = await activityAnalysisMutation.mutateAsync(activity.id);
      setActivityAnalysis(data);
    } catch {
      // Тихая обработка ошибок - не показываем в консоли
      setAnalysisError('Analysis not available');
    }
    setShowModal(true);
  };

  const handleAiAnalysis = async (activity) => {
    setSelectedActivity(activity);
    setAiModalOpen(true);
    setAiAnalysis('');
    setAiError(null);
    setAiLoading(true);
    const summary = buildAiSummary(activity);
    try {
      const data = await aiAnalysisMutation.mutateAsync(summary);
      if (data.analysis) setAiAnalysis(data.analysis);
      else setAiError('No response from AI');
    } catch {
      setAiError('Error requesting AI');
    } finally {
      setAiLoading(false);
    }
  };

  const handleYearChange = (e) => {
    setSelectedYear(e.target.value);
  };

  // T-6.2: the year-filtered analytics summary comes from the shared query
  // cache (useAnalyticsSummary) instead of a fetch-on-selectedYear-change
  // effect. A user with no linked Strava simply gets an empty
  // `/api/activities` response from the server — no client-side
  // cache-busting needed for that case now that there's no per-user
  // localStorage key to bust.
  // T-6.3 (audit W-26): dropped the unused `useHeroImages`/`startStravaLogin`
  // wiring left over from an earlier version of this page — `heroImage` was
  // computed but never rendered, and no button called `handleStravaLogin`.
  const { data: analyticsData } = useAnalyticsSummary({ year: selectedYear });
  const analytics = analyticsData?.summary;

  useEffect(() => {
    if (aiModalOpen) {
      setTimeout(() => setAiModalVisible(true), 10);
      document.body.style.overflow = 'hidden';
    } else {
      setAiModalVisible(false);
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [aiModalOpen]);

  return (
    <div className="main main-relative">
      <div id="trainings-hero-banner" className="plan-hero hero-banner">
        <PartnersLogo
          logoSrc={garminLogoSvg}
          alt="Powered by Garmin"
          height="32px"
          position="absolute"
          top="16px"
          right="auto"
          style={{ right: '8px' }}
          opacity={1}
          hoverOpacity={1}
          filterEffect="none"
          activities={activities}
          showOnlyForBrands={['Garmin']}
        />
        <PartnersLogo
          logoSrc={stravaBlackSvg}
          alt="Powered by Strava"
          height="24.5px"
          opacity={1}
          hoverOpacity={1}
          filterEffect="none"
        />

        <div className="hero-blob">
          <BlobOrb size={850} />
        </div>

        <div className="hero-content">
          <h1 className="hero-heading">Every <b>ride</b> you've logged, in one place</h1>
          <div className="plan-meta-row">
            <p className="hero-subtitle">
              Browse, filter and export all your synced rides <br/>through the years.&nbsp;
              <select
                value={selectedYear}
                onChange={handleYearChange}
                className="year-selector"
                aria-label="Select year"
              >
                <option value="all">All Years</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </p>
          </div>

          <div className="plan-fact-hero">
            <div className="plan-fact-hero-card">
              <div className="card-stats">
                <span className="card-percentage">{analytics?.totalKm ?? 0}</span>
                <span className="card-fraction">km</span>
              </div>
              <div className="card-label">Total Distance</div>
            </div>
            <div className="plan-fact-hero-card">
              <div className="card-stats">
                <span className="card-percentage">{analytics?.totalElev ?? 0}</span>
                <span className="card-fraction">m</span>
              </div>
              <div className="card-label">Elevation Gain</div>
            </div>
            <div className="plan-fact-hero-card">
              <div className="card-stats">
                <span className="card-percentage">{analytics?.totalMovingHours ?? 0}</span>
                <span className="card-fraction">h</span>
              </div>
              <div className="card-label">Moving Time</div>
            </div>
            <div className="plan-fact-hero-card">
              <div className="card-stats">
                <span className="card-percentage">{analytics?.avgSpeed ?? 0}</span>
                <span className="card-fraction">km/h</span>
              </div>
              <div className="card-label">Average Speed</div>
            </div>
          </div>

        </div>
      </div>
      {activitiesError && <ErrorMessage>Error loading Strava data</ErrorMessage>}
      <div className="trainings-content">
        {loading && <div className="content-loader"><div></div></div>}
        <ActivityFilters
          filters={filters}
          onFiltersChange={setFilters}
          types={types}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(!showFilters)}
          onReset={resetFilters}
        />
        <div className="activities-table-container">
          {!loading && !activitiesError && (
            <ActivityList
              groupedYears={groupedYears}
              onAiAnalysis={handleAiAnalysis}
              onShowDetails={showActivityModal}
            />
          )}
        </div>
      </div>

      {/* Модалка анализа тренировки */}
      {showModal && selectedActivity && (
        <div className="modal-overlay activity-details-modal">
          <div className="modal-content">
            <button
              onClick={() => setShowModal(false)}
              className="modal-close"
            >
              ×
            </button>
            <div className="activity-analysis-modal-body">
              <h3> {selectedActivity.name}</h3>
              <div className="activity-details-grid">
                <div className="detail-row">

                  <div className="detail-label">Distance:</div>
                  <div className="detail-value">{selectedActivity.distance ? (selectedActivity.distance / 1000).toFixed(1) : '-'} km</div>
                </div>
                <div className="detail-row">
                  <div className="detail-label">Mov. Time:</div>
                  <div className="detail-value">{selectedActivity.moving_time ? Math.round(selectedActivity.moving_time / 60) : '-'} min</div>
                </div>
                <div className="detail-row">
                  <div className="detail-label">Elap. Time:</div>
                  <div className="detail-value">{selectedActivity.elapsed_time ? Math.round(selectedActivity.elapsed_time / 60) : '-'} min</div>
                </div>
                <div className="detail-row">
                  <div className="detail-label">Avg. Speed:</div>
                  <div className="detail-value">{selectedActivity.average_speed ? (selectedActivity.average_speed * 3.6).toFixed(1) : '-'} km/h</div>
                </div>
                <div className="detail-row">
                  <div className="detail-label">Max Speed:</div>
                  <div className="detail-value">{selectedActivity.max_speed ? (selectedActivity.max_speed * 3.6).toFixed(1) : '-'} km/h</div>
                </div>
                <div className="detail-row">
                  <div className="detail-label">Elev. Gain:</div>
                  <div className="detail-value">{selectedActivity.total_elevation_gain ? Math.round(selectedActivity.total_elevation_gain) : '-'} m</div>
                </div>
                <div className="detail-row">
                  <div className="detail-label">Max Elevation:</div>
                  <div className="detail-value">{selectedActivity.elev_high ? Math.round(selectedActivity.elev_high) : '-'} m</div>
                </div>
                <div className="detail-row">
                  <div className="detail-label">Avg. Heartrate:</div>
                  <div className="detail-value">{selectedActivity.average_heartrate ? Math.round(selectedActivity.average_heartrate) : '-'} bpm</div>
                </div>
                <div className="detail-row">
                  <div className="detail-label">Max Heartrate:</div>
                  <div className="detail-value">{selectedActivity.max_heartrate ? Math.round(selectedActivity.max_heartrate) : '-'} bpm</div>
                </div>
                <div className="detail-row">
                  <div className="detail-label">Avg. Cadence:</div>
                  <div className="detail-value">{selectedActivity.average_cadence ? Math.round(selectedActivity.average_cadence) : '-'} rpm</div>
                </div>
                <div className="detail-row">
                  <div className="detail-label">Temp:</div>
                  <div className="detail-value">{selectedActivity.average_temp ? Math.round(selectedActivity.average_temp) : '-'} °C</div>
                </div>
                <div className="detail-row">
                  <div className="detail-label">Est. Power:</div>
                  <div className="detail-value">{selectedActivity?.estimated_power?.avgWatts ?? '-'} W</div>
                </div>
                <div className="detail-row">
                  <div className="detail-label">Real Avg Power:</div>
                  <div className="detail-value">{selectedActivity.average_watts ?? '-'} W</div>
                </div>
                <div className="detail-row">
                  <div className="detail-label">Real Max Power:</div>
                  <div className="detail-value">{selectedActivity.max_watts ?? '-'} W</div>
                </div>
              </div>
              <hr />
              <div className="recommendations">
                <h4 style={{fontSize: '1.1em', fontWeight: 700, color: '#000', marginBottom: '20px'}}>Recommendations</h4>
                {analysisLoading && <AILoadingSpinner isLoading={analysisLoading} compact={true} />}
                {analysisError && <div style={{color: '#666', fontStyle: 'italic'}}>{analysisError}</div>}
                {!analysisLoading && !analysisError && activityAnalysis && (
                <div style={{fontSize: '0.85em'}}>
                    {activityAnalysis.recommendations.map((rec, index) => (
                    <div key={index}>
                      <strong style={{fontWeight: 700, color: '#000', marginBottom: '8px', display: 'block'}}>{rec.title}</strong>
                      {rec.advice}
                    </div>
                  ))}
                </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Модалка ИИ-анализа */}
      {aiModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100%',
          zIndex: 1000,
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          overflow: 'scroll',
          transition: 'background 0.2s',
          opacity: aiModalVisible ? 1 : 0,
          transform: aiModalVisible ? 'scale(1)' : 'scale(0.98)',
          pointerEvents: aiModalVisible ? 'auto' : 'none',
          transitionProperty: 'opacity, transform, background',
          transitionDuration: '0.35s',
          transitionTimingFunction: 'cubic-bezier(.4,0,.2,1)',
        }}>
          <div style={{



            padding: '2.5em 2em 2em 2em',

            width: '768px',
            minHeight: 320,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            fontSize: '1.13em',
            fontWeight: 400,
            color: '#000',
            letterSpacing: '-0.01em',
            lineHeight: 1.6,
            overflowY: 'auto',
          }}>
            <button onClick={() => setAiModalOpen(false)} style={{
              position: 'absolute',
              top: 18,
              right: 0,
              fontSize: '2.2em',
              background: 'none',
              border: 'none',
              color: '#000',
              opacity:0.5,
              cursor: 'pointer',
              zIndex: 10,
              lineHeight: 1,
              padding: 0,
              transition: 'color 0.2s',
            }} title="Close">×</button>
            <div className="activity-analysis-modal-body" style={{ width: '100%' }}>
              <h3 style={{ fontWeight: 800, color:'#000', border: 'none', fontSize: '2.5em', margin: '0 0 1.2em 0', letterSpacing: '-1px', textAlign: 'left' }}>
                {selectedActivity?.name ? selectedActivity.name : 'AI Activity Analysis'}
              </h3>
              {aiLoading && <AILoadingSpinner isLoading={aiLoading} />}
              {aiError && <div style={{color: 'red', textAlign: 'center'}}>{aiError}</div>}
              {!aiLoading && !aiError && aiAnalysis && (
                <div style={{whiteSpace: 'pre-line', fontSize: '1.13em', color: '#000', marginTop: 12}}>{aiAnalysis}</div>
              )}
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

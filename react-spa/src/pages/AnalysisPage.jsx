import './AnalysisPage.css';
import PageLoadingOverlay from '../components/PageLoadingOverlay';
import Footer from '../components/Footer';
import {
  useActivities,
  useProfile,
  useAnalyticsSummary,
  useSkills,
  useAnalyticsSnapshotHistory,
} from '../data/hooks';
import { computeMetricTrend } from '../utils/garageData';
import { PlanFactHero } from './analysis/PlanFactHero';
import { PeriodSummary } from './analysis/PeriodSummary';
import { SkillsSection } from './analysis/SkillsSection';
import { MetricSection } from './analysis/MetricSection';

// T-6.3 (audit W-23): AnalysisPage was 566 lines in one file, rendering all
// ~12 recharts-based sections eagerly on mount. Split into
// src/pages/analysis/{PeriodSummary,PlanFactHero,SkillsSection,
// MetricSection,lib}.jsx: the pure period/plan-fact math moved to lib.jsx
// (unit-tested there), and every genuinely heavy chart section is now
// lazy-mounted via `useInView` (src/hooks/useInView.js, IntersectionObserver)
// instead of rendering unconditionally on page load. PlanFactHero stays
// eager — it's the always-visible top banner, not a chart.
export default function AnalysisPage() {
  // T-6.2 (audit W-18): activities/profile/summary/skills all come from the
  // shared TanStack Query cache now — no more page-local localStorage cache
  // or manual cleanup sweeps (the persisted query cache's own gcTime
  // handles eviction).
  const { data: activitiesData, isLoading: loading, error } = useActivities();
  const activities = activitiesData || [];
  const { data: userProfile } = useProfile();
  const { data: summaryData } = useAnalyticsSummary();
  const summary = summaryData?.summary;

  // Skills radar (T-3.3): the server computes skills and writes both
  // skills_history and analytics_snapshots itself (routes/skills.js) — this
  // page just reads GET /api/skills.
  const { data: skillsData } = useSkills();
  const apiSkills = skillsData?.skills ?? null;
  const riderProfile = skillsData?.riderProfile ?? null;
  const skillsTrend = skillsData?.trend ?? null;

  // +/- badge next to Avg Power/HR/Cadence — diffs the two most recent
  // analytics_snapshots rows.
  const { data: snapshotHistory } = useAnalyticsSnapshotHistory(2);
  const metricsTrend = computeMetricTrend(snapshotHistory || []);

  // FTP/VO2max ("real intervals") badge on the hero — no per-activity
  // interval detection wired up on this page yet, so it's a fixed
  // placeholder like before the split.
  const lastRealIntervals = { count: 0, min: 0, label: 'Low', color: '#bdbdbd' };

  const pageLoading = loading;

  return (
    <div className="main-layout">
      <PageLoadingOverlay isLoading={pageLoading} loadingText="Analyzing activities & Preparing charts..." />
      <div className="main">
        {!pageLoading && (
          <PlanFactHero activities={activities} userProfile={userProfile} lastRealIntervals={lastRealIntervals} />
        )}

        {!pageLoading && (
          <PeriodSummary activities={activities} userProfile={userProfile} />
        )}

        {!pageLoading && (
          <SkillsSection
            activities={activities}
            selectedPeriod="4w"
            userProfile={userProfile}
            summary={summary}
            apiSkills={apiSkills}
            riderProfile={riderProfile}
            skillsTrend={skillsTrend}
          />
        )}

        <div className="plan-content">
          {loading && <div className="content-loader"><div></div></div>}

          {!loading && !error && (
            <MetricSection
              activities={activities}
              userProfile={userProfile}
              summary={summary}
              metricsTrend={metricsTrend}
            />
          )}

          {error && <div className="error-message">{error.message}</div>}
        </div>
      </div>

      <Footer />
    </div>
  );
}

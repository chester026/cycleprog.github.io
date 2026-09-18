// T-6.3 (audit W-23): the 4-week progress-by-period chart, split out of
// AnalysisPage.jsx and lazy-mounted with useInView — ProgressChart itself
// is a recharts AreaChart/LineChart, so it doesn't render until this
// section has actually scrolled near the viewport.
import { useMemo } from 'react';
import ProgressChart from '../../components/ProgressChart';
import '../../components/ProgressChart.css';
import { getPlanFromProfile } from '@bikelab/shared/calc';
import { useInView } from '../../hooks/useInView';
import { computePeriodSummary } from './lib';

export function PeriodSummary({ activities, userProfile }) {
  const [ref, inView] = useInView();

  const periodSummary = useMemo(
    () => computePeriodSummary(activities, userProfile, getPlanFromProfile(userProfile)),
    [activities, userProfile]
  );

  return (
    <div ref={ref}>
      {inView && <ProgressChart data={periodSummary} />}
    </div>
  );
}

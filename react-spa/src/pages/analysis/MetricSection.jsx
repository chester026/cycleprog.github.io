// T-6.3 (audit W-23): the Power/Heart/Cadence charts block, split out of
// AnalysisPage.jsx. This is the heaviest part of the page — 10 recharts
// across the three groups — so each group gets its own useInView instead
// of one big gate: the page doesn't pay for Heart's 5 charts or Cadence's
// 4 while the visitor is still looking at Power.
import PowerAnalysis from '../../components/PowerAnalysis';
import '../../components/PowerAnalysis.css';
import HeartRateVsSpeedChart from '../../components/HeartRateVsSpeedChart';
import AverageHeartRateTrendChart from '../../components/AverageHeartRateTrendChart';
import MinMaxHeartRateBarChart from '../../components/MinMaxHeartRateBarChart';
import HeartRateVsElevationChart from '../../components/HeartRateVsElevationChart';
import HeartRateZonesChart from '../../components/HeartRateZonesChart';
import '../../components/HeartRateZonesChart.css';
import CadenceStandardsAnalysis from '../../components/CadenceStandardsAnalysis';
import '../../components/CadenceStandardsAnalysis.css';
import CadenceVsSpeedChart from '../../components/CadenceVsSpeedChart';
import AverageCadenceTrendChart from '../../components/AverageCadenceTrendChart';
import CadenceVsElevationChart from '../../components/CadenceVsElevationChart';
import { useInView } from '../../hooks/useInView';

function PowerGroup({ activities, summary, trend }) {
  const [ref, inView] = useInView();
  return (
    <div ref={ref}>
      <h2 className="analitycs-heading">Power</h2>
      {inView && (
        <PowerAnalysis activities={activities} summary={summary} trend={trend} />
      )}
    </div>
  );
}

function HeartGroup({ activities, userProfile, trend }) {
  const [ref, inView] = useInView();
  return (
    <div ref={ref}>
      <h2 className="analitycs-heading">Heart</h2>
      {inView && (
        <>
          <HeartRateVsSpeedChart activities={activities} trend={trend} />
          <AverageHeartRateTrendChart activities={activities} />
          <MinMaxHeartRateBarChart activities={activities} />
          <HeartRateVsElevationChart activities={activities} />
          <HeartRateZonesChart activities={activities} profile={userProfile} />
        </>
      )}
    </div>
  );
}

function CadenceGroup({ activities, trend }) {
  const [ref, inView] = useInView();
  return (
    <div ref={ref}>
      <h2 className="analitycs-heading">Cadence</h2>
      {inView && (
        <>
          <CadenceStandardsAnalysis activities={activities} trend={trend} />
          <CadenceVsSpeedChart activities={activities} />
          <AverageCadenceTrendChart activities={activities} />
          <CadenceVsElevationChart activities={activities} />
        </>
      )}
    </div>
  );
}

export function MetricSection({ activities, userProfile, summary, metricsTrend }) {
  return (
    <div className="charts-container">
      <PowerGroup activities={activities} summary={summary?.power} trend={metricsTrend?.avg_power} />
      <HeartGroup activities={activities} userProfile={userProfile} trend={metricsTrend?.avg_hr} />
      <CadenceGroup activities={activities} trend={metricsTrend?.avg_cadence} />
    </div>
  );
}

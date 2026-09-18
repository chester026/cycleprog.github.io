// T-6.3 (audit W-23): Rider Skills radar + FTP/VO2max analysis, split out
// of AnalysisPage.jsx and lazy-mounted with useInView (SkillsRadarChart is
// a recharts RadarChart).
import SkillsRadarChart from '../../components/SkillsRadarChart';
import '../../components/SkillsRadarChart.css';
import FTPAnalysis from '../../components/FTPAnalysis';
import '../../components/FTPAnalysis.css';
import { useInView } from '../../hooks/useInView';

export function SkillsSection({ activities, selectedPeriod, userProfile, summary, apiSkills, riderProfile, skillsTrend }) {
  const [ref, inView] = useInView();

  if (!activities.length) return null;

  return (
    <div ref={ref}>
      {inView && (
        <>
          <SkillsRadarChart
            skills={apiSkills}
            riderProfile={riderProfile}
            skillsTrend={skillsTrend}
          />
          <FTPAnalysis
            activities={activities}
            selectedPeriod={selectedPeriod}
            userProfile={userProfile}
            summary={summary}
          />
        </>
      )}
    </div>
  );
}

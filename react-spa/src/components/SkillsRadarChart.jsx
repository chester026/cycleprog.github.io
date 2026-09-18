import React, { useMemo } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import './SkillsRadarChart.css';

// T-3.3 (docs/audit/00-AUDIT-AND-PLAN.md T-3.3, docs/audit/layers/03-react-
// spa.md W-44): skills are computed server-side now (`GET /api/skills`,
// @bikelab/shared/calc) — this component just renders the already-computed
// `skills`/`riderProfile`/`skillsTrend`, instead of running its own (drifted
// vs. the app's) formula against raw activities.
const SkillsRadarChart = ({ skills: calculatedSkills, riderProfile, skillsTrend }) => {
  const skillsData = useMemo(() => {
    if (!calculatedSkills) return null;

    const skills = [
      {
        skill: 'Climbing',
        value: Math.round(calculatedSkills.climbing),
        fullMark: 100,
        description: 'Elevation density & VAM (climbing speed)'
      },
      {
        skill: 'Sprint/Attack',
        value: Math.round(calculatedSkills.sprint),
        fullMark: 100,
        description: 'Max speed on flat & acceleration ability'
      },
      {
        skill: 'Endurance',
        value: Math.round(calculatedSkills.endurance),
        fullMark: 100,
        description: 'Weekly volume & VO₂max'
      },
      {
        skill: 'Tempo',
        value: Math.round(calculatedSkills.tempo),
        fullMark: 100,
        description: 'Avg speed on flat & efficiency at tempo HR'
      },
      // Добавляем Power только если есть данные
      ...(calculatedSkills.power > 0 ? [{
        skill: 'Power',
        value: Math.round(calculatedSkills.power),
        fullMark: 100,
        description: 'Average watts from power meter'
      }] : []),
      {
        skill: 'Discipline',
        value: Math.round(calculatedSkills.consistency),
        fullMark: 100,
        description: 'Training regularity & stability'
      }
    ];
    
    return skills;
  }, [calculatedSkills]);

  // Вычисляем общий скор (средний балл по всем навыкам)
  const overallScore = useMemo(() => {
    if (!skillsData || skillsData.length === 0) return 0;

    const sum = skillsData.reduce((acc, skill) => acc + skill.value, 0);
    return Math.round(sum / skillsData.length);
  }, [skillsData]);

  if (!skillsData) {
    return (
      <div className="skills-radar-empty">
        Not enough data to analyze skills
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="skills-tooltip">
          <p className="tooltip-skill">{data.payload.skill}</p>
          <p className="tooltip-value">{data.value}/100</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="skills-radar-chart">
     <div className="skills-radar-chart-header">
     <h2 className="analitycs-heading">Skills</h2>
     <p className="skills-subtitle">Last three months</p>
     </div>
      
      <div className="skills-radar-chart-container">
      <ResponsiveContainer width="100%" height={540}>
        <RadarChart data={skillsData}>
          <PolarGrid stroke="#3b4252" />
          <PolarAngleAxis 
            dataKey="skill" 
            tick={{ fill: '#d6d6d6', fontSize: 13, fontWeight: 600 }}
          />
          <PolarRadiusAxis 
            angle={90} 
            domain={[0, 100]}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            stroke="#3b4252"
          />
          <Radar
            name="Skills"
            dataKey="value"
            stroke="rgb(255, 94, 0)"
            fill="rgb(255, 94, 0)"
            fillOpacity={0.3}
            strokeWidth={2.5}
          />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>

      <div className="skills-legend">
       

        {/* Skills List */}
        {skillsData.map((skill, index) => {
          // Маппинг названий скиллов к ключам в skillsTrend
          const skillKeyMap = {
            'Climbing': 'climbing',
            'Sprint/Attack': 'sprint',
            'Endurance': 'endurance',
            'Tempo': 'tempo',
            'Power': 'power',
            'Discipline': 'consistency' // UI: Discipline, но в БД/трендах: consistency
          };
          const skillKey = skillKeyMap[skill.skill];
          const trend = skillsTrend?.[skillKey];
          
          return (
            <div key={index} className="skill-item">
              <div className="skill-info">
                <div className="skill-name-with-trend">
                  <span className="skill-name">{skill.skill}</span>
                  {trend !== undefined && trend !== null && trend !== 0 && (
                    <span className={`skill-trend ${trend > 0 ? 'positive' : 'negative'}`}>
                      {trend > 0 ? '+' : ''}{trend}
                    </span>
                  )}
                </div>
                <span className="skill-description">{skill.description}</span>
              </div>
              <div className="skill-bar-container">
                <div 
                  className="skill-bar" 
                  style={{ width: `${skill.value}%` }}
                />
              </div>
              <div className="skill-value-with-trend">
                <span className="skill-value">{skill.value}</span>
              </div>
            </div>
          );
        })}

         {/* Rider Profile */}
         {riderProfile && (
          <div className="rider-profile-badge">
            <div className="profile-text">
              <span className="profile-name">{riderProfile.profile}</span>
              <span className="profile-description">{riderProfile.description}</span>
            </div>
            <div className="profile-score">
              <span className="score-value">{overallScore}</span>
              <span className="score-label">Overall</span>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

// Мемоизируем компонент для избежания лишних перерасчетов
export default React.memo(SkillsRadarChart, (prevProps, nextProps) => {
  const skillsEqual = JSON.stringify(prevProps.skills) === JSON.stringify(nextProps.skills);
  const profileEqual = prevProps.riderProfile?.profile === nextProps.riderProfile?.profile;
  const trendEqual = JSON.stringify(prevProps.skillsTrend) === JSON.stringify(nextProps.skillsTrend);

  // Возвращаем true если все равно (НЕ нужно обновлять)
  return skillsEqual && profileEqual && trendEqual;
});


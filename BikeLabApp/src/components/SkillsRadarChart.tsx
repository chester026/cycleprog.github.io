import React, {useMemo, useEffect} from 'react';
import {View, Text, StyleSheet, Dimensions, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import Svg, {Circle, Polygon, Line, Text as SvgText} from 'react-native-svg';
import {
  calculateAllSkills,
  determineRiderProfile,
} from '../utils/skillsCalculator';
import type {Activity} from '../types/activity';

interface SkillsRadarChartProps {
  activities: Activity[];
  userProfile: any;
  powerStats: {
    avgPower: number;
    maxPower?: number;
    minPower?: number;
    totalActivities?: number;
  } | null;
  summary: {
    vo2max?: number;
    lthr?: number;
    totalDistance?: number;
  } | null;
  skillsTrend?: Record<string, number> | null;
  onSkillsCalculated?: (skills: {
    climbing: number;
    sprint: number;
    endurance: number;
    tempo: number;
    power: number;
    consistency: number;
  }) => void;
  onHelpPress?: (topicId: string) => void;
}

interface SkillData {
  skillKey: string;
  skill: string;
  value: number;
  fullMark: number;
  description: string;
}

export const SkillsRadarChart: React.FC<SkillsRadarChartProps> = ({
  activities,
  userProfile,
  powerStats,
  summary,
  skillsTrend,
  onSkillsCalculated,
  onHelpPress,
}) => {
  const {t} = useTranslation();
  // Вычисляем навыки
  const skillsData = useMemo<SkillData[] | null>(() => {
    if (!activities || activities.length === 0) return null;

    const calculatedSkills = calculateAllSkills(
      activities,
      powerStats,
      summary,
    );

    const skills: SkillData[] = [
      {
        skillKey: 'climbing',
        skill: t('skills.climbing'),
        value: Math.round(calculatedSkills.climbing),
        fullMark: 100,
        description: t('skills.climbingDesc'),
      },
      {
        skillKey: 'sprint',
        skill: t('skills.sprint'),
        value: Math.round(calculatedSkills.sprint),
        fullMark: 100,
        description: t('skills.sprintDesc'),
      },
      {
        skillKey: 'endurance',
        skill: t('skills.endurance'),
        value: Math.round(calculatedSkills.endurance),
        fullMark: 100,
        description: t('skills.enduranceDesc'),
      },
      {
        skillKey: 'tempo',
        skill: t('skills.tempo'),
        value: Math.round(calculatedSkills.tempo),
        fullMark: 100,
        description: t('skills.tempoDesc'),
      },
      // Power только если есть данные
      ...(calculatedSkills.power > 0
        ? [
            {
              skillKey: 'power',
              skill: t('skills.power'),
              value: Math.round(calculatedSkills.power),
              fullMark: 100,
              description: t('skills.powerDesc'),
            },
          ]
        : []),
      {
        skillKey: 'discipline',
        skill: t('skills.discipline'),
        value: Math.round(calculatedSkills.consistency),
        fullMark: 100,
        description: t('skills.disciplineDesc'),
      },
    ];

    return skills;
  }, [activities, powerStats, summary, t]);

  // Вычисляем общий скор
  const overallScore = useMemo(() => {
    if (!skillsData || skillsData.length === 0) return 0;

    const sum = skillsData.reduce((acc, skill) => acc + skill.value, 0);
    return Math.round(sum / skillsData.length);
  }, [skillsData]);

  // Вычисляем профиль райдера
  const riderProfile = useMemo(() => {
    if (!skillsData) return null;

    const skillsObject = {
      climbing: skillsData.find(s => s.skillKey === 'climbing')?.value || 0,
      sprint: skillsData.find(s => s.skillKey === 'sprint')?.value || 0,
      endurance: skillsData.find(s => s.skillKey === 'endurance')?.value || 0,
      tempo: skillsData.find(s => s.skillKey === 'tempo')?.value || 0,
      power: skillsData.find(s => s.skillKey === 'power')?.value || 0,
      consistency: skillsData.find(s => s.skillKey === 'discipline')?.value || 0,
    };

    return determineRiderProfile(skillsObject);
  }, [skillsData]);

  // Передаем рассчитанные навыки в родительский компонент
  useEffect(() => {
    if (skillsData && onSkillsCalculated) {
      const skillsObject = {
        climbing: skillsData.find(s => s.skillKey === 'climbing')?.value || 0,
        sprint: skillsData.find(s => s.skillKey === 'sprint')?.value || 0,
        endurance: skillsData.find(s => s.skillKey === 'endurance')?.value || 0,
        tempo: skillsData.find(s => s.skillKey === 'tempo')?.value || 0,
        power: skillsData.find(s => s.skillKey === 'power')?.value || 0,
        consistency: skillsData.find(s => s.skillKey === 'discipline')?.value || 0,
      };
      onSkillsCalculated(skillsObject);
    }
  }, [skillsData, onSkillsCalculated]);

  // Функция для расчета координат точки на радаре
  const polarToCartesian = (
    centerX: number,
    centerY: number,
    radius: number,
    angleInDegrees: number,
  ) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    };
  };

  if (!skillsData) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{t('skills.noData')}</Text>
        </View>
      </View>
    );
  }

  const chartSize = Dimensions.get('window').width - 64;
  const center = chartSize / 2;
  const maxRadius = center - 40;
  const numSkills = skillsData.length;
  const angleStep = 360 / numSkills;

  // Создаем точки для полигона (радар-области)
  const radarPoints = skillsData
    .map((skill, i) => {
      const angle = i * angleStep;
      const radius = (skill.value / 100) * maxRadius;
      const point = polarToCartesian(center, center, radius, angle);
      return `${point.x},${point.y}`;
    })
    .join(' ');

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
          <Text style={styles.title}>{t('skills.title')}</Text>
          {onHelpPress && (
            <TouchableOpacity
              style={styles.helpButton}
              onPress={() => onHelpPress('skills_radar')}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Text style={styles.helpIcon}>?</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.subtitle}>{t('skills.subtitle')}</Text>
      </View>

      {/* Radar Chart */}
      <View style={styles.chartContainer}>
        <Svg width={chartSize} height={chartSize}>
          {/* Фоновые концентрические круги (сетка) */}
          {[0.25, 0.5, 0.75, 1].map((scale, i) => (
            <Circle
              key={`circle-${i}`}
              cx={center}
              cy={center}
              r={maxRadius * scale}
              stroke="#3b4252"
              strokeWidth={1}
              fill="none"
            />
          ))}

          {/* Линии осей для каждого навыка */}
          {skillsData.map((skill, i) => {
            const angle = i * angleStep;
            const endPoint = polarToCartesian(center, center, maxRadius, angle);
            return (
              <Line
                key={`axis-${i}`}
                x1={center}
                y1={center}
                x2={endPoint.x}
                y2={endPoint.y}
                stroke="#3b4252"
                strokeWidth={1}
              />
            );
          })}

          {/* Радар-область (заполненная) */}
          <Polygon
            points={radarPoints}
            fill="rgba(255, 94, 0, 0.3)"
            stroke="rgb(255, 94, 0)"
            strokeWidth={2.5}
          />

          {/* Метки навыков */}
          {skillsData.map((skill, i) => {
            const angle = i * angleStep;
            const labelRadius = maxRadius + 20;
            const point = polarToCartesian(center, center, labelRadius, angle);
            return (
              <SvgText
                key={`label-${i}`}
                x={point.x}
                y={point.y}
                fill="#d6d6d6"
                fontSize="11"
                fontWeight="600"
                textAnchor="middle"
                alignmentBaseline="middle">
                {skill.skill}
              </SvgText>
            );
          })}
        </Svg>
      </View>

      {/* Skills Legend */}
      <View style={styles.legend}>
        {skillsData.map((skill, index) => {
          const trendKey = skill.skillKey === 'discipline' ? 'consistency' : skill.skillKey;
          const trend = skillsTrend?.[trendKey];

          // Debug: проверяем тренды
          if (index === 0) {
            console.log('🎨 SkillsRadarChart rendering with trends:', skillsTrend);
          }

          // Debug: логируем каждый скилл
          console.log(`  Skill: ${skill.skill} (${trendKey}) → trend: ${trend}`);

          return (
            <View key={index} style={styles.skillItem}>
              <View style={styles.skillInfo}>
                <View style={styles.skillNameRow}>
                  <Text style={styles.skillName}>{skill.skill}</Text>
                  {trend !== undefined && trend !== null && trend !== 0 && (
                    <Text
                      style={[
                        styles.skillTrend,
                        trend > 0 ? styles.trendPositive : styles.trendNegative,
                      ]}>
                      {trend > 0 ? '+' : ''}
                      {trend}
                    </Text>
                  )}
                </View>
                <Text style={styles.skillDescription}>{skill.description}</Text>
              </View>
              <View style={styles.skillBarContainer}>
                <View
                  style={[styles.skillBar, {width: `${skill.value}%`}]}
                />
              </View>
              <Text style={styles.skillValue}>{skill.value}</Text>
            </View>
          );
        })}

        {/* Rider Profile */}
        {riderProfile && (
          <View style={styles.profileBadge}>
            <View style={styles.profileLeft}>
             
              <View style={styles.profileText}>
                <Text style={styles.profileName}>{riderProfile.profile}</Text>
                <Text style={styles.profileDescription}>
                  {riderProfile.description}
                </Text>
              </View>
            </View>
            <View style={styles.profileScore}>
              <Text style={styles.scoreValue}>{overallScore}</Text>
              <Text style={styles.scoreLabel}>{t('skills.overall')}</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  helpButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  helpIcon: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
  },
  container: {
    padding: 16,
    backgroundColor: '#1a1a1a',
    paddingTop: 32,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.3,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 60,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.2,
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#fff',
    opacity: 0.3,
    fontWeight: '500',
  },
  chartContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  legend: {
    marginTop: 16,
  },
  skillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  skillInfo: {
    flex: 1,
  },
  skillNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  skillName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  skillTrend: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
  },
  trendPositive: {
    color: '#16a34a',
    backgroundColor: 'rgba(22, 163, 74, 0.15)',
  },
  trendNegative: {
    color: '#dc2626',
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
  },
  skillDescription: {
    fontSize: 11,
    color: '#fff',
    opacity: 0.5,
  },
  skillBarContainer: {
    width: 80,
    height: 4,
    backgroundColor: '#2a2a2a',
    borderRadius: 2,
    overflow: 'hidden',
  },
  skillBar: {
    height: '100%',
    backgroundColor: 'rgb(255, 94, 0)',
  },
  skillValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    width: 32,
    textAlign: 'right',
  },
  profileBadge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#212121',
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  profileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  profileText: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom:8,
  },
  profileDescription: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.5,
  },
  profileScore: {
    alignItems: 'center',
    paddingLeft: 16,
    borderLeftWidth: 1,
    borderLeftColor: '#2a2a2a',
  },
  scoreValue: {
    fontSize: 32,
    fontWeight: '800',
    color: 'rgb(255, 94, 0)',
    lineHeight: 32,
  },
  scoreLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
    marginTop: 2,
  },
});

export default React.memo(SkillsRadarChart);


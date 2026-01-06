// Утилиты для расчета навыков велосипедиста (Skills Radar Chart)
// Портировано из react-spa для React Native

import {Activity} from '../types/activity';

interface PowerStats {
  avgPower: number;
  maxPower?: number;
  minPower?: number;
  totalActivities?: number;
}

interface Summary {
  vo2max?: number;
  lthr?: number;
  totalDistance?: number;
}

interface Skills {
  climbing: number;
  sprint: number;
  endurance: number;
  tempo: number;
  power: number;
  consistency: number;
}

interface RiderProfile {
  profile: string;
  description: string;
  emoji: string;
}

// Вспомогательная функция: медиана
const calculateMedian = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

/**
 * Рассчитать все навыки на основе активностей
 */
export const calculateAllSkills = (
  activities: Activity[],
  powerStats: PowerStats | null,
  summary: Summary | null,
  periodStart: Date | null = null,
  periodEnd: Date | null = null,
): Skills => {
  if (!activities || activities.length === 0) {
    return {
      climbing: 0,
      sprint: 0,
      endurance: 0,
      tempo: 0,
      power: 0,
      consistency: 0,
    };
  }

  // Если период не задан явно - используем последние 3 ПОЛНЫХ месяца
  let startDate: Date, endDate: Date;

  if (periodStart && periodEnd) {
    startDate = periodStart;
    endDate = periodEnd;
  } else {
    // Вычисляем последние 3 месяца от текущей даты
    const now = new Date();
    endDate = new Date(now); // Сегодня
    
    // Начало - 3 месяца назад (90 дней)
    startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  }

  const recentActivities = activities.filter(a => {
    const activityDate = new Date(a.start_date);
    return activityDate >= startDate && activityDate <= endDate;
  });

  return {
    climbing: calculateClimbing(recentActivities, powerStats, summary),
    sprint: calculateSprint(recentActivities),
    endurance: calculateEndurance(recentActivities, summary),
    tempo: calculateTempo(recentActivities),
    power: calculatePower(powerStats),
    consistency: calculateConsistency(activities), // использует все активности
  };
};

// 1. CLIMBING - анализ подъемов (Density + VAM)
function calculateClimbing(
  recentActivities: Activity[],
  powerStats: PowerStats | null,
  summary: Summary | null,
): number {
  const ridesWithElevation = recentActivities.filter(
    a => (a.total_elevation_gain || 0) > 100,
  );

  if (ridesWithElevation.length === 0) {
    return 15;
  }

  // ЧАСТЬ 1: Climbing Density (65%)
  const elevationData = ridesWithElevation.map(a => {
    const distance = (a.distance || 0) / 1000;
    const elevation = a.total_elevation_gain || 0;
    const per100km = distance > 0 ? (elevation / distance) * 100 : 0;
    return {name: a.name, distance, elevation, per100km};
  });

  const avgElevationPer100km =
    elevationData.reduce((sum, a) => sum + a.per100km, 0) /
    ridesWithElevation.length;

  let densityScore = 0;
  if (avgElevationPer100km < 200)
    densityScore = (avgElevationPer100km / 200) * 20;
  else if (avgElevationPer100km < 500)
    densityScore = 20 + ((avgElevationPer100km - 200) / 300) * 20;
  else if (avgElevationPer100km < 1000)
    densityScore = 40 + ((avgElevationPer100km - 500) / 500) * 20;
  else if (avgElevationPer100km < 1500)
    densityScore = 60 + ((avgElevationPer100km - 1000) / 500) * 15;
  else if (avgElevationPer100km < 2000)
    densityScore = 75 + ((avgElevationPer100km - 1500) / 500) * 15;
  else if (avgElevationPer100km < 3000)
    densityScore = 90 + ((avgElevationPer100km - 2000) / 1000) * 10;
  else densityScore = 100;

  // ЧАСТЬ 2: Median VAM (15% или 25% адаптивно)
  const mountainRides = ridesWithElevation.filter(a => {
    const elevation = a.total_elevation_gain || 0;
    const distance = (a.distance || 0) / 1000;
    const elevationPerKm = distance > 0 ? elevation / distance : 0;
    return elevation > 350 && elevationPerKm > 15;
  });

  let vamScore = 0;

  if (mountainRides.length > 0) {
    const vamValues = mountainRides
      .map(a => {
        const elevation = a.total_elevation_gain || 0;
        const timeHours = (a.moving_time || 0) / 3600;
        const vam = timeHours > 0 ? elevation / timeHours : 0;
        return {name: a.name, elevation, timeHours, vam};
      })
      .filter(v => v.vam > 0);

    if (vamValues.length > 0) {
      const medianVAM = calculateMedian(vamValues.map(v => v.vam));

      if (medianVAM < 150) vamScore = 0;
      else if (medianVAM < 200) vamScore = ((medianVAM - 150) / 50) * 20;
      else if (medianVAM < 300) vamScore = 20 + ((medianVAM - 200) / 100) * 20;
      else if (medianVAM < 450) vamScore = 40 + ((medianVAM - 300) / 150) * 15;
      else if (medianVAM < 600) vamScore = 55 + ((medianVAM - 450) / 150) * 10;
      else if (medianVAM < 800) vamScore = 65 + ((medianVAM - 600) / 200) * 15;
      else if (medianVAM < 1200) vamScore = 80 + ((medianVAM - 800) / 400) * 20;
      else vamScore = 100;
    }
  } else {
    vamScore = densityScore;
  }

  // ЧАСТЬ 3: VAM при темповом HR 85-95% LTHR
  const lthr = summary?.lthr || 165;
  const hrMin = Math.round(lthr * 0.85);
  const hrMax = Math.round(lthr * 0.95);

  const tempoHRMountainRides = mountainRides.filter(a => {
    const hr = a.average_heartrate || 0;
    return hr >= hrMin && hr <= hrMax;
  });

  let vamHRScore = 0;
  if (tempoHRMountainRides.length > 0) {
    const vamHRValues = tempoHRMountainRides
      .map(a => {
        const elevation = a.total_elevation_gain || 0;
        const timeHours = (a.moving_time || 0) / 3600;
        const vam = timeHours > 0 ? elevation / timeHours : 0;
        return {name: a.name, hr: a.average_heartrate, vam};
      })
      .filter(v => v.vam > 0);

    if (vamHRValues.length > 0) {
      const medianVAMHR = calculateMedian(vamHRValues.map(v => v.vam));

      if (medianVAMHR < 150) vamHRScore = 0;
      else if (medianVAMHR < 200) vamHRScore = ((medianVAMHR - 150) / 50) * 20;
      else if (medianVAMHR < 300)
        vamHRScore = 20 + ((medianVAMHR - 200) / 100) * 20;
      else if (medianVAMHR < 450)
        vamHRScore = 40 + ((medianVAMHR - 300) / 150) * 15;
      else if (medianVAMHR < 600)
        vamHRScore = 55 + ((medianVAMHR - 450) / 150) * 10;
      else if (medianVAMHR < 800)
        vamHRScore = 65 + ((medianVAMHR - 600) / 200) * 15;
      else if (medianVAMHR < 1200)
        vamHRScore = 80 + ((medianVAMHR - 800) / 400) * 20;
      else vamHRScore = 100;
    }
  } else {
    vamHRScore = vamScore;
  }

  // Адаптивные веса
  let densityWeight = 0.65;
  let vamWeight = 0.15;
  let vamHRWeight = 0.2;

  if (tempoHRMountainRides.length < 3) {
    vamHRWeight = 0.1;
    vamWeight = 0.25;
  }

  const finalScore = Math.min(
    100,
    densityScore * densityWeight +
      vamScore * vamWeight +
      vamHRScore * vamHRWeight,
  );

  return finalScore;
}

// 2. SPRINT/ATTACK - спринтерские качества
function calculateSprint(recentActivities: Activity[]): number {
  const flatRides = recentActivities.filter(a => {
    const distance = (a.distance || 0) / 1000;
    const elevation = a.total_elevation_gain || 0;
    const elevationRate = distance > 0 ? elevation / distance : 100;
    const avgSpeedKmh = (a.average_speed || 0) * 3.6;
    return elevationRate < 10 && distance > 10 && avgSpeedKmh >= 22;
  });

  if (flatRides.length === 0) return 30;

  // 1. Медианная максимальная скорость (60%)
  const maxSpeedsFlat = flatRides
    .map(a => (a.max_speed || 0) * 3.6)
    .sort((a, b) => a - b);
  const medianMaxSpeed = calculateMedian(maxSpeedsFlat);

  let maxSpeedScore = 0;
  if (medianMaxSpeed < 30) maxSpeedScore = 0;
  else if (medianMaxSpeed < 40)
    maxSpeedScore = ((medianMaxSpeed - 30) / 10) * 20;
  else if (medianMaxSpeed < 45)
    maxSpeedScore = 20 + ((medianMaxSpeed - 40) / 5) * 15;
  else if (medianMaxSpeed < 50)
    maxSpeedScore = 35 + ((medianMaxSpeed - 45) / 5) * 25;
  else if (medianMaxSpeed < 55)
    maxSpeedScore = 60 + ((medianMaxSpeed - 50) / 5) * 20;
  else if (medianMaxSpeed < 65)
    maxSpeedScore = 80 + ((medianMaxSpeed - 55) / 10) * 20;
  else maxSpeedScore = 100;

  // 2. Медианный Variability Index (40%)
  const variabilities = flatRides
    .filter(a => a.max_speed && a.average_speed && a.average_speed > 0)
    .map(a => {
      const maxKmh = a.max_speed! * 3.6;
      const avgKmh = a.average_speed * 3.6;
      return (maxKmh - avgKmh) / avgKmh;
    })
    .sort((a, b) => a - b);

  const medianVariability =
    variabilities.length > 0 ? calculateMedian(variabilities) : 0;

  let variabilityScore = 0;
  if (medianVariability < 0.1) variabilityScore = 0;
  else if (medianVariability < 0.2)
    variabilityScore = ((medianVariability - 0.1) / 0.1) * 20;
  else if (medianVariability < 0.3)
    variabilityScore = 20 + ((medianVariability - 0.2) / 0.1) * 20;
  else if (medianVariability < 0.45)
    variabilityScore = 40 + ((medianVariability - 0.3) / 0.15) * 30;
  else if (medianVariability < 0.6)
    variabilityScore = 70 + ((medianVariability - 0.45) / 0.15) * 20;
  else if (medianVariability < 0.8)
    variabilityScore = 90 + ((medianVariability - 0.6) / 0.2) * 10;
  else variabilityScore = 100;

  return Math.min(100, maxSpeedScore * 0.6 + variabilityScore * 0.4);
}

// 3. ENDURANCE - выносливость (Volume + VO2max)
function calculateEndurance(
  recentActivities: Activity[],
  summary: Summary | null,
): number {
  const totalDistance = recentActivities.reduce(
    (sum, a) => sum + (a.distance || 0) / 1000,
    0,
  );
  const avgWeeklyKm = totalDistance / 12; // 12 недель = 3 месяца

  // ЧАСТЬ 1: Volume (70%)
  let volumeScore = 0;
  if (avgWeeklyKm < 20) volumeScore = 0;
  else if (avgWeeklyKm < 50) volumeScore = 5 + ((avgWeeklyKm - 20) / 30) * 10;
  else if (avgWeeklyKm < 80) volumeScore = 15 + ((avgWeeklyKm - 50) / 30) * 10;
  else if (avgWeeklyKm < 120) volumeScore = 25 + ((avgWeeklyKm - 80) / 40) * 15;
  else if (avgWeeklyKm < 250)
    volumeScore = 40 + ((avgWeeklyKm - 120) / 130) * 15;
  else if (avgWeeklyKm < 350)
    volumeScore = 55 + ((avgWeeklyKm - 250) / 100) * 10;
  else if (avgWeeklyKm < 500) volumeScore = 65 + ((avgWeeklyKm - 350) / 150) * 5;
  else volumeScore = 70;

  // ЧАСТЬ 2: VO2max (30%)
  let vo2maxScore = 0;
  const vo2max = summary?.vo2max;

  if (vo2max) {
    if (vo2max < 20) vo2maxScore = 0;
    else if (vo2max < 30) vo2maxScore = ((vo2max - 20) / 10) * 5;
    else if (vo2max < 40) vo2maxScore = 5 + ((vo2max - 30) / 10) * 5;
    else if (vo2max < 50) vo2maxScore = 10 + ((vo2max - 40) / 10) * 5;
    else if (vo2max < 75) vo2maxScore = 15 + ((vo2max - 50) / 25) * 10;
    else if (vo2max < 85) vo2maxScore = 25 + ((vo2max - 75) / 10) * 5;
    else vo2maxScore = 30;
  }

  return Math.min(100, volumeScore + vo2maxScore);
}

// 4. TEMPO - темп на равнине + эффективность
function calculateTempo(recentActivities: Activity[]): number {
  const flatRides = recentActivities.filter(a => {
    const distance = (a.distance || 0) / 1000;
    const elevation = a.total_elevation_gain || 0;
    const elevationRate = distance > 0 ? elevation / distance : 100;
    return elevationRate < 10 && distance > 20;
  });

  if (flatRides.length === 0) return 0;

  // 1. МЕДИАННАЯ скорость (50%)
  const speeds = flatRides.map(a => (a.average_speed || 0) * 3.6);
  const medianSpeed = calculateMedian(speeds);

  let speedScore = 0;
  if (medianSpeed < 12) speedScore = 0;
  else if (medianSpeed < 15) speedScore = 5 + ((medianSpeed - 12) / 3) * 10;
  else if (medianSpeed < 18) speedScore = 15 + ((medianSpeed - 15) / 3) * 10;
  else if (medianSpeed < 22) speedScore = 25 + ((medianSpeed - 18) / 4) * 15;
  else if (medianSpeed < 25) speedScore = 40 + ((medianSpeed - 22) / 3) * 15;
  else if (medianSpeed < 28) speedScore = 55 + ((medianSpeed - 25) / 3) * 15;
  else if (medianSpeed < 32) speedScore = 70 + ((medianSpeed - 28) / 4) * 15;
  else if (medianSpeed < 36) speedScore = 85 + ((medianSpeed - 32) / 4) * 10;
  else if (medianSpeed < 40) speedScore = 95 + ((medianSpeed - 36) / 4) * 5;
  else speedScore = 100;

  // 2. ЭФФЕКТИВНОСТЬ: медианный Speed/HR Ratio (50%)
  const tempoHRRides = flatRides.filter(a => {
    const hr = a.average_heartrate || 0;
    return hr >= 130 && hr <= 160;
  });

  let efficiencyScore = 0;
  if (tempoHRRides.length > 0) {
    const efficiencies = tempoHRRides
      .map(a => {
        const speed = (a.average_speed || 0) * 3.6;
        const hr = a.average_heartrate || 0;
        return hr > 0 ? speed / hr : 0;
      })
      .filter(e => e > 0)
      .sort((a, b) => a - b);

    if (efficiencies.length > 0) {
      const medianEfficiency = calculateMedian(efficiencies);

      if (medianEfficiency < 0.1) efficiencyScore = 0;
      else if (medianEfficiency < 0.13)
        efficiencyScore = ((medianEfficiency - 0.1) / 0.03) * 20;
      else if (medianEfficiency < 0.15)
        efficiencyScore = 20 + ((medianEfficiency - 0.13) / 0.02) * 20;
      else if (medianEfficiency < 0.18)
        efficiencyScore = 40 + ((medianEfficiency - 0.15) / 0.03) * 20;
      else if (medianEfficiency < 0.21)
        efficiencyScore = 60 + ((medianEfficiency - 0.18) / 0.03) * 20;
      else if (medianEfficiency < 0.25)
        efficiencyScore = 80 + ((medianEfficiency - 0.21) / 0.04) * 15;
      else
        efficiencyScore =
          95 + Math.min(((medianEfficiency - 0.25) / 0.05) * 5, 5);
    }
  } else {
    efficiencyScore = speedScore;
  }

  return Math.min(100, speedScore * 0.5 + efficiencyScore * 0.5);
}

// 5. POWER - функциональная мощность
function calculatePower(powerStats: PowerStats | null): number {
  if (!powerStats || !powerStats.avgPower) return 0;

  const avgPower = powerStats.avgPower;
  let score = 0;

  if (avgPower < 60) score = 0;
  else if (avgPower < 80) score = ((avgPower - 60) / 20) * 15;
  else if (avgPower < 100) score = 15 + ((avgPower - 80) / 20) * 15;
  else if (avgPower < 120) score = 30 + ((avgPower - 100) / 20) * 10;
  else if (avgPower < 200) score = 40 + ((avgPower - 120) / 80) * 20;
  else if (avgPower < 280) score = 60 + ((avgPower - 200) / 80) * 20;
  else if (avgPower < 340) score = 80 + ((avgPower - 280) / 60) * 15;
  else if (avgPower < 450) score = 95 + ((avgPower - 340) / 110) * 5;
  else score = 100;

  return Math.min(100, score);
}

// 6. CONSISTENCY - постоянство тренировок
function calculateConsistency(activities: Activity[]): number {
  const now = new Date();
  const eightWeeksAgo = new Date(
    now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000,
  );

  const last8WeeksActivities = activities.filter(a => {
    const activityDate = new Date(a.start_date);
    return activityDate >= eightWeeksAgo && activityDate <= now;
  });

  if (last8WeeksActivities.length === 0) return 0;

  // Группируем по неделям
  const weeksData: Record<
    string,
    {count: number; totalDistance: number; isCurrentWeek: boolean}
  > = {};

  last8WeeksActivities.forEach(a => {
    const date = new Date(a.start_date);
    const weekNumber = Math.floor(
      (date.getTime() - eightWeeksAgo.getTime()) /
        (7 * 24 * 60 * 60 * 1000),
    );
    const weekKey = `week-${weekNumber}`;

    if (!weeksData[weekKey]) {
      weeksData[weekKey] = {count: 0, totalDistance: 0, isCurrentWeek: false};
    }
    weeksData[weekKey].count++;
    weeksData[weekKey].totalDistance += (a.distance || 0) / 1000;
  });

  // Заполняем недостающие недели
  const currentWeekNumber = Math.floor(
    (now.getTime() - eightWeeksAgo.getTime()) / (7 * 24 * 60 * 60 * 1000),
  );

  for (let i = 0; i < 8; i++) {
    const weekKey = `week-${i}`;
    if (!weeksData[weekKey]) {
      weeksData[weekKey] = {
        count: 0,
        totalDistance: 0,
        isCurrentWeek: i === currentWeekNumber,
      };
    } else {
      weeksData[weekKey].isCurrentWeek = i === currentWeekNumber;
    }
  }

  const weeks = Object.values(weeksData);
  const completedWeeks = weeks.filter(w => !w.isCurrentWeek);
  const currentWeek = weeks.find(w => w.isCurrentWeek);

  // ЧАСТЬ 1: Coverage (0-40)
  const weeksWithZero = completedWeeks.filter(w => w.count === 0).length;
  const weeksWithOne = completedWeeks.filter(w => w.count === 1).length;
  const weeksWithMin2 = completedWeeks.filter(w => w.count >= 2).length;
  const weeksWithMin3 = completedWeeks.filter(w => w.count >= 3).length;

  const effectiveWeeksWithZero = Math.max(0, weeksWithZero - 1);

  let coverageScore = 0;
  coverageScore -= effectiveWeeksWithZero * 5;
  coverageScore += weeksWithOne * 2.5;
  coverageScore += weeksWithMin2 * 5;
  coverageScore += weeksWithMin3 * 0.5;

  coverageScore = Math.max(0, Math.min(40, coverageScore));

  if (currentWeek && currentWeek.count >= 1) {
    coverageScore += Math.min(2, currentWeek.count * 0.5);
  }
  coverageScore = Math.min(40, coverageScore);

  // ЧАСТЬ 2: Stability (0-30)
  const weeklyDistances = completedWeeks.map(w => w.totalDistance);
  const avgWeeklyDistance =
    weeklyDistances.reduce((sum, d) => sum + d, 0) / weeklyDistances.length;

  let stabilityScore = 0;
  if (avgWeeklyDistance >= 30) {
    const variance =
      weeklyDistances.reduce(
        (sum, d) => sum + Math.pow(d - avgWeeklyDistance, 2),
        0,
      ) / weeklyDistances.length;
    const stdDev = Math.sqrt(variance);
    let cv = stdDev / avgWeeklyDistance;

    cv = Math.min(1, cv);
    stabilityScore = 30 * Math.pow(1 - cv, 1.5);
  }

  const totalScore = coverageScore + stabilityScore;
  return Math.min(100, (totalScore / 70) * 100);
}

/**
 * Определить профиль райдера на основе навыков
 */
export const determineRiderProfile = (skills: Skills): RiderProfile => {
  if (!skills) {
    return {profile: 'Unknown', description: 'Not enough data', emoji: '❓'};
  }

  const {climbing, sprint, endurance, tempo, power, consistency} = skills;
  const avgSkill =
    (climbing + sprint + endurance + tempo + power + consistency) / 6;

  // Находим доминирующий навык
  const skillsArray = [
    {name: 'climbing', value: climbing},
    {name: 'sprint', value: sprint},
    {name: 'endurance', value: endurance},
    {name: 'tempo', value: tempo},
    {name: 'power', value: power},
    {name: 'consistency', value: consistency},
  ].sort((a, b) => b.value - a.value);

  const topSkill = skillsArray[0];
  const secondSkill = skillsArray[1];

  const dominance = topSkill.value - avgSkill;

  // Развивающийся райдер
  if (avgSkill < 40) {
    return {
      profile: 'Developing Rider',
      description: 'Keep training, results will come!',
      emoji: '🎯',
    };
  }

  // All-Rounder
  const maxDiff =
    Math.max(...skillsArray.map(s => s.value)) -
    Math.min(...skillsArray.map(s => s.value));
  if (maxDiff < 20 && avgSkill >= 55) {
    return {
      profile: 'All-Rounder',
      description: 'Balanced across all areas',
      emoji: '🚴',
    };
  }

  // Consistency Champion
  if (consistency > 75 && consistency - avgSkill > 15) {
    return {
      profile: 'Consistent Trainer',
      description: 'Discipline is your strength',
      emoji: '📊',
    };
  }

  // Time Trialist
  if (tempo >= 60 && power >= 60 && (tempo + power) / 2 > avgSkill + 10) {
    return {
      profile: 'Time Trialist',
      description: 'Speed and power combined',
      emoji: '⏱️',
    };
  }

  // По доминирующему навыку
  if (dominance > 10) {
    switch (topSkill.name) {
      case 'climbing':
        return {
          profile: 'Climber',
          description: 'Mountains are your playground',
          emoji: '🏔️',
        };
      case 'sprint':
        return {
          profile: 'Sprinter',
          description: 'Explosive power on demand',
          emoji: '⚡',
        };
      case 'endurance':
        return {
          profile: 'Endurance Rider',
          description: 'Built for long distances',
          emoji: '💪',
        };
      case 'tempo':
        return {
          profile: 'Tempo Specialist',
          description: 'Sustained speed master',
          emoji: '🎯',
        };
      case 'power':
        return {
          profile: 'Power House',
          description: 'Watts for days',
          emoji: '⚡',
        };
      default:
        return {
          profile: 'Versatile Rider',
          description: 'Adapting to any challenge',
          emoji: '🚴',
        };
    }
  }

  // По топ-2
  if (topSkill.name === 'climbing' && secondSkill.name === 'endurance') {
    return {
      profile: 'Mountain Endurance',
      description: 'Long climbs specialist',
      emoji: '🏔️',
    };
  }

  if (topSkill.name === 'sprint' && secondSkill.name === 'power') {
    return {
      profile: 'Explosive Sprinter',
      description: 'Pure acceleration',
      emoji: '💥',
    };
  }

  // По умолчанию
  return {
    profile: 'Versatile Rider',
    description: 'Growing in all areas',
    emoji: '🚴',
  };
};

export default calculateAllSkills;


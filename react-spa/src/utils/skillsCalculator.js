// Утилиты для расчета навыков велосипедиста (Skills Radar Chart)

// Вспомогательная функция: медиана
const calculateMedian = (values) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

/**
 * Рассчитать все навыки на основе активностей
 * @param {Array} activities - массив активностей
 * @param {Object} powerStats - статистика мощности из PowerAnalysis
 * @param {Object} summary - сводка с VO2max из FTPAnalysis
 * @param {Date} periodStart - начало периода (опционально)
 * @param {Date} periodEnd - конец периода (опционально)
 * @returns {Object} - объект с навыками (0-100)
 */
export const calculateAllSkills = (activities, powerStats, summary, periodStart = null, periodEnd = null) => {
  if (!activities || activities.length === 0) {
    return {
      climbing: 0,
      sprint: 0,
      endurance: 0,
      tempo: 0,
      power: 0,
      consistency: 0
    };
  }

  // Если период не задан явно - используем последние 3 ПОЛНЫХ месяца
  let startDate, endDate;
  
  if (periodStart && periodEnd) {
    startDate = periodStart;
    endDate = periodEnd;
  } else {
    // Вычисляем последние 3 полных месяца
    const now = new Date();
    
    // Конец периода - последний день предыдущего месяца
    endDate = new Date(now.getFullYear(), now.getMonth(), 0);
    
    // Начало периода - 3 месяца назад от конца
    startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 2, 1);
  }
  
  const recentActivities = activities.filter(a => {
    const activityDate = new Date(a.start_date);
    return activityDate >= startDate && activityDate <= endDate;
  });

  return {
    climbing: calculateClimbing(recentActivities, null, powerStats, summary),
    sprint: calculateSprint(recentActivities),
    endurance: calculateEndurance(recentActivities, summary),
    tempo: calculateTempo(recentActivities),
    power: calculatePower(powerStats),
    consistency: calculateConsistency(activities) // использует все активности
  };
};

// 1. CLIMBING - анализ подъемов (Density + VAM)
function calculateClimbing(recentActivities, userProfile, powerStats, summary) {
  console.log('🏔️ === CLIMBING CALCULATION START ===');
  console.log('📊 Total activities to analyze:', recentActivities.length);
  
  const ridesWithElevation = recentActivities.filter(a => (a.total_elevation_gain || 0) > 100);
  console.log('📊 Rides with elevation > 100m:', ridesWithElevation.length);
  
  if (ridesWithElevation.length === 0) {
    console.log('⚠️ No rides with elevation > 100m → returning 15');
    return 15;
  }

  // ЧАСТЬ 1: Climbing Density (65%)
  const elevationData = ridesWithElevation.map(a => {
    const distance = (a.distance || 0) / 1000;
    const elevation = a.total_elevation_gain || 0;
    const per100km = distance > 0 ? (elevation / distance) * 100 : 0;
    return { name: a.name, distance, elevation, per100km };
  });
  
  console.log('📊 Elevation data per ride:', elevationData);
  
  const avgElevationPer100km = elevationData.reduce((sum, a) => sum + a.per100km, 0) / ridesWithElevation.length;
  console.log(`📊 Average elevation per 100km: ${avgElevationPer100km.toFixed(1)} m/100km`);

  let densityScore = 0;
  if (avgElevationPer100km < 200) densityScore = (avgElevationPer100km / 200) * 20;
  else if (avgElevationPer100km < 500) densityScore = 20 + (avgElevationPer100km - 200) / 300 * 20;
  else if (avgElevationPer100km < 1000) densityScore = 40 + (avgElevationPer100km - 500) / 500 * 20;
  else if (avgElevationPer100km < 1500) densityScore = 60 + (avgElevationPer100km - 1000) / 500 * 15;
  else if (avgElevationPer100km < 2000) densityScore = 75 + (avgElevationPer100km - 1500) / 500 * 15;
  else if (avgElevationPer100km < 3000) densityScore = 90 + (avgElevationPer100km - 2000) / 1000 * 10;
  else densityScore = 100;
  
  console.log(`📊 Density Score: ${densityScore.toFixed(1)}/100 (weight: 65%)`);

  // ЧАСТЬ 2: Median VAM (15% или 25% адаптивно)
  // Фильтруем только "настоящие горные" райды:
  // - elevation > 350м
  // - elevation per km > 15 м/км (средний градиент ~1.5%)
  const mountainRides = ridesWithElevation.filter(a => {
    const elevation = a.total_elevation_gain || 0;
    const distance = (a.distance || 0) / 1000;
    const elevationPerKm = distance > 0 ? elevation / distance : 0;
    return elevation > 350 && elevationPerKm > 15;
  });
  
  console.log(`📊 Mountain rides (elevation > 350m AND > 15m/km): ${mountainRides.length}`);
  
  let vamScore = 0;

  if (mountainRides.length > 0) {
    const vamValues = mountainRides.map(a => {
      const elevation = a.total_elevation_gain || 0;
      const timeHours = (a.moving_time || 0) / 3600;
      const vam = timeHours > 0 ? elevation / timeHours : 0;
      return { name: a.name, elevation, timeHours, vam };
    }).filter(v => v.vam > 0);

    console.log('📊 VAM values:', vamValues);

    if (vamValues.length > 0) {
      const medianVAM = calculateMedian(vamValues.map(v => v.vam));
      console.log(`📊 Median VAM: ${medianVAM.toFixed(1)} m/h`);

      if (medianVAM < 150) vamScore = 0;
      else if (medianVAM < 200) vamScore = (medianVAM - 150) / 50 * 20;
      else if (medianVAM < 300) vamScore = 20 + (medianVAM - 200) / 100 * 20;
      else if (medianVAM < 450) vamScore = 40 + (medianVAM - 300) / 150 * 15;
      else if (medianVAM < 600) vamScore = 55 + (medianVAM - 450) / 150 * 10;
      else if (medianVAM < 800) vamScore = 65 + (medianVAM - 600) / 200 * 15;
      else if (medianVAM < 1200) vamScore = 80 + (medianVAM - 800) / 400 * 20;
      else vamScore = 100;
      
      console.log(`📊 VAM Score: ${vamScore.toFixed(1)}/100`);
    }
  } else {
    vamScore = densityScore;
    console.log(`📊 No mountain rides → VAM Score = Density Score: ${vamScore.toFixed(1)}/100`);
  }

  // ЧАСТЬ 3: VAM при темповом HR 85-95% LTHR (20% или 10% адаптивно)
  // LTHR (Lactate Threshold Heart Rate) из summary
  const lthr = summary?.lthr || 165; // Fallback если нет данных
  const hrMin = Math.round(lthr * 0.85); // 85% LTHR (темповая зона)
  const hrMax = Math.round(lthr * 0.95); // 95% LTHR (субпороговая)
  
  console.log(`📊 LTHR: ${lthr} bpm → HR range: ${hrMin}-${hrMax} bpm (85-95% LTHR)`);
  
  const tempoHRMountainRides = mountainRides.filter(a => {
    const hr = a.average_heartrate || 0;
    return hr >= hrMin && hr <= hrMax;
  });
  
  console.log(`📊 Mountain rides with HR ${hrMin}-${hrMax}: ${tempoHRMountainRides.length}`);

  let vamHRScore = 0;
  if (tempoHRMountainRides.length > 0) {
    const vamHRValues = tempoHRMountainRides.map(a => {
      const elevation = a.total_elevation_gain || 0;
      const timeHours = (a.moving_time || 0) / 3600;
      const vam = timeHours > 0 ? elevation / timeHours : 0;
      return { name: a.name, hr: a.average_heartrate, vam };
    }).filter(v => v.vam > 0);

    console.log('📊 VAM at HR values:', vamHRValues);

    if (vamHRValues.length > 0) {
      const medianVAMHR = calculateMedian(vamHRValues.map(v => v.vam));
      console.log(`📊 Median VAM at HR: ${medianVAMHR.toFixed(1)} m/h`);

      if (medianVAMHR < 150) vamHRScore = 0;
      else if (medianVAMHR < 200) vamHRScore = (medianVAMHR - 150) / 50 * 20;
      else if (medianVAMHR < 300) vamHRScore = 20 + (medianVAMHR - 200) / 100 * 20;
      else if (medianVAMHR < 450) vamHRScore = 40 + (medianVAMHR - 300) / 150 * 15;
      else if (medianVAMHR < 600) vamHRScore = 55 + (medianVAMHR - 450) / 150 * 10;
      else if (medianVAMHR < 800) vamHRScore = 65 + (medianVAMHR - 600) / 200 * 15;
      else if (medianVAMHR < 1200) vamHRScore = 80 + (medianVAMHR - 800) / 400 * 20;
      else vamHRScore = 100;
      
      console.log(`📊 VAM at HR Score: ${vamHRScore.toFixed(1)}/100`);
    }
  } else {
    vamHRScore = vamScore;
    console.log(`📊 No rides with HR in range → VAM at HR Score = VAM Score: ${vamHRScore.toFixed(1)}/100`);
  }

  // Адаптивные веса
  let densityWeight = 0.65;
  let vamWeight = 0.15;
  let vamHRWeight = 0.2;

  if (tempoHRMountainRides.length < 3) {
    vamHRWeight = 0.1;
    vamWeight = 0.25;
    console.log(`⚠️ Less than 3 rides with HR → adjusted weights: Density 65%, VAM 25%, VAM@HR 10%`);
  } else {
    console.log(`✅ ${tempoHRMountainRides.length} rides with HR → weights: Density 65%, VAM 15%, VAM@HR 20%`);
  }

  const finalScore = Math.min(100, densityScore * densityWeight + vamScore * vamWeight + vamHRScore * vamHRWeight);
  
  console.log(`📊 === FINAL CLIMBING SCORE ===`);
  console.log(`   Density: ${densityScore.toFixed(1)} × ${densityWeight} = ${(densityScore * densityWeight).toFixed(1)}`);
  console.log(`   VAM: ${vamScore.toFixed(1)} × ${vamWeight} = ${(vamScore * vamWeight).toFixed(1)}`);
  console.log(`   VAM@HR: ${vamHRScore.toFixed(1)} × ${vamHRWeight} = ${(vamHRScore * vamHRWeight).toFixed(1)}`);
  console.log(`   TOTAL: ${finalScore.toFixed(1)}/100`);
  console.log('🏔️ === CLIMBING CALCULATION END ===\n');

  return finalScore;
}

// 2. SPRINT/ATTACK - спринтерские качества (медианы)
function calculateSprint(recentActivities) {
  const flatRides = recentActivities.filter(a => {
    const distance = (a.distance || 0) / 1000;
    const elevation = a.total_elevation_gain || 0;
    const elevationRate = distance > 0 ? (elevation / distance) : 100;
    const avgSpeedKmh = (a.average_speed || 0) * 3.6;
    // Фильтруем: равнинные заезды с приличной средней скоростью (≥22 км/ч)
    // Это исключает медленные заезды с единичными ускорениями
    return elevationRate < 10 && distance > 10 && avgSpeedKmh >= 22;
  });

  if (flatRides.length === 0) return 30;

  // 1. Медианная максимальная скорость на равнине (60%)
  const maxSpeedsFlat = flatRides.map(a => (a.max_speed || 0) * 3.6).sort((a, b) => a - b);
  const medianMaxSpeed = calculateMedian(maxSpeedsFlat);

  let maxSpeedScore = 0;
  if (medianMaxSpeed < 30) maxSpeedScore = 0;
  else if (medianMaxSpeed < 40) maxSpeedScore = (medianMaxSpeed - 30) / 10 * 20;
  else if (medianMaxSpeed < 45) maxSpeedScore = 20 + (medianMaxSpeed - 40) / 5 * 15;
  else if (medianMaxSpeed < 50) maxSpeedScore = 35 + (medianMaxSpeed - 45) / 5 * 25;
  else if (medianMaxSpeed < 55) maxSpeedScore = 60 + (medianMaxSpeed - 50) / 5 * 20;
  else if (medianMaxSpeed < 65) maxSpeedScore = 80 + (medianMaxSpeed - 55) / 10 * 20;
  else maxSpeedScore = 100;

  // 2. Медианный Variability Index (40%)
  const variabilities = flatRides
    .filter(a => a.max_speed && a.average_speed && a.average_speed > 0)
    .map(a => {
      const maxKmh = a.max_speed * 3.6;
      const avgKmh = a.average_speed * 3.6;
      return (maxKmh - avgKmh) / avgKmh;
    })
    .sort((a, b) => a - b);

  const medianVariability = variabilities.length > 0 ? calculateMedian(variabilities) : 0;

  let variabilityScore = 0;
  if (medianVariability < 0.10) variabilityScore = 0;
  else if (medianVariability < 0.20) variabilityScore = (medianVariability - 0.10) / 0.10 * 20;
  else if (medianVariability < 0.30) variabilityScore = 20 + (medianVariability - 0.20) / 0.10 * 20;
  else if (medianVariability < 0.45) variabilityScore = 40 + (medianVariability - 0.30) / 0.15 * 30;
  else if (medianVariability < 0.60) variabilityScore = 70 + (medianVariability - 0.45) / 0.15 * 20;
  else if (medianVariability < 0.80) variabilityScore = 90 + (medianVariability - 0.60) / 0.20 * 10;
  else variabilityScore = 100;

  return Math.min(100, maxSpeedScore * 0.6 + variabilityScore * 0.4);
}

// 3. ENDURANCE - выносливость (Volume + VO2max)
function calculateEndurance(recentActivities, summary) {
  const totalDistance = recentActivities.reduce((sum, a) => sum + ((a.distance || 0) / 1000), 0);
  const avgWeeklyKm = totalDistance / 12; // 12 недель = 3 месяца

  // ЧАСТЬ 1: Volume (70%)
  let volumeScore = 0;
  if (avgWeeklyKm < 20) volumeScore = 0;
  else if (avgWeeklyKm < 50) volumeScore = 5 + (avgWeeklyKm - 20) / 30 * 10;
  else if (avgWeeklyKm < 80) volumeScore = 15 + (avgWeeklyKm - 50) / 30 * 10;
  else if (avgWeeklyKm < 120) volumeScore = 25 + (avgWeeklyKm - 80) / 40 * 15;
  else if (avgWeeklyKm < 250) volumeScore = 40 + (avgWeeklyKm - 120) / 130 * 15;
  else if (avgWeeklyKm < 350) volumeScore = 55 + (avgWeeklyKm - 250) / 100 * 10;
  else if (avgWeeklyKm < 500) volumeScore = 65 + (avgWeeklyKm - 350) / 150 * 5;
  else volumeScore = 70;

  // ЧАСТЬ 2: VO2max (30%)
  let vo2maxScore = 0;
  const vo2max = summary?.vo2max;
  
  if (vo2max) {
    if (vo2max < 20) vo2maxScore = 0;
    else if (vo2max < 30) vo2maxScore = (vo2max - 20) / 10 * 5;
    else if (vo2max < 40) vo2maxScore = 5 + (vo2max - 30) / 10 * 5;
    else if (vo2max < 50) vo2maxScore = 10 + (vo2max - 40) / 10 * 5;
    else if (vo2max < 75) vo2maxScore = 15 + (vo2max - 50) / 25 * 10;
    else if (vo2max < 85) vo2maxScore = 25 + (vo2max - 75) / 10 * 5;
    else vo2maxScore = 30;
  }

  return Math.min(100, volumeScore + vo2maxScore);
}

// 4. TEMPO - темп на равнине + эффективность (Speed + Speed/HR Efficiency)
function calculateTempo(recentActivities) {
  const flatRides = recentActivities.filter(a => {
    const distance = (a.distance || 0) / 1000;
    const elevation = a.total_elevation_gain || 0;
    const elevationRate = distance > 0 ? (elevation / distance) : 100;
    return elevationRate < 10 && distance > 20;
  });

  if (flatRides.length === 0) return 0;

  // 1. МЕДИАННАЯ скорость на равнине (50%)
  const speeds = flatRides.map(a => (a.average_speed || 0) * 3.6);
  const medianSpeed = calculateMedian(speeds);

  let speedScore = 0;
  if (medianSpeed < 12) speedScore = 0;
  else if (medianSpeed < 15) speedScore = 5 + (medianSpeed - 12) / 3 * 10;
  else if (medianSpeed < 18) speedScore = 15 + (medianSpeed - 15) / 3 * 10;
  else if (medianSpeed < 22) speedScore = 25 + (medianSpeed - 18) / 4 * 15;
  else if (medianSpeed < 25) speedScore = 40 + (medianSpeed - 22) / 3 * 15;
  else if (medianSpeed < 28) speedScore = 55 + (medianSpeed - 25) / 3 * 15;
  else if (medianSpeed < 32) speedScore = 70 + (medianSpeed - 28) / 4 * 15;
  else if (medianSpeed < 36) speedScore = 85 + (medianSpeed - 32) / 4 * 10;
  else if (medianSpeed < 40) speedScore = 95 + (medianSpeed - 36) / 4 * 5;
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

      if (medianEfficiency < 0.10) efficiencyScore = 0;
      else if (medianEfficiency < 0.13) efficiencyScore = (medianEfficiency - 0.10) / 0.03 * 20;
      else if (medianEfficiency < 0.15) efficiencyScore = 20 + (medianEfficiency - 0.13) / 0.02 * 20;
      else if (medianEfficiency < 0.18) efficiencyScore = 40 + (medianEfficiency - 0.15) / 0.03 * 20;
      else if (medianEfficiency < 0.21) efficiencyScore = 60 + (medianEfficiency - 0.18) / 0.03 * 20;
      else if (medianEfficiency < 0.25) efficiencyScore = 80 + (medianEfficiency - 0.21) / 0.04 * 15;
      else efficiencyScore = 95 + Math.min((medianEfficiency - 0.25) / 0.05 * 5, 5);
    }
  } else {
    efficiencyScore = speedScore;
  }

  return Math.min(100, speedScore * 0.5 + efficiencyScore * 0.5);
}

// 5. POWER - функциональная мощность (из PowerAnalysis)
function calculatePower(powerStats) {
  if (!powerStats || !powerStats.avgPower) return 0;

  const avgPower = powerStats.avgPower;
  let score = 0;

  if (avgPower < 60) score = 0;
  else if (avgPower < 80) score = (avgPower - 60) / 20 * 15;
  else if (avgPower < 100) score = 15 + (avgPower - 80) / 20 * 15;
  else if (avgPower < 120) score = 30 + (avgPower - 100) / 20 * 10;
  else if (avgPower < 200) score = 40 + (avgPower - 120) / 80 * 20;
  else if (avgPower < 280) score = 60 + (avgPower - 200) / 80 * 20;
  else if (avgPower < 340) score = 80 + (avgPower - 280) / 60 * 15;
  else if (avgPower < 450) score = 95 + (avgPower - 340) / 110 * 5;
  else score = 100;

  return Math.min(100, score);
}

// 6. CONSISTENCY - постоянство тренировок (за последние 8 недель)
function calculateConsistency(activities) {
  const now = new Date();
  const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);
  
  const last8WeeksActivities = activities.filter(a => {
    const activityDate = new Date(a.start_date);
    return activityDate >= eightWeeksAgo && activityDate <= now;
  });

  if (last8WeeksActivities.length === 0) return 0;

  // Группируем по неделям
  const weeksData = {};
  last8WeeksActivities.forEach(a => {
    const date = new Date(a.start_date);
    const weekNumber = Math.floor((date - eightWeeksAgo) / (7 * 24 * 60 * 60 * 1000));
    const weekKey = `week-${weekNumber}`;
    
    if (!weeksData[weekKey]) {
      weeksData[weekKey] = { count: 0, totalDistance: 0, isCurrentWeek: false };
    }
    weeksData[weekKey].count++;
    weeksData[weekKey].totalDistance += (a.distance || 0) / 1000;
  });

  // Заполняем недостающие недели нулями и определяем текущую неделю
  const currentWeekNumber = Math.floor((now - eightWeeksAgo) / (7 * 24 * 60 * 60 * 1000));
  for (let i = 0; i < 8; i++) {
    const weekKey = `week-${i}`;
    if (!weeksData[weekKey]) {
      weeksData[weekKey] = { count: 0, totalDistance: 0, isCurrentWeek: i === currentWeekNumber };
    } else {
      weeksData[weekKey].isCurrentWeek = i === currentWeekNumber;
    }
  }

  const weeks = Object.values(weeksData);
  const completedWeeks = weeks.filter(w => !w.isCurrentWeek);
  const currentWeek = weeks.find(w => w.isCurrentWeek);

  // ЧАСТЬ 1: Coverage (0-40) - более лояльная логика
  // Считаем только завершенные недели
  const weeksWithZero = completedWeeks.filter(w => w.count === 0).length;
  const weeksWithOne = completedWeeks.filter(w => w.count === 1).length;
  const weeksWithMin2 = completedWeeks.filter(w => w.count >= 2).length;
  const weeksWithMin3 = completedWeeks.filter(w => w.count >= 3).length;
  
  // Grace period: 1 неделя с 0 заездов допустима (отдых/восстановление)
  const effectiveWeeksWithZero = Math.max(0, weeksWithZero - 1);
  
  // Штрафы и бонусы:
  // - 0 заездов (после grace period): -5 баллов за неделю
  // - 1 заезд: половина баллов (2.5 из 5)
  // - 2+ заезда: полные баллы (5 за неделю)
  // - 3+ заезда: бонус (+0.5 за неделю)
  let coverageScore = 0;
  coverageScore -= effectiveWeeksWithZero * 5; // штраф за пропуски
  coverageScore += weeksWithOne * 2.5; // половина баллов за 1 заезд
  coverageScore += weeksWithMin2 * 5; // полные баллы за 2+ заезда
  coverageScore += weeksWithMin3 * 0.5; // бонус за 3+ заезда
  
  // Нормализуем: 7 недель × 5 баллов = 35 максимум
  coverageScore = Math.max(0, Math.min(40, coverageScore));

  // Бонус для текущей недели, если уже есть тренировки
  if (currentWeek && currentWeek.count >= 1) {
    // Более агрессивный бонус, если много тренировок на текущей неделе
    if (currentWeek.count >= 3) {
      coverageScore += Math.min(5, currentWeek.count * 1.5); // 3 тренировки = +4.5 балла
    } else {
      coverageScore += Math.min(2, currentWeek.count * 0.5); // 1-2 тренировки = +0.5-1 балл
    }
  }
  // Финальная проверка диапазона 0-40
  coverageScore = Math.max(0, Math.min(40, coverageScore));

  // ЧАСТЬ 2: Stability (0-30)
  // Исключаем текущую неделю из расчета стабильности (она еще не завершена)
  const weeklyDistances = completedWeeks.map(w => w.totalDistance);
  const avgWeeklyDistance = weeklyDistances.reduce((sum, d) => sum + d, 0) / weeklyDistances.length;

  let stabilityScore = 0;
  if (avgWeeklyDistance >= 30) {
    const variance = weeklyDistances.reduce((sum, d) => sum + Math.pow(d - avgWeeklyDistance, 2), 0) / weeklyDistances.length;
    const stdDev = Math.sqrt(variance);
    let cv = stdDev / avgWeeklyDistance;
    
    cv = Math.min(1, cv);
    stabilityScore = 30 * Math.pow(1 - cv, 1.5);
  }

  const totalScore = coverageScore + stabilityScore;
  const finalScore = (totalScore / 70) * 100;
  
  // Гарантируем диапазон 0-100
  return Math.max(0, Math.min(100, finalScore));
}

/**
 * Определить профиль райдера на основе навыков
 * @param {Object} skills - объект с навыками (climbing, sprint, endurance, tempo, power, consistency)
 * @returns {Object} - { profile: string, description: string, emoji: string }
 */
export const determineRiderProfile = (skills) => {
  if (!skills) {
    return { profile: 'Unknown', description: 'Not enough data', emoji: '❓' };
  }

  const { climbing, sprint, endurance, tempo, power, consistency } = skills;
  const avgSkill = (climbing + sprint + endurance + tempo + power + consistency) / 6;

  // Находим доминирующий навык
  const skillsArray = [
    { name: 'climbing', value: climbing },
    { name: 'sprint', value: sprint },
    { name: 'endurance', value: endurance },
    { name: 'tempo', value: tempo },
    { name: 'power', value: power },
    { name: 'consistency', value: consistency }
  ].sort((a, b) => b.value - a.value);

  const topSkill = skillsArray[0];
  const secondSkill = skillsArray[1];
  const bottomSkill = skillsArray[skillsArray.length - 1];

  // Разница между топ навыком и средним
  const dominance = topSkill.value - avgSkill;

  // Развивающийся райдер (все навыки низкие)
  if (avgSkill < 40) {
    return {
      profile: 'Developing Rider',
      description: 'Keep training, results will come!',
      emoji: '🎯'
    };
  }

  // All-Rounder (все навыки сбалансированы)
  const maxDiff = Math.max(...skillsArray.map(s => s.value)) - Math.min(...skillsArray.map(s => s.value));
  if (maxDiff < 20 && avgSkill >= 55) {
    return {
      profile: 'All-Rounder',
      description: 'Balanced across all areas',
      emoji: '🚴'
    };
  }

  // Consistency Champion (если consistency явно выделяется)
  if (consistency > 75 && consistency - avgSkill > 15) {
    return {
      profile: 'Consistent Trainer',
      description: 'Discipline is your strength',
      emoji: '📊'
    };
  }

  // Time Trialist (Tempo + Power высокие)
  if (tempo >= 60 && power >= 60 && (tempo + power) / 2 > avgSkill + 10) {
    return {
      profile: 'Time Trialist',
      description: 'Speed and power combined',
      emoji: '⏱️'
    };
  }

  // Определяем по доминирующему навыку
  if (dominance > 10) {
    switch (topSkill.name) {
      case 'climbing':
        return {
          profile: 'Climber',
          description: 'Mountains are your playground',
          emoji: '🏔️'
        };
      case 'sprint':
        return {
          profile: 'Sprinter',
          description: 'Explosive power on demand',
          emoji: '⚡'
        };
      case 'endurance':
        return {
          profile: 'Endurance Rider',
          description: 'Built for long distances',
          emoji: '💪'
        };
      case 'tempo':
        return {
          profile: 'Tempo Specialist',
          description: 'Sustained speed master',
          emoji: '🎯'
        };
      case 'power':
        return {
          profile: 'Power House',
          description: 'Watts for days',
          emoji: '⚡'
        };
      default:
        return {
          profile: 'Versatile Rider',
          description: 'Adapting to any challenge',
          emoji: '🚴'
        };
    }
  }

  // Если нет явного доминирования - смотрим на топ-2
  if (topSkill.name === 'climbing' && secondSkill.name === 'endurance') {
    return {
      profile: 'Mountain Endurance',
      description: 'Long climbs specialist',
      emoji: '🏔️'
    };
  }

  if (topSkill.name === 'sprint' && secondSkill.name === 'power') {
    return {
      profile: 'Explosive Sprinter',
      description: 'Pure acceleration',
      emoji: '💥'
    };
  }

  // По умолчанию
  return {
    profile: 'Versatile Rider',
    description: 'Growing in all areas',
    emoji: '🚴'
  };
};

export default calculateAllSkills;


import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import './PowerAnalysis.css';

const PowerAnalysis = ({ activities }) => {
  const [riderWeight, setRiderWeight] = useState(75); // кг
  const [bikeWeight, setBikeWeight] = useState(8); // кг
  const [surfaceType, setSurfaceType] = useState('asphalt'); // тип покрытия
  const [powerData, setPowerData] = useState([]);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [windData, setWindData] = useState({}); // кэш данных о ветре
  const [useWindData, setUseWindData] = useState(true); // включить/выключить учет ветра

  // Константы для расчетов (по данным Strava)
  const GRAVITY = 9.81; // м/с²
  const AIR_DENSITY = 1.225; // кг/м³ (стандартная плотность воздуха)
  const CD_A = 0.4; // аэродинамический профиль (усредненное значение Strava)
  
  // Функция для получения данных о ветре для конкретной активности
  const getWindDataForActivity = async (activity) => {
    if (!useWindData) return null;
    
    try {
      const activityDate = new Date(activity.start_date);
      const dateKey = activityDate.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Проверяем кэш
      if (windData[dateKey]) {
        return windData[dateKey];
      }
      
      // Получаем координаты активности (используем средние координаты)
      // В реальном приложении нужно получать координаты из activity.start_latlng
      const lat = 35.1264; // примерные координаты (можно сделать настраиваемыми)
      const lng = 33.4299;
      
      // Получаем данные о ветре с Open-Meteo API
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=wind_speed_10m,wind_direction_10m&start_date=${dateKey}&end_date=${dateKey}&wind_speed_unit=ms`
      );
      
      if (!response.ok) {
        console.warn('Failed to fetch wind data for', dateKey);
        return null;
      }
      
      const data = await response.json();
      
      if (data.hourly && data.hourly.time) {
        // Находим данные для времени активности
        const activityHour = activityDate.getHours();
        const hourIndex = data.hourly.time.findIndex(time => 
          new Date(time).getHours() === activityHour
        );
        
        if (hourIndex !== -1) {
          const windSpeed = data.hourly.wind_speed_10m[hourIndex];
          const windDirection = data.hourly.wind_direction_10m[hourIndex];
          
          const windInfo = {
            speed: windSpeed, // м/с
            direction: windDirection, // градусы
            date: dateKey
          };
          
          // Кэшируем данные
          setWindData(prev => ({
            ...prev,
            [dateKey]: windInfo
          }));
          
          return windInfo;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching wind data:', error);
      return null;
    }
  };
  
  // Коэффициенты сопротивления качению для разных покрытий
  const CRR_VALUES = {
    asphalt: 0.005,      // Асфальт, хорошие шины
    concrete: 0.006,     // Бетон
    gravel: 0.012,       // Гравий
    dirt: 0.015,         // Грунт
    mountain: 0.020      // Горный велосипед
  };

  // Функция для расчета мощности по формулам Strava с учетом ветра
  const calculatePower = async (activity) => {
    if (!activity || !activity.distance || !activity.moving_time || !activity.total_elevation_gain) {
      return null;
    }

    // Проверяем, есть ли реальные данные мощности
    const hasRealPower = activity.average_watts && activity.max_watts;

    const totalWeight = riderWeight + bikeWeight; // кг
    const distance = parseFloat(activity.distance) || 0; // метры
    const time = parseFloat(activity.moving_time) || 0; // секунды
    const elevationGain = parseFloat(activity.total_elevation_gain) || 0; // метры
    const averageSpeed = parseFloat(activity.average_speed) || 0; // м/с

    // Проверяем, что у нас есть все необходимые данные
    if (distance <= 0 || time <= 0 || averageSpeed <= 0) {
      return null;
    }

    // Рассчитываем средний уклон
    // Для спусков elevationGain может быть небольшим, но реальный уклон отрицательный
    let averageGrade = elevationGain / distance;
    
    // Если это явно спуск (высокая скорость, низкий набор высоты), корректируем уклон
    const speedKmh = averageSpeed * 3.6;
    const distanceKm = distance / 1000;
    
    // Если скорость высокая (>25 км/ч) и набор высоты низкий относительно дистанции,
    // то это скорее всего спуск
    if (speedKmh > 25 && elevationGain < distanceKm * 50) {
      // Оцениваем уклон спуска на основе скорости и сопротивления
      // Чем выше скорость, тем круче спуск
      const estimatedDescentGrade = -(speedKmh - 20) / 10; // примерная оценка
      averageGrade = Math.max(-0.15, estimatedDescentGrade); // максимум -15%
    }

    // 2. Сопротивление качению
    const crr = CRR_VALUES[surfaceType];
    const rollingPower = crr * totalWeight * GRAVITY * averageSpeed;

    // Получаем данные о ветре
    const windInfo = await getWindDataForActivity(activity);
    
    // 3. Аэродинамическое сопротивление с учетом ветра
    let aeroPower = 0.5 * AIR_DENSITY * CD_A * Math.pow(averageSpeed, 3);
    let windEffect = 0;
    let windPower = 0;
    
    if (windInfo && windInfo.speed > 0) {
      // Рассчитываем эффективную скорость с учетом ветра
      // Для упрощения считаем, что направление движения совпадает с направлением активности
      // В реальном приложении нужно учитывать реальное направление движения
      const windSpeed = windInfo.speed; // м/с
      const windDirection = windInfo.direction; // градусы
      
      // Упрощенный расчет: считаем, что ветер либо попутный, либо встречный
      // В реальности нужно учитывать угол между направлением движения и ветром
      const effectiveSpeed = averageSpeed + windSpeed; // упрощенный расчет
      
      // Пересчитываем аэродинамическое сопротивление с учетом ветра
      const aeroPowerWithWind = 0.5 * AIR_DENSITY * CD_A * Math.pow(effectiveSpeed, 3);
      windPower = aeroPowerWithWind - aeroPower;
      windEffect = windPower;
      
      // Обновляем аэродинамическое сопротивление
      aeroPower = aeroPowerWithWind;
    }

    // 1. Гравитационная сила (вес + уклон)
    // На подъеме - сопротивление (положительная мощность), на спуске - помощь (отрицательная мощность)
    let gravityPower = totalWeight * GRAVITY * averageGrade * averageSpeed;
    
    // Для спусков ограничиваем гравитационную помощь
    // На крутых спусках гравитация не может полностью компенсировать сопротивление
    if (averageGrade < 0) {
      const maxAssistance = rollingPower + aeroPower; // максимальная помощь = сопротивление
      gravityPower = Math.max(-maxAssistance, gravityPower);
    }

    // 4. Общая мощность
    // На спуске гравитация помогает (отрицательная), поэтому общая мощность меньше
    let totalPower = rollingPower + aeroPower + gravityPower;
    
    // На спуске мощность не может быть меньше минимальной (просто поддержание равновесия)
    if (averageGrade < 0) {
      const minPowerOnDescent = 20; // минимальная мощность на спуске
      totalPower = Math.max(minPowerOnDescent, totalPower);
    }

    // Проверяем, что мощность получилась разумной
    if (isNaN(totalPower) || totalPower < 0 || totalPower > 10000) {
      return null;
    }

    const result = {
      total: Math.round(totalPower),
      gravity: Math.round(gravityPower),
      gravityType: averageGrade > 0 ? 'resistance' : 'assistance', // тип гравитационной силы
      rolling: Math.round(rollingPower),
      aero: Math.round(aeroPower),
      wind: Math.round(windPower), // влияние ветра
      windSpeed: windInfo ? windInfo.speed : null, // скорость ветра (м/с)
      windDirection: windInfo ? windInfo.direction : null, // направление ветра (градусы)
      grade: (averageGrade * 100).toFixed(1), // уклон в процентах
      speed: (averageSpeed * 3.6).toFixed(1), // скорость в км/ч
      distance: (distance / 1000).toFixed(1), // дистанция в км
      time: Math.round(time / 60), // время в минутах
      elevation: Math.round(elevationGain), // набор высоты в метрах
                  date: new Date(activity.start_date).toLocaleDateString('en-US', { 
              month: 'numeric', 
              day: 'numeric', 
              year: '2-digit' 
            }),
      name: activity.name,
      hasRealPower,
      realAvgPower: hasRealPower ? activity.average_watts : null,
      realMaxPower: hasRealPower ? activity.max_watts : null,
      accuracy: hasRealPower ? Math.round((Math.abs(totalPower - activity.average_watts) / activity.average_watts) * 100) : null
    };

    // Отладочная информация для проверки расчетов
    console.log(`Power calculation for "${activity.name}":`, {
      totalPower: Math.round(totalPower),
      gravityPower: Math.round(gravityPower),
      rollingPower: Math.round(rollingPower),
      aeroPower: Math.round(aeroPower),
      windPower: Math.round(windPower),
      windSpeed: windInfo ? windInfo.speed + ' m/s' : 'N/A',
      windDirection: windInfo ? windInfo.direction + '°' : 'N/A',
      averageGrade: (averageGrade * 100).toFixed(1) + '%',
      averageSpeed: (averageSpeed * 3.6).toFixed(1) + ' km/h',
      distance: (distance / 1000).toFixed(1) + ' km',
      time: Math.round(time / 60) + ' min',
      isDescent: averageGrade < 0 ? 'YES' : 'NO'
    });

    return result;
  };

  // Функция для анализа всех активностей
  const analyzeActivities = async () => {
    if (!activities || activities.length === 0) return;

    setLoading(true);
    
    try {
      // Фильтруем активности
      const filteredActivities = activities.filter(activity => activity && activity.distance > 1000);
      
      // Асинхронно рассчитываем мощность для каждой активности
      const powerPromises = filteredActivities.map(async (activity) => {
        try {
          const power = await calculatePower(activity);
          if (!power) return null;
          
          return {
            ...power,
            id: activity.id,
            originalActivity: activity
          };
        } catch (error) {
          console.error('Error calculating power for activity:', activity.id, error);
          return null;
        }
      });
      
      // Ждем завершения всех расчетов
      const powerResults = await Promise.all(powerPromises);
      
      // Фильтруем результаты и сортируем
      const analyzedData = powerResults
        .filter(Boolean)
        .sort((a, b) => new Date(b.originalActivity.start_date) - new Date(a.originalActivity.start_date));

      setPowerData(analyzedData);
      
      // Выбираем по умолчанию первый из топ-30 по мощности
      const top30 = [...analyzedData].sort((a, b) => b.total - a.total).slice(0, 30);
      if (top30.length > 0) {
        setSelectedActivity(top30[0]);
      }
    
    } catch (error) {
      console.error('Error analyzing activities:', error);
      setPowerData([]);
    } finally {
      setLoading(false);
    }
  };

  // Функция для расчета статистик
  const calculateStats = () => {
    if (!powerData || powerData.length === 0) return null;

    try {
      const powers = powerData.map(d => d.total);
    const avgPower = Math.round(powers.reduce((a, b) => a + b, 0) / powers.length);
    const maxPower = Math.max(...powers);
    const minPower = Math.min(...powers);

    // Находим лучшие результаты по мощности
    const bestByPower = [...powerData]
      .sort((a, b) => b.total - a.total)
      .slice(0, 30);

    // Отладочная информация для топ-5
    console.log('Top 5 by power:', bestByPower.map(activity => ({
      name: activity.name,
      total: activity.total,
      date: activity.date
    })));

    // Находим лучшие результаты по средней мощности (мощность/время)
    const bestByAvgPower = [...powerData]
      .map(d => ({ ...d, avgPower: Math.round(d.total / (d.time / 60)) }))
      .sort((a, b) => b.avgPower - a.avgPower)
      .slice(0, 5);



    // Статистика по точности расчетов (если есть реальные данные)
    const activitiesWithRealPower = powerData.filter(d => d.hasRealPower);
    const avgAccuracy = activitiesWithRealPower.length > 0 
      ? Math.round(activitiesWithRealPower.reduce((sum, d) => sum + d.accuracy, 0) / activitiesWithRealPower.length)
      : null;

    return {
      avgPower,
      maxPower,
      minPower,
      totalActivities: powerData.length,
      activitiesWithRealPower: activitiesWithRealPower.length,
      avgAccuracy,
      bestByPower,
      bestByAvgPower
    };
    } catch (error) {
      console.error('Error calculating stats:', error);
      return null;
    }
  };

  // Функция для форматирования времени
  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}ч ${mins}м` : `${mins}м`;
  };

  // Custom tooltip для графика
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="power-tooltip">
          <p className="tooltip-title">{data.name}</p>
          <p className="tooltip-date">{data.date}</p>
          <p className="tooltip-power">Power: <strong>{data.total} W</strong></p>
          <p className="tooltip-details">
            Speed: {data.speed} km/h<br/>
            Grade: {data.grade}%<br/>
            Distance: {data.distance} km<br/>
            Time: {formatTime(data.time)}
          </p>
          <div className="tooltip-breakdown">
            <span>
              Gravity: {data.gravity} W 
              {data.gravityType === 'assistance' ? ' (assistance)' : ' (resistance)'}
            </span>
            <span>Rolling: {data.rolling} W</span>
            <span>Aero: {data.aero} W</span>
            {data.wind !== undefined && data.wind !== 0 && (
              <span style={{ color: data.wind > 0 ? '#ef4444' : '#10b981' }}>
                Wind: {data.wind > 0 ? '+' : ''}{data.wind} W
              </span>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  useEffect(() => {
    if (activities && activities.length > 0) {
      analyzeActivities();
    }
  }, [activities, riderWeight, bikeWeight, surfaceType, useWindData]);



  // Отладочная информация для проверки данных
  useEffect(() => {
    if (powerData.length > 0) {
      console.log('Power data updated:', powerData.length, 'activities');
      
      // Находим конкретную активность "Afternoon Ride" для отладки
      const afternoonRide = powerData.find(activity => activity.name === 'Afternoon Ride');
      if (afternoonRide) {
        console.log('Afternoon Ride details:', {
          total: afternoonRide.total,
          gravity: afternoonRide.gravity,
          rolling: afternoonRide.rolling,
          aero: afternoonRide.aero,
          grade: afternoonRide.grade + '%',
          speed: afternoonRide.speed + ' km/h',
          distance: afternoonRide.distance + ' km',
          time: afternoonRide.time + ' min'
        });
      }
    }
  }, [powerData]);

  const stats = calculateStats();

  return (
    <div className="power-analysis">
      <div className="power-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent:'space-between' }}>
          <h3 style={{ color: '#f6f8ff', margin: 0}}></h3>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="settings-btn"
            title="Настройки"
            style={{ marginLeft: 12 }}
          >
            Settings
          </button>
        </div>
        
       
      </div>

      {/* Parameters */}
      {showSettings && (
        <div className="power-params">
          <div style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
          <div className="param-group">
          <label>Rider Weight (kg):</label>
          <input
            type="number"
            value={riderWeight}
            onChange={(e) => setRiderWeight(parseFloat(e.target.value) || 75)}
            min="40"
            max="150"
            step="0.5"
          />
        </div>
        <div className="param-group">
          <label>Bike Weight (kg):</label>
          <input
            type="number"
            value={bikeWeight}
            onChange={(e) => setBikeWeight(parseFloat(e.target.value) || 8)}
            min="5"
            max="20"
            step="0.1"
          />
        </div>
        <div className="param-group">
          <label>Surface Type:</label>
          <select
            value={surfaceType}
            onChange={(e) => setSurfaceType(e.target.value)}
            
          >
            <option value="asphalt">Asphalt</option>
            <option value="concrete">Concrete</option>
            <option value="gravel">Gravel</option>
            <option value="dirt">Dirt</option>
            <option value="mountain">Mountain Bike</option>
          </select>
        </div>
          </div>
       
        <div className="param-group">
          <label>Include Wind Data:</label>
          <div style={{ display: 'flex', alignItems: 'center'}}>
            <input
              type="checkbox"
              checked={useWindData}
              onChange={(e) => setUseWindData(e.target.checked)}
              style={{ minWidth: '16px', margin:'0'}}
            />
            <span style={{ marginLeft: 8, fontSize: '0.9em', color: '#b0b8c9' }}>
              Use weather API for wind calculations
            </span>
          </div>
          
        </div>
        <div className="param-info">
          <small>
            Total Weight: <strong>{riderWeight + bikeWeight} kg</strong><br/>
            CdA: {CD_A} | Crr: {CRR_VALUES[surfaceType]} | Air Density: {AIR_DENSITY} kg/m³<br/>
            Wind Data: {useWindData ? 'Enabled' : 'Disabled'}
          </small>
        </div>
      </div>
      )}

      {loading && <div className="power-loading">Analyzing activities...</div>}

      {stats && (
        <div className="power-stats">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.avgPower}</div>
              <div className="stat-label">Average Power (W)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.maxPower}</div>
              <div className="stat-label">Maximum Power (W)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.minPower}</div>
              <div className="stat-label">Minimum Power (W)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.totalActivities}</div>
              <div className="stat-label">Activities Analyzed</div>
            </div>
            {stats.avgAccuracy && (
              <div className="stat-card" style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }}>
                <div className="stat-value">±{stats.avgAccuracy}%</div>
                <div className="stat-label">Average Accuracy ({stats.activitiesWithRealPower} with power meter)</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Power Chart */}
      {powerData.length > 0 && (
        <div className="power-chart">
                     <div style={{ 
           marginTop: '40px',
           marginBottom: '40px', 
           padding: '8px 12px', 
           background: '#23272f', 
           border: '1px solid #7eaaff', 
          
           fontSize: '14px',
           color: '#b0b8c9'
         }}>
           <strong>Note:</strong> These are estimated values. Accuracy depends on GPS data quality, 
           road profile and selected parameters. For accurate measurements use a power meter.
         </div>
         
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={powerData}>
              <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#353a44" />
              <YAxis 
                tick={{ fontSize: 13, fill: '#b0b8c9' }}
                axisLine={{ stroke: '#444' }}
                tickLine={false}
                label={{ value: 'Power (W)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#b0b8c9' } }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#7eaaff"
                strokeWidth={3}
                fill="url(#powerGradient)"
                fillOpacity={0.4}
                onClick={(data) => {
                  const activity = powerData.find(d => d.id === data.id);
                  if (activity) {
                    setSelectedActivity(activity);
                  }
                }}
                style={{ cursor: 'pointer' }}
              />
              <defs>
                <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7eaaff" stopOpacity={0.32}/>
                  <stop offset="100%" stopColor="#7eaaff" stopOpacity={0.01}/>
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Best Results */}
      {stats && (
        <div className="power-best">
          <div className="best-section">
            <h4>Maximum Power Top</h4>
            <div className="best-list">
              {stats.bestByPower.map((activity, index) => (
                 <div 
                   key={activity.id} 
                   className="best-item"
                   onClick={() => setSelectedActivity(activity)}
                   style={{ cursor: 'pointer' }}
                 >
                  <div className="best-rank">#{index + 1}</div>
                  <div className="best-info">
                    <div className="best-name">{activity.name}</div>
                    <div className="best-details">
                      {activity.date} • {activity.distance} км • {formatTime(activity.time)}
                    </div>
                  </div>
                  <div className="best-power">
                    {activity.total} W
                  </div>
                </div>
              ))}
            </div>
          </div>
  {/* Detailed Analysis of Selected Activity */}
  {selectedActivity ? (
        <div className="detailed-analysis">
          <h4>{selectedActivity.name}</h4>
          <div className="analysis-grid">
            <div className="analysis-item">
              <div className="analysis-label">Estimated Power:</div>
              <div className="analysis-value">{selectedActivity.total} W</div>
            </div>
            <div className="analysis-item">
              <div className="analysis-label">Average Power (W/min):</div>
              <div className="analysis-value">{Math.round(selectedActivity.total / (selectedActivity.time / 60))} W/min</div>
            </div>
              {selectedActivity.hasRealPower && (
                <>
                  <div className="analysis-item">
                    <div className="analysis-label">Real Average Power:</div>
                    <div className="analysis-value" style={{ color: '#10b981' }}>{selectedActivity.realAvgPower} W</div>
                  </div>
                  <div className="analysis-item">
                    <div className="analysis-label">Real Maximum Power:</div>
                    <div className="analysis-value" style={{ color: '#10b981' }}>{selectedActivity.realMaxPower} W</div>
                  </div>
                  <div className="analysis-item">
                    <div className="analysis-label">Calculation Accuracy:</div>
                    <div className="analysis-value" style={{ 
                      color: selectedActivity.accuracy <= 10 ? '#10b981' : 
                             selectedActivity.accuracy <= 20 ? '#f59e0b' : '#ef4444'
                    }}>
                      ±{selectedActivity.accuracy}%
                    </div>
                  </div>
                </>
              )}
            <div className="analysis-item">
              <div className="analysis-label">
                Gravitational Force ({selectedActivity.gravityType === 'assistance' ? 'assistance' : 'resistance'}):
              </div>
              
              <div className="analysis-value" style={{ 
                color: selectedActivity.gravityType === 'assistance' ? '#10b981' : '#ef4444'
              }}>
                {selectedActivity.gravity} W
              </div>
            </div>
            
            <div className="analysis-item">
              <div className="analysis-label">Rolling Resistance:</div>
              <div className="analysis-value">{selectedActivity.rolling} W</div>
            </div>
            {selectedActivity.wind !== undefined && selectedActivity.wind !== 0 && (
              <div className="analysis-item">
                <div className="analysis-label">Wind Effect:</div>
                <div className="analysis-value" style={{ 
                  color: selectedActivity.wind > 0 ? '#ef4444' : '#10b981'
                }}>
                  {selectedActivity.wind > 0 ? '+' : ''}{selectedActivity.wind} W
                </div>
              </div>
            )}
            <div className="analysis-item">
              <div className="analysis-label">Aerodynamic Resistance:</div>
              <div className="analysis-value">{selectedActivity.aero} W</div>
            </div>
            
            {selectedActivity.windSpeed && (
              <div className="analysis-item">
                <div className="analysis-label">Wind Speed:</div>
                <div className="analysis-value">{selectedActivity.windSpeed} m/s</div>
              </div>
            )}
           
            <div className="analysis-item">
              <div className="analysis-label">Average Grade:</div>
              <div className="analysis-value">{selectedActivity.grade}%</div>
            </div>
            {selectedActivity.windDirection && (
              <div className="analysis-item">
                <div className="analysis-label">Wind Direction:</div>
                <div className="analysis-value">{selectedActivity.windDirection}°</div>
              </div>
            )}
            <div className="analysis-item">
              <div className="analysis-label">Average Speed:</div>
              <div className="analysis-value">{selectedActivity.speed} km/h</div>
            </div>
                      </div>
          </div>
        ) : (
          <div className="detailed-analysis">
            <div style={{ marginBottom: '16px' }}>
              <h4>Detailed Analysis</h4>
            </div>
            <div style={{ color: '#b0b8c9', textAlign: 'center', padding: '40px' }}>
              Loading data...
            </div>
          </div>
        )}
        
        </div>
      )}

    
    </div>
  );
};

export default PowerAnalysis; 
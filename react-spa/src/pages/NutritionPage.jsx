import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import { heroImagesUtils } from '../utils/heroImages';
import './NutritionPage.css';
import flaImg from '../assets/img/fla.png';
import gelImg from '../assets/img/gel.webp';
import barImg from '../assets/img/bar.png';
import GpxElevationChart from '../components/GpxElevationChart';

export default function NutritionPage() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [heroImage, setHeroImage] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      const cached = cacheUtils.get(CACHE_KEYS.ACTIVITIES);
      if (cached && cached.length > 0) {
        setActivities(cached);
        setLoading(false);
      } else {
        const res = await fetch('/activities');
        if (res.ok) {
          const data = await res.json();
          setActivities(data);
        }
        setLoading(false);
      }
      // hero
      try {
        const imageFilename = await heroImagesUtils.getHeroImage('nutrition');
        if (imageFilename) {
          setHeroImage(heroImagesUtils.getImageUrl(imageFilename));
        }
      } catch {}
    };
    loadData();
  }, []);

  // Вычисление дат текущего 4-недельного цикла для hero
  const planCycleDates = React.useMemo(() => {
    if (!activities.length) return { min: null, max: null };
    const weekNumbers = activities.map(a => {
      const d = new Date(a.start_date);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + 4 - (d.getDay() || 7));
      const yearStart = new Date(d.getFullYear(), 0, 1);
      return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    });
    const minWeek = Math.min(...weekNumbers);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() + 4 - (now.getDay() || 7));
    const nowWeek = (() => {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return Math.ceil((((now - yearStart) / 86400000) + 1) / 7);
    })();
    const n = Math.floor((nowWeek - minWeek) / 4);
    const startWeekInCycle = minWeek + n * 4;
    const year = now.getFullYear();
    function getDateOfISOWeek(week, year) {
      const simple = new Date(year, 0, 1 + (week - 1) * 7);
      const dow = simple.getDay();
      const ISOweekStart = simple;
      if (dow <= 4)
        ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
      else
        ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
      return ISOweekStart;
    }
    return {
      min: getDateOfISOWeek(startWeekInCycle, year),
      max: getDateOfISOWeek(startWeekInCycle + 3, year)
    };
  }, [activities]);
  const planCycleMinDate = planCycleDates.min;
  const planCycleMaxDate = planCycleDates.max;

  // Аналитика за текущий 4-недельный цикл
  const recent = activities.filter(a => {
    const d = new Date(a.start_date);
    return planCycleMinDate && planCycleMaxDate && d >= planCycleMinDate && d <= planCycleMaxDate;
  });
  const totalRides = recent.length;
  const totalTimeH = recent.reduce((sum, a) => sum + (a.moving_time || 0), 0) / 3600;
  // Калории: 600 ккал/ч если пульс <140, 850 ккал/ч если >=140
  const totalCalories = recent.reduce((sum, a) => {
    const hr = a.average_heartrate || 0;
    const t = (a.moving_time || 0) / 3600;
    return sum + t * (hr >= 140 ? 850 : 600);
  }, 0);
  // Углеводы: 35 г/ч (реалистичнее для любителя)
  const carbsPerHour = 35;
  const totalCarbs = totalTimeH * carbsPerHour;
  // Вода: 0.6 л/ч
  const totalWater = totalTimeH * 0.6;
  // Самая длинная тренировка
  let longest = null;
  recent.forEach(a => {
    if (!longest || (a.distance || 0) > (longest.distance || 0)) longest = a;
  });
  let longestStats = null;
  if (longest) {
    const distKm = (longest.distance || 0) / 1000;
    const timeH = (longest.moving_time || 0) / 3600;
    const hr = longest.average_heartrate || 0;
    const cal = timeH * (hr >= 140 ? 850 : 600);
    const carbs = timeH * carbsPerHour;
    const water = timeH * 0.6;
    // Для расчёта гелей/батончиков берём только 70% от углеводов (остальное — обычная еда)
    const gels = Math.ceil((carbs * 0.7) / 25);
    const bars = Math.ceil((carbs * 0.7) / 40);
    longestStats = { distKm, timeH, cal, carbs, water, gels, bars };
  }

  // Найти минимальную и максимальную дату в recent
  let minDate = null, maxDate = null;
  if (recent.length > 0) {
    minDate = new Date(Math.min(...recent.map(a => new Date(a.start_date).getTime())));
    maxDate = new Date(Math.max(...recent.map(a => new Date(a.start_date).getTime())));
  } else {
    minDate = planCycleMinDate;
    maxDate = planCycleMaxDate;
  }
  const formatDate = d => d ? d.toLocaleDateString('ru-RU') : '';

  // --- Конфигуратор питания ---
  const [input, setInput] = useState({
    distance: '', // км
    elevation: '', // м
    speed: '', // км/ч
    temp: '' // °C
  });
  const [result, setResult] = useState(null);

  // Логика для определения текущей недели питания (как в Анализ и план)
  function getISOWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }
  function getDateOfISOWeek(week, year) {
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4)
      ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    else
      ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    return ISOweekStart;
  }
  const getCurrentNutritionWeek = () => {
    if (!activities.length) return 0;
    const weekNumbers = activities.map(a => getISOWeekNumber(a.start_date));
    const minWeek = Math.min(...weekNumbers);
    const nowWeek = getISOWeekNumber(new Date());
    const n = Math.floor((nowWeek - minWeek) / 4);
    const startWeekInCycle = minWeek + n * 4;
    let idx = nowWeek - startWeekInCycle;
    if (idx < 0) idx = 0;
    if (idx > 3) idx = 3;
    return idx;
  };
  const getNextCycleDate = () => {
    if (!activities.length) return null;
    const weekNumbers = activities.map(a => getISOWeekNumber(a.start_date));
    const minWeek = Math.min(...weekNumbers);
    const now = new Date();
    const nowWeek = getISOWeekNumber(now);
    const year = now.getFullYear();
    // Следующий цикл начинается с недели minWeek + 4 * (n+1)
    const n = Math.floor((nowWeek - minWeek) / 4) + 1;
    const nextCycleWeek = minWeek + n * 4;
    // Если nextCycleWeek > 52, перескочим на следующий год
    let nextCycleYear = year;
    let week = nextCycleWeek;
    if (week > 52) {
      week = week - 52;
      nextCycleYear = year + 1;
    }
    return getDateOfISOWeek(week, nextCycleYear);
  };
  const currentWeekIdx = getCurrentNutritionWeek();
  const nextCycleDate = getNextCycleDate();

  const handleInput = e => {
    setInput({ ...input, [e.target.name]: e.target.value });
  };

  const handleCalc = () => {
    const dist = parseFloat(input.distance) || 0;
    const elev = parseFloat(input.elevation) || 0;
    const speed = parseFloat(input.speed) || 20;
    const temp = parseFloat(input.temp) || 20;
    if (!dist || !speed) return setResult(null);
    // Время
    const timeH = dist / speed;
    // Калории: базово 600 ккал/ч, если набор >1000м или speed>25 — 850 ккал/ч
    const intense = elev > 1000 || speed > 25;
    const calPerH = intense ? 850 : 600;
    const cal = timeH * calPerH;
    // Вода: 0.6 л/ч, если t>25°C — 0.8 л/ч, если t<10°C — 0.45 л/ч
    let waterPerH = 0.6;
    if (temp >= 25) waterPerH = 0.8;
    else if (temp <= 10) waterPerH = 0.45;
    const water = timeH * waterPerH;
    // Углеводы: 35 г/ч
    const carbs = timeH * 35;
    // Гели/батончики: 70% от углеводов
    const gels = Math.ceil((carbs * 0.7) / 25);
    const bars = Math.ceil((carbs * 0.7) / 40);
    setResult({ timeH, cal, water, carbs, gels, bars, waterPerH });
  };

  return (
    <div className="main-layout">
      <Sidebar />
      <div className="main">
        <>
          <div id="nutrition-hero-banner" className="plan-hero hero-banner" style={{ backgroundImage: heroImage ? `url(${heroImage})` : 'none' }}>
            <h1 className="hero-title" style={{ fontSize: '2.1rem', fontWeight: 700, margin: '0 0 2em 0', color: '#fff', marginLeft: '3.5rem' }}>Питание и гидратация</h1>
            <br />
            <br />
            <br />
            {planCycleMinDate && planCycleMaxDate && (
              <div style={{ color: '#fff', fontSize: '0.9em', opacity: 0.8, marginLeft: '3.5rem', marginBottom: '1em' }}>
                Период: <b>{planCycleMinDate.toLocaleDateString('ru-RU')}</b> — <b>{planCycleMaxDate.toLocaleDateString('ru-RU')}</b>
              </div>
            )}
            <div className="hero-content-nutrition">
              <div className="nutrition-hero-stats">
                <div className="nutrition-hero-cards">
                  <div className="nutrition-hero-card">
                    <span className="big-number">~{Math.round(totalCalories).toLocaleString()}</span>
                    <span className="stat-label">ккал</span>
                  </div>
                  <div className="nutrition-hero-card">
                    <span className="big-number">{totalTimeH.toFixed(1)}</span>
                    <span className="stat-label">часов</span>
                  </div>
                  <div className="nutrition-hero-card">
                    <span className="big-number">~{Math.round(totalCarbs)}</span>
                    <span className="stat-label">г углеводов</span>
                  </div>
                  <div className="nutrition-hero-card">
                    <span className="big-number">~{totalWater.toFixed(1)}</span>
                    <span className="stat-label">л воды</span>
                  </div>
                  <div className="nutrition-hero-card">
                    <span className="big-number">{totalRides}</span>
                    <span className="stat-label">трен.</span>
                  </div>
                </div>
              </div>
              
              {longestStats && (
                <div className="longest-ride-banner">
                  <b>Самая длинная тренировка:</b> {longestStats.distKm.toFixed(0)} км, {longestStats.timeH.toFixed(1)} ч, ~{Math.round(longestStats.cal)} ккал, нужно было взять <b>{longestStats.gels}</b> геля, <b>{longestStats.bars}</b> батончика, {longestStats.water.toFixed(1)} л воды
                 
                </div>
              )}
            </div>
          </div>
          {/* Конфигуратор питания */}
          <div className="nutrition-calc-wrap">
            <h2 style={{ marginTop: 0 }}>Калькулятор питания и воды</h2>
            <div className="nutrition-calc-fields">
              <div>
                <label>Дистанция (км):<br /><input type="number" name="distance" value={input.distance} onChange={handleInput} min="0" placeholder="105" /></label>
              </div>
              <div>
                <label>Набор высоты (м):<br /><input type="number" name="elevation" value={input.elevation} onChange={handleInput} min="0" placeholder="1200" /></label>
              </div>
              <div>
                <label>Ср. скорость (км/ч):<br /><input type="number" name="speed" value={input.speed} onChange={handleInput} min="5" max="60" placeholder="27" /></label>
              </div>
              <div>
                <label>Температура (°C):<br /><input type="number" name="temp" value={input.temp} onChange={handleInput} min="-10" max="45" placeholder="22" /></label>
              </div>
            </div>
            <div>
              <button onClick={handleCalc} style={{ color: '#274DD3', background: 'none', border: 'none', padding: 0, fontSize: '1em', fontWeight: 600, cursor: 'pointer' }}>Рассчитать</button>
            </div>
            {result && (
              <div className="nutrition-calc-result">
                <div className="nutrition-calc-flex-row">
                  <div className="nutrition-calc-thumbs">
                    <div className="nutrition-calc-item">
                      <img src={flaImg} alt="Фляга" className="nutrition-calc-img" />
                      <span className="nutrition-calc-item-label">x{Math.ceil(result.water / 0.5)}</span>
                    </div>
                    <div className="nutrition-calc-item">
                      <img src={gelImg} alt="Гель" className="nutrition-calc-img" />
                      <span className="nutrition-calc-item-label">x{result.gels}</span>
                    </div>
                    <div className="nutrition-calc-item">
                      <img src={barImg} alt="Батончик" className="nutrition-calc-img" />
                      <span className="nutrition-calc-item-label">x{result.bars}</span>
                    </div>
                  </div>
                  <div className="nutrition-calc-row-results">
                    <div className="nutrition-calc-result-item">
                      <b>Время в пути:</b> {result.timeH.toFixed(2)} ч
                    </div>
                    <div className="nutrition-calc-result-item">
                      <b>Калории:</b> ~{Math.round(result.cal).toLocaleString()} ккал
                    </div>
                    <div className="nutrition-calc-result-item">
                      <b>Вода:</b> ~{result.water.toFixed(1)} л <span className="nutrition-calc-result-hint">(по {result.waterPerH} л/ч, скорректировано по температуре)</span>
                    </div>
                    <div className="nutrition-calc-result-item">
                      <b>Углеводы:</b> ~{Math.round(result.carbs)} г
                      <div className="nutrition-calc-result-hint">(часть углеводов можно заменить обычной едой)</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="nutrition-calc-hint">
              <b>Пояснения:</b><br />
            <div>Вода: 0.6 л/ч (жара: 0.8 л/ч, холод: 0.45 л/ч)</div>
            <div>Углеводы: 35 г/ч (гели — 25 г, батончик — 40 г, 70% от общего — спортивное питание)</div>
            <div>Калории: 600 ккал/ч (интенсивно/много набора — 850 ккал/ч)</div>
            <div>Часть углеводов можно получить из обычной еды: бананы, булочки, изотоник</div>
          </div>
        </div>

        <GpxElevationChart />

        {/* Рекомендованное питание по неделям */}
        <div className="nutrition-recommend-block">
       
          <div className="nutrition-recommend-content-row">
          <div className="nutrition-menu-left">MENU</div>
            <div className="nutrition-menu-content">
              <div className="nutrition-weeks-row">
                {nextCycleDate && (
                  <div style={{width:'100%',textAlign:'left',fontSize:'0.95em',color:'#fff',marginBottom:'0.5em'}}>
                    Следующее обновление цикла: <b>{nextCycleDate.toLocaleDateString('ru-RU')}</b>
                  </div>
                )}
                {[1,2,3,4].map((week, idx) => (
                  <div
                    key={week}
                    className={`nutrition-week-card${currentWeekIdx === idx ? ' current' : ''}`}
                  >
                    <b className={`nutrition-week-title week${week}`}>Неделя {week}</b>
                    {currentWeekIdx === idx && (
                      <span className="nutrition-week-badge">Текущая</span>
                    )}
                    <div className="nutrition-week-focus">
                      {week === 1 && 'Базовое питание, адаптация'}
                      {week === 2 && 'Увеличение углеводов, поддержка восстановления'}
                      {week === 3 && 'Включение сложных углеводов, разнообразие белков'}
                      {week === 4 && 'Лёгкая неделя, акцент на овощи и восстановление'}
                    </div>
                    <div className="nutrition-week-menu">
                      {week === 1 && 'Овсянка, яйца, курица, овощи, цельнозерновой хлеб, фрукты, орехи'}
                      {week === 2 && 'Рис, паста, рыба, творог, бананы, ягоды, овощи, бобовые'}
                      {week === 3 && 'Гречка, индейка, фасоль, брокколи, йогурт, яблоки, семечки'}
                      {week === 4 && 'Овощные супы, рыба, яйца, кефир, ягоды, зелень, картофель'}
                    </div>
                  </div>
                ))}
              </div>
              <div className="nutrition-recommend-columns">
                <div className="nutrition-recommend-col">
                  <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
                    <span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: '50%', background: '#28a745' }}></span>
                  </div>
                  
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: '1.1em', display: 'block', textAlign: 'left', marginBottom: '0.3em' }}>
                    Рекомендуется:
                  </span>
                  <div>Овощи, зелень, ягоды, фрукты, Крупы: овсянка, гречка, рис, киноа, Постное мясо: курица, индейка, рыба, Яйца, творог, йогурт, Орехи, семечки (умеренно), Оливковое, льняное масло, Цельнозерновой хлеб, макароны из твёрдых сортов</div>
                </div>
                <div className="nutrition-recommend-col">
                  <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
                    <span style={{ display: 'inline-block', width: 18, height: 18, background: '#ffc107', borderRadius: 3 }}></span>
                  </div>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: '1.1em', display: 'block', textAlign: 'left', marginBottom: '0.3em' }}>
                    Ограничить:
                  </span>
                  <div>Жареное, копчёное, Сливочное масло, маргарин, Сладости, выпечка, Колбасы, сосиски, Фастфуд, Газировка, энергетики, Алкоголь, майонез</div>
                </div>
                <div className="nutrition-recommend-col">
                  <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
                    <span style={{ display: 'inline-block', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderBottom: '18px solid #dc3545', marginRight: 2 }}></span>
                  </div>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: '1.1em', display: 'block', textAlign: 'left', marginBottom: '0.3em' }}>
                    Избегать:
                  </span>
                  <div>Трансжиры (чипсы, магазинные торты, майонез), Много жаренного и вредного жира, Сильно обработанные продукты, Сладкие газированные напитки, Большое количество соли</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Удалён блок .nutrition-analytics-block с таблицей 'Аналитика по тренировкам' */}
        <div className="nutrition-tips-row">
          <div className="nutrition-tip-block">
            <h2>Рекомендации по питанию</h2>
            <div><b>Перед тренировкой:</b> за 2–3 ч — сложные углеводы, немного белка, мало жира. За 30–60 мин — лёгкий перекус (банан, батончик).</div>
            <div><b>Во время тренировки:</b> если &lt;1 ч — только вода. 1–2 ч: 30–60 г углеводов/ч. &gt;2 ч: 60–90 г/ч, электролиты, пить каждые 10–15 мин.</div>
            <div><b>После тренировки:</b> в течение 30 мин — углеводы + белок (3:1), восстановить электролиты.</div>
          </div>
          <div className="nutrition-tip-block">
            <h2>Памятка</h2>
            <div>Пить 0.5–0.8 л воды в час, есть — каждые 30–40 мин.</div>
            <div>Для длинных поездок: брать запас воды, гели, батончики, электролиты.</div>
            <div>Вести дневник питания и самочувствия.</div>
          </div>
        </div>
          </>
      </div>
    </div>
  );
} 
import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import { heroImagesUtils } from '../utils/heroImages';
import './NutritionPage.css';
import flaImg from '../assets/img/fla.png';
import gelImg from '../assets/img/gel.webp';
import barImg from '../assets/img/bar.png';

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

  // Аналитика за 4 недели
  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const recent = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
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
    minDate = fourWeeksAgo;
    maxDate = now;
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
            <div className="hero-content-nutrition">
              <div className="nutrition-hero-stats">
                <span style={{ fontSize: '0.95em', color: '#fff', opacity: 0.7 }}>
                  Период: <b>{formatDate(minDate)}</b> — <b>{formatDate(maxDate)}</b>
                </span>
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
          <div className="nutrition-analytics-block">
            <h2>Аналитика по тренировкам</h2>
            <table className="styled-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Дистанция, км</th>
                  <th>Время, ч</th>
                  <th>Калории</th>
                  <th>Углеводы, г</th>
                  <th>Вода, л</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a, i) => {
                  const dist = (a.distance || 0) / 1000;
                  const t = (a.moving_time || 0) / 3600;
                  const hr = a.average_heartrate || 0;
                  const cal = t * (hr >= 140 ? 850 : 600);
                  const carbs = t * 50;
                  const water = t * 0.6;
                  return (
                    <tr key={i}>
                      <td>{a.start_date ? new Date(a.start_date).toLocaleDateString('ru-RU') : ''}</td>
                      <td>{dist.toFixed(1)}</td>
                      <td>{t.toFixed(2)}</td>
                      <td>{Math.round(cal)}</td>
                      <td>{Math.round(carbs)}</td>
                      <td>{water.toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      </div>
    </div>
  );
} 
import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import { heroImagesUtils } from '../utils/heroImages';
import './NutritionPage.css';
import flaImg from '../assets/img/fla.png';
import gelImg from '../assets/img/gel.webp';
import barImg from '../assets/img/bar.png';
import GpxElevationChart from '../components/GpxElevationChart';
import { apiFetch } from '../utils/api';
import { jwtDecode } from 'jwt-decode';
import PageLoadingOverlay from '../components/PageLoadingOverlay';
import Footer from '../components/Footer';
import defaultHeroImage from '../assets/img/hero/lb.webp';

export default function NutritionPage() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [heroImage, setHeroImage] = useState(null);
  const [summary, setSummary] = useState(null);
  const [period, setPeriod] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(true);

  // Получить userId из токена
  function getUserId() {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) return null;
    try {
      const decoded = jwtDecode(token);
      return decoded.userId;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    let userId = null, stravaId = null;
    try {
      const decoded = jwtDecode(token);
      userId = decoded.userId;
      stravaId = decoded.strava_id;
    } catch {}
    if (userId && !stravaId) {
      localStorage.removeItem(`cycleprog_cache_activities_${userId}`);
      setActivities([]);
      setSummary(null);
      setPeriod(null);
    }
    const loadData = async () => {
      setPageLoading(true);
  
      
      const userId = getUserId();
      const cacheKey = userId ? `activities_${userId}` : CACHE_KEYS.ACTIVITIES;
      const cached = cacheUtils.get(cacheKey);
      if (cached && cached.length > 0) {
        setActivities(cached);
        setLoading(false);
      } else {
        const data = await apiFetch('/api/activities');
        setActivities(data);
        cacheUtils.set(cacheKey, data, 30 * 60 * 1000);
        setLoading(false);
      }
      // hero
      try {
        const imageFilename = await heroImagesUtils.getHeroImage('nutrition');
        if (imageFilename) {
          setHeroImage(heroImagesUtils.getImageUrl(imageFilename));
        }
      } catch {}
      // Загружаем аналитику с сервера
      try {
        setAnalyticsLoading(true);
        const data = await apiFetch('/api/analytics/summary');
        setSummary(data.summary);
        setPeriod(data.period);
      } finally {
        setAnalyticsLoading(false);
      }
      

      setPageLoading(false);
    };
    loadData();
  }, [localStorage.getItem('token')]);

  // Вместо вычислений по activities используем только summary и period с бэкенда
  // В hero-блоке:
  // summary.totalCalories, summary.totalTimeH, summary.totalCarbs, summary.totalWater, summary.totalRides и т.д.
  // Найти минимальную и максимальную дату в recent
  // Для отображения периода
  const formatDate = d => d ? new Date(d).toLocaleDateString('ru-RU') : '';

  // --- Конфигуратор питания ---
  const [input, setInput] = useState({
    distance: '', // km
    elevation: '', // m
    speed: '', // km/h
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
      <PageLoadingOverlay isLoading={pageLoading} loadingText="Calculating nutrition..." />
      <Sidebar />
      <div className="main">
        {!pageLoading && (
        <>
          <div id="nutrition-hero-banner" className="plan-hero hero-banner" style={{ backgroundImage: heroImage ? `url(${heroImage})` : `url(${defaultHeroImage})` }}>
            <h1 className="hero-title" style={{ fontSize: '2.1rem', fontWeight: 700, margin: '0 0 2em 0', color: '#fff', marginLeft: '3.5rem' }}>Nutrition and Hydration</h1>
            <br />
            <br />
            <br />
            {period && period.start && period.end && (
              <div style={{ color: '#fff', fontSize: '0.9em', opacity: 0.8, marginLeft: '3.5rem', marginBottom: '1em' }}>
                Period: <b>{formatDate(period.start)}</b> — <b>{formatDate(period.end)}</b>
              </div>
            )}
            <div className="hero-content-nutrition">
              <div className="nutrition-hero-stats">
                <div className="nutrition-hero-cards">
                  {analyticsLoading ? (
                    <div style={{ color: '#fff', fontSize: '1.1em', opacity: 0.7 }}>Loading...</div>
                  ) : summary ? (
                    <>
                  <div className="nutrition-hero-card">
                        <span className="big-number">~{summary.totalCalories.toLocaleString()}</span>
                        <span className="stat-label">kcal</span>
                  </div>
                  <div className="nutrition-hero-card">
                        <span className="big-number">{summary.totalTimeH}</span>
                        <span className="stat-label">hours</span>
                  </div>
                  <div className="nutrition-hero-card">
                        <span className="big-number">~{summary.totalCarbs}</span>
                        <span className="stat-label">g carbs</span>
                  </div>
                  <div className="nutrition-hero-card">
                        <span className="big-number">~{summary.totalWater}</span>
                        <span className="stat-label">liters of water</span>
                  </div>
                  <div className="nutrition-hero-card">
                        <span className="big-number">{summary.totalRides}</span>
                        <span className="stat-label">rides</span>
                  </div>
                    </>
                  ) : (
                    <div style={{ color: '#fff', fontSize: '1.1em', opacity: 0.7 }}>No data</div>
                  )}
                </div>
              </div>
              
              {/* Removed longest ride banner as it relied on client-side calculations */}
            </div>
          </div>
          {/* Конфигуратор питания */}
          <div className="nutrition-calc-wrap">
            <h2 style={{ marginTop: 0 }}>Nutrition and Hydration Calculator</h2>
            <div className="nutrition-calc-fields">
              <div>
                <label>Distance (km):<br /><input type="number" name="distance" value={input.distance} onChange={handleInput} min="0" placeholder="105" /></label>
              </div>
              <div>
                <label>Elevation Gain (m):<br /><input type="number" name="elevation" value={input.elevation} onChange={handleInput} min="0" placeholder="1200" /></label>
              </div>
              <div>
                <label>Average Speed (km/h):<br /><input type="number" name="speed" value={input.speed} onChange={handleInput} min="5" max="60" placeholder="27" /></label>
              </div>
              <div>
                <label>Temperature (°C):<br /><input type="number" name="temp" value={input.temp} onChange={handleInput} min="-10" max="45" placeholder="22" /></label>
              </div>
            </div>
            <div>
              <button onClick={handleCalc} style={{ color: '#274DD3', background: 'none', border: 'none', padding: 0, fontSize: '1em', fontWeight: 600, cursor: 'pointer' }}>Calculate</button>
            </div>
            {result && (
              <div className="nutrition-calc-result">
                <div className="nutrition-calc-flex-row">
                  <div className="nutrition-calc-thumbs">
                    <div className="nutrition-calc-item">
                      <img src={flaImg} alt="Flask" className="nutrition-calc-img" />
                      <span className="nutrition-calc-item-label">x{Math.ceil(result.water / 0.5)}</span>
                    </div>
                    <div className="nutrition-calc-item">
                      <img src={gelImg} alt="Gel" className="nutrition-calc-img" />
                      <span className="nutrition-calc-item-label">x{result.gels}</span>
                    </div>
                    <div className="nutrition-calc-item">
                      <img src={barImg} alt="Bar" className="nutrition-calc-img" />
                      <span className="nutrition-calc-item-label">x{result.bars}</span>
                    </div>
                  </div>
                  <div className="nutrition-calc-row-results">
                    <div className="nutrition-calc-result-item">
                      <b>Time in motion:</b> {result.timeH.toFixed(2)} h
                    </div>
                    <div className="nutrition-calc-result-item">
                      <b>Calories:</b> ~{Math.round(result.cal).toLocaleString()} kcal
                    </div>
                    <div className="nutrition-calc-result-item">
                      <b>Water:</b> ~{result.water.toFixed(1)} l <span className="nutrition-calc-result-hint">(based on {result.waterPerH} l/h, adjusted for temperature)</span>
                    </div>
                    <div className="nutrition-calc-result-item">
                      <b>Carbs:</b> ~{Math.round(result.carbs)} g
                      <div className="nutrition-calc-result-hint">(some carbs can be replaced with regular food)</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="nutrition-calc-hint">
              <b>Notes:</b><br />
            <div>Water: 0.6 l/h (hot: 0.8 l/h, cold: 0.45 l/h)</div>
            <div>Carbs: 35 g/h (gels — 25 g, bars — 40 g, 70% of total — sports nutrition)</div>
            <div>Calories: 600 kcal/h (intense/high elevation — 850 kcal/h)</div>
            <div>Some carbs can be obtained from regular food: bananas, buns, isotonic</div>
          </div>
        </div>

        <GpxElevationChart />

        {/* Recommended nutrition by weeks */}
        <div className="nutrition-recommend-block">
       
          <div className="nutrition-recommend-content-row">
          <div className="nutrition-menu-left">NUTRITION</div>
            <div className="nutrition-menu-content">
          <div className="nutrition-weeks-row">
                {nextCycleDate && (
                  <div style={{width:'100%',textAlign:'left',fontSize:'0.95em',color:'#fff',marginBottom:'0.5em'}}>
                    Next cycle update: <b>{nextCycleDate.toLocaleDateString('ru-RU')}</b>
            </div>
                )}
                {[1,2,3,4].map((week, idx) => (
                  <div
                    key={week}
                    className={`nutrition-week-card${currentWeekIdx === idx ? ' current' : ''}`}
                  >
                    <b className={`nutrition-week-title week${week}`}>Week {week}</b>
                    {currentWeekIdx === idx && (
                      <span className="nutrition-week-badge">Current</span>
                    )}
                    <div className="nutrition-week-focus">
                      {week === 1 && 'Base nutrition, adaptation'}
                      {week === 2 && 'Increased carbs, support recovery'}
                      {week === 3 && 'Inclusion of complex carbs, variety of proteins'}
                      {week === 4 && 'Light week, emphasis on vegetables and recovery'}
            </div>
                    <div className="nutrition-week-menu">
                      {week === 1 && 'Oatmeal, eggs, chicken, vegetables, whole grain bread, fruits, nuts'}
                      {week === 2 && 'Rice, pasta, fish, yogurt, bananas, berries, vegetables, legumes'}
                      {week === 3 && 'Buckwheat, turkey, lentils, broccoli, yogurt, apples, sunflower seeds'}
                      {week === 4 && 'Vegetable soups, fish, eggs, kefir, berries, herbs, potatoes'}
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
                    Recommended:
                  </span>
                  <div>Vegetables, herbs, berries, fruits, Grains: oatmeal, buckwheat, rice, quinoa, Plant-based meat: chicken, turkey, fish, Eggs, yogurt, cheese, Nuts, seeds (moderate), Olive oil, flaxseed oil, Whole grain bread, pasta from hard varieties</div>
            </div>
            <div className="nutrition-recommend-col">
                  <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
                    <span style={{ display: 'inline-block', width: 18, height: 18, background: '#ffc107', borderRadius: 3 }}></span>
                  </div>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: '1.1em', display: 'block', textAlign: 'left', marginBottom: '0.3em' }}>
                    Limit:
                  </span>
                  <div>Fried, smoked, Butter, margarine, Sweets, bakery, Sausages, sausages, Fast food, Soft drinks, energy drinks, Alcohol, mayonnaise</div>
            </div>
            <div className="nutrition-recommend-col">
                  <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
                    <span style={{ display: 'inline-block', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderBottom: '18px solid #dc3545', marginRight: 2 }}></span>
                  </div>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: '1.1em', display: 'block', textAlign: 'left', marginBottom: '0.3em' }}>
                    Avoid:
                  </span>
                  <div>Trans fats (chips, store-bought cakes, mayonnaise), A lot of fried and unhealthy fat, Highly processed foods, Sugary carbonated drinks, Large amounts of salt</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Удалён блок .nutrition-analytics-block с таблицей 'Аналитика по тренировкам' */}
        <div className="nutrition-tips-row">
          <div className="nutrition-tip-block">
            <h2>Nutrition Recommendations</h2>
            <div><b>Before training:</b> 2–3 hours before — complex carbs, some protein, little fat. 30–60 minutes before — light snack (banana, bar).</div>
            <div><b>During training:</b> if &lt;1 hour — only water. 1–2 hours: 30–60 g carbs/h. &gt;2 hours: 60–90 g/h, electrolytes, drink every 10–15 minutes.</div>
            <div><b>After training:</b> within 30 minutes — carbs + protein (3:1), replenish electrolytes.</div>
          </div>
          <div className="nutrition-tip-block">
            <h2>Memo</h2>
            <div>Drink 0.5–0.8 l of water per hour, eat — every 30–40 minutes.</div>
            <div>For long rides: take water reserves, gels, bars, electrolytes.</div>
            <div>Keep a food diary and self-assessment.</div>
          </div>
        </div>
          </>
        )}
      </div>
      
      <Footer />
    </div>
  );
} 
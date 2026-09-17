import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { apiFetch } from '../utils/api';
import { cooperTestVO2max, vo2maxCategory } from '@bikelab/shared/calc';

// Same category boundaries as the shared `vo2maxCategory` (<30/<40/<50/<60/<70/else),
// with this page's own display labels (T-3.2).
const VO2MAX_CATEGORY_LABELS = {
  beginner: 'Beginner',
  belowAverage: 'Below Average',
  average: 'Average',
  aboveAverage: 'Above Average',
  excellent: 'Excellent',
  elite: 'Elite',
};
import MetaGoalRow from '../components/MetaGoalRow';
import BlobOrb from '../components/BlobOrb';
import './GoalAssistantPage.css';
import flaImg from '../assets/img/fla.png';
import gelImg from '../assets/img/gel.webp';
import barImg from '../assets/img/bar.png';
import PartnersLogo from '../components/PartnersLogo';
import Footer from '../components/Footer';
import garminLogoSvg from '../assets/img/logo/garmin_tag_black.png';
import stravaBlackSvg from '../assets/img/logo/api_logo_pwrdBy_strava_stack_black.svg';

export default function GoalAssistantPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [metaGoals, setMetaGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [goalInput, setGoalInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [activities, setActivities] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('active'); // 'active' or 'completed'

  // Display name for the hero greeting — same source Sidebar.jsx already
  // reads (localStorage, refreshed from the auth JWT), no new fetch added.
  const [userName, setUserName] = useState(() => {
    const stored = localStorage.getItem('user_name');
    return stored ? stored.split(' ')[0] : 'there';
  });

  // VO2max Calculator State
  const [vo2maxData, setVo2maxData] = useState({
    manual: null,
    testDistance: '',
    age: '',
    weight: '',
    gender: 'male'
  });

  // Nutrition Calculator State
  const [input, setInput] = useState({ distance: '', elevation: '', speed: '', temp: '' });
  const [result, setResult] = useState(null);

  useEffect(() => {
    loadMetaGoals();
    loadActivities();
    loadUserProfile();

    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) {
      try {
        const decoded = jwtDecode(token);
        if (decoded.name) setUserName(decoded.name.split(' ')[0]);
      } catch (e) {
        // keep whatever localStorage already had
      }
    }
  }, []);

  // Prefill from GoalDetailPage's "Ask coach for a plan" CTA (Trainings tab
  // empty state) — it navigates here with { state: { initialPrompt } } since
  // this page's AI input is the closest equivalent to the app's dedicated
  // CoachChat screen. Consumed once so it doesn't reappear on back/forward.
  useEffect(() => {
    const prefill = location.state?.initialPrompt;
    if (prefill) {
      setGoalInput(prefill);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadUserProfile = async () => {
    try {
      const profile = await apiFetch('/api/user-profile');
      setUserProfile(profile);
      
      // Автозаполнение полей калькуляторов из профиля
      if (profile?.weight || profile?.age || profile?.gender) {
        setVo2maxData(prev => ({
          ...prev,
          weight: profile.weight || prev.weight,
          age: profile.age || prev.age,
          gender: profile.gender || prev.gender
        }));
      }
    } catch (e) {
      console.error('Error loading user profile:', e);
    }
  };

  const loadMetaGoals = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      const data = await apiFetch('/api/meta-goals');
      setMetaGoals(data || []);
    } catch (e) {
      console.error('Error loading meta goals:', e);
      setError('Failed to load goals');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const loadActivities = async () => {
    try {
      const data = await apiFetch('/api/activities');
      setActivities(data || []);
    } catch (e) {
      console.error('Error loading activities:', e);
    }
  };

  // Проверка релевантности запроса на клиенте
  const isRelevantToCycling = (text) => {
    const lowerText = text.toLowerCase();
    
    // Ключевые слова велоспорта и фитнеса
    const cyclingKeywords = [
      'bike', 'cycling', 'ride', 'fondo', 'км', 'km', 'distance', 'велосипед',
      'ftp', 'vo2', 'power', 'watts', 'cadence', 'speed', 'climb', 'elevation',
      'hill', 'training', 'workout', 'endurance', 'fitness', 'race', 'event',
      'competition', 'gran fondo', 'century', 'brevet', 'sportive', 'pedal',
      'грандфондо', 'тренировка', 'заезд', 'гонка', 'выносливость', 'дистанция',
      'подъем', 'спуск', 'heart rate', 'hr', 'pulse', 'пульс', 'tempo', 'interval',
      'recovery', 'base', 'threshold', 'zone', 'improve', 'prepare', 'build'
    ];
    
    // Явно нерелевантные темы
    const irrelevantKeywords = [
      'cook', 'recipe', 'food', 'meal', 'пельмени', 'готовить', 'рецепт', 'еда',
      'program', 'code', 'python', 'javascript', 'программ', 'сайт',
      'movie', 'film', 'book', 'music', 'фильм', 'книга', 'музыка',
      'weather', 'погода', 'news', 'новости', 'варить', 'жарить'
    ];
    
    // Сначала проверяем нерелевантные слова
    const hasIrrelevant = irrelevantKeywords.some(keyword => lowerText.includes(keyword));
    if (hasIrrelevant) return false;
    
    // Проверяем наличие ключевых слов
    const hasKeyword = cyclingKeywords.some(keyword => lowerText.includes(keyword));
    
    return hasKeyword;
  };

  const handleGenerateGoal = async () => {
    if (!goalInput.trim()) {
      setError('Please describe your goal');
      return;
    }

    // Клиентская валидация релевантности
    if (!isRelevantToCycling(goalInput)) {
      setError('🚴 Please describe a cycling-related goal. For example: "Ride 300km per week" or "Prepare for Gran Fondo".');
      return;
    }

    try {
      setGenerating(true);
      setError(null);

      const result = await apiFetch('/api/meta-goals/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userGoalDescription: goalInput
        })
      });

      console.log('✅ Goal generated:', result);
      
      // Очищаем input
      setGoalInput('');
      
      // Перезагружаем мета-цели
      await loadMetaGoals();
      
      // Переходим к детальной странице новой цели
      navigate(`/goal-assistant/${result.metaGoal.id}`);
      
    } catch (e) {
      console.error('Error generating goal:', e);
      setError(e.message || 'Failed to generate goal. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleQuickTemplate = (template) => {
    setGoalInput(template);
    setError(''); // Очищаем ошибку при выборе шаблона
  };

  const calculateMetaProgress = (metaGoal) => {
    // Фильтруем подцели для этой мета-цели
    const subGoals = metaGoal.sub_goals || [];
    
    if (subGoals.length === 0) return 0;
    
    // Вычисляем средний прогресс по всем подцелям
    const totalProgress = subGoals.reduce((sum, goal) => {
      const progress = goal.target_value > 0 
        ? Math.min((goal.current_value / goal.target_value) * 100, 100)
        : 0;
      return sum + progress;
    }, 0);
    
    return Math.round(totalProgress / subGoals.length);
  };

  // VO2max Calculator Handler
  const handleVO2maxInput = (field, value) => {
    setVo2maxData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Nutrition Calculator Handlers
  const handleInput = (e) => {
    const { name, value } = e.target;
    setInput(prev => ({ ...prev, [name]: value }));
  };

  const handleCalc = () => {
    const dist = parseFloat(input.distance);
    const elev = parseFloat(input.elevation);
    const spd = parseFloat(input.speed);
    const temp = parseFloat(input.temp);
    
    if (!dist || !elev || !spd) return;
    
    const timeH = dist / spd;
    const elevPerKm = elev / dist;
    
    let isPersonalized = false;
    let userWeight = 75;
    let calPerKgPerH = 10;
    let carbsPerKgPerH = 0.6;
    let waterPerH = 0.6;
    
    if (userProfile?.weight) {
      isPersonalized = true;
      userWeight = userProfile.weight;
      
      const expLevel = userProfile.experience_level || 'intermediate';
      const age = userProfile.age || 30;
      const gender = userProfile.gender || 'male';
      
      if (expLevel === 'advanced') {
        calPerKgPerH = gender === 'female' ? 9 : 11;
        carbsPerKgPerH = 0.7;
      } else if (expLevel === 'beginner') {
        calPerKgPerH = gender === 'female' ? 7.5 : 8.5;
        carbsPerKgPerH = 0.5;
      } else {
        calPerKgPerH = gender === 'female' ? 8 : 10;
        carbsPerKgPerH = 0.6;
      }
      
      if (age > 40) calPerKgPerH *= 0.95;
      if (age > 50) calPerKgPerH *= 0.9;
      
      waterPerH = 0.01 * userWeight;
      if (temp > 25) waterPerH *= 1.3;
      else if (temp > 20) waterPerH *= 1.1;
      else if (temp < 10) waterPerH *= 0.75;
    } else {
      if (temp > 25) waterPerH = 0.8;
      else if (temp < 10) waterPerH = 0.45;
    }
    
    let cal = isPersonalized ? calPerKgPerH * userWeight * timeH : 600 * timeH;
    let carbs = isPersonalized ? carbsPerKgPerH * userWeight * timeH : 35 * timeH;
    
    if (elevPerKm > 20 || spd > 30) {
      cal *= 1.4;
      carbs *= 1.2;
    } else if (elevPerKm > 10 || spd > 25) {
      cal *= 1.2;
      carbs *= 1.1;
    }
    
    const water = waterPerH * timeH;
    const gels = Math.ceil(carbs * 0.7 / 25);
    const bars = Math.ceil((carbs * 0.7 - gels * 25) / 40);
    
    setResult({
      timeH,
      cal,
      carbs,
      water,
      gels,
      bars,
      waterPerH,
      isPersonalized,
      userWeight,
      calPerKgPerH,
      carbsPerKgPerH
    });
  };

  return (
    <div className="goal-assistant-page">
      {/* Hero Section */}
      <div id="goal-hero-banner" className="plan-hero hero-banner">
        <PartnersLogo
          logoSrc={garminLogoSvg}
          alt="Powered by Garmin"
          height="32px"
          position="absolute"
          top="16px"
          right="auto"
          style={{ right: '8px' }}
          opacity={1}
          hoverOpacity={1}
          filterEffect="none"
          activities={activities}
          showOnlyForBrands={['Garmin']}
        />
        <PartnersLogo
          logoSrc={stravaBlackSvg}
          alt="Powered by Strava"
          height="24.5px"
          opacity={1}
          hoverOpacity={1}
          filterEffect="none"
        />

        <div className={`hero-blob ${generating ? 'generating' : ''}`}>
          <BlobOrb size={850} />
        </div>

        {generating && (
          <div className="generating-text">
            Generating<span className="dots"></span>
          </div>
        )}

        <div className={`hero-content ${generating ? 'hidden' : ''}`}>
          <h1 className="hero-heading">
            Hey <span className="hero-username">{userName}</span> what should we work on today?
          </h1>
          <p className="hero-subtitle">Ask me anything about cycling — training, gear, recovery, nutrition, or your own rides.</p>

          <div className="ai-input-wrapper">
            <span className="ai-input-icon" aria-hidden="true">✦</span>
            <input
              type="text"
              className="ai-input"
              placeholder="Ask your AI coach..."
              value={goalInput}
              onChange={(e) => {
                setGoalInput(e.target.value);
                if (error) setError(''); // Очищаем ошибку при изменении ввода
              }}
              disabled={generating}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !generating && goalInput.trim()) {
                  handleGenerateGoal();
                }
              }}
            />
            <button
              onClick={handleGenerateGoal}
              className="ai-submit-btn"
              disabled={generating || !goalInput.trim()}
              title="Generate Goal Plan"
            >
              <span className="btn-content">{generating ? '···' : '→'}</span>
            </button>
          </div>

          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}

          {/* Quick Templates */}
          <div className="quick-templates">
            <span>Quick templates:</span>
            <button
              onClick={() => handleQuickTemplate("Ride 300km per week consistently")}
              disabled={generating}
            >
              Distance Goal
            </button>
            <button
              onClick={() => handleQuickTemplate("Prepare for Gran Fondo event with 150km and 2000m elevation")}
              disabled={generating}
            >
              Gran Fondo
            </button>
            <button
              onClick={() => handleQuickTemplate("Improve my FTP and climbing ability")}
              disabled={generating}
            >
              FTP Improvement
            </button>
            <button
              onClick={() => handleQuickTemplate("Build endurance base for long distance cycling")}
              disabled={generating}
            >
              Base Building
            </button>
          </div>
        </div>
      </div>

      {/* Meta Goals List */}
      <section className="meta-goals-section">
        <div className="section-header">
          <h2>Personalized Goals</h2>
          
          {/* Tabs */}
          <div className="goals-tabs">
            <button 
              className={`tab-btn ${activeTab === 'active' ? 'active' : ''}`}
              onClick={() => setActiveTab('active')}
            >
              Active
            </button>
            <button 
              className={`tab-btn ${activeTab === 'completed' ? 'active' : ''}`}
              onClick={() => setActiveTab('completed')}
            >
              Completed
            </button>
          </div>
        </div>
        
        {loading ? (
          <div className="loading-container">
            <div className="loader"></div>
            <p>Loading goals...</p>
          </div>
        ) : metaGoals.filter(mg => mg.status === activeTab).length === 0 ? (
          <div className="no-goals">
            <div className="no-goals-icon"></div>
            <h3>No {activeTab} goals</h3>
            <p>{activeTab === 'active' 
              ? 'Describe your cycling goal above and let AI create a personalized training plan for you.'
              : 'Completed goals will appear here.'
            }</p>
          </div>
        ) : (
          <div className="meta-goals-list">
            {metaGoals
              .filter(mg => mg.status === activeTab)
              .map(metaGoal => (
                <MetaGoalRow
                  key={metaGoal.id}
                  metaGoal={metaGoal}
                  onClick={() => navigate(`/goal-assistant/${metaGoal.id}`)}
                  onStatusChange={loadMetaGoals}
                />
              ))}
          </div>
        )}
      </section>

      {/* VO₂max Calculator */}
      <section className="calculator-section">
      <h2 style={{ marginTop: 0 }}>VO₂max Calculator</h2>
        <div id="vo2max-calculator" className="vomax-calc-wrap">
         
          
          <div className="vomax-calc-fields">
            <div>
              <label>Distance in 12 min (m):<br />
                <input 
                  type="number" 
                  value={vo2maxData.testDistance} 
                  onChange={e => handleVO2maxInput('testDistance', e.target.value)} 
                  placeholder="3000" 
                  min="1000" 
                  max="5000" 
                />
              </label>
            </div>
            <div>
              <label>Age (years):<br />
                <input 
                  type="number" 
                  value={vo2maxData.age} 
                  onChange={e => handleVO2maxInput('age', e.target.value)} 
                  placeholder="35" 
                  min="15" 
                  max="80" 
                />
              </label>
            </div>
            <div>
              <label>Weight (kg):<br />
                <input 
                  type="number" 
                  value={vo2maxData.weight} 
                  onChange={e => handleVO2maxInput('weight', e.target.value)} 
                  placeholder="75" 
                  min="40" 
                  max="150" 
                />
              </label>
            </div>
            <div>
              <label>Gender:<br />
                <select 
                  value={vo2maxData.gender} 
                  onChange={e => handleVO2maxInput('gender', e.target.value)}
                  className="vomax-calc-select"
                >
                  <option value="male">M</option>
                  <option value="female">F</option>
                </select>
              </label>
            </div>
          </div>
          
          <div>
            <button 
              onClick={() => {
                const dist = parseFloat(vo2maxData.testDistance);
                const age = parseFloat(vo2maxData.age);
                const weight = parseFloat(vo2maxData.weight);
                
                if (!dist || !age || !weight) return;

                const vo2max = cooperTestVO2max(dist, { age, weight, gender: vo2maxData.gender });

                setVo2maxData(prev => ({ ...prev, manual: vo2max }));
              }} 
              style={{ 
                color: '#274DD3', 
                background: 'none', 
                border: 'none', 
                padding: 0, 
                fontSize: '1em', 
                fontWeight: 600, 
                cursor: 'pointer' 
              }}
            >
              Calculate
            </button>
          </div>
          
          {vo2maxData.manual && (
            <div className="vomax-calc-result">
              <div className="vomax-calc-flex-row">
                <div className="vomax-calc-row-results">
                  <div className="vomax-calc-result-item-wrap">
                    <div className="vomax-calc-result-item" style={{fontSize:'3.1em'}}>
                      <b>VO₂max: {vo2maxData.manual} ml/kg/min</b>
                    </div>
                    <div className="vomax-calc-result-item">
                      <b>Fitness Level:</b> {VO2MAX_CATEGORY_LABELS[vo2maxCategory(vo2maxData.manual)]}
                    </div>
                    <div className="vomax-calc-result-item">
                      <b>Test Distance:</b> {vo2maxData.testDistance}m in 12 min
                    </div>
                  </div>
                  
                  {(vo2maxData.weight || vo2maxData.age) && (
                    <div className="vomax-calc-result-item" style={{ background: '#4CAF50', width: '115px', padding: '18px' }}>
                      <span style={{ 
                        fontSize: '1em', 
                        marginBottom: '8px',
                        display: 'inline-block',
                        color: '#fff', 
                        fontWeight: 'bold'
                      }}>
                        Calculated using profile data
                      </span><br />
                      Age: {vo2maxData.age} years  Weight: {vo2maxData.weight}kg  Gender: {vo2maxData.gender}
                    </div>
                  )}
                </div>
              </div>
              <br />
              <div style={{ display:'inline-block', color:'#707070', fontSize:'0.8em'}}>
                <b>Beginner:</b> 10-30 | <b>Amateur:</b> 30-50 | <b>Advanced:</b> 50-75 | <b>Elite:</b> 75-85+ | <b>World Class:</b> 85-90+
              </div>
            </div>
          )}
          
          <div className="vomax-calc-hint">
            <b>How to calculate VO₂max?</b><br /><br />
            <div>• Warm up for 10-15 minutes before the test</div>
            <div>• Run or ride as far as possible in exactly 12 minutes</div>
            <div>• Maintain steady effort - avoid starting too fast</div>
            <div>• Cool down properly after the test</div>
            <div>• Formula: VO₂max = (distance × 0.02241) – 11.288 + adjustments for age, gender, weight</div>
          </div>
        </div>
      </section>

      {/* Nutrition Calculator */}
      <section className="calculator-section">
      <h2 style={{ marginTop: 0 }}>Nutrition and Hydration Calculator</h2>
        <div className="nutrition-calc-wrap">
         
          
          <div className="nutrition-calc-fields">
            <div>
              <label>Distance (km):<br />
                <input type="number" name="distance" value={input.distance} onChange={handleInput} min="0" placeholder="105" />
              </label>
            </div>
            <div>
              <label>Elevation Gain (m):<br />
                <input type="number" name="elevation" value={input.elevation} onChange={handleInput} min="0" placeholder="1200" />
              </label>
            </div>
            <div>
              <label>Average Speed (km/h):<br />
                <input type="number" name="speed" value={input.speed} onChange={handleInput} min="5" max="60" placeholder="27" />
              </label>
            </div>
            <div>
              <label>Temperature (°C):<br />
                <input type="number" name="temp" value={input.temp} onChange={handleInput} min="-10" max="45" placeholder="22" />
              </label>
            </div>
          </div>
          
          <div>
            <button onClick={handleCalc} style={{ color: '#274DD3', background: 'none', border: 'none', padding: 0, fontSize: '1em', fontWeight: 600, cursor: 'pointer' }}>
              Calculate
            </button>
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
                  <div className="nutrition-calc-result-item-wrap">
                    <div className="nutrition-calc-result-item">
                      <b>Time in motion:</b> {result.timeH.toFixed(2)} h
                    </div>
                    <div className="nutrition-calc-result-item">
                      <b>Calories:</b> ~{Math.round(result.cal).toLocaleString()} kcal
                    </div>
                    <div className="nutrition-calc-result-item">
                      <b>Water:</b> ~{result.water.toFixed(1)} l <span className="nutrition-calc-result-hint">(based on {result.waterPerH.toFixed(1)} l/h, adjusted for temperature{result.isPersonalized ? ` and weight ${result.userWeight}kg` : ''})</span>
                    </div>
                    <div className="nutrition-calc-result-item">
                      <b>Carbs:</b> ~{Math.round(result.carbs)} g
                      <div className="nutrition-calc-result-hint">(some carbs can be replaced with regular food{result.isPersonalized ? `, personalized: ${result.carbsPerKgPerH} g/kg/h` : ''})</div>
                    </div>
                  </div>
                  
                  {result.isPersonalized && (
                    <div className="nutrition-calc-result-item" style={{ background: '#4CAF50', marginTop: '8px', padding: '12px' }}>
                      <span style={{ 
                        fontSize: '1em', 
                        marginBottom: '8px',
                        display: 'inline-block',
                        color: '#fff', 
                        fontWeight: 'bold'
                      }}>
                        Calculated using profile data
                      </span><br />
                      Weight: {result.userWeight}kg | Calories: {result.calPerKgPerH} kcal/kg/h | Carbs: {result.carbsPerKgPerH} g/kg/h
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <div className="nutrition-calc-hint">
            {userProfile?.weight ? (
              <>
                <div><b>Personalized calculations using your profile data:</b></div>
                <div>• Water: adjusted for weight ({userProfile.weight}kg), temperature, and intensity</div>
                <div>• Carbs: {userProfile.experience_level === 'advanced' ? '0.5-0.8' : userProfile.experience_level === 'beginner' ? '0.4-0.6' : '0.5-0.7'} g/kg/h based on experience level</div>
                <div>• Calories: {userProfile.gender === 'female' ? '7.5-10' : '8.5-12'} kcal/kg/h adjusted for age, gender, and experience</div>
                <div>• Gels (25g) and bars (40g): 70% of total carbs from sports nutrition</div>
              </>
            ) : (
              <>
                <div>
                  <b>Generic calculations - </b>
                  <a 
                    href="/profile?tab=personal"
                    style={{ 
                      color: '#274DD3', 
                      textDecoration: 'underline',
                      fontWeight: 'bold'
                    }}
                  >
                    Complete your profile for personalized results
                  </a>
                  <b>:</b>
                </div>
                <div>• Water: 0.6 l/h (hot: 0.8 l/h, cold: 0.45 l/h)</div>
                <div>• Carbs: 35 g/h (gels — 25 g, bars — 40 g, 70% of total — sports nutrition)</div>
                <div>• Calories: 600 kcal/h (intense/high elevation — 850 kcal/h)</div>
              </>
            )}
            <div>• Some carbs can be obtained from regular food: bananas, buns, isotonic</div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}


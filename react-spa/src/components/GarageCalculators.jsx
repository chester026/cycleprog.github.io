// VO2max + Nutrition/Hydration calculators, ported as-is (same markup, same
// classes, same math) from Goal Assistant's calculator section
// (`pages/GoalAssistantPage.jsx`). The only change is plumbing: Garage
// already loads `userProfile` for the page, so it's passed in as a prop
// instead of this component fetching its own copy.
import React, { useState, useEffect } from 'react';
import flaImg from '../assets/img/fla.png';
import gelImg from '../assets/img/gel.webp';
import barImg from '../assets/img/bar.png';
import './GarageCalculators.css';

export default function GarageCalculators({ userProfile }) {
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

  // Autofill from profile, same as Goal Assistant's loadUserProfile did.
  useEffect(() => {
    if (userProfile?.weight || userProfile?.age || userProfile?.gender) {
      setVo2maxData(prev => ({
        ...prev,
        weight: userProfile.weight || prev.weight,
        age: userProfile.age || prev.age,
        gender: userProfile.gender || prev.gender
      }));
    }
  }, [userProfile]);

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
    <>
      {/* VO2max Calculator */}
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

                let vo2max = dist * 0.02241 - 11.288;

                if (age > 40) vo2max *= (1 - (age - 40) * 0.005);
                else if (age < 25) vo2max *= (1 + (25 - age) * 0.003);

                if (vo2maxData.gender === 'female') vo2max *= 0.9;

                if (weight > 80) vo2max *= 0.98;
                else if (weight < 60) vo2max *= 1.02;

                setVo2maxData(prev => ({ ...prev, manual: Math.round(vo2max) }));
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
                    <div className="vomax-calc-result-item" style={{ fontSize: '3.1em' }}>
                      <b>VO₂max: {vo2maxData.manual} ml/kg/min</b>
                    </div>
                    <div className="vomax-calc-result-item">
                      <b>Fitness Level:</b> {
                        vo2maxData.manual < 30 ? 'Beginner' :
                        vo2maxData.manual < 40 ? 'Below Average' :
                        vo2maxData.manual < 50 ? 'Average' :
                        vo2maxData.manual < 60 ? 'Above Average' :
                        vo2maxData.manual < 70 ? 'Excellent' :
                        'Elite'
                      }
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
              <div style={{ display: 'inline-block', color: '#707070', fontSize: '0.8em' }}>
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
    </>
  );
}

// Nutrition calculator for the garage page.
//
// The maths is lifted verbatim from NutritionPage's handleCalc — it was already
// entirely client-side and depended on nothing but the user profile, so it is
// reused here rather than reimplemented. The layout follows the app: four large
// number fields, a green Calculate, a plain-text Clear, and a green result box.
import React, { useState } from 'react';
import flaskImg from '../assets/img/fla.png';
import gelImg from '../assets/img/gel.webp';
import barImg from '../assets/img/bar.png';

const FIELDS = [
  { name: 'distance', label: 'Distance, km', placeholder: '105' },
  { name: 'elevation', label: 'Elevation, m', placeholder: '1200' },
  { name: 'speed', label: 'Avg Speed, km/h', placeholder: '27' },
  { name: 'temp', label: 'Temp, °C', placeholder: '22' }
];

const EMPTY = { distance: '', elevation: '', speed: '', temp: '' };

export default function GarageNutrition({ userProfile }) {
  const [input, setInput] = useState(EMPTY);
  const [result, setResult] = useState(null);

  const handleInput = e => setInput({ ...input, [e.target.name]: e.target.value });

  const handleCalc = () => {
    const dist = parseFloat(input.distance) || 0;
    const elev = parseFloat(input.elevation) || 0;
    const speed = parseFloat(input.speed) || 20;
    const temp = parseFloat(input.temp) || 20;
    if (!dist || !speed) return setResult(null);

    const timeH = dist / speed;

    const userWeight = userProfile?.weight ? parseFloat(userProfile.weight) : 75;
    const userAge = userProfile?.age || 35;
    const userGender = userProfile?.gender || 'male';
    const experienceLevel = userProfile?.experience_level || 'intermediate';

    const intense = elev > 1000 || speed > 25;

    let calPerKgPerH = intense ? 11 : 8.5;
    if (userAge > 40) calPerKgPerH *= 0.95;
    else if (userAge < 25) calPerKgPerH *= 1.05;
    if (userGender === 'female') calPerKgPerH *= 0.88;
    if (experienceLevel === 'advanced') calPerKgPerH *= 0.92;
    else if (experienceLevel === 'beginner') calPerKgPerH *= 1.08;
    const cal = timeH * userWeight * calPerKgPerH;

    let waterPerH = (userWeight / 75) * 0.6;
    if (temp >= 30) waterPerH *= 1.4;
    else if (temp >= 25) waterPerH *= 1.2;
    else if (temp <= 5) waterPerH *= 0.7;
    else if (temp <= 10) waterPerH *= 0.8;
    if (intense) waterPerH *= 1.15;
    const water = timeH * waterPerH;

    let carbsPerKgPerH = intense ? 0.7 : 0.5;
    if (experienceLevel === 'advanced') carbsPerKgPerH *= 1.1;
    else if (experienceLevel === 'beginner') carbsPerKgPerH *= 0.9;
    const carbs = timeH * userWeight * carbsPerKgPerH;

    setResult({
      timeH,
      cal,
      water,
      carbs,
      gels: Math.ceil((carbs * 0.7) / 25),
      bars: Math.ceil((carbs * 0.7) / 40),
      waterPerH,
      userWeight,
      calPerKgPerH: calPerKgPerH.toFixed(1),
      carbsPerKgPerH: carbsPerKgPerH.toFixed(1),
      isPersonalized: !!userProfile?.weight
    });
  };

  const handleClear = () => {
    setInput(EMPTY);
    setResult(null);
  };

  return (
    <div className="garage-nutrition">
      <div className="garage-nutri-fields">
        {FIELDS.map(field => (
          <div className="garage-nutri-field" key={field.name}>
            <label htmlFor={`garage-nutri-${field.name}`}>{field.label}</label>
            <input
              id={`garage-nutri-${field.name}`}
              type="number"
              name={field.name}
              value={input[field.name]}
              onChange={handleInput}
              placeholder={field.placeholder}
            />
          </div>
        ))}
      </div>

      <div className="garage-nutri-actions">
        <button className="garage-btn-calc" onClick={handleCalc}>Calculate</button>
        <button className="garage-btn-clear" onClick={handleClear}>Clear</button>
      </div>

      {result && (
        <div className="garage-nutri-result">
          <div className="garage-nutri-result-stats">
            <div>
              <div className="garage-nutri-stat">
                <div className="garage-nutri-stat-label">Time in motion:</div>
                <div className="garage-nutri-stat-value">{result.timeH.toFixed(2)} h</div>
              </div>
              <div className="garage-nutri-stat">
                <div className="garage-nutri-stat-label">Water:</div>
                <div className="garage-nutri-stat-value">~{result.water.toFixed(1)} l</div>
                <div className="garage-nutri-stat-hint">
                  (based on {result.waterPerH.toFixed(1)} l/h
                  {result.isPersonalized ? `, weight ${result.userWeight}kg` : ''})
                </div>
              </div>
            </div>
            <div>
              <div className="garage-nutri-stat">
                <div className="garage-nutri-stat-label">Calories:</div>
                <div className="garage-nutri-stat-value">
                  ~{Math.round(result.cal).toLocaleString()} kcal
                </div>
              </div>
              <div className="garage-nutri-stat">
                <div className="garage-nutri-stat-label">Carbs (total):</div>
                <div className="garage-nutri-stat-value">~{Math.round(result.carbs)} g</div>
                <div className="garage-nutri-stat-hint">
                  Sports nutrition: {Math.round(result.carbs * 0.7)}g (gels + bars),
                  regular food: {Math.round(result.carbs * 0.3)}g
                </div>
              </div>
            </div>
          </div>

          <div className="garage-nutri-icons">
            <div className="garage-nutri-icon">
              <img src={flaskImg} alt="" aria-hidden="true" />
              <div className="garage-nutri-icon-title">Water</div>
              <div className="garage-nutri-icon-value">{result.water.toFixed(1)}L</div>
              <div className="garage-nutri-icon-hint">
                ≈{Math.ceil(result.water / 0.5)} bottles
              </div>
            </div>
            <div className="garage-nutri-icon">
              <img src={gelImg} alt="" aria-hidden="true" />
              <div className="garage-nutri-icon-title">Gel</div>
              <div className="garage-nutri-icon-value">x{result.gels}</div>
              <div className="garage-nutri-icon-hint">{result.gels * 25}g</div>
            </div>
            <div className="garage-nutri-icon">
              <img src={barImg} alt="" aria-hidden="true" />
              <div className="garage-nutri-icon-title">Carbo.</div>
              <div className="garage-nutri-icon-value">x{result.bars}</div>
              <div className="garage-nutri-icon-hint">{result.bars * 40}g</div>
            </div>
          </div>
        </div>
      )}

      <div className="garage-nutri-hint">
        <b>{result?.isPersonalized ? 'Calculated from your profile' : 'Generic calculation'}</b>
        {result?.isPersonalized ? (
          <>
            <p>• Weight {result.userWeight}kg · {result.calPerKgPerH} kcal/kg/h · {result.carbsPerKgPerH} g/kg/h</p>
            <p>• Water scales with your weight and the temperature you entered</p>
          </>
        ) : (
          <>
            <p>• Based on a 75kg rider — fill in your weight in the profile for a personal estimate</p>
            <p>• Water 0.6 l/h baseline, adjusted for temperature and intensity</p>
          </>
        )}
        <p>• Sports nutrition covers ~70% of the carbs, regular food the rest</p>
      </div>
    </div>
  );
}

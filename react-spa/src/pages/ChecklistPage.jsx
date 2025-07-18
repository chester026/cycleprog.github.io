import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import './ChecklistPage.css';
import { heroImagesUtils } from '../utils/heroImages';

const checklist = [
  { section: 'What to buy', items: [
    'Bicycle (road/gravel)',
    'Helmet',
    'Carbon wheelset: DT Swiss ERC 1100 DICUT 35 (Disc) / ERC 1400',
    'Continental Grand Prix 5000 S TR Folding Tire - 30-622 - black/transparent',
    'Bike shoes and pedals',
    'Spare tire/repair kit',
    'Pump/CO₂ canister',
    'Water bottles',
    'Bike shorts/tights',
    'Goggles',
    'Gloves',
    'Rear light',
    'Front light',
    'Bike computer or phone holder',
    'Chain lube',
    'Multi-tool',
    'Saddlebag/pannier',
    'Buy gels/energy bars',
  ]},
  { section: 'What to do', items: [
    'Check bike condition',
    'Adjust seating (bike fit)',
    'Register for Gran Fondo',
  ]}
];

export default function ChecklistPage() {
  const [checklistState, setChecklistState] = useState({});
  const [animatingKey, setAnimatingKey] = useState(null);
  const [heroImage, setHeroImage] = useState(null);

  // Загружаем состояние из localStorage при монтировании
  useEffect(() => {
    const savedState = {};
    checklist.forEach((section, sectionIdx) => {
      section.items.forEach((item, itemIdx) => {
        const key = `checklist_${sectionIdx}_${itemIdx}`;
        savedState[key] = localStorage.getItem(key) === '1';
      });
    });
    setChecklistState(savedState);
    fetchHeroImage();
  }, []);

  const handleCheckboxChange = (key) => {
    const newValue = !checklistState[key];
    
    // Сохраняем в localStorage
    localStorage.setItem(key, newValue ? '1' : '0');
    
    // Устанавливаем анимацию
    setAnimatingKey(key);
    
    // Обновляем состояние
    setChecklistState(prev => ({
      ...prev,
      [key]: newValue
    }));

    // Убираем анимацию через 350мс
    setTimeout(() => {
      setAnimatingKey(null);
    }, 350);
  };

  const fetchHeroImage = async () => {
    try {
      const imageFilename = await heroImagesUtils.getHeroImage('checklist');
      if (imageFilename) {
        setHeroImage(heroImagesUtils.getImageUrl(imageFilename));
      }
    } catch (error) {
      console.error('Error loading hero image:', error);
    }
  };

  const renderSection = (section, sectionIdx) => {
    // Сортируем: сначала невыполненные, потом выполненные
    const items = section.items.map((item, itemIdx) => {
      const key = `checklist_${sectionIdx}_${itemIdx}`;
      const checked = checklistState[key] || false;
      return { item, key, checked };
    });
    
    const unchecked = items.filter(i => !i.checked);
    const checked = items.filter(i => i.checked);
    const sorted = unchecked.concat(checked);

    return (
      <div className={`checklist-section-card${sectionIdx === 1 ? ' with-bg' : ''}`} key={sectionIdx}>
        <h2>{section.section}</h2>
        <ul className="checklist-ul">
          {sorted.map(({ item, key, checked }) => {
            let animClass = '';
            if (animatingKey === key) {
              animClass = checked ? 'anim-fade-out' : 'anim-fade-in';
            }
            
            return (
              <li 
                key={key} 
                className={`checklist-item ${animClass}`}
                data-key={key}
              >
                <label>
                  <input 
                    type="checkbox" 
                    data-key={key}
                    checked={checked}
                    onChange={() => handleCheckboxChange(key)}
                  />
                  <span>{item}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <div className="main-layout">
      <Sidebar />
      <div className="main">
        {/* Hero блок */}
        <div id="checklist-hero-banner" className="plan-hero hero-banner" style={{
          backgroundImage: heroImage ? `url(${heroImage})` : 'url(/src/assets/img/bike_bg.png)'
        }}>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '1.2em' }}>
            Checklist for Gran Fondo
          </h1>
          <div style={{ 
            fontSize: '0.9em', 
            color: '#fff', 
            opacity: '0.7', 
            marginTop: '0.5em', 
            maxWidth: '600px', 
            marginLeft: '4.3em' 
          }}>
            Everything you need to buy and do for a successful Gran Fondo start. Mark completed items — your progress will be saved.
          </div>
        </div>

       
          <div className="checklist-row">
            {checklist.map((section, idx) => renderSection(section, idx))}
          </div>
        
      </div>
    </div>
  );
} 
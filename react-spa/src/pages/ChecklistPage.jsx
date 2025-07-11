import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import './ChecklistPage.css';
import { heroImagesUtils } from '../utils/heroImages';

const checklist = [
  { section: 'Что купить', items: [
    'Велосипед (шоссейный/гравийный)',
    'Шлем',
    'Carbon wheelset: DT Swiss ERC 1100 DICUT 35 (Disc) / ERC 1400',
    'Continental Grand Prix 5000 S TR Folding Tire - 30-622 - black/transparent',
    'Велотуфли и педали',
    'Запасная камера/ремкомплект',
    'Насос/баллон CO₂',
    'Бутылки для воды',
    'Велоформа (джерси, шорты)',
    'Очки',
    'Перчатки',
    'Задний фонарь',
    'Передний фонарь',
    'Велокомпьютер или держатель для телефона',
    'Смазка для цепи',
    'Мультиинструмент',
    'Сумка подседельная/рамная',
    'Закупить гели/батончики для питания',
  ]},
  { section: 'Что сделать', items: [
    'Проверить техническое состояние велосипеда',
    'Настроить посадку (bike fit)',
    'Зарегистрироваться на Gran Fondo',
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
            Чек-лист подготовки
          </h1>
          <div style={{ 
            fontSize: '0.9em', 
            color: '#fff', 
            opacity: '0.7', 
            marginTop: '0.5em', 
            maxWidth: '600px', 
            marginLeft: '4.3em' 
          }}>
            Всё, что нужно купить и сделать для успешного старта на Gran Fondo. Отмечайте выполненное — прогресс сохранится.
          </div>
        </div>

       
          <div className="checklist-row">
            {checklist.map((section, idx) => renderSection(section, idx))}
          </div>
        
      </div>
    </div>
  );
} 
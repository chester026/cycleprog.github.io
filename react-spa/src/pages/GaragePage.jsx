import React from 'react';
import Sidebar from '../components/Sidebar';
import HeroTrackBanner from '../components/HeroTrackBanner';
import BikeGarageBlock from '../components/BikeGarageBlock';
import MyRidesBlock from '../components/MyRidesBlock';
import WeatherBlock from '../components/WeatherBlock';
import './GaragePage.css';

export default function GaragePage() {
  console.log('GaragePage: Component rendered');

  return (
    <div className="main-layout">
      <Sidebar />
      <div className="main">
        {/* Hero-блок с картой и метриками */}
        <HeroTrackBanner />
        
        {/* Bike Garage блок */}
        <BikeGarageBlock />
        
        {/* Cyprus Gran Fondo блок */}
        <div className="gfc-event-hero-row">
          <div className="gfc-event-hero">
            <div className="gfc-event-hero-content">
              <div className="gfc-event-title">Cyprus Gran Fondo 2026</div>
              <div className="gfc-event-date">3–5 апреля 2026, Пафос, Кипр</div>
              <div className="gfc-event-desc">
                <b>Дистанции:</b> Gran Fondo и Medio Fondo.<br />
                <b>UCI Квалификация:</b> этап квалификации на UCI Gran Fondo World Championships.<br /><br />
                <b>Квалификация:</b> Для попадания на Чемпионат Мира UCI нужно попасть в топ-25% своей возрастной группы на этапе 1 или 2.<br /><br />
                <b>Регистрация:</b> Организатор Activate Cyprus предлагает разные пакеты участия.
              </div>
              <a href="https://www.activatecyprus.com/gran-fondo-cyprus" target="_blank" className="gfc-event-link">Подробнее на activatecyprus.com</a>
            </div>
          </div>
          <div className="gfc-event-side">
            <h2 className="gfc-event-title-big">MY RIDES</h2>
            <div className="gfc-event-my-rides-block">
              <MyRidesBlock />
            </div>
          </div>
        </div>
        
        {/* Погодный блок */}
        <WeatherBlock />
      </div>
    </div>
  );
} 
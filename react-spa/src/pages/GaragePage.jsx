import React from 'react';

import HeroTrackBanner from '../components/HeroTrackBanner';
import BikeGarageBlock from '../components/BikeGarageBlock';
import MyRidesBlock from '../components/MyRidesBlock';
import WeatherBlock from '../components/WeatherBlock';
import EventsHero from '../components/EventsHero';
import Footer from '../components/Footer';
import './GaragePage.css';

export default function GaragePage() {


  return (
    <div className="main-layout">
      <div className="main">
        {/* Hero-блок с картой и метриками */}
        <HeroTrackBanner />
        
        {/* Bike Garage блок */}
        <BikeGarageBlock />
        
        {/* Events Hero блок */}
        <EventsHero>
          <MyRidesBlock />
        </EventsHero>
        
        {/* Погодный блок */}
        <WeatherBlock />
      </div>
      
      <Footer />
    </div>
  );
} 
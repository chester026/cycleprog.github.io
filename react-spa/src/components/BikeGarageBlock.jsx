import React, { useState, useEffect } from 'react';
import './BikeGarageBlock.css';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import { apiFetch } from '../utils/api';

export default function BikeGarageBlock() {
  const [garageImages, setGarageImages] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGarageImages();
  }, []);

  const loadGarageImages = async () => {
    try {
      // Сначала проверяем кэш
      const cachedImages = cacheUtils.get(CACHE_KEYS.GARAGE_IMAGES);
      if (cachedImages) {
        setGarageImages(cachedImages);
        setLoading(false);
        return;
      }

      const res = await apiFetch('/api/garage/positions');
      
      if (res.status === 429) {
        console.warn('Rate limit exceeded, using cached data if available');
        setLoading(false);
        return;
      }
      
      if (!res.ok) throw new Error('Failed to load garage images');
      
      const pos = await res.json();
      
      // Сохраняем в кэш на 1 час (изображения редко меняются)
      cacheUtils.set(CACHE_KEYS.GARAGE_IMAGES, pos, 60 * 60 * 1000);
      
      setGarageImages(pos);
    } catch (e) {
      console.error('Error loading garage images:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bike-garage-block">
        <div className="bike-garage-title">Bike garage</div>
        <div className="bike-garage-flex">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '200px' }}>
            <div style={{ width: 40, height: 40, border: '4px solid #f3f3f3', borderTop: '4px solid #274DD3', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bike-garage-block">
      <div className="bike-garage-title">Bike garage</div>
      <div className="bike-garage-flex">
        <div className="bike-garage-right">
          <div 
            className="bike-garage-right-top" 
            style={{
              background: garageImages?.['left-top'] 
                ? `url('/img/garage/${garageImages['left-top']}') center/cover` 
                : '#f4f6fa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#aaa'
            }}
          >
            {garageImages?.['left-top'] ? '' : 'No image'}
          </div>
          <div 
            className="bike-garage-right-bottom" 
            style={{
              background: garageImages?.['left-bottom'] 
                ? `url('/img/garage/${garageImages['left-bottom']}') center/cover` 
                : '#f4f6fa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#aaa'
            }}
          >
            {garageImages?.['left-bottom'] ? '' : 'No image'}
          </div>
        </div>
        <div className="bike-garage-left">
          <div className="bike-garage-left-block" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa'}}>
            {garageImages?.['right'] ? (
              <img src={`/img/garage/${garageImages['right']}`} alt="Bike" className="bike-garage-img" />
            ) : (
              'Upload images in admin'
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 
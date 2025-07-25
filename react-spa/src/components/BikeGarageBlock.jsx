import React, { useState, useEffect } from 'react';
import './BikeGarageBlock.css';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import { apiFetch } from '../utils/api';
import ImageUploadModal from './ImageUploadModal';

export default function BikeGarageBlock() {
  const [garageImages, setGarageImages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadModal, setUploadModal] = useState({ isOpen: false, position: null });

  useEffect(() => {
    loadGarageImages();
  }, []);

  const loadGarageImages = async () => {
    try {
      // Принудительно очищаем кэш для обновления данных
      cacheUtils.clear(CACHE_KEYS.GARAGE_IMAGES);


      const res = await apiFetch('/api/garage/positions');
      
      if (res.status === 429) {
        console.warn('Rate limit exceeded, using cached data if available');
        setLoading(false);
        return;
      }
      
      if (!res.ok) throw new Error('Failed to load garage images');
      
      const pos = await res.json();
      
      // Отладочная информация
      
      
      // Сохраняем в кэш на 1 час (изображения редко меняются)
      cacheUtils.set(CACHE_KEYS.GARAGE_IMAGES, pos, 60 * 60 * 1000);
      
      setGarageImages(pos);
    } catch (e) {
      console.error('Error loading garage images:', e);
      setGarageImages({}); // Устанавливаем пустой объект вместо null
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

  // Функция для получения URL изображения (поддерживает старый и новый формат)
  const getImageUrl = (position) => {
    if (!garageImages) return null;
    
    const imageData = garageImages[position];
    if (!imageData) return null;
    
    // Новый формат (ImageKit)
    if (imageData.url) {
      // Добавляем WebP трансформации к URL
      const baseUrl = imageData.url.split('?')[0]; // Убираем существующие параметры
      return `${baseUrl}?tr=q-100,f-webp`;
    }
    
    // Старый формат (локальные файлы)
    if (typeof imageData === 'string') {
      return `/img/garage/${imageData}`;
    }
    
    return null;
  };

  // Функция для проверки наличия изображения
  const hasImage = (position) => {
    if (!garageImages) return false;
    
    const imageData = garageImages[position];
    if (!imageData) return false;
    
    // Новый формат (ImageKit)
    if (imageData.url) return true;
    
    // Старый формат (локальные файлы)
    if (typeof imageData === 'string') return true;
    
    return false;
  };

  // Функции для работы с модальным окном загрузки
  const openUploadModal = (position) => {
    setUploadModal({ isOpen: true, position });
  };

  const closeUploadModal = () => {
    setUploadModal({ isOpen: false, position: null });
  };

  const handleUploadSuccess = (result) => {
    // Обновляем изображения после успешной загрузки
    setGarageImages(prev => ({
      ...prev,
      [result.pos]: {
        fileId: result.fileId,
        url: result.url,
        name: result.filename
      }
    }));
    
    // Очищаем кэш для принудительного обновления
    cacheUtils.clear(CACHE_KEYS.GARAGE_IMAGES);
  };

  return (
    <div className="bike-garage-block">
      <div className="bike-garage-title">Bike garage</div>
      <div className="bike-garage-flex">
        <div className="bike-garage-right">
          <div 
            className="bike-garage-right-top image-upload-container" 
            style={{
              background: hasImage('left-top')
                ? `url('${getImageUrl('left-top')}') center/cover` 
                : '#f4f6fa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#aaa',
              position: 'relative'
            }}
          >
            {hasImage('left-top') ? '' : 'No image'}
            <button 
              className="image-upload-btn material-symbols-outlined"
              onClick={() => openUploadModal('left-top')}
              title="Загрузить изображение"
            >
              photo_library
            </button>
          </div>
          <div 
            className="bike-garage-right-bottom image-upload-container" 
            style={{
              background: hasImage('left-bottom')
                ? `url('${getImageUrl('left-bottom')}') center/cover` 
                : '#f4f6fa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#aaa',
              position: 'relative'
            }}
          >
            {hasImage('left-bottom') ? '' : 'No image'}
            <button 
              className="image-upload-btn material-symbols-outlined"
              onClick={() => openUploadModal('left-bottom')}
              title="Загрузить изображение"
            >
              photo_library
            </button>
          </div>
        </div>
        <div className="bike-garage-left">
          <div 
            className="bike-garage-left-block image-upload-container" 
            style={{
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              color: '#aaa',
              position: 'relative'
            }}
          >
            {hasImage('right') ? (
              <img 
                src={getImageUrl('right')} 
                alt="Bike" 
                className="bike-garage-img" 
              />
            ) : (
              'Upload images in admin'
            )}
            <button 
              className="image-upload-btn material-symbols-outlined"
              onClick={() => openUploadModal('right')}
              title="Загрузить изображение"
            >
              photo_library
            </button>
          </div>
        </div>
      </div>
      
      {/* Модальное окно загрузки */}
      <ImageUploadModal
        isOpen={uploadModal.isOpen}
        onClose={closeUploadModal}
        onUpload={handleUploadSuccess}
        position={uploadModal.position}
      />
    </div>
  );
} 
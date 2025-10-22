import React, { useState, useEffect } from 'react';
import './BikeGarageBlock.css';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import { CACHE_TTL } from '../utils/cacheConstants';
import { apiFetch } from '../utils/api';
import { proxyStravaImage } from '../utils/imageProxy';
import ImageUploadModal from './ImageUploadModal';
import { jwtDecode } from 'jwt-decode';

export default function BikeGarageBlock() {
  const [garageImages, setGarageImages] = useState(null);
  const [bikes, setBikes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bikesLoading, setBikesLoading] = useState(true);
  const [uploadModal, setUploadModal] = useState({ isOpen: false, position: null });
  const [showAllBikes, setShowAllBikes] = useState(false);

  // Получить userId из токена
  const getUserId = () => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) return null;
    try {
      const decoded = jwtDecode(token);
      return decoded.userId;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    loadGarageImages();
    loadBikes();
  }, []);

  const loadGarageImages = async () => {
    try {
      setLoading(true);
      const userId = getUserId();
      const cacheKey = userId ? `garage_images_${userId}` : CACHE_KEYS.GARAGE_IMAGES;
      
      // Принудительно очищаем кэш для обновления данных
      cacheUtils.clear(cacheKey);

      const pos = await apiFetch('/api/garage/positions');
      
      // Сохраняем в кэш на 1 час (изображения редко меняются)
      cacheUtils.set(cacheKey, pos, 60 * 60 * 1000);
      
      setGarageImages(pos);
    } catch (e) {
      console.error('Error loading garage images:', e);
      setGarageImages({}); // Устанавливаем пустой объект вместо null
    } finally {
      setLoading(false);
    }
  };

  const loadBikes = async () => {
    try {
      setBikesLoading(true);
      const userId = getUserId();
      const cacheKey = userId ? `bikes_${userId}` : CACHE_KEYS.BIKES;
      
      // Проверяем кэш
      const cachedBikes = cacheUtils.get(cacheKey);
      if (cachedBikes) {
        setBikes(cachedBikes);
        setBikesLoading(false);
        return;
      }
      
      // Если кэша нет, загружаем с сервера
      const bikesData = await apiFetch('/api/bikes');
      
      // Сохраняем в кэш на 6 часов
      cacheUtils.set(cacheKey, bikesData, CACHE_TTL.BIKES);
      
      setBikes(bikesData);
    } catch (e) {
      console.error('Error loading bikes:', e);
      setBikes([]); // Устанавливаем пустой массив при ошибке
    } finally {
      setBikesLoading(false);
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
      // Добавляем WebP трансформации к URL и используем прокси для Strava
      const baseUrl = imageData.url.split('?')[0]; // Убираем существующие параметры
      const imageUrl = `${baseUrl}?tr=q-100,f-webp`;
      return proxyStravaImage(imageUrl);
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
    const userId = getUserId();
    const cacheKey = userId ? `garage_images_${userId}` : CACHE_KEYS.GARAGE_IMAGES;
    cacheUtils.clear(cacheKey);
    
    // Перезагружаем данные с сервера
    loadGarageImages();
  };

  // Функция для принудительного обновления данных о велосипедах
  const refreshBikes = async () => {
    const userId = getUserId();
    const cacheKey = userId ? `bikes_${userId}` : CACHE_KEYS.BIKES;
    cacheUtils.clear(cacheKey);
    await loadBikes();
  };

  return (
    <div className="bike-garage-block">
       {/* Информация о велосипедах из Strava */}
       {bikesLoading && (
        <div className="bike-mileage-info">
          <div className="bike-mileage-item">
            <span className="bike-name">Loading bikes...</span>
          </div>
        </div>
      )}
      
      {!bikesLoading && bikes.length > 0 && (
        <>
          <div className="bike-mileage-info">
            {(showAllBikes ? bikes : bikes.filter(bike => bike.primary)).map((bike, index) => (
              <div key={bike.id} className={`bike-mileage-item ${bike.primary ? 'primary' : 'secondary'}`}>
                <div className="bike-info">
                  <span className="bike-name">
                    {bike.brand_name && bike.model_name 
                      ? `${bike.brand_name} ${bike.model_name}` 
                      : bike.name}
                    {bike.primary && <span className="primary-badge">Primary</span>}
                  </span>
                  {bike.activitiesCount && (
                    <span className="bike-activities">{bike.activitiesCount} rides</span>
                  )}
                </div>
                <span className="bike-distance">
                  <span style={{ fontWeight: '800', color: '#cdcdcd' }}>ODO: </span>
                  {bike.distanceKm.toLocaleString()} km
                </span>
              </div>
            ))}
          </div>
          {bikes.length > 1 && (
            <button 
              onClick={() => setShowAllBikes(!showAllBikes)}
              className="see-all-bikes-btn"
            >
              {showAllBikes ? 'Show less' : `See all bikes (${bikes.length})`}
            </button>
          )}
        </>
      )}
      <div className="bike-garage-title">
        Bike garage
        {/* Скрытая кнопка обновления для разработки */}
        <button 
          onClick={refreshBikes}
          style={{
            position: 'absolute',
            right: '10px',
            top: '10px',
            background: 'transparent',
            border: 'none',
            color: '#cdcdcd',
            fontSize: '12px',
            cursor: 'pointer',
            opacity: 0.3
          }}
          title="Refresh bikes data"
        >
          ↻
        </button>
      </div>
      
     
      
      {!bikesLoading && bikes.length === 0 && (
        <div className="bike-mileage-info">
          <div className="bike-mileage-item">
            <span className="bike-name" style={{ color: '#999' }}>No Strava bikes found</span>
          </div>
        </div>
      )}
      
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
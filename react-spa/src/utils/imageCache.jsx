import React, { useState, useEffect } from 'react';

// Утилита для кэширования изображений
const IMAGE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 часа для профилей
const CACHE_PREFIX = 'image_cache_';

export const imageCacheUtils = {
  // Кэшировать изображение
  cacheImage: (url, data) => {
    try {
      const cacheKey = CACHE_PREFIX + btoa(url);
      const cacheData = {
        url,
        data,
        timestamp: Date.now()
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Failed to cache image:', error);
    }
  },

  // Получить изображение из кэша
  getCachedImage: (url) => {
    try {
      const cacheKey = CACHE_PREFIX + btoa(url);
      const cached = localStorage.getItem(cacheKey);
      
      if (!cached) return null;
      
      const cacheData = JSON.parse(cached);
      
      // Проверяем TTL
      if (Date.now() - cacheData.timestamp > IMAGE_CACHE_TTL) {
        localStorage.removeItem(cacheKey);
        return null;
      }
      
      return cacheData.data;
    } catch (error) {
      console.warn('Failed to get cached image:', error);
      return null;
    }
  },

  // Очистить кэш изображений
  clearImageCache: () => {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.warn('Failed to clear image cache:', error);
    }
  },

  // Получить размер кэша
  getCacheSize: () => {
    try {
      const keys = Object.keys(localStorage);
      const imageKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
      return imageKeys.length;
    } catch (error) {
      return 0;
    }
  }
};

// Компонент для кэшированного изображения
export const CachedImage = ({ src, alt, className, style, fallback, ...props }) => {
  const [imageSrc, setImageSrc] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!src) {
      setImageSrc(null);
      setIsLoaded(false);
      setHasError(false);
      return;
    }

    // Проверяем кэш
    const cachedData = imageCacheUtils.getCachedImage(src);
    if (cachedData) {
      setImageSrc(cachedData);
      setIsLoaded(true);
      setHasError(false);
      return;
    }

    // Загружаем изображение
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Для CORS
    
    img.onload = () => {
      try {
        // Создаем canvas для кэширования
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        
        // Конвертируем в base64 для кэширования
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        
        // Кэшируем
        imageCacheUtils.cacheImage(src, dataUrl);
        
        setImageSrc(dataUrl);
        setIsLoaded(true);
        setHasError(false);
      } catch (error) {
        // Если не удалось кэшировать, используем оригинальный URL
        setImageSrc(src);
        setIsLoaded(true);
        setHasError(false);
      }
    };
    
    img.onerror = () => {
      setHasError(true);
      setIsLoaded(true);
      if (fallback) {
        setImageSrc(fallback);
      } else {
        setImageSrc(null);
      }
    };
    
    img.src = src;
  }, [src, fallback]);

  // Не рендерим изображение если нет src
  if (!imageSrc) {
    return null;
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      style={{
        ...style,
        opacity: isLoaded ? 1 : 0.7,
        transition: 'opacity 0.3s ease',
        filter: hasError ? 'grayscale(100%)' : 'none'
      }}
      loading="lazy"
      {...props}
    />
  );
}; 
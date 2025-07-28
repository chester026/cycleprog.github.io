import React, { useState, useEffect } from 'react';
import { imageCacheUtils } from '../utils/imageCache.jsx';

const OptimizedImage = ({ 
  src, 
  alt, 
  className, 
  style, 
  placeholder = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2Y1ZjVmNSIvPjwvc3ZnPg==',
  ...props 
}) => {
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
      setImageSrc(null);
    };
    
    img.src = src;
  }, [src]);

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

export default OptimizedImage; 
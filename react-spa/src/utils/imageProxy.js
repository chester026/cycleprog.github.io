// Утилита для проксирования изображений Strava (решает CORS проблему)
export const proxyStravaImage = (imageUrl) => {
  if (!imageUrl) return null;
  
  // Если это URL Strava (cloudfront.net), используем прокси
  if (imageUrl.includes('cloudfront.net') || imageUrl.includes('strava.com')) {
    return `/api/proxy/strava-image?url=${encodeURIComponent(imageUrl)}`;
  }
  
  // Для других URL возвращаем как есть
  return imageUrl;
};

// Утилита для проверки, является ли URL изображением Strava
export const isStravaImage = (imageUrl) => {
  return imageUrl && (imageUrl.includes('cloudfront.net') || imageUrl.includes('strava.com'));
}; 
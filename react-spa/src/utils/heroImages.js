import { apiFetch } from './api';
// Утилита для работы с hero изображениями
let heroImagesCache = null;
let heroImagesCacheTime = 0;
const HERO_CACHE_TTL = 5 * 60 * 1000; // 5 минут

export const heroImagesUtils = {
  // Получить изображение для конкретного hero блока
  getHeroImage: async (heroType) => {
    try {
      // Проверяем кэш
      if (heroImagesCache && Date.now() - heroImagesCacheTime < HERO_CACHE_TTL) {
        return heroImagesCache[heroType] || null;
      }

      const response = await apiFetch('/api/hero/positions');
      if (response.ok) {
        const data = await response.json();
        heroImagesCache = data;
        heroImagesCacheTime = Date.now();
        return data[heroType] || null;
      }
    } catch (error) {
      console.error('Error loading hero images:', error);
    }
    return null;
  },

  // Очистить кэш
  clearCache: () => {
    heroImagesCache = null;
    heroImagesCacheTime = 0;
  },

  // Получить URL изображения
  getImageUrl: (filename) => {
    if (!filename) return null;
    return `/img/hero/${filename}`;
  }
}; 
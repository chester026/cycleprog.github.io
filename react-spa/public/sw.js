const CACHE_NAME = 'bike-lab-v2';
const urlsToCache = [
  '/',
  '/src/assets/img/bike_bg.png',
  '/src/assets/img/garage/',
  '/src/assets/img/hero/'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  // Пропускаем API запросы и внешние ресурсы
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('open-meteo.com') ||
      event.request.url.includes('strava.com') ||
      event.request.url.includes('imagekit.io')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
}); 
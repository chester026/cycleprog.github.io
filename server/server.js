require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const app = express();

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());
const PORT = 8080;

// Middleware для предотвращения кеширования только файлов с хешами
app.use((req, res, next) => {
  // Отключаем кеширование для index.html и файлов с хешами
  if (req.path === '/' || req.path === '/index.html' || 
      (req.path.startsWith('/assets/') && req.path.match(/[a-zA-Z0-9]{8,}\.(js|css)$/))) {
    res.setHeader('Cache-Control', 'no-cache');
  }
  next();
});

const CLIENT_ID = '165560';
const CLIENT_SECRET = 'eb3045c2a8ff4b1d2157e26ec14be58aa6fe995f';
// Устаревшие файлы удалены - теперь используется многопользовательская архитектура
// const RIDES_FILE = path.join(__dirname, '../public/rides.json');
// const TOKENS_FILE = path.join(__dirname, 'strava_tokens.json');
// const PLANNED_RIDES_FILE = path.join(__dirname, '../public/manual_rides.json');
const GARAGE_DIR = path.join(__dirname, '../react-spa/src/assets/img/garage');
const GARAGE_META = path.join(GARAGE_DIR, 'garage_images.json');
const HERO_DIR = path.join(__dirname, '../react-spa/src/assets/img/hero');
const HERO_META = path.join(HERO_DIR, 'hero_images.json');
const { analyzeTraining, cleanupOldCache, getCacheStats } = require('./aiAnalysis');
const { 
  uploadToImageKit, 
  deleteFromImageKit, 
  getImageUrl, 
  FOLDERS,
  getImageKitConfig,
  saveImageMetadata,
  getUserImages,
  deleteImageMetadata
} = require('./imagekit-config');
const { generateVerificationToken, sendVerificationEmail, sendPasswordResetEmail } = require('./brevo-config');
const { 
  getUserProfile, 
  updateUserProfile, 
  generatePersonalizedPlan, 
  getGoalSpecificRecommendations, 
  getTrainingTypeDetails, 
  getAllTrainingTypes, 
  getPlanExecutionStats,
  getCustomTrainingPlan,
  saveCustomTrainingPlan,
  deleteCustomTraining,
  completeOnboarding
} = require('./recommendations');

// ImageKit configuration loaded successfully

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const isProduction = process.env.PGSSLMODE === 'require' || process.env.NODE_ENV === 'production';

const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});
const jwt = require('jsonwebtoken');

app.use(express.static('public'));
app.use('/img/garage', express.static(path.join(__dirname, '../react-spa/src/assets/img/garage')));
app.use('/img/hero', express.static(path.join(__dirname, '../react-spa/src/assets/img/hero')));

// Раздача статики фронта с правильными MIME типами
app.use(express.static(path.join(__dirname, '../react-spa/dist'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html');
    }
  }
}));

// Устаревшие функции удалены - теперь используется многопользовательская архитектура
// function loadTokens() { ... }
// function saveTokens() { ... }
// loadTokens();

app.get('/exchange_token', async (req, res, next) => {
  const code = req.query.code;
  if (!code) {
    // Если нет code — это не Strava, а SPA, передаём дальше
    return next();
  }
  try {
    // 1. Получаем access_token через Strava OAuth
    const response = await axios.post('https://www.strava.com/oauth/token', {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code'
    });
    const access_token = response.data.access_token;
    const refresh_token = response.data.refresh_token;
    const expires_at = response.data.expires_at;

    // 2. Получаем профиль пользователя Strava
    const athleteRes = await axios.get('https://www.strava.com/api/v3/athlete', {
      headers: { Authorization: `Bearer ${access_token}` },
      timeout: 10000
    });
    const athlete = athleteRes.data;
    const strava_id = athlete.id;
    const email = athlete.email || null;
    const name = athlete.firstname + (athlete.lastname ? ' ' + athlete.lastname : '');
    const avatar = athlete.profile || null;

    // 3. Находим или создаём пользователя в базе
    let user;
    const userResult = await pool.query('SELECT * FROM users WHERE strava_id = $1', [strava_id]);
    if (userResult.rows.length > 0) {
      // Обновляем токены и профиль
      user = userResult.rows[0];
      await pool.query(
        'UPDATE users SET strava_access_token = $1, strava_refresh_token = $2, strava_expires_at = $3, name = $4, email = COALESCE($5, email), avatar = $6 WHERE id = $7',
        [access_token, refresh_token, expires_at, name, email, avatar, user.id]
      );
    } else {
      // Создаём нового пользователя
      const insertResult = await pool.query(
        'INSERT INTO users (strava_id, strava_access_token, strava_refresh_token, strava_expires_at, name, email, avatar) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [strava_id, access_token, refresh_token, expires_at, name, email, avatar]
      );
      user = insertResult.rows[0];
    }

    // 4. Генерируем JWT
    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email, strava_id: user.strava_id, name: user.name, avatar: user.avatar },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 5. Редиректим на фронт с токеном и user-данными
    const redirectUrl = `/exchange_token?jwt=${encodeURIComponent(jwtToken)}&name=${encodeURIComponent(user.name || '')}&avatar=${encodeURIComponent(user.avatar || '')}`;
    res.redirect(redirectUrl);
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).send('Token exchange failed');
  }
});

// --- Кэш для Strava activities по userId ---
let activitiesCache = {}; // { [userId]: { data: [...], time: ... } }
const ACTIVITIES_CACHE_TTL = 15 * 60 * 1000; // 15 минут

// --- Переменные для лимитов Strava ---
let stravaRateLimits = {
  limit15min: null,
  limitDay: null,
  usage15min: null,
  usageDay: null,
  lastUpdate: null
};

function updateStravaLimits(headers) {
  if (!headers) return;
  // Строка вида "100,1000"
  const limit = headers['x-ratelimit-limit'];
  const usage = headers['x-ratelimit-usage'];
  if (limit && usage) {
    const [limit15, limitDay] = limit.split(',').map(Number);
    const [usage15, usageDay] = usage.split(',').map(Number);
    stravaRateLimits = {
      limit15min: limit15,
      limitDay: limitDay,
      usage15min: usage15,
      usageDay: usageDay,
      lastUpdate: new Date().toISOString()
    };
  }
}

// Получить Strava токен пользователя
async function getUserStravaToken(userId) {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (!result.rows.length) return null;
  const user = result.rows[0];
  if (!user.strava_access_token || !user.strava_refresh_token) return null;
  return user;
}

// --- Новый эндпоинт: Strava activities только для текущего пользователя ---
app.get('/api/activities', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await getUserStravaToken(userId);
    if (!user) return res.json([]); // Нет Strava токена — пусто
    // Проверяем кэш
    if (
      activitiesCache[userId] &&
      Date.now() - activitiesCache[userId].time < ACTIVITIES_CACHE_TTL
    ) {
      return res.json(activitiesCache[userId].data);
    }
    // Проверяем refresh
    let access_token = user.strava_access_token;
    let refresh_token = user.strava_refresh_token;
    let expires_at = user.strava_expires_at;
    const now = Math.floor(Date.now() / 1000);
    if (now >= expires_at) {
      const refresh = await axios.post('https://www.strava.com/oauth/token', {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refresh_token
      });
      access_token = refresh.data.access_token;
      refresh_token = refresh.data.refresh_token;
      expires_at = refresh.data.expires_at;
      // Сохраняем новые токены
      await pool.query(
        'UPDATE users SET strava_access_token = $1, strava_refresh_token = $2, strava_expires_at = $3 WHERE id = $4',
        [access_token, refresh_token, expires_at, userId]
      );
    }
    // Получаем только велосипедные заезды с пагинацией
    let allActivities = [];
    let page = 1;
    const per_page = 200;
    while (true) {
      const response = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
        headers: { Authorization: `Bearer ${access_token}` },
        params: { per_page, page, type: 'Ride' },
        timeout: 15000 // 15 секунд timeout
      });
      updateStravaLimits(response.headers);
      const activities = response.data;
      if (!activities.length) break;
      allActivities = allActivities.concat(activities);
      if (activities.length < per_page) break;
      page++;
    }
    // Кэшируем
    activitiesCache[userId] = { data: allActivities, time: Date.now() };
    res.json(allActivities);
  } catch (err) {
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      console.error('Strava API timeout:', err.message);
      res.status(503).json({ error: true, message: 'Strava API timeout. Please try again later.' });
    } else {
      console.error(err.response?.data || err);
      if (err.response && err.response.data) {
        const status = err.response.status || 500;
        res.status(status).json({ error: true, message: err.response.data.message || err.response.data || 'Failed to fetch activities' });
      } else {
        res.status(500).json({ error: true, message: err.message || 'Failed to fetch activities' });
      }
    }
  }
});

// Новый эндпоинт для получения streams (временных рядов) по id активности
app.get('/api/activities/:id/streams', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    // Получаем токен пользователя
    const user = await getUserStravaToken(userId);
    if (!user) {
      return res.status(401).json({ error: true, message: 'Strava token not found' });
    }
    
    // Проверяем и обновляем токен если нужно
    let access_token = user.strava_access_token;
    let refresh_token = user.strava_refresh_token;
    let expires_at = user.strava_expires_at;
    const now = Math.floor(Date.now() / 1000);
    
    if (now >= expires_at) {
      const refresh = await axios.post('https://www.strava.com/oauth/token', {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refresh_token
      });
      access_token = refresh.data.access_token;
      refresh_token = refresh.data.refresh_token;
      expires_at = refresh.data.expires_at;
      
      // Сохраняем новые токены
      await pool.query(
        'UPDATE users SET strava_access_token = $1, strava_refresh_token = $2, strava_expires_at = $3 WHERE id = $4',
        [access_token, refresh_token, expires_at, userId]
      );
    }
    
    const response = await axios.get(
      `https://www.strava.com/api/v3/activities/${id}/streams`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
        params: { keys: 'watts,heartrate,velocity_smooth,time', key_by_type: true }
      }
    );
    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err);
    if (err.response && err.response.data) {
      const status = err.response.status || 500;
      res.status(status).json({ error: true, message: err.response.data.message || err.response.data || 'Failed to fetch streams' });
    } else {
      res.status(500).json({ error: true, message: err.message || 'Failed to fetch streams' });
    }
  }
});



// Get all rides for current user
app.get('/api/rides', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const result = await pool.query('SELECT * FROM rides WHERE user_id = $1 ORDER BY start DESC', [userId]);
  res.json(result.rows);
});

// Add a ride for current user
app.post('/api/rides', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { title, location, locationLink, details, start } = req.body;
  const result = await pool.query(
    'INSERT INTO rides (user_id, title, location, location_link, details, start) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [userId, title, location, locationLink, details, start]
  );
  
  // Автоматически обновляем цели после добавления поездки
  await updateUserGoals(userId, req.headers.authorization);
  
  res.json(result.rows[0]);
});

// Update a ride
app.put('/api/rides/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const { title, location, locationLink, details, start } = req.body;
  const result = await pool.query(
    'UPDATE rides SET title=$1, location=$2, location_link=$3, details=$4, start=$5 WHERE id=$6 AND user_id=$7 RETURNING *',
    [title, location, locationLink, details, start, id, userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Ride not found' });
  res.json(result.rows[0]);
});

// Delete a ride
app.delete('/api/rides/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const result = await pool.query(
    'DELETE FROM rides WHERE id=$1 AND user_id=$2 RETURNING *',
    [id, userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Ride not found' });
  res.json({ success: true });
});

// (Optional) Import rides for current user
app.post('/api/rides/import', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
    const ridesToImport = req.body;
    if (!Array.isArray(ridesToImport)) {
    return res.status(400).json({ error: true, message: 'Expected array of rides' });
    }
  let imported = 0;
  for (const ride of ridesToImport) {
    await pool.query(
      'INSERT INTO rides (user_id, title, location, location_link, details, start) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, ride.title, ride.location, ride.locationLink, ride.details, ride.start]
    );
    imported++;
  }
  
  // Автоматически обновляем цели после импорта поездок
  await updateUserGoals(userId, req.headers.authorization);
  
  res.json({ success: true, imported });
});



// Эндпоинт для проверки наличия access_token
app.get('/strava-auth-status', (req, res) => {
  res.json({ hasToken: !!access_token });
});



// Multer configuration
if (!fs.existsSync(GARAGE_DIR)) fs.mkdirSync(GARAGE_DIR, { recursive: true });
if (!fs.existsSync(HERO_DIR)) fs.mkdirSync(HERO_DIR, { recursive: true });

// Multer configuration for ImageKit (memory storage)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Получить список изображений garage
app.get('/api/garage/images', (req, res) => {
  fs.readdir(GARAGE_DIR, (err, files) => {
    if (err) return res.status(500).send('Ошибка чтения');
    // Только изображения
    const imgs = files.filter(f => /\.(png|jpe?g|webp|gif)$/i.test(f));
    res.json(imgs);
  });
});

function loadGarageMeta() {
  if (!fs.existsSync(GARAGE_META)) return {};
  try { return JSON.parse(fs.readFileSync(GARAGE_META, 'utf8')); } catch { return {}; }
}
function saveGarageMeta(meta) {
  fs.writeFileSync(GARAGE_META, JSON.stringify(meta, null, 2));
}

function loadHeroMeta() {
  if (!fs.existsSync(HERO_META)) return {};
  try { return JSON.parse(fs.readFileSync(HERO_META, 'utf8')); } catch { return {}; }
}
function saveHeroMeta(meta) {
  fs.writeFileSync(HERO_META, JSON.stringify(meta, null, 2));
}

// Прокси для изображений Strava (решает CORS проблему)
app.get('/api/proxy/strava-image', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    const response = await axios.get(imageUrl, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Передаем заголовки от оригинального ответа
    res.setHeader('Content-Type', response.headers['content-type']);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Кэшируем на 1 час
    
    // Передаем поток данных
    response.data.pipe(res);
  } catch (error) {
    console.error('Error proxying image:', error.message);
    res.status(500).json({ error: 'Failed to proxy image' });
  }
});

// Получить соответствие позиций и файлов (обновлено для многопользовательской архитектуры)
app.get('/api/garage/positions', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const images = await getUserImages(pool, userId, 'garage');
    res.json(images.garage || {});
  } catch (error) {
    res.status(500).json({ error: 'Failed to load garage images' });
  }
});

// Получить соответствие позиций и файлов hero
app.get('/api/hero/positions', (req, res) => {
  res.json(loadHeroMeta());
});

// Загрузить новое изображение с позицией (ImageKit) - обновлено для многопользовательской архитектуры
app.post('/api/garage/upload', authMiddleware, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Missing file parameter for upload' });
  const pos = req.body.pos;
  if (!['right','left-top','left-bottom'].includes(pos)) return res.status(400).json({ error: 'Некорректная позиция' });
  
  try {
    const userId = req.user.userId;
    
    // Получаем глобальную конфигурацию ImageKit
    const config = getImageKitConfig();
    if (!config) {
      return res.status(400).json({ error: 'ImageKit configuration not found' });
    }
    
    // Получаем текущие изображения пользователя
    const currentImages = await getUserImages(pool, userId, 'garage');
    const currentImage = currentImages.garage?.[pos];
    
    // Если на этой позиции уже есть файл — удалить старый файл из ImageKit
    if (currentImage && currentImage.fileId) {
      const deleteResult = await deleteFromImageKit(currentImage.fileId, config);
      if (!deleteResult.success) {
        console.warn('Failed to delete old image:', deleteResult.error);
      }
    }
    
    // Загружаем файл в ImageKit
    const fileName = `${userId}_${pos}_${Date.now()}_${req.file.originalname}`;
    const uploadResult = await uploadToImageKit(req.file, FOLDERS.GARAGE, fileName, config);
    
    if (!uploadResult.success) {
      return res.status(500).json({ error: uploadResult.error });
    }
    
    // Сохраняем метаданные в базу данных
    const saveResult = await saveImageMetadata(
      pool, 
      userId, 
      'garage', 
      pos, 
      uploadResult, 
      req.file
    );
    
    if (!saveResult.success) {
      return res.status(500).json({ error: 'Failed to save image metadata' });
    }
    
    res.json({ 
      filename: uploadResult.name, 
      pos,
      url: uploadResult.url,
      fileId: uploadResult.fileId
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Получить hero изображения пользователя
app.get('/api/hero/images', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userImages = await getUserImages(pool, userId, 'hero');
    
    // Формируем объект с позициями
    const positions = ['garage', 'plan', 'trainings', 'checklist', 'nutrition'];
    const result = {};
    
    positions.forEach(pos => {
      // Проверяем, есть ли изображение для этой позиции
      if (userImages.hero && userImages.hero[pos]) {
        result[pos] = userImages.hero[pos];
      } else {
        result[pos] = null;
      }
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error getting hero images:', error);
    res.status(500).json({ error: 'Failed to get hero images' });
  }
});

// Загрузить новое hero изображение с позицией (ImageKit)
app.post('/api/hero/upload', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    
    const userId = req.user.userId;
    const pos = req.body.pos;
    
    if (!['garage','plan','trainings','checklist','nutrition'].includes(pos)) {
      return res.status(400).json({ error: 'Invalid position' });
    }
    
    // Получаем глобальную конфигурацию ImageKit
    const config = getImageKitConfig();
    if (!config) {
      return res.status(400).json({ error: 'ImageKit configuration not found' });
    }
    
    // Удаляем старое изображение если есть
    await deleteImageMetadata(pool, userId, 'hero', pos);
    
    // Загружаем в ImageKit
    const uploadResult = await uploadToImageKit(
      req.file, 
      `hero/${userId}`, 
      `${pos}_${Date.now()}.jpg`, 
      config
    );
    
    if (!uploadResult.success) {
      return res.status(500).json({ error: uploadResult.error });
    }
    
    // Сохраняем метаданные в базу данных
    await saveImageMetadata(
      pool, 
      userId, 
      'hero', 
      pos, 
      uploadResult, 
      req.file
    );
    
    res.json({ 
      filename: uploadResult.name, 
      pos,
      url: uploadResult.url,
      fileId: uploadResult.fileId
    });
    
  } catch (error) {
    console.error('Error uploading hero image:', error);
    res.status(500).json({ error: 'Failed to upload hero image' });
  }
});

// Назначить изображение во все hero позиции (ImageKit)
app.post('/api/hero/assign-all', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    
    const userId = req.user.userId;
    const positions = ['garage', 'plan', 'trainings', 'checklist', 'nutrition'];
    
    // Получаем глобальную конфигурацию ImageKit
    const config = getImageKitConfig();
    if (!config) {
      return res.status(400).json({ error: 'ImageKit configuration not found' });
    }
    
    // Удаляем старые изображения
    for (const pos of positions) {
      await deleteImageMetadata(pool, userId, 'hero', pos);
    }
    
    // Загружаем в ImageKit
    const uploadResult = await uploadToImageKit(
      req.file, 
      `hero/${userId}`, 
      `all_hero_${Date.now()}.jpg`, 
      config
    );
    
    if (!uploadResult.success) {
      return res.status(500).json({ error: uploadResult.error });
    }
    
    // Сохраняем метаданные для всех позиций
    for (const pos of positions) {
      await saveImageMetadata(
        pool, 
        userId, 
        'hero', 
        pos, 
        uploadResult, 
        req.file
      );
    }
    
    res.json({ 
      filename: uploadResult.name, 
      positions: positions,
      url: uploadResult.url,
      fileId: uploadResult.fileId,
      deletedFiles: positions.length
    });
    
  } catch (error) {
    console.error('Error uploading hero image to all positions:', error);
    res.status(500).json({ error: 'Failed to upload hero image to all positions' });
  }
});

// Удалить изображение и из meta (ImageKit) - обновлено для многопользовательской архитектуры
app.delete('/api/garage/images/:name', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Получаем глобальную конфигурацию ImageKit
    const config = getImageKitConfig();
    if (!config) {
      return res.status(400).json({ error: 'ImageKit configuration not found' });
    }
    
    // Находим изображение в базе данных
    const result = await pool.query(
      'SELECT * FROM user_images WHERE user_id = $1 AND file_name = $2',
      [userId, req.params.name]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    const image = result.rows[0];
    
    // Удаляем из ImageKit
    if (image.file_id) {
      await deleteFromImageKit(image.file_id, config);
    }
    
    // Удаляем из базы данных
    await deleteImageMetadata(pool, userId, image.image_type, image.position);
    
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// Удалить hero изображение и из meta
app.delete('/api/hero/images/:name', (req, res) => {
  const file = path.join(HERO_DIR, req.params.name);
  if (!file.startsWith(HERO_DIR)) return res.status(400).send('Некорректное имя');
  let meta = loadHeroMeta();
  
  // Проверяем, используется ли файл в других позициях
  const usedInPositions = Object.keys(meta).filter(k => meta[k] === req.params.name);
  
  // Удаляем из meta
  for (const k of Object.keys(meta)) {
    if (meta[k] === req.params.name) meta[k] = null;
  }
  saveHeroMeta(meta);
  
  // Удаляем файл только если он больше нигде не используется
  if (usedInPositions.length === 1) {
    fs.unlink(file, err => {
      if (err) return res.status(404).send('Не найдено');
      res.json({ ok: true, message: 'Файл удален' });
    });
  } else {
    res.json({ ok: true, message: 'Файл удален из позиции, но остается в других позициях' });
  }
});

// Удалить hero изображение из конкретной позиции (ImageKit)
app.delete('/api/hero/positions/:position', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const position = req.params.position;
    const positions = ['garage', 'plan', 'trainings', 'checklist', 'nutrition'];
    
    if (!positions.includes(position)) {
      return res.status(400).json({ error: 'Invalid position' });
    }
    
    // Получаем изображение из базы данных
    const result = await pool.query(
      'SELECT * FROM user_images WHERE user_id = $1 AND image_type = $2 AND position = $3',
      [userId, 'hero', position]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Position is empty' });
    }
    
    const image = result.rows[0];
    
    // Получаем глобальную конфигурацию ImageKit
    const config = getImageKitConfig();
    if (!config) {
      return res.status(400).json({ error: 'ImageKit configuration not found' });
    }
    
    // Удаляем из ImageKit
    if (image.file_id) {
      await deleteFromImageKit(image.file_id, config);
    }
    
    // Удаляем из базы данных
    await deleteImageMetadata(pool, userId, 'hero', position);
    
    res.json({ ok: true, message: 'Image deleted successfully' });
    
  } catch (error) {
    console.error('Error deleting hero image:', error);
    res.status(500).json({ error: 'Failed to delete hero image' });
  }
});

// Получить токены Strava (обновлено для многопользовательской архитектуры)
app.get('/api/strava/tokens', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Получаем токены пользователя из базы данных
    const result = await pool.query(
      'SELECT strava_access_token, strava_refresh_token, strava_expires_at FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    
    const user = result.rows[0];
    const tokens = {
      access_token: user.strava_access_token || '',
      refresh_token: user.strava_refresh_token || '',
      expires_at: user.strava_expires_at || 0
    };
    
    res.json(tokens);
  } catch (err) {
    console.error('Error getting tokens:', err);
    res.status(500).json({ error: true, message: 'Failed to get tokens' });
  }
});

// Обновить токены Strava (обновлено для многопользовательской архитектуры)
app.post('/api/strava/tokens', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { access_token: newAccessToken, refresh_token: newRefreshToken, expires_at: newExpiresAt } = req.body;
    
    if (!newAccessToken || !newRefreshToken) {
      return res.status(400).json({ error: true, message: 'Access token and refresh token are required' });
    }
    
    // Обновляем токены пользователя в базе данных
    await pool.query(
      'UPDATE users SET strava_access_token = $1, strava_refresh_token = $2, strava_expires_at = $3 WHERE id = $4',
      [newAccessToken, newRefreshToken, parseInt(newExpiresAt) || 0, userId]
    );
    

    res.json({ success: true, message: 'Tokens updated successfully' });
  } catch (err) {
    console.error('Error updating tokens:', err);
    res.status(500).json({ error: true, message: 'Failed to update tokens' });
  }
});

// Получение ImageKit конфигурации (глобальная для всех пользователей)
app.get('/api/imagekit/config', authMiddleware, async (req, res) => {
  try {
    const config = getImageKitConfig();
    
    if (!config) {
      return res.status(404).json({ error: 'ImageKit configuration not found' });
    }
    
    // Не возвращаем приватные ключи
    res.json({
      public_key: config.public_key,
      url_endpoint: config.url_endpoint
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get ImageKit configuration' });
  }
});



// Новый эндпоинт для получения лимитов Strava
app.get('/api/strava/limits', authMiddleware, (req, res) => {
  try {
    res.json(stravaRateLimits || {
      limit15min: null,
      limitDay: null,
      usage15min: null,
      usageDay: null,
      lastUpdate: null
    });
  } catch (error) {
    console.error('Error getting Strava limits:', error);
    res.status(500).json({ 
      error: true, 
      message: 'Failed to get Strava limits',
      limits: {
        limit15min: null,
        limitDay: null,
        usage15min: null,
        usageDay: null,
        lastUpdate: null
      }
    });
  }
});

// Принудительно обновить лимиты Strava (обновлено для многопользовательской архитектуры)
app.post('/api/strava/limits/refresh', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log('🔄 Refreshing Strava limits for user:', userId);
    
    const user = await getUserStravaToken(userId);
    
    if (!user) {
      console.log('❌ No Strava token found for user:', userId);
      return res.status(400).json({ error: true, message: 'Нет Strava токена для пользователя' });
    }

    let access_token = user.strava_access_token;
    let refresh_token = user.strava_refresh_token;
    let expires_at = user.strava_expires_at;

    const now = Math.floor(Date.now() / 1000);
    if (now >= expires_at) {
      const refresh = await axios.post('https://www.strava.com/oauth/token', {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refresh_token
      });
      access_token = refresh.data.access_token;
      refresh_token = refresh.data.refresh_token;
      expires_at = refresh.data.expires_at;
      
      // Обновляем токены в базе данных
      await pool.query(
        'UPDATE users SET strava_access_token = $1, strava_refresh_token = $2, strava_expires_at = $3 WHERE id = $4',
        [access_token, refresh_token, expires_at, userId]
      );
    }

    // Делаем тестовый запрос для получения лимитов
    const response = await axios.get('https://www.strava.com/api/v3/athlete', {
      headers: { Authorization: `Bearer ${access_token}` },
      timeout: 10000
    });
    
    // Обновляем лимиты из заголовков
    updateStravaLimits(response.headers);
    console.log('✅ Strava limits updated:', stravaRateLimits);
    
    res.json({ 
      success: true, 
      message: 'Лимиты обновлены',
      limits: stravaRateLimits 
    });
  } catch (err) {
    console.error('❌ Error refreshing Strava limits:', err.message);
    res.status(500).json({ 
      error: true, 
      message: err.response?.data?.message || err.message || 'Failed to refresh limits' 
    });
  }
});

// === Аналитика по поездкам за 4-недельный цикл ===
app.get('/api/analytics/summary', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const filterYear = req.query.year ? parseInt(req.query.year) : null;
    let periodParam = req.query.period || '4w';
    // Получаем все поездки: Strava + ручные
    let activities = [];
    // Strava
    if (activitiesCache[userId] && Array.isArray(activitiesCache[userId].data)) {
      activities = activities.concat(activitiesCache[userId].data);
    } else {
      // Если нет кеша — пробуем загрузить сейчас
      try {
        const user = await getUserStravaToken(userId);
        if (user) {
          // (Можно вынести в функцию, но для простоты — повторение)
          let access_token = user.strava_access_token;
          let refresh_token = user.strava_refresh_token;
          let expires_at = user.strava_expires_at;
          const now = Math.floor(Date.now() / 1000);
          if (now >= expires_at) {
            const refresh = await axios.post('https://www.strava.com/oauth/token', {
              client_id: CLIENT_ID,
              client_secret: CLIENT_SECRET,
              grant_type: 'refresh_token',
              refresh_token: refresh_token
            });
            access_token = refresh.data.access_token;
            refresh_token = refresh.data.refresh_token;
            expires_at = refresh.data.expires_at;
            await pool.query(
              'UPDATE users SET strava_access_token = $1, strava_refresh_token = $2, strava_expires_at = $3 WHERE id = $4',
              [access_token, refresh_token, expires_at, userId]
            );
          }
          // Получаем только велосипедные заезды с пагинацией
          let allActivities = [];
          let page = 1;
          const per_page = 200;
          while (true) {
            const response = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
              headers: { Authorization: `Bearer ${access_token}` },
              params: { per_page, page, type: 'Ride' },
              timeout: 15000
            });
            updateStravaLimits(response.headers);
            const activities = response.data;
            if (!activities.length) break;
            allActivities = allActivities.concat(activities);
            if (activities.length < per_page) break;
            page++;
          }
          activitiesCache[userId] = { data: allActivities, time: Date.now() };
          activities = activities.concat(allActivities);
        }
      } catch {}
    }
    // Ручные
    const manualResult = await pool.query('SELECT * FROM rides WHERE user_id = $1', [userId]);
    activities = activities.concat(manualResult.rows);
    // Фильтрация по userId, если есть
    if (req.query.userId) {
      activities = activities.filter(a => !a.userId || a.userId == req.query.userId);
    }
    // --- Новое: фильтрация по году ---
    let isAllYears = false;
    let yearOnly = false;
    if (req.query.year === 'all') {
      isAllYears = true;
      // не фильтруем по году
      if (!req.query.period) {
        // Если выбран все годы и не указан период — вернуть все активности
        periodParam = 'all';
      }
    } else if (filterYear) {
      activities = activities.filter(a => a.start_date && new Date(a.start_date).getFullYear() === filterYear);
      // Если явно НЕ передан period, то это запрос на весь год
      if (!req.query.period) yearOnly = true;
    }

    // Activities loaded from cache
    if (!activities.length) return res.json({ summary: null });

    // --- Новое: фильтрация по period ---
    let filtered = activities;
    const now = new Date();
    let periodStart = null, periodEnd = null;
    if (yearOnly) {
      // Только год, без периода — весь год
      periodStart = new Date(filterYear, 0, 1);
      periodEnd = new Date(filterYear, 11, 31, 23, 59, 59, 999);
      filtered = activities; // уже отфильтрованы по году
    } else if (periodParam === '4w') {
      // === Новый расчёт календарного 4-недельного блока ===
      // 1. Найти ближайший прошедший понедельник (или сегодня, если сегодня понедельник)
      const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayOfWeek = nowDate.getDay(); // 0=вс, 1=пн, ...
      const daysSinceMonday = (dayOfWeek + 6) % 7; // 0=пн, 6=вс
      // 2. Найти номер недели в году (ISO week)
      function getISOWeek(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
      }
      const isoWeek = getISOWeek(nowDate);
      // 3. Определить номер 4-недельного блока (1,2,3...)
      const blockNum = Math.floor((isoWeek - 1) / 4);
      // 4. Найти первый понедельник этого блока
      const firstMonday = new Date(nowDate);
      firstMonday.setDate(firstMonday.getDate() - daysSinceMonday - ((isoWeek - 1) % 4) * 7);
      // 5. Начало периода — этот понедельник, конец — через 28 дней (воскресенье включительно)
      periodStart = new Date(firstMonday);
      periodEnd = new Date(firstMonday);
      periodEnd.setDate(periodEnd.getDate() + 27); // 28 дней
      // 6. Фильтруем активности по этому периоду
      filtered = activities.filter(a => {
        const d = new Date(a.start_date);
        return d >= periodStart && d <= periodEnd;
      });
      // Period calculation for plan-fact-hero
      // Filtered activities for current period
    } else if (periodParam === '3m') {
      const threeMonthsAgo = new Date(now.getTime() - 92 * 24 * 60 * 60 * 1000);
      filtered = activities.filter(a => new Date(a.start_date) > threeMonthsAgo);
      periodStart = threeMonthsAgo;
      periodEnd = now;
    } else if (periodParam === 'year') {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      filtered = activities.filter(a => new Date(a.start_date) > yearAgo);
      periodStart = yearAgo;
      periodEnd = now;
    } else if (periodParam === 'all') {
      filtered = activities;
      if (filtered.length) {
        periodStart = new Date(Math.min(...filtered.map(a => new Date(a.start_date))));
        periodEnd = new Date(Math.max(...filtered.map(a => new Date(a.start_date))));
      }
    }



    // Аналитика по filtered (аналогично текущей логике)
    const totalRides = filtered.length;
    const totalTimeH = filtered.reduce((sum, a) => sum + (a.moving_time || 0), 0) / 3600;
    const totalCalories = filtered.reduce((sum, a) => {
      const hr = a.average_heartrate || 0;
      const t = (a.moving_time || 0) / 3600;
      return sum + t * (hr >= 140 ? 850 : 600);
    }, 0);
    const carbsPerHour = 35;
    const totalCarbs = totalTimeH * carbsPerHour;
    const totalWater = totalTimeH * 0.6;
    const totalElev = filtered.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0);
    const totalMovingSec = filtered.reduce((sum, a) => sum + (a.moving_time || 0), 0);
    const totalKm = filtered.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
    const avgSpeed = totalMovingSec > 0 ? (totalKm / (totalMovingSec / 3600)) : null;
    let longest = null;
    filtered.forEach(a => {
      if (!longest || (a.distance || 0) > (longest.distance || 0)) longest = a;
    });
    let longestStats = null;
    if (longest) {
      const distKm = (longest.distance || 0) / 1000;
      const timeH = (longest.moving_time || 0) / 3600;
      const hr = longest.average_heartrate || 0;
      const cal = timeH * (hr >= 140 ? 850 : 600);
      const carbs = timeH * carbsPerHour;
      const water = timeH * 0.6;
      const gels = Math.ceil((carbs * 0.7) / 25);
      const bars = Math.ceil((carbs * 0.7) / 40);
      longestStats = { distKm, timeH, cal, carbs, water, gels, bars, name: longest.name, date: longest.start_date };
    }
    // Среднее число тренировок в неделю (за период)
    let avgPerWeek = 0;
    if (periodParam === 'year' || periodParam === 'all') {
      avgPerWeek = +(totalRides / 52).toFixed(2);
    } else if (periodParam === '3m') {
      avgPerWeek = +(totalRides / 13).toFixed(2);
    } else {
      avgPerWeek = +(totalRides / 4).toFixed(2);
    }
    // Количество длинных поездок (>50км или >2.5ч)
    const longRidesCount = filtered.filter(a => (a.distance || 0) > 50000 || (a.moving_time || 0) > 2.5 * 3600).length;
    // Количество интервальных тренировок (по названию/type)
    const intervalsCount = filtered.filter(a => (a.name || '').toLowerCase().includes('интервал') || (a.name || '').toLowerCase().includes('interval') || (a.type && a.type.toLowerCase().includes('interval'))).length;
    
    // Анализ высокоинтенсивного времени (≥160 BPM ≥120 сек подряд)
    let highIntensityTimeMin = 0;
    let highIntensityIntervals = 0;
    let highIntensitySessions = 0;
    
    // Простой анализ по среднему пульсу (так как streams данные недоступны на сервере)
    for (const act of filtered) {
      if (act.average_heartrate && act.average_heartrate >= 160 && act.moving_time && act.moving_time >= 120) {
        // Если средний пульс ≥160 и время ≥2 минуты, считаем это интервалом
        highIntensityTimeMin += Math.round(act.moving_time / 60);
        highIntensityIntervals++;
        highIntensitySessions++;
      }
    }

    // Динамический план на основе профиля пользователя
    const { getPlanFromProfile } = require('./trainingPlans');
    
    // Получаем профиль пользователя для персонализации плана
    let userProfile = null;
    try {
      const profileResult = await pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]);
      if (profileResult.rows.length > 0) {
        userProfile = profileResult.rows[0];
      }
    } catch (error) {
      console.warn('Could not fetch user profile for plan calculation:', error);
    }
    
    // Получаем персонализированный план
    const plan = getPlanFromProfile(userProfile);
    const progress = {
      rides: Math.round(totalRides / plan.rides * 100),
      km: Math.round(totalKm / plan.km * 100),
      long: Math.round(longRidesCount / plan.long * 100),
      intervals: Math.round(intervalsCount / plan.intervals * 100)
    };
    // Время по пульсовым зонам (Z2, Z3, Z4, другое)
    let z2 = 0, z3 = 0, z4 = 0, other = 0;
    filtered.forEach(a => {
      if (!a.average_heartrate || !a.moving_time) return;
      const hr = a.average_heartrate;
      const t = a.moving_time / 60; // минуты
      if (hr >= 109 && hr < 127) z2 += t;
      else if (hr >= 127 && hr < 145) z3 += t;
      else if (hr >= 145 && hr < 163) z4 += t;
      else other += t;
    });
    const zones = { z2: Math.round(z2), z3: Math.round(z3), z4: Math.round(z4), other: Math.round(other) };
    function estimateVO2max(acts, userProfile) {
      // VO2max calculation with activity data
      if (!acts.length) {
        // No activities available for VO2max calculation
        return null;
      }
      
      // Получаем лучшую скорость и лучшее усилие
      const bestSpeed = Math.max(...acts.map(a => (a.average_speed || 0) * 3.6)); // км/ч
      const avgHR = acts.reduce((sum, a) => sum + (a.average_heartrate || 0), 0) / acts.filter(a => a.average_heartrate).length;
      
      // Используем данные профиля или значения по умолчанию
      const age = userProfile?.age || 35;
      const weight = userProfile?.weight || 75;
      const gender = userProfile?.gender || 'male';
      const restingHR = userProfile?.resting_heartrate || 60;
      const maxHR = userProfile?.max_heartrate || (220 - age);
      
      // Если нет данных о скорости, возвращаем базовую оценку
      if (bestSpeed < 10) return null;
      
      // Модифицированная формула на основе Jack Daniels' и cycling power equations
      // Базовый расчет VO₂max для велоспорта
      let vo2max;
      
      if (bestSpeed >= 40) {
        // Высокая скорость - используем формулу для конкурентного уровня
        vo2max = 2.8 * bestSpeed - 25; // Линейная зависимость для высоких скоростей
      } else {
        // Обычная скорость - базовая формула с коэффициентами для велоспорта
        vo2max = 1.8 * bestSpeed + 10; // Более реалистичная формула
      }
      
      // Корректировки на основе данных профиля
      
      // Возрастная корректировка (VO₂max снижается с возрастом)
      const ageAdjustment = Math.max(0.85, 1 - (age - 25) * 0.005);
      vo2max *= ageAdjustment;
      
      // Гендерная корректировка
      if (gender === 'female') {
        vo2max *= 0.88; // У женщин обычно на 10-15% ниже
      }
      
      // Корректировка на основе HR данных (если доступны)
      if (avgHR && restingHR && maxHR) {
        const hrReserve = maxHR - restingHR;
        const avgHRPercent = (avgHR - restingHR) / hrReserve;
        
        // Если средний пульс высокий при хорошей скорости - VO₂max может быть ниже
        if (avgHRPercent > 0.85 && bestSpeed < 35) {
          vo2max *= 0.92;
        } else if (avgHRPercent < 0.7 && bestSpeed > 30) {
          vo2max *= 1.05; // Хорошая эффективность
        }
      }
      
      // Бонус за тренированность (интервальные тренировки)
      const intervals = acts.filter(a => 
        (a.name || '').toLowerCase().includes('интервал') || 
        (a.name || '').toLowerCase().includes('interval') || 
        (a.type && a.type.toLowerCase().includes('interval'))
      );
      
      const longRides = acts.filter(a => (a.distance || 0) > 50000 || (a.moving_time || 0) > 2.5 * 3600).length; // >50км или >2.5ч
      const recentActs = acts.filter(a => {
        const actDate = new Date(a.start_date);
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return actDate > monthAgo;
      });
      
      // Тренированность: интервалы + объем + регулярность
      let fitnessBonus = 1;
      if (intervals.length >= 8) fitnessBonus += 0.08;
      else if (intervals.length >= 4) fitnessBonus += 0.05;
      else if (intervals.length >= 2) fitnessBonus += 0.02;
      
      if (longRides >= 4) fitnessBonus += 0.03;
      if (recentActs.length >= 12) fitnessBonus += 0.03; // регулярность
      
      vo2max *= fitnessBonus;
      
      // Ограничиваем разумными пределами
      vo2max = Math.max(25, Math.min(80, vo2max));
      
      return Math.round(vo2max);
    }
    function estimateFTP(acts) { return null; }
    // Для VO2max используем плавающие периоды, как в goals cache
    let vo2maxActivities = filtered;
    if (periodParam === '4w') {
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      vo2maxActivities = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
      // Rolling 28 days VO2max calculation
    } else if (periodParam === '3m') {
      const threeMonthsAgo = new Date(now.getTime() - 92 * 24 * 60 * 60 * 1000);
      vo2maxActivities = activities.filter(a => new Date(a.start_date) > threeMonthsAgo);
      // Rolling 3 months VO2max calculation
    } else if (periodParam === 'year') {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      vo2maxActivities = activities.filter(a => new Date(a.start_date) > yearAgo);
      // Rolling year VO2max calculation
    }
    
    const vo2max = estimateVO2max(vo2maxActivities, userProfile);
    // VO2max calculated for analytics summary
    // User profile loaded for calculations
    const ftp = estimateFTP(filtered);
    

    
    res.json({
      summary: {
        totalCalories: Math.round(totalCalories),
        totalTimeH: +totalTimeH.toFixed(1),
        totalCarbs: Math.round(totalCarbs),
        totalWater: +totalWater.toFixed(1),
        totalRides,
        longestRide: longestStats,
        avgPerWeek,
        longRidesCount,
        intervalsCount,
        highIntensityTimeMin,
        highIntensityIntervals,
        highIntensitySessions,
        progress,
        plan, // Добавляем план в ответ
        zones,
        totalKm: Math.round(totalKm),
        totalElev: Math.round(totalElev),
        totalMovingHours: +(totalMovingSec / 3600).toFixed(1),
        avgSpeed: avgSpeed !== null ? +avgSpeed.toFixed(1) : null,
        vo2max,
        ftp
      },
      period: {
        start: periodStart,
        end: periodEnd
      }
    });
  } catch (err) {
    console.error('Ошибка аналитики:', err);
    res.status(500).json({ error: true, message: err.message || 'Ошибка аналитики' });
  }
});

// Функция для вычисления VO2max для конкретного периода
async function calculateVO2maxForPeriod(userId, period) {
  try {
    // Получаем активности из кэша
    let activities = [];
    if (activitiesCache[userId] && Array.isArray(activitiesCache[userId].data)) {
      activities = activitiesCache[userId].data;
    }
    
    // Получаем профиль пользователя
    let userProfile = null;
    try {
      const profileResult = await pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]);
      if (profileResult.rows.length > 0) {
        userProfile = profileResult.rows[0];
      }
    } catch (error) {
      console.warn('Could not fetch user profile for VO2max calculation:', error);
    }
    
    // Фильтруем по периоду
    let filteredActivities = activities;
    const now = new Date();
    
    if (period === '4w') {
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
    } else if (period === '3m') {
      const threeMonthsAgo = new Date(now.getTime() - 92 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > threeMonthsAgo);
    } else if (period === 'year') {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > yearAgo);
    }
    
    // Calculating VO2max for goal period
    
    // Используем функцию estimateVO2max из analytics endpoint
    // Копируем её логику здесь для доступности
    function estimateVO2max(acts, userProfile) {
      if (!acts.length) return null;
      
      // Получаем лучшую скорость и лучшее усилие
      const bestSpeed = Math.max(...acts.map(a => (a.average_speed || 0) * 3.6)); // км/ч
      const avgHR = acts.reduce((sum, a) => sum + (a.average_heartrate || 0), 0) / acts.filter(a => a.average_heartrate).length;
      
      // Используем данные профиля или значения по умолчанию
      const age = userProfile?.age || 35;
      const weight = userProfile?.weight || 75;
      const gender = userProfile?.gender || 'male';
      const restingHR = userProfile?.resting_hr || 60;
      const maxHR = userProfile?.max_hr || (220 - age);
      
      // Базовый расчет VO₂max для велоспорта
      let vo2max;
      
      if (bestSpeed >= 40) {
        // Высокая скорость - используем формулу для конкурентного уровня
        vo2max = 2.8 * bestSpeed - 25; // Линейная зависимость для высоких скоростей
      } else {
        // Обычная скорость - базовая формула с коэффициентами для велоспорта
        vo2max = 1.8 * bestSpeed + 10; // Более реалистичная формула
      }
      
      // Корректировки на основе данных профиля
      
      // Возрастная корректировка (VO₂max снижается с возрастом)
      const ageAdjustment = Math.max(0.85, 1 - (age - 25) * 0.005);
      vo2max *= ageAdjustment;
      
      // Гендерная корректировка
      if (gender === 'female') {
        vo2max *= 0.88; // У женщин обычно на 10-15% ниже
      }
      
      // Корректировка на основе HR данных (если доступны)
      if (avgHR && restingHR && maxHR) {
        const hrReserve = maxHR - restingHR;
        const avgHRPercent = (avgHR - restingHR) / hrReserve;
        
        // Если средний пульс высокий при хорошей скорости - VO₂max может быть ниже
        if (avgHRPercent > 0.85 && bestSpeed < 35) {
          vo2max *= 0.92;
        } else if (avgHRPercent < 0.7 && bestSpeed > 30) {
          vo2max *= 1.05; // Хорошая эффективность
        }
      }
      
      // Бонус за тренированность (интервальные тренировки)
      const intervals = acts.filter(a => 
        (a.name || '').toLowerCase().includes('интервал') || 
        (a.name || '').toLowerCase().includes('interval') || 
        (a.type && a.type.toLowerCase().includes('interval'))
      );
      
      const longRides = acts.filter(a => (a.distance || 0) > 50000 || (a.moving_time || 0) > 2.5 * 3600);
      
      // Регулярность тренировок
      const totalRides = acts.length;
      const daysSpan = Math.max(1, (new Date() - new Date(Math.min(...acts.map(a => new Date(a.start_date))))) / (1000 * 60 * 60 * 24));
      const ridesPerWeek = (totalRides / daysSpan) * 7;
      
      let fitnessBonus = 1;
      if (intervals.length >= 1) fitnessBonus += 0.03;
      if (intervals.length >= 3) fitnessBonus += 0.02;
      if (longRides.length >= 1) fitnessBonus += 0.02;
      if (longRides.length >= 3) fitnessBonus += 0.02;
      if (ridesPerWeek >= 3) fitnessBonus += 0.03;
      if (ridesPerWeek >= 5) fitnessBonus += 0.02;
      
      vo2max *= fitnessBonus;
      
      // Ограничиваем разумными пределами
      vo2max = Math.max(25, Math.min(80, vo2max));
      
      return Math.round(vo2max);
    }
    
    const vo2max = estimateVO2max(filteredActivities, userProfile);
    
    // VO2max calculation completed
    return vo2max;
  } catch (error) {
    console.error('Error calculating VO2max for period:', error);
    return null;
  }
}

// === Анализ отдельной активности: тип и рекомендации ===
app.get('/api/analytics/activity/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    // Получаем активности из кэша пользователя
    let activities = [];
    if (activitiesCache[userId] && Array.isArray(activitiesCache[userId].data)) {
      activities = activitiesCache[userId].data;
    } else {
      // Если нет в кэше, получаем с Strava
      try {
        const user = await getUserStravaToken(userId);
        if (user) {
          let access_token = user.strava_access_token;
          let refresh_token = user.strava_refresh_token;
          let expires_at = user.strava_expires_at;
          const now = Math.floor(Date.now() / 1000);
          
          if (now >= expires_at) {
            const refresh = await axios.post('https://www.strava.com/oauth/token', {
              client_id: CLIENT_ID,
              client_secret: CLIENT_SECRET,
              grant_type: 'refresh_token',
              refresh_token: refresh_token
            });
            access_token = refresh.data.access_token;
            refresh_token = refresh.data.refresh_token;
            expires_at = refresh.data.expires_at;
            await pool.query(
              'UPDATE users SET strava_access_token = $1, strava_refresh_token = $2, strava_expires_at = $3 WHERE id = $4',
              [access_token, refresh_token, expires_at, userId]
            );
          }
          
          const response = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
            headers: { Authorization: `Bearer ${access_token}` },
            params: { per_page: 200, page: 1 },
            timeout: 15000
          });
          
          activities = response.data.filter(a => a.type === 'Ride');
        }
      } catch (error) {
        console.error('Error fetching activities for analysis:', error);
      }
    }
    
    // Находим нужную активность
    const activity = activities.find(a => String(a.id) === String(id));
    if (!activity) return res.status(404).json({ error: true, message: 'Activity not found' });

    // Анализ активности (логика с фронта)
    let type = 'Regular';
    if (activity.distance && activity.distance/1000 > 60) type = 'Long';
    else if (activity.average_speed && activity.average_speed*3.6 < 20 && activity.moving_time && activity.moving_time/60 < 60) type = 'Recovery';
    else if (activity.total_elevation_gain && activity.total_elevation_gain > 800) type = 'Mountain';
    else if ((activity.name||'').toLowerCase().includes('интервал') || (activity.type||'').toLowerCase().includes('interval')) type = 'Interval';

    const recommendations = [];
    if (activity.average_speed && activity.average_speed*3.6 < 25) {
      recommendations.push({
        title: 'Average speed below 25 km/h',
        advice: 'To improve speed, include interval training (e.g., 4×4 min with 4 min rest, Z4-Z5), work on pedal technique (cadence 90–100), pay attention to your body position on the bike, and aerodynamics.'
      });
    }
    if (activity.average_heartrate && activity.average_heartrate > 155) {
      recommendations.push({
        title: 'Heart rate above 155 bpm',
        advice: 'This may indicate high intensity or insufficient recovery. Check your sleep quality, stress level, add recovery training, pay attention to hydration and nutrition.'
      });
    }
    if (activity.total_elevation_gain && activity.total_elevation_gain > 500 && activity.average_speed*3.6 < 18) {
      recommendations.push({
        title: 'Mountain training with low speed',
        advice: 'To improve results, add strength training off the bike and intervals in ascents (e.g., 5×5 min in Z4).'
      });
    }
    if (!activity.average_heartrate) {
      recommendations.push({
        title: 'No heart rate data',
        advice: 'Add a heart rate monitor for more accurate intensity control and recovery.'
      });
    }
    if (!activity.distance || activity.distance/1000 < 30) {
      recommendations.push({
        title: 'Short distance',
        advice: 'To develop endurance, plan at least one long ride (60+ km) per week. Gradually increase the distance, remembering to eat and hydrate on the road.'
      });
    }
    if (type === 'Recovery') {
      recommendations.push({
        title: 'Recovery training',
        advice: 'Great! Don\'t forget to alternate such training with intervals and long rides for progress.'
      });
    }
    if (type === 'Interval' && activity.average_heartrate && activity.average_heartrate < 140) {
      recommendations.push({
        title: 'Interval training with low heart rate',
        advice: 'Intervals should be performed with greater intensity (Z4-Z5) to get the maximum training effect.'
      });
    }
    if (!activity.average_cadence) {
      recommendations.push({
        title: 'No cadence data',
        advice: 'Using a cadence sensor will help track pedal technique and avoid excessive fatigue.'
      });
    }
    if (recommendations.length === 0) {
      recommendations.push({
        title: 'Great training!',
        advice: 'Training completed perfectly! Continue in the same spirit and gradually increase the load for further progress.'
      });
    }
    res.json({ type, recommendations });
  } catch (err) {
    console.error('Ошибка анализа активности:', err);
    res.status(500).json({ error: true, message: err.message || 'Ошибка анализа активности' });
  }
});

app.post('/api/ai-analysis', async (req, res) => {
  try {
    const summary = req.body.summary;
    if (!summary) return res.status(400).json({ error: 'No summary provided' });
    
    // Получаем userId из токена
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization required' });
    
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;
    
    const analysis = await analyzeTraining(summary, pool, userId);
    res.json({ analysis });
  } catch (e) {
    console.error('AI analysis error:', e);
    res.status(500).json({ error: 'AI analysis failed', details: e.message });
  }
});

// Регистрация нового пользователя
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Проверяем, не существует ли уже пользователь с таким email
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: true, message: 'User with this email already exists' });
    }
    
    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Создаем пользователя
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, email, name',
      [email, hashedPassword, name]
    );
    
    const user = result.rows[0];
    
    // Генерируем токен верификации
    const verificationToken = generateVerificationToken();
    
    // Сохраняем токен в базе
    await pool.query(
      'UPDATE users SET verification_token = $1, verification_token_expires = NOW() + INTERVAL \'24 hours\' WHERE id = $2',
      [verificationToken, user.id]
    );
    
    // Отправляем email для верификации
    await sendVerificationEmail(email, verificationToken, name);
    
    res.json({ 
      success: true, 
      message: 'Registration successful. Please check your email to verify your account.',
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: true, message: err.message || 'Registration failed' });
  }
});

// Подтверждение email
app.get('/api/verify-email', async (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.status(400).json({ error: 'Verification token required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, verification_token_expires FROM users WHERE verification_token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    const user = result.rows[0];
    
    // Проверяем срок действия токена
    if (new Date() > new Date(user.verification_token_expires)) {
      return res.status(400).json({ error: 'Verification token has expired' });
    }

    // Подтверждаем email
    await pool.query(
      'UPDATE users SET email_verified = TRUE, verification_token = NULL, verification_token_expires = NULL WHERE id = $1',
      [user.id]
    );

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Email verification failed' });
  }
});

// Повторная отправка email подтверждения
app.post('/api/resend-verification', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email_verified FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    
    if (user.email_verified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Генерируем новый токен
    const verificationToken = generateVerificationToken();
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 часа

    await pool.query(
      'UPDATE users SET verification_token = $1, verification_token_expires = $2 WHERE id = $3',
      [verificationToken, tokenExpires, user.id]
    );

    // Отправляем email подтверждения
    const emailSent = await sendVerificationEmail(email, verificationToken);
    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send verification email' });
    }

    res.json({ message: 'Verification email sent successfully' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    
    // Проверяем верификацию email
    if (!user.email_verified) {
      return res.status(403).json({ 
        error: 'Email not verified. Please check your email and click the verification link.',
        needsVerification: true
      });
    }
    
    // ВАЖНО: включаем strava_id, name, avatar!
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        strava_id: user.strava_id,
        name: user.name,
        avatar: user.avatar
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, email: user.email, created_at: user.created_at } });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// === Защита всех /api маршрутов ===
// app.use('/api', authMiddleware); // Убираем глобальную защиту, используем индивидуальную

// --- NEW: checklist endpoints using DB and userId ---

// Get all checklist items for current user
app.get('/api/checklist', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const result = await pool.query(
    'SELECT * FROM checklist WHERE user_id = $1 ORDER BY section, id',
    [userId]
  );
  res.json(result.rows);
});

// Add a checklist item for current user
app.post('/api/checklist', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { section, item, checked } = req.body;
  const result = await pool.query(
    'INSERT INTO checklist (user_id, section, item, checked) VALUES ($1, $2, $3, $4) RETURNING *',
    [userId, section, item, checked ?? false]
  );
  res.json(result.rows[0]);
});

// Update a checklist item (e.g., mark as checked)
app.put('/api/checklist/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const { checked, link } = req.body;
  
  let query, params;
  if (link !== undefined) {
    // Обновляем ссылку
    query = 'UPDATE checklist SET link = $1 WHERE id = $2 AND user_id = $3 RETURNING *';
    params = [link, id, userId];
  } else {
    // Обновляем статус checked
    query = 'UPDATE checklist SET checked = $1 WHERE id = $2 AND user_id = $3 RETURNING *';
    params = [checked, id, userId];
  }
  
  const result = await pool.query(query, params);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
  res.json(result.rows[0]);
});

// Delete a checklist item
app.delete('/api/checklist/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const result = await pool.query(
    'DELETE FROM checklist WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
  res.json({ success: true });
});

// Delete a checklist section (all items in the section)
app.delete('/api/checklist/section/:section', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { section } = req.params;
  
  // Декодируем название секции (двойное кодирование)
  const decodedSection = decodeURIComponent(decodeURIComponent(section));
  
  const result = await pool.query(
    'DELETE FROM checklist WHERE section = $1 AND user_id = $2 RETURNING *',
    [decodedSection, userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Section not found' });
  res.json({ success: true, deletedCount: result.rows.length });
});

// --- NEW: Personal Goals endpoints ---

// Get all goals for current user
app.get('/api/goals', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  
  const result = await pool.query(
    'SELECT * FROM goals WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );

  res.json(result.rows);
});

// Add a new goal for current user
app.post('/api/goals', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { title, description, target_value, current_value, unit, goal_type, period, hr_threshold, duration_threshold } = req.body;
    
    // Валидация числовых полей - конвертируем пустые строки в 0 для создания
    const validatedTargetValue = (target_value === '' || target_value === null || target_value === undefined) ? 0 : Number(target_value);
    const validatedCurrentValue = (current_value === '' || current_value === null || current_value === undefined) ? 0 : Number(current_value);
    const validatedHrThreshold = (hr_threshold === '' || hr_threshold === null || hr_threshold === undefined) ? 160 : Number(hr_threshold);
    const validatedDurationThreshold = (duration_threshold === '' || duration_threshold === null || duration_threshold === undefined) ? 120 : Number(duration_threshold);
    
    // Вычисляем VO2max для FTP целей
    let vo2maxValue = null;
    if (goal_type === 'ftp_vo2max') {
      vo2maxValue = await calculateVO2maxForPeriod(userId, period || '4w');
      // Saving FTP goal with calculated VO2max
    }
    
    const result = await pool.query(
      'INSERT INTO goals (user_id, title, description, target_value, current_value, unit, goal_type, period, hr_threshold, duration_threshold, vo2max_value) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
      [userId, title, description, validatedTargetValue, validatedCurrentValue, unit, goal_type, period || '4w', validatedHrThreshold, validatedDurationThreshold, vo2maxValue]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating goal:', error);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

// Update a goal
app.put('/api/goals/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const { title, description, target_value, current_value, unit, goal_type, period, hr_threshold, duration_threshold } = req.body;
  
  try {
    // Получаем текущую цель из базы данных
    const currentGoalResult = await pool.query(
      'SELECT * FROM goals WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (currentGoalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    const currentGoal = currentGoalResult.rows[0];
    
    // Собираем данные для обновления, используя существующие значения как fallback
    const updateData = {
      title: title !== undefined ? title : currentGoal.title,
      description: description !== undefined ? description : currentGoal.description,
      target_value: target_value !== undefined ? (target_value === '' || target_value === null ? 0 : Number(target_value)) : currentGoal.target_value,
      current_value: current_value !== undefined ? (current_value === '' || current_value === null ? 0 : Number(current_value)) : currentGoal.current_value,
      unit: unit !== undefined ? unit : currentGoal.unit,
      goal_type: goal_type !== undefined ? goal_type : currentGoal.goal_type,
      period: period !== undefined ? period : currentGoal.period,
      hr_threshold: hr_threshold !== undefined ? (hr_threshold === '' || hr_threshold === null ? 160 : Number(hr_threshold)) : currentGoal.hr_threshold,
      duration_threshold: duration_threshold !== undefined ? (duration_threshold === '' || duration_threshold === null ? 120 : Number(duration_threshold)) : currentGoal.duration_threshold
    };
    
    // Пересчитываем VO2max для FTP целей при обновлении
    let vo2maxValue = currentGoal.vo2max_value; // По умолчанию оставляем старое значение
    
    if (updateData.goal_type === 'ftp_vo2max') {
      // Пересчитываем VO2max если изменился период или если его не было
      const periodChanged = updateData.period !== currentGoal.period;
      const noExistingVO2max = !currentGoal.vo2max_value;
      
      if (periodChanged || noExistingVO2max) {
        vo2maxValue = await calculateVO2maxForPeriod(userId, updateData.period);
        // VO2max recalculated for updated FTP goal
      }
    } else {
      // Если тип цели изменился с FTP на другой, очищаем VO2max
      if (currentGoal.goal_type === 'ftp_vo2max') {
        vo2maxValue = null;
        console.log(`🗑️ Clearing VO2max value - goal type changed from ftp_vo2max to ${updateData.goal_type}`);
      }
    }
    
    const result = await pool.query(
      'UPDATE goals SET title = $1, description = $2, target_value = $3, current_value = $4, unit = $5, goal_type = $6, period = $7, hr_threshold = $8, duration_threshold = $9, vo2max_value = $10, updated_at = NOW() WHERE id = $11 AND user_id = $12 RETURNING *',
      [updateData.title, updateData.description, updateData.target_value, updateData.current_value, updateData.unit, updateData.goal_type, updateData.period, updateData.hr_threshold, updateData.duration_threshold, vo2maxValue, id, userId]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating goal:', err);
    res.status(500).json({ error: true, message: err.message || 'Failed to update goal' });
  }
});

// Delete a goal
app.delete('/api/goals/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  
  const result = await pool.query(
    'DELETE FROM goals WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Goal not found' });
  res.json({ success: true });
});

// Функция для обновления целей пользователя
async function updateUserGoals(userId, authHeader) {
  try {
    // Получаем аналитику
    const analyticsResponse = await axios.get(`http://localhost:${PORT}/api/analytics/summary`, {
      headers: { Authorization: authHeader }
    });
    const analytics = analyticsResponse.data.summary;
    
    if (!analytics) {
      return;
    }
    
    // Получаем все цели пользователя
    const goalsResult = await pool.query(
      'SELECT * FROM goals WHERE user_id = $1',
      [userId]
    );
    
    const updatedGoals = [];
    
    for (const goal of goalsResult.rows) {
      let newCurrentValue = goal.current_value;
      
      // Обновляем значения на основе типа цели
      // Для distance целей НЕ обновляем current_value - они считаются на фронтенде
      switch (goal.goal_type) {
        case 'vo2max':
          newCurrentValue = analytics.vo2max || 0;
          break;
        case 'ftp':
          newCurrentValue = analytics.ftp || 0;
          break;
        case 'rides':
          newCurrentValue = analytics.totalRides || 0;
          break;
        case 'distance':
        case 'time':
        case 'elevation':
        case 'speed_flat':
        case 'speed_hills':
        case 'pulse':
        case 'avg_hr_flat':
        case 'avg_hr_hills':
        case 'avg_power':
        case 'cadence':
        case 'long_rides':
        case 'intervals':
        case 'recovery':
        case 'ftp_vo2max':
          // Для этих целей оставляем current_value как есть - они считаются на фронтенде
          continue; // Пропускаем обновление этих целей
        case 'avg_per_week':
          newCurrentValue = analytics.avgPerWeek || 0;
          break;
      }
      
      // Обновляем цель только если значение изменилось
      if (newCurrentValue !== goal.current_value) {

        await pool.query(
          'UPDATE goals SET current_value = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
          [newCurrentValue, goal.id, userId]
        );
        updatedGoals.push({ id: goal.id, title: goal.title, oldValue: goal.current_value, newValue: newCurrentValue });
      }
    }
    
    return updatedGoals;
  } catch (err) {
    console.error('Error auto-updating goals:', err);
  }
}

// Update goals with current values from analytics (manual endpoint)
app.post('/api/goals/update-current', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Получаем аналитику
    const analyticsResponse = await axios.get(`http://localhost:${PORT}/api/analytics/summary`, {
      headers: { Authorization: req.headers.authorization }
    });
    const analytics = analyticsResponse.data.summary;
    
    if (!analytics) {
      return res.status(400).json({ error: 'No analytics data available' });
    }
    
    // Получаем все цели пользователя
    const goalsResult = await pool.query(
      'SELECT * FROM goals WHERE user_id = $1',
      [userId]
    );
    
    const updatedGoals = [];
    
    for (const goal of goalsResult.rows) {
      let newCurrentValue = goal.current_value;
      
      // Обновляем значения на основе типа цели
      // Для distance целей НЕ обновляем current_value - они считаются на фронтенде
      switch (goal.goal_type) {
        case 'vo2max':
          newCurrentValue = analytics.vo2max || 0;
          break;
        case 'ftp':
          newCurrentValue = analytics.ftp || 0;
          break;
        case 'rides':
          newCurrentValue = analytics.totalRides || 0;
          break;
        case 'distance':
        case 'time':
        case 'elevation':
        case 'speed_flat':
        case 'speed_hills':
        case 'pulse':
        case 'avg_hr_flat':
        case 'avg_hr_hills':
        case 'avg_power':
        case 'cadence':
        case 'long_rides':
        case 'intervals':
        case 'recovery':
        case 'ftp_vo2max':
          // Для этих целей оставляем current_value как есть - они считаются на фронтенде
          continue; // Пропускаем обновление этих целей
        case 'avg_per_week':
          newCurrentValue = analytics.avgPerWeek || 0;
          break;
      }
      
      // Обновляем цель только если значение изменилось
      if (newCurrentValue !== goal.current_value) {
        const updateResult = await pool.query(
          'UPDATE goals SET current_value = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
          [newCurrentValue, goal.id, userId]
        );
        updatedGoals.push(updateResult.rows[0]);
      }
    }
    
    res.json({ 
      success: true, 
      updated: updatedGoals.length,
      goals: updatedGoals 
    });
  } catch (err) {
    console.error('Error updating goals:', err);
    res.status(500).json({ error: true, message: err.message || 'Failed to update goals' });
  }
});



// --- Endpoint для привязки Strava к существующему пользователю ---
app.get('/link_strava', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state; // JWT пользователя
  
  if (!code || !state) {
    return res.status(400).send('Missing code or state');
  }
  let userId;
  try {
    const payload = jwt.verify(state, process.env.JWT_SECRET);
    userId = payload.userId;
  } catch (error) {
    return res.status(401).send('Invalid token');
  }
  try {
    // 1. Получаем access_token через Strava OAuth
    const response = await axios.post('https://www.strava.com/oauth/token', {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code'
    });
    const access_token = response.data.access_token;
    const refresh_token = response.data.refresh_token;
    const expires_at = response.data.expires_at;

    // 2. Получаем профиль пользователя Strava
    const athleteRes = await axios.get('https://www.strava.com/api/v3/athlete', {
      headers: { Authorization: `Bearer ${access_token}` },
      timeout: 10000
    });
    const athlete = athleteRes.data;
    const strava_id = athlete.id;
    const email = athlete.email || null;
    const name = athlete.firstname + (athlete.lastname ? ' ' + athlete.lastname : '');
    const avatar = athlete.profile || null;


    // 3. Проверяем, не занят ли этот strava_id другим пользователем
    const existing = await pool.query('SELECT id FROM users WHERE strava_id = $1 AND id != $2', [strava_id, userId]);
    if (existing.rows.length > 0) {

      return res.status(409).send('This Strava account is already linked to another user.');
    }

    // 4. Обновляем текущего пользователя
    const updateRes = await pool.query(
      'UPDATE users SET strava_id = $1, strava_access_token = $2, strava_refresh_token = $3, strava_expires_at = $4, name = $5, email = COALESCE($6, email), avatar = $7 WHERE id = $8',
      [strava_id, access_token, refresh_token, expires_at, name, email, avatar, userId]
    );
    

    // 5. Генерируем новый JWT с обновлёнными данными
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    
    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email, strava_id: user.strava_id, name: user.name, avatar: user.avatar },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 6. Отправляем страницу, которая закроет popup и уведомит родительское окно
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Strava Connected</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 40px;
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.1);
          }
          .success-icon {
            font-size: 48px;
            margin-bottom: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h2>Strava Connected Successfully!</h2>
          <p>You can now close this window.</p>
        </div>
        
        <script>
          // Сохраняем новый JWT токен
          const urlParams = new URLSearchParams(window.location.search);
          const newToken = "${jwtToken}";
          
          // Уведомляем родительское окно об успешном подключении
          if (window.opener) {
            window.opener.postMessage({
              type: 'STRAVA_CONNECTED',
              token: newToken,
              success: true
            }, window.location.origin);
          }
          
          // Закрываем popup через 2 секунды
          setTimeout(() => {
            window.close();
          }, 2000);
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Strava link error:', err.response?.data || err);
    res.status(500).send('Failed to link Strava');
  }
});

// --- Endpoint для отвязки Strava от пользователя ---
app.post('/api/unlink_strava', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  try {
    // Обнуляем strava_id и все связанные поля
    await pool.query(
      'UPDATE users SET strava_id = NULL, strava_access_token = NULL, strava_refresh_token = NULL, strava_expires_at = NULL, avatar = NULL WHERE id = $1',
      [userId]
    );
    // Очищаем серверный кэш Strava activities для этого пользователя
    if (activitiesCache && activitiesCache[userId]) {
      delete activitiesCache[userId];
    }
    // Получаем обновлённого пользователя
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    // Генерируем новый JWT без strava_id
    const jwtToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        strava_id: user.strava_id,
        name: user.name,
        avatar: user.avatar
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token: jwtToken });
  } catch (e) {
    console.error('Unlink Strava error:', e);
    res.status(500).json({ error: 'Failed to unlink Strava' });
  }
});

// --- Endpoint для получения информации о памяти PostgreSQL ---
app.get('/api/database/memory', authMiddleware, async (req, res) => {
  try {
    const memoryInfo = {};
    
    // 1. Общая информация о памяти
    const generalMemory = await pool.query(`
      SELECT 
        name,
        setting,
        unit,
        context,
        category
      FROM pg_settings 
      WHERE name IN (
        'shared_buffers',
        'effective_cache_size',
        'work_mem',
        'maintenance_work_mem',
        'wal_buffers',
        'max_connections'
      )
      ORDER BY name;
    `);
    memoryInfo.generalSettings = generalMemory.rows;
    
    // 2. Размеры таблиц и индексов - используем pg_tables
    const tableSizes = await pool.query(`
      SELECT 
        schemaname,
        tablename,
        'N/A' as total_size,
        'N/A' as table_size,
        'N/A' as index_size,
        0 as total_size_bytes
      FROM pg_tables 
      WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
      LIMIT 10;
    `);
    memoryInfo.tableSizes = tableSizes.rows;
    
    // 3. Общий размер базы данных
    const dbSize = await pool.query(`
      SELECT 
        pg_database.datname as database_name,
        pg_size_pretty(pg_database_size(pg_database.datname)) as database_size,
        pg_database_size(pg_database.datname) as database_size_bytes
      FROM pg_database 
      WHERE datname = current_database();
    `);
    memoryInfo.databaseSize = dbSize.rows[0];
    
    // 4. Активные соединения
    const activeConnections = await pool.query(`
      SELECT 
        count(*) as active_connections,
        count(*) * 1024 * 1024 as estimated_memory_usage_bytes
      FROM pg_stat_activity 
      WHERE state = 'active';
    `);
    memoryInfo.activeConnections = activeConnections.rows[0];
    
    // 5. Статистика кэша
    const cacheStats = await pool.query(`
      SELECT 
        sum(heap_blks_read) as heap_blocks_read,
        sum(heap_blks_hit) as heap_blocks_hit,
        CASE 
          WHEN sum(heap_blks_hit) + sum(heap_blks_read) = 0 THEN 0
          ELSE round(100.0 * sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)), 2)
        END as cache_hit_ratio
      FROM pg_statio_user_tables;
    `);
    memoryInfo.cacheStats = cacheStats.rows[0];
    
    // 6. Размеры индексов - используем pg_stat_user_indexes
    const indexSizes = await pool.query(`
      SELECT 
        schemaname,
        relname as tablename,
        indexrelname as indexname,
        'N/A' as index_size,
        0 as index_size_bytes
      FROM pg_stat_user_indexes 
      LIMIT 5;
    `);
    memoryInfo.indexSizes = indexSizes.rows;
    
    // 7. Статистика WAL (Write-Ahead Log)
    const walStats = await pool.query(`
      SELECT 
        name,
        setting,
        unit
      FROM pg_settings 
      WHERE name LIKE 'wal_%' AND name IN (
        'wal_buffers',
        'wal_writer_delay',
        'checkpoint_segments'
      );
    `);
    memoryInfo.walStats = walStats.rows;
    
    // 8. Процессы и их использование памяти
    const processStats = await pool.query(`
      SELECT 
        pid,
        usename,
        application_name,
        client_addr,
        state,
        query_start,
        state_change,
        query
      FROM pg_stat_activity 
      WHERE state = 'active' 
      ORDER BY query_start;
    `);
    memoryInfo.activeProcesses = processStats.rows;
    
    res.json(memoryInfo);
  } catch (error) {
    console.error('Database memory info error:', error);
    res.status(500).json({ error: 'Failed to get database memory info' });
  }
});

// --- Endpoint для получения детальной статистики таблиц ---
app.get('/api/database/table-stats', authMiddleware, async (req, res) => {
  try {
    const tableStats = await pool.query(`
      SELECT 
        schemaname,
        tablename,
        attname,
        n_distinct,
        correlation,
        'N/A' as most_common_vals,
        'N/A' as most_common_freqs,
        'N/A' as histogram_bounds
      FROM pg_stats 
      WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
      ORDER BY schemaname, tablename, attname
      LIMIT 20;
    `);
    
    res.json({ tableStats: tableStats.rows });
  } catch (error) {
    console.error('Table stats error:', error);
    res.status(500).json({ error: 'Failed to get table statistics' });
  }
});

// --- Endpoint для очистки кэша PostgreSQL ---
app.post('/api/database/clear-cache', authMiddleware, async (req, res) => {
  try {
    // Очищаем shared buffers (требует права суперпользователя)
    await pool.query('DISCARD ALL;');
    
    res.json({ 
      success: true, 
      message: 'PostgreSQL cache cleared successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Clear cache error:', error);
    res.status(500).json({ 
      error: 'Failed to clear cache', 
      details: error.message 
    });
  }
});

const { profiles } = require('./database_profiles');

// --- Endpoint для получения доступных профилей ---
app.get('/api/database/profiles', authMiddleware, async (req, res) => {
  try {
    const profileList = Object.keys(profiles).map(key => ({
      id: key,
      name: profiles[key].name,
      description: profiles[key].description
    }));
    
    res.json({ profiles: profileList });
  } catch (error) {
    console.error('Get profiles error:', error);
    res.status(500).json({ error: 'Failed to get profiles' });
  }
});

// --- Endpoint для оптимизации PostgreSQL ---
app.post('/api/database/optimize', authMiddleware, async (req, res) => {
  try {
    const { profile = 'low-end' } = req.body; // По умолчанию low-end
    const selectedProfile = profiles[profile];
    
    if (!selectedProfile) {
      return res.status(400).json({ error: 'Invalid profile selected' });
    }

    const results = [];
    
    // Сначала проверим права доступа
    try {
      const rightsCheck = await pool.query('SELECT current_user, session_user;');

    } catch (error) {
      console.log('Rights check error:', error.message);
    }
    
    // Применяем настройки из выбранного профиля
    for (const [name, setting] of Object.entries(selectedProfile.settings)) {
      try {
        // Пробуем разные способы применения настроек
        let success = false;
        let errorMessage = '';
        
        // Способ 1: ALTER SYSTEM SET
        try {
          await pool.query(`ALTER SYSTEM SET ${name} = '${setting.value}';`);
          success = true;
        } catch (alterError) {
          errorMessage = alterError.message;
          
          // Способ 2: SET (только для текущей сессии)
          try {
            await pool.query(`SET ${name} = '${setting.value}';`);
            success = true;
            errorMessage = 'Applied to current session only';
          } catch (setError) {
            errorMessage = `ALTER SYSTEM: ${alterError.message}, SET: ${setError.message}`;
          }
        }
        
        if (success) {
          results.push({ 
            name: name, 
            value: setting.value, 
            status: 'success', 
            description: setting.description,
            note: errorMessage === 'Applied to current session only' ? errorMessage : undefined
          });
        } else {
          results.push({ 
            name: name, 
            value: setting.value, 
            status: 'error', 
            error: errorMessage,
            description: setting.description 
          });
        }
      } catch (error) {
        results.push({ 
          name: name, 
          value: setting.value, 
          status: 'error', 
          error: error.message,
          description: setting.description 
        });
      }
    }
    
    // Проверяем, сколько настроек применилось
    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    
    let message = `PostgreSQL optimization completed with ${selectedProfile.name} profile`;
    if (successCount === 0) {
      message += ' (no settings applied - insufficient privileges)';
    } else if (errorCount > 0) {
      message += ` (${successCount} applied, ${errorCount} failed)`;
    }
    
    res.json({ 
      success: successCount > 0,
      message: message,
      profile: selectedProfile.name,
      results: results,
      recommendations: [
        ...selectedProfile.recommendations,
        successCount === 0 ? '⚠️ Для применения настроек нужны права суперпользователя PostgreSQL' : '',
        '🔄 Перезапустите PostgreSQL: sudo systemctl restart postgresql',
        '📝 Или перезагрузите конфигурацию: SELECT pg_reload_conf();'
      ].filter(Boolean),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Optimization error:', error);
    res.status(500).json({ 
      error: 'Failed to optimize PostgreSQL', 
      details: error.message 
    });
  }
});

// Эндпоинт для получения данных о ветре (прокси для Open-Meteo API)
app.get('/api/weather/wind', async (req, res) => {
  try {
    const { latitude, longitude, start_date, end_date } = req.query;
    
    // console.log(`🌤️ Запрос данных о ветре: lat=${latitude}, lng=${longitude}, start=${start_date}, end=${end_date}`);
    
    if (!latitude || !longitude || !start_date || !end_date) {
      // console.log(`❌ Отсутствуют обязательные параметры: lat=${latitude}, lng=${longitude}, start=${start_date}, end=${end_date}`);
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Валидация координат
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      // console.log(`❌ Некорректные координаты: lat=${latitude}, lng=${longitude}`);
      return res.status(400).json({ error: 'Invalid coordinates' });
    }
    
    // Определяем, какой API использовать
    const activityDate = new Date(start_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    
    const activityDateStr = activityDate.toISOString().split('T')[0];
    const threeDaysAgoStr = threeDaysAgo.toISOString().split('T')[0];
    
    const useForecastAPI = activityDateStr >= threeDaysAgoStr;
    
    let apiUrl;
    if (useForecastAPI) {
      // Для последних 3 дней используем прогнозный API
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 1);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 3);
      
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      
      apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&start_date=${startDateStr}&end_date=${endDateStr}&hourly=windspeed_10m,winddirection_10m&windspeed_unit=ms&timezone=auto`;
    } else {
      // Для более старых дат используем архивный API
      apiUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${start_date}&end_date=${end_date}&hourly=windspeed_10m,winddirection_10m&windspeed_unit=ms`;
    }
    
    const response = await axios.get(apiUrl, { timeout: 10000 }); // 10 секунд таймаут
    res.json(response.data);
    
  } catch (error) {
    // console.error('Weather API error:', {
    //   message: error.message,
    //   response: error.response?.data,
    //   status: error.response?.status,
    //   url: error.config?.url
    // });
    res.status(500).json({ 
      error: 'Failed to fetch weather data',
      details: error.response?.data || error.message,
      status: error.response?.status
    });
  }
});

// Эндпоинт для получения прогноза погоды
app.get('/api/weather/forecast', async (req, res) => {
  try {
    const { latitude, longitude } = req.query;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code,uv_index_max&temperature_unit=celsius&wind_speed_unit=ms&precipitation_unit=mm&timezone=auto`;
    
    const response = await axios.get(apiUrl);
    res.json(response.data);
    
  } catch (error) {
    console.error('Weather forecast API error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to fetch weather forecast',
      details: error.response?.data || error.message 
    });
  }
});

// ===== API ЭНДПОИНТЫ ДЛЯ ТРЕНИРОВОЧНЫХ РЕКОМЕНДАЦИЙ =====

// Получение персонализированного плана тренировок
app.get('/api/training-plan', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const plan = await generatePersonalizedPlan(pool, userId);
    res.json(plan);
  } catch (error) {
    console.error('Error generating training plan:', error);
    res.status(500).json({ error: 'Failed to generate training plan' });
  }
});

// Получение профиля пользователя
app.get('/api/user-profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const profile = await getUserProfile(pool, userId);
    
    // Get Strava info and email from users table
    const userResult = await pool.query('SELECT strava_id, email FROM users WHERE id = $1', [userId]);
    const strava_id = userResult.rows[0]?.strava_id || null;
    const email = userResult.rows[0]?.email || null;
    
    // Combine profile data with Strava info and email
    const fullProfile = {
      ...profile,
      strava_id: strava_id,
      email: email
    };
    
    res.json(fullProfile);
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// Обновление профиля пользователя
app.put('/api/user-profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const profileData = req.body;
    
    // Валидация данных
    if (profileData.experience_level && !['beginner', 'intermediate', 'advanced'].includes(profileData.experience_level)) {
      return res.status(400).json({ error: 'Invalid experience level' });
    }
    
    if (profileData.time_available && (profileData.time_available < 1 || profileData.time_available > 10)) {
      return res.status(400).json({ error: 'Time available must be between 1 and 10 hours' });
    }
    
    // Валидация новых полей онбоардинга
    if (profileData.height && (profileData.height < 100 || profileData.height > 250)) {
      return res.status(400).json({ error: 'Height must be between 100 and 250 cm' });
    }
    
    if (profileData.weight && (profileData.weight < 30 || profileData.weight > 200)) {
      return res.status(400).json({ error: 'Weight must be between 30 and 200 kg' });
    }
    
    if (profileData.age && (profileData.age < 10 || profileData.age > 100)) {
      return res.status(400).json({ error: 'Age must be between 10 and 100 years' });
    }
    
    if (profileData.bike_weight && (profileData.bike_weight < 5 || profileData.bike_weight > 25)) {
      return res.status(400).json({ error: 'Bike weight must be between 5 and 25 kg' });
    }
    
    const updatedProfile = await updateUserProfile(pool, userId, profileData);
    
    // Update email in users table if provided
    if (profileData.email !== undefined) {
      await pool.query('UPDATE users SET email = $1 WHERE id = $2', [profileData.email, userId]);
    }
    
    // Get Strava info and email from users table
    const userResult = await pool.query('SELECT strava_id, email FROM users WHERE id = $1', [userId]);
    const strava_id = userResult.rows[0]?.strava_id || null;
    const email = userResult.rows[0]?.email || null;
    
    // Combine profile data with Strava info and email
    const fullProfile = {
      ...updatedProfile,
      strava_id: strava_id,
      email: email
    };
    
    res.json(fullProfile);
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

// Завершение онбоардинга
app.post('/api/user-profile/onboarding', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const onboardingData = req.body;
    
    // Если это только skip (только onboarding_completed), пропускаем валидацию
    if (onboardingData.onboarding_completed && Object.keys(onboardingData).length === 1) {
      const completedProfile = await completeOnboarding(pool, userId, onboardingData);
      res.json(completedProfile);
      return;
    }
    
    // Валидация данных онбоардинга
    if (onboardingData.height && (onboardingData.height < 100 || onboardingData.height > 250)) {
      return res.status(400).json({ error: 'Height must be between 100 and 250 cm' });
    }
    
    if (onboardingData.weight && (onboardingData.weight < 30 || onboardingData.weight > 200)) {
      return res.status(400).json({ error: 'Weight must be between 30 and 200 kg' });
    }
    
    if (onboardingData.age && (onboardingData.age < 10 || onboardingData.age > 100)) {
      return res.status(400).json({ error: 'Age must be between 10 and 100 years' });
    }
    
    if (onboardingData.bike_weight && (onboardingData.bike_weight < 5 || onboardingData.bike_weight > 25)) {
      return res.status(400).json({ error: 'Bike weight must be between 5 and 25 kg' });
    }
    
    if (onboardingData.experience_level && !['beginner', 'intermediate', 'advanced'].includes(onboardingData.experience_level)) {
      return res.status(400).json({ error: 'Invalid experience level' });
    }
    
    if (onboardingData.max_hr && (onboardingData.max_hr < 100 || onboardingData.max_hr > 220)) {
      return res.status(400).json({ error: 'Max HR must be between 100 and 220 bpm' });
    }
    
    if (onboardingData.resting_hr && (onboardingData.resting_hr < 40 || onboardingData.resting_hr > 100)) {
      return res.status(400).json({ error: 'Resting HR must be between 40 and 100 bpm' });
    }
    
    if (onboardingData.lactate_threshold && (onboardingData.lactate_threshold < 120 || onboardingData.lactate_threshold > 200)) {
      return res.status(400).json({ error: 'Lactate Threshold must be between 120 and 200 bpm' });
    }
    
    const completedProfile = await completeOnboarding(pool, userId, onboardingData);
    
    // Get Strava info from users table
    const userResult = await pool.query('SELECT strava_id FROM users WHERE id = $1', [userId]);
    const strava_id = userResult.rows[0]?.strava_id || null;
    
    // Combine profile data with Strava info
    const fullProfile = {
      ...completedProfile,
      strava_id: strava_id
    };
    
    res.json(fullProfile);
  } catch (error) {
    console.error('❌ Error completing onboarding:', error);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

// Обновление email для пользователей Strava
app.post('/api/user-profile/email', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { email } = req.body;
    
    // Валидация email
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email address is required' });
    }
    
    // Проверяем, не используется ли уже этот email другим пользователем
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, userId]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'This email is already used by another account' });
    }
    
    // Обновляем email в таблице users
    await pool.query('UPDATE users SET email = $1 WHERE id = $2', [email, userId]);
    
    // Генерируем новый JWT с обновленным email
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    
    const newToken = jwt.sign(
      { userId: user.id, email: user.email, strava_id: user.strava_id, name: user.name, avatar: user.avatar },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({ 
      success: true, 
      message: 'Email updated successfully',
      token: newToken
    });
  } catch (error) {
    console.error('❌ Error updating email:', error);
    res.status(500).json({ error: 'Failed to update email' });
  }
});

// Получение рекомендаций для конкретной цели
app.get('/api/goals/:goalId/recommendations', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const goalId = parseInt(req.params.goalId);
    
    if (isNaN(goalId)) {
      return res.status(400).json({ error: 'Invalid goal ID' });
    }
    
    const recommendations = await getGoalSpecificRecommendations(pool, userId, goalId);
    res.json(recommendations);
  } catch (error) {
    console.error('Error getting goal recommendations:', error);
    if (error.message === 'Goal not found') {
      res.status(404).json({ error: 'Goal not found' });
    } else {
      res.status(500).json({ error: 'Failed to get goal recommendations' });
    }
  }
});

// Получение информации о типе тренировки
app.get('/api/training-types/:type', authMiddleware, async (req, res) => {
  try {
    const trainingType = req.params.type;
    const details = getTrainingTypeDetails(trainingType);
    
    if (!details) {
      return res.status(404).json({ error: 'Training type not found' });
    }
    
    res.json(details);
  } catch (error) {
    console.error('Error getting training type details:', error);
    res.status(500).json({ error: 'Failed to get training type details' });
  }
});

// Получение всех доступных типов тренировок
app.get('/api/training-types', authMiddleware, async (req, res) => {
  try {
    const trainingTypes = getAllTrainingTypes();
    res.json(trainingTypes);
  } catch (error) {
    console.error('Error getting training types:', error);
    res.status(500).json({ error: 'Failed to get training types' });
  }
});

// Получение статистики выполнения планов
app.get('/api/training-plan/stats', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const stats = await getPlanExecutionStats(pool, userId);
    res.json(stats);
  } catch (error) {
    console.error('Error getting plan execution stats:', error);
    res.status(500).json({ error: 'Failed to get plan execution stats' });
  }
});

// Сохранение кастомной тренировки
app.post('/api/training-plan/custom', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { dayKey, training } = req.body;
    
    if (!dayKey || !training) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const result = await saveCustomTrainingPlan(pool, userId, dayKey, training);
    res.json(result);
  } catch (error) {
    console.error('Error saving custom training:', error);
    res.status(500).json({ error: 'Failed to save custom training' });
  }
});

// Удаление кастомной тренировки
app.delete('/api/training-plan/custom/:dayKey', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { dayKey } = req.params;
    
    const result = await deleteCustomTraining(pool, userId, dayKey);
    res.json(result);
  } catch (error) {
    console.error('Error deleting custom training:', error);
    res.status(500).json({ error: 'Failed to delete custom training' });
  }
});



// Периодическая очистка кэша AI анализа (каждые 24 часа)
setInterval(async () => {
  try {
    await cleanupOldCache(pool);
  } catch (error) {
    console.error('Ошибка при очистке кэша AI анализа:', error);
  }
}, 24 * 60 * 60 * 1000); // 24 часа

// Эндпоинт для получения статистики кэша AI анализа
app.get('/api/ai-cache-stats', async (req, res) => {
  try {
    const stats = await getCacheStats(pool);
    res.json({ stats });
  } catch (error) {
    console.error('Ошибка при получении статистики кэша:', error);
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
});

// ===============================
// EVENTS MANAGEMENT ENDPOINTS
// ===============================

// GET /api/events - Получить все события пользователя
app.get('/api/events', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await pool.query(
      'SELECT * FROM events WHERE user_id = $1 ORDER BY start_date ASC',
      [userId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// POST /api/events - Создать новое событие
app.post('/api/events', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { title, description, link, start_date, background_color } = req.body;
    
    // Валидация
    if (!title || !start_date) {
      return res.status(400).json({ error: 'Title and start_date are required' });
    }
    
    // Проверяем цвет (должен быть hex формата)
    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    if (background_color && !colorRegex.test(background_color)) {
      return res.status(400).json({ error: 'Invalid background_color format' });
    }
    
    const result = await pool.query(
      'INSERT INTO events (user_id, title, description, link, start_date, background_color) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [userId, title, description || null, link || null, start_date, background_color || '#274DD3']
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// PUT /api/events/:id - Обновить событие
app.put('/api/events/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const eventId = req.params.id;
    const { title, description, link, start_date, background_color } = req.body;
    
    // Проверяем что событие принадлежит пользователю
    const existingEvent = await pool.query(
      'SELECT * FROM events WHERE id = $1 AND user_id = $2',
      [eventId, userId]
    );
    
    if (existingEvent.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Валидация
    if (!title || !start_date) {
      return res.status(400).json({ error: 'Title and start_date are required' });
    }
    
    // Проверяем цвет
    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    if (background_color && !colorRegex.test(background_color)) {
      return res.status(400).json({ error: 'Invalid background_color format' });
    }
    
    const result = await pool.query(
      'UPDATE events SET title = $1, description = $2, link = $3, start_date = $4, background_color = $5, updated_at = NOW() WHERE id = $6 AND user_id = $7 RETURNING *',
      [title, description || null, link || null, start_date, background_color || '#274DD3', eventId, userId]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// DELETE /api/events/:id - Удалить событие
app.delete('/api/events/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const eventId = req.params.id;
    
    const result = await pool.query(
      'DELETE FROM events WHERE id = $1 AND user_id = $2 RETURNING *',
      [eventId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    res.json({ message: 'Event deleted successfully', event: result.rows[0] });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// --- ADMIN USERS MANAGEMENT ---

// Получение списка всех пользователей (только для админа)
app.get('/api/admin/users', authMiddleware, async (req, res) => {
  try {
    const users = await pool.query(`
      SELECT 
        u.id,
        u.email,
        u.email_verified,
        u.strava_id,
        u.strava_access_token IS NOT NULL as has_strava_token,
        u.created_at,
        p.experience_level,
        (SELECT COUNT(*) FROM rides r WHERE r.user_id = u.id) as rides_count,
        (SELECT COUNT(*) FROM goals g WHERE g.user_id = u.id) as goals_count,
        (SELECT COUNT(*) FROM events e WHERE e.user_id = u.id) as events_count
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      ORDER BY u.created_at DESC
    `);
    
    res.json({ users: users.rows });
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Unlink Strava для конкретного пользователя (только для админа)
app.post('/api/admin/users/:userId/unlink-strava', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    
    await pool.query(`
      UPDATE users 
      SET 
        strava_access_token = NULL,
        strava_refresh_token = NULL,
        strava_expires_at = NULL,
        strava_id = NULL
      WHERE id = $1
    `, [userId]);
    
    res.json({ success: true, message: 'Strava отключен от пользователя' });
  } catch (error) {
    console.error('Error unlinking Strava:', error);
    res.status(500).json({ error: 'Failed to unlink Strava' });
  }
});

// Удаление пользователя со всеми связанными данными (только для админа)
app.delete('/api/admin/users/:userId', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { userId } = req.params;
    
    await client.query('BEGIN');
    
    // Удаляем связанные данные в правильном порядке
    const deleteQueries = [
      'DELETE FROM custom_training_plans WHERE user_id = $1',
      'DELETE FROM generated_weekly_plans WHERE user_id = $1',
      'DELETE FROM checklist WHERE user_id = $1',
      'DELETE FROM ai_analysis_cache WHERE user_id = $1',
      'DELETE FROM rides WHERE user_id = $1',
      'DELETE FROM goals WHERE user_id = $1',
      'DELETE FROM events WHERE user_id = $1',
      'DELETE FROM user_images WHERE user_id = $1',
      'DELETE FROM user_profiles WHERE user_id = $1',
      'DELETE FROM users WHERE id = $1'
    ];
    
    let deletedRecords = {};
    
    for (const query of deleteQueries) {
      const result = await client.query(query, [userId]);
      const tableName = query.split('FROM ')[1].split(' WHERE')[0];
      deletedRecords[tableName] = result.rowCount;
    }
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: 'Пользователь удален',
      deletedRecords 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  } finally {
    client.release();
  }
});

// SPA fallback — для всех остальных маршрутов отдаём index.html
app.get('*', (req, res) => {
  // Пропускаем API запросы
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  // Пропускаем /link_strava (должен обрабатываться выше)
  if (req.path === '/link_strava') {
    return res.status(404).send('Strava callback not properly handled');
  }
  
  // Пропускаем запросы к статическим файлам
  if (req.path.includes('.') && !req.path.endsWith('.html')) {
    return res.status(404).send('File not found');
  }
  
  // Для всех остальных запросов возвращаем index.html
  res.sendFile(path.join(__dirname, '../react-spa/dist/index.html'));
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

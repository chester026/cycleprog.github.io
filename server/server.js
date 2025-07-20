require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const app = express();
app.use(express.json());
const PORT = 8080;

const CLIENT_ID = '165560';
const CLIENT_SECRET = 'eb3045c2a8ff4b1d2157e26ec14be58aa6fe995f';
let access_token = '';
let refresh_token = '';
let expires_at = 0;

const RIDES_FILE = path.join(__dirname, '../public/rides.json');
const TOKENS_FILE = path.join(__dirname, 'strava_tokens.json');
const PLANNED_RIDES_FILE = path.join(__dirname, '../public/manual_rides.json');
const GARAGE_DIR = path.join(__dirname, '../react-spa/src/assets/img/garage');
const GARAGE_META = path.join(GARAGE_DIR, 'garage_images.json');
const HERO_DIR = path.join(__dirname, '../react-spa/src/assets/img/hero');
const HERO_META = path.join(HERO_DIR, 'hero_images.json');
const { analyzeTraining } = require('./aiAnalysis');
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

// Раздача статики фронта
app.use(express.static(path.join(__dirname, '../react-spa/dist')));

// Загрузка токенов из файла при старте
function loadTokens() {
  if (fs.existsSync(TOKENS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
      access_token = data.access_token || '';
      refresh_token = data.refresh_token || '';
      expires_at = data.expires_at || 0;
    } catch (e) { console.error('Ошибка чтения токенов:', e); }
  }
}

// Сохранение токенов в файл
function saveTokens() {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify({ access_token, refresh_token, expires_at }, null, 2));
}

// Загрузка токенов при старте
loadTokens();

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
      headers: { Authorization: `Bearer ${access_token}` }
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
    // Получаем все активности с пагинацией
    let allActivities = [];
    let page = 1;
    const per_page = 200;
    while (true) {
      const response = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
        headers: { Authorization: `Bearer ${access_token}` },
        params: { per_page, page }
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
    console.error(err.response?.data || err);
    if (err.response && err.response.data) {
      const status = err.response.status || 500;
      res.status(status).json({ error: true, message: err.response.data.message || err.response.data || 'Failed to fetch activities' });
    } else {
      res.status(500).json({ error: true, message: err.message || 'Failed to fetch activities' });
    }
  }
});

// Новый эндпоинт для получения streams (временных рядов) по id активности
app.get('/activities/:id/streams', async (req, res) => {
  try {
    const { id } = req.params;
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
  res.json({ success: true, imported });
});

// Удалить все ручные заезды
app.delete('/api/rides/all', (req, res) => {
  fs.writeFile(PLANNED_RIDES_FILE, '[]', err => {
    if (err) return res.status(500).send('Ошибка очистки');
    res.json({ ok: true });
  });
});

// Эндпоинт для проверки наличия access_token
app.get('/strava-auth-status', (req, res) => {
  res.json({ hasToken: !!access_token });
});

// Сохранить новый порядок ручных заездов
app.post('/api/rides/reorder', (req, res) => {
  fs.writeFile(PLANNED_RIDES_FILE, JSON.stringify(req.body, null, 2), err => {
    if (err) return res.status(500).send('Ошибка записи');
    res.json({ ok: true });
  });
});

// --- Автоматическая загрузка данных при запуске, если токены есть ---
async function autoFetchActivities() {
  if (!access_token) return;
  const now = Math.floor(Date.now() / 1000);
  if (now >= expires_at) {
    try {
      const refresh = await axios.post('https://www.strava.com/oauth/token', {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refresh_token
      });
      access_token = refresh.data.access_token;
      refresh_token = refresh.data.refresh_token;
      expires_at = refresh.data.expires_at;
      saveTokens();
    } catch (e) {
      console.error('Ошибка обновления токена:', e.response?.data || e);
      return;
    }
  }
  try {
    let allActivities = [];
    let page = 1;
    const per_page = 200;
    while (true) {
      const response = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
        headers: { Authorization: `Bearer ${access_token}` },
        params: { per_page, page }
      });
      const activities = response.data;
      if (!activities.length) break;
      allActivities = allActivities.concat(activities);
      if (activities.length < per_page) break;
      page++;
    }
    fs.writeFileSync(RIDES_FILE, JSON.stringify(allActivities, null, 2));
    console.log('Strava activities загружены автоматически при запуске.');
  } catch (e) {
    console.error('Ошибка автозагрузки Strava activities:', e.response?.data || e);
  }
}

// --- При запуске ---
if (access_token) {
  autoFetchActivities();
} else {
  console.log('Для интеграции со Strava перейдите по ссылке:');
  console.log(`https://www.strava.com/oauth/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=http://localhost:${PORT}/exchange_token&approval_prompt=force&scope=activity:read_all`);
}

// Multer configuration
if (!fs.existsSync(GARAGE_DIR)) fs.mkdirSync(GARAGE_DIR, { recursive: true });
if (!fs.existsSync(HERO_DIR)) fs.mkdirSync(HERO_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Определяем директорию в зависимости от URL
    if (req.path.includes('/hero/')) {
      cb(null, HERO_DIR);
    } else {
      cb(null, GARAGE_DIR);
    }
  },
  filename: (req, file, cb) => {
    // Оставляем оригинальное имя, но избегаем коллизий
    let name = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    let final = name;
    let i = 1;
    const dir = req.path.includes('/hero/') ? HERO_DIR : GARAGE_DIR;
    while (fs.existsSync(path.join(dir, final))) {
      final = `${i++}_${name}`;
    }
    cb(null, final);
  }
});
const upload = multer({ storage });

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

// Получить соответствие позиций и файлов
app.get('/api/garage/positions', (req, res) => {
  res.json(loadGarageMeta());
});

// Получить соответствие позиций и файлов hero
app.get('/api/hero/positions', (req, res) => {
  res.json(loadHeroMeta());
});

// Загрузить новое изображение с позицией
app.post('/api/garage/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).send('Нет файла');
  const pos = req.body.pos;
  if (!['right','left-top','left-bottom'].includes(pos)) return res.status(400).send('Некорректная позиция');
  let meta = loadGarageMeta();
  // Если на этой позиции уже есть файл — удалить старый файл
  if (meta[pos] && meta[pos] !== req.file.filename) {
    const oldFile = path.join(GARAGE_DIR, meta[pos]);
    if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
  }
  meta[pos] = req.file.filename;
  saveGarageMeta(meta);
  res.json({ filename: req.file.filename, pos });
});

// Загрузить новое hero изображение с позицией
app.post('/api/hero/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).send('Нет файла');
  const pos = req.body.pos;
  if (!['garage','plan','trainings','checklist','nutrition'].includes(pos)) return res.status(400).send('Некорректная позиция');
  
  // Создаем директорию если не существует
  if (!fs.existsSync(HERO_DIR)) fs.mkdirSync(HERO_DIR, { recursive: true });
  
  let meta = loadHeroMeta();
  // Если на этой позиции уже есть файл — удалить старый файл
  if (meta[pos] && meta[pos] !== req.file.filename) {
    const oldFile = path.join(HERO_DIR, meta[pos]);
    if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
  }
  meta[pos] = req.file.filename;
  saveHeroMeta(meta);
  res.json({ filename: req.file.filename, pos });
});

// Назначить изображение во все hero позиции
app.post('/api/hero/assign-all', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).send('Нет файла');
  
  // Создаем директорию если не существует
  if (!fs.existsSync(HERO_DIR)) fs.mkdirSync(HERO_DIR, { recursive: true });
  
  let meta = loadHeroMeta();
  const positions = ['garage', 'plan', 'trainings', 'checklist', 'nutrition'];
  
  // Удаляем старые файлы, которые больше не используются
  const oldFiles = new Set(Object.values(meta).filter(name => name !== null));
  const newFiles = new Set([req.file.filename]);
  const filesToDelete = Array.from(oldFiles).filter(name => !newFiles.has(name));
  
  filesToDelete.forEach(filename => {
    const filePath = path.join(HERO_DIR, filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log('Deleted old hero file:', filename);
      } catch (err) {
        console.error('Error deleting old file:', err);
      }
    }
  });
  
  // Назначаем новый файл во все позиции
  positions.forEach(pos => {
    meta[pos] = req.file.filename;
  });
  
  saveHeroMeta(meta);
  res.json({ 
    filename: req.file.filename, 
    positions: positions,
    deletedFiles: filesToDelete.length
  });
});

// Удалить изображение и из meta
app.delete('/api/garage/images/:name', (req, res) => {
  const file = path.join(GARAGE_DIR, req.params.name);
  if (!file.startsWith(GARAGE_DIR)) return res.status(400).send('Некорректное имя');
  let meta = loadGarageMeta();
  // Удаляем из meta
  for (const k of Object.keys(meta)) {
    if (meta[k] === req.params.name) meta[k] = null;
  }
  saveGarageMeta(meta);
  fs.unlink(file, err => {
    if (err) return res.status(404).send('Не найдено');
    res.json({ ok: true });
  });
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

// Удалить hero изображение из конкретной позиции
app.delete('/api/hero/positions/:position', (req, res) => {
  const position = req.params.position;
  const positions = ['garage', 'plan', 'trainings', 'checklist', 'nutrition'];
  if (!positions.includes(position)) {
    return res.status(400).send('Некорректная позиция');
  }
  
  let meta = loadHeroMeta();
  const filename = meta[position];
  
  if (!filename) {
    return res.status(404).send('Позиция пуста');
  }
  
  // Проверяем, используется ли файл в других позициях
  const usedInOtherPositions = Object.keys(meta).filter(k => 
    k !== position && meta[k] === filename
  );
  
  // Удаляем только из указанной позиции
  meta[position] = null;
  saveHeroMeta(meta);
  
  // Удаляем файл только если он больше нигде не используется
  if (usedInOtherPositions.length === 0) {
    const file = path.join(HERO_DIR, filename);
    fs.unlink(file, err => {
      if (err) {
        console.error('Error deleting file:', err);
        res.json({ ok: true, message: 'Позиция очищена, но файл не найден' });
      } else {
        res.json({ ok: true, message: 'Файл удален' });
      }
    });
  } else {
    res.json({ 
      ok: true, 
      message: `Позиция очищена. Файл остается в: ${usedInOtherPositions.join(', ')}` 
    });
  }
});

// Получить токены Strava
app.get('/api/strava/tokens', (req, res) => {
  try {
    const tokens = {
      access_token: access_token || '',
      refresh_token: refresh_token || '',
      expires_at: expires_at || 0
    };
    res.json(tokens);
  } catch (err) {
    console.error('Error getting tokens:', err);
    res.status(500).json({ error: true, message: 'Failed to get tokens' });
  }
});

// Обновить токены Strava
app.post('/api/strava/tokens', (req, res) => {
  try {
    const { access_token: newAccessToken, refresh_token: newRefreshToken, expires_at: newExpiresAt } = req.body;
    
    if (!newAccessToken || !newRefreshToken) {
      return res.status(400).json({ error: true, message: 'Access token and refresh token are required' });
    }
    
    // Обновляем глобальные переменные
    access_token = newAccessToken;
    refresh_token = newRefreshToken;
    expires_at = parseInt(newExpiresAt) || 0;
    
    // Сохраняем в файл
    saveTokens();
    
    console.log('Strava tokens updated successfully');
    res.json({ success: true, message: 'Tokens updated successfully' });
  } catch (err) {
    console.error('Error updating tokens:', err);
    res.status(500).json({ error: true, message: 'Failed to update tokens' });
  }
});

// Новый эндпоинт для получения лимитов Strava
app.get('/api/strava/limits', (req, res) => {
  res.json(stravaRateLimits);
});

// Принудительно обновить лимиты Strava
app.post('/api/strava/limits/refresh', async (req, res) => {
  try {
    if (!access_token) {
      return res.status(400).json({ error: true, message: 'Нет access token' });
    }

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
      saveTokens();
    }

    // Делаем тестовый запрос для получения лимитов
    const response = await axios.get('https://www.strava.com/api/v3/athlete', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    
    // Обновляем лимиты из заголовков
    updateStravaLimits(response.headers);
    
    res.json({ 
      success: true, 
      message: 'Лимиты обновлены',
      limits: stravaRateLimits 
    });
  } catch (err) {
    console.error('Error refreshing Strava limits:', err);
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
      // Если нет кэша — пробуем загрузить сейчас
      try {
        const user = await getUserStravaToken(userId);
        if (user) {
          // (Можно вынести в функцию, но для простоты — повтор)
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
          // Получаем все активности с пагинацией
          let allActivities = [];
          let page = 1;
          const per_page = 200;
          while (true) {
            const response = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
              headers: { Authorization: `Bearer ${access_token}` },
              params: { per_page, page }
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
    // Количество длинных поездок (>60км или >2.5ч)
    const longRidesCount = filtered.filter(a => (a.distance || 0) > 60000 || (a.moving_time || 0) > 2.5 * 3600).length;
    // Количество интервальных тренировок (по названию/type)
    const intervalsCount = filtered.filter(a => (a.name || '').toLowerCase().includes('интервал') || (a.name || '').toLowerCase().includes('interval') || (a.type && a.type.toLowerCase().includes('interval'))).length;
    // Прогресс по плану (примерные значения)
    const plan = { rides: 12, km: 400, long: 4, intervals: 8 };
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
    function estimateVO2max(acts) {
      if (!acts.length) return null;
      const bestSpeed = Math.max(...acts.map(a => (a.average_speed || 0) * 3.6));
      const avgHR = acts.reduce((sum, a) => sum + (a.average_heartrate || 0), 0) / acts.filter(a => a.average_heartrate).length;
      const intervals = acts.filter(a => (a.name || '').toLowerCase().includes('интервал') || (a.name || '').toLowerCase().includes('interval') || (a.type && a.type.toLowerCase().includes('interval')));
      let baseVO2max = (bestSpeed * 1.2) + (avgHR * 0.05);
      let intensityBonus = 0;
      if (intervals.length >= 6) intensityBonus = 4;
      else if (intervals.length >= 3) intensityBonus = 2;
      else if (intervals.length >= 1) intensityBonus = 1;
      return Math.round(baseVO2max + intensityBonus);
    }
    function estimateFTP(acts) { return null; }
    const vo2max = estimateVO2max(filtered);
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
        progress,
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

// === Анализ отдельной активности: тип и рекомендации ===
app.get('/api/analytics/activity/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Собираем все активности (Strava + ручные)
    let activities = [];
    if (activitiesCache && Array.isArray(activitiesCache)) {
      activities = activities.concat(activitiesCache);
    } else if (fs.existsSync(RIDES_FILE)) {
      const stravaData = JSON.parse(fs.readFileSync(RIDES_FILE, 'utf8'));
      activities = activities.concat(stravaData);
    }
    if (fs.existsSync(PLANNED_RIDES_FILE)) {
      const manualData = JSON.parse(fs.readFileSync(PLANNED_RIDES_FILE, 'utf8'));
      activities = activities.concat(manualData);
    }
    // Находим нужную активность
    const activity = activities.find(a => String(a.id) === String(id));
    if (!activity) return res.status(404).json({ error: true, message: 'Activity not found' });

    // Анализ активности (логика с фронта)
    let type = 'Обычная';
    if (activity.distance && activity.distance/1000 > 60) type = 'Длинная';
    else if (activity.average_speed && activity.average_speed*3.6 < 20 && activity.moving_time && activity.moving_time/60 < 60) type = 'Восстановительная';
    else if (activity.total_elevation_gain && activity.total_elevation_gain > 800) type = 'Горная';
    else if ((activity.name||'').toLowerCase().includes('интервал') || (activity.type||'').toLowerCase().includes('interval')) type = 'Интервальная';

    const recommendations = [];
    if (activity.average_speed && activity.average_speed*3.6 < 25) {
      recommendations.push({
        title: 'Средняя скорость ниже 25 км/ч',
        advice: 'Для повышения скорости включайте интервальные тренировки (например, 4×4 мин в Z4-Z5 с отдыхом 4 мин), работайте над техникой педалирования (каденс 90–100), следите за положением тела на велосипеде и аэродинамикой.'
      });
    }
    if (activity.average_heartrate && activity.average_heartrate > 155) {
      recommendations.push({
        title: 'Пульс выше 155 уд/мин',
        advice: 'Это может быть признаком высокой интенсивности или недостаточного восстановления. Проверьте качество сна, уровень стресса, добавьте восстановительные тренировки, следите за гидратацией и питанием.'
      });
    }
    if (activity.total_elevation_gain && activity.total_elevation_gain > 500 && activity.average_speed*3.6 < 18) {
      recommendations.push({
        title: 'Горная тренировка с низкой скоростью',
        advice: 'Для улучшения результатов добавьте силовые тренировки вне велосипеда и интервалы в подъёмы (например, 5×5 мин в Z4).'
      });
    }
    if (!activity.average_heartrate) {
      recommendations.push({
        title: 'Нет данных по пульсу',
        advice: 'Добавьте датчик пульса для более точного контроля интенсивности и восстановления.'
      });
    }
    if (!activity.distance || activity.distance/1000 < 30) {
      recommendations.push({
        title: 'Короткая дистанция',
        advice: 'Для развития выносливости планируйте хотя бы одну длинную поездку (60+ км) в неделю. Постепенно увеличивайте дистанцию, не забывая про питание и гидратацию в пути.'
      });
    }
    if (type === 'Восстановительная') {
      recommendations.push({
        title: 'Восстановительная тренировка',
        advice: 'Отлично! Не забывайте чередовать такие тренировки с интервальными и длинными для прогресса.'
      });
    }
    if (type === 'Интервальная' && activity.average_heartrate && activity.average_heartrate < 140) {
      recommendations.push({
        title: 'Интервальная тренировка с низким пульсом',
        advice: 'Интервалы стоит выполнять с большей интенсивностью (Z4-Z5), чтобы получить максимальный тренировочный эффект.'
      });
    }
    if (!activity.average_cadence) {
      recommendations.push({
        title: 'Нет данных по каденсу',
        advice: 'Использование датчика каденса поможет отслеживать технику педалирования и избегать излишней усталости.'
      });
    }
    if (recommendations.length === 0) {
      recommendations.push({
        title: 'Отличная тренировка!',
        advice: 'Тренировка выполнена отлично! Продолжайте в том же духе и постепенно повышайте нагрузку для дальнейшего прогресса.'
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
    const analysis = await analyzeTraining(summary);
    res.json({ analysis });
  } catch (e) {
    console.error('AI analysis error:', e);
    res.status(500).json({ error: 'AI analysis failed', details: e.message });
  }
});

app.post('/api/register', async (req, res) => {
  console.log('POST /api/register', req.body);
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email, hash]
    );
    res.json({ user: result.rows[0] });
  } catch (e) {
    console.error('Registration error:', e);
    if (e.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: 'Registration failed' });
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
app.use('/api', authMiddleware);

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
  const { checked } = req.body;
  const result = await pool.query(
    'UPDATE checklist SET checked = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
    [checked, id, userId]
  );
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
    console.log('[Strava link] userId from JWT:', userId);
  } catch {
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
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const athlete = athleteRes.data;
    const strava_id = athlete.id;
    const email = athlete.email || null;
    const name = athlete.firstname + (athlete.lastname ? ' ' + athlete.lastname : '');
    const avatar = athlete.profile || null;
    console.log('[Strava link] strava_id:', strava_id, 'name:', name, 'email:', email);

    // 3. Проверяем, не занят ли этот strava_id другим пользователем
    const existing = await pool.query('SELECT id FROM users WHERE strava_id = $1 AND id != $2', [strava_id, userId]);
    if (existing.rows.length > 0) {
      console.log('[Strava link] strava_id already linked to another user:', existing.rows[0].id);
      return res.status(409).send('This Strava account is already linked to another user.');
    }

    // 4. Обновляем текущего пользователя
    const updateRes = await pool.query(
      'UPDATE users SET strava_id = $1, strava_access_token = $2, strava_refresh_token = $3, strava_expires_at = $4, name = $5, email = COALESCE($6, email), avatar = $7 WHERE id = $8',
      [strava_id, access_token, refresh_token, expires_at, name, email, avatar, userId]
    );
    console.log('[Strava link] UPDATE result:', updateRes.rowCount, 'rows updated for userId', userId);

    // 5. Генерируем новый JWT с обновлёнными данными
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email, strava_id: user.strava_id, name: user.name, avatar: user.avatar },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 6. Редиректим на фронт с параметром strava_linked=1 и новым токеном
    const redirectUrl = `/exchange_token?jwt=${encodeURIComponent(jwtToken)}&strava_linked=1&name=${encodeURIComponent(user.name || '')}&avatar=${encodeURIComponent(user.avatar || '')}`;
    res.redirect(redirectUrl);
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

// SPA fallback — для всех остальных маршрутов отдаём index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../react-spa/dist/index.html'));
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

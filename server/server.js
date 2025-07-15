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

app.get('/exchange_token', async (req, res) => {
  const code = req.query.code;
  try {
    const response = await axios.post('https://www.strava.com/oauth/token', {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code'
    });
    access_token = response.data.access_token;
    refresh_token = response.data.refresh_token;
    expires_at = response.data.expires_at;
    saveTokens();
    res.redirect('/trainings');
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).send('Token exchange failed');
  }
});

// --- Кэш для Strava activities ---
let activitiesCache = null;
let activitiesCacheTime = 0;
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

app.get('/activities', async (req, res) => {
  try {
    // Проверяем кэш
    if (activitiesCache && Date.now() - activitiesCacheTime < ACTIVITIES_CACHE_TTL) {
      return res.json(activitiesCache);
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
      // --- Сохраняем лимиты из заголовков ---
      updateStravaLimits(response.headers);
      const activities = response.data;
      if (!activities.length) break;
      allActivities = allActivities.concat(activities);
      if (activities.length < per_page) break;
      page++;
    }
    // Сохраняем в кэш
    activitiesCache = allActivities;
    activitiesCacheTime = Date.now();
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

// Получить все заезды (только ручные)
app.get('/api/rides', (req, res) => {
  fs.readFile(PLANNED_RIDES_FILE, (err, data) => {
    if (err) return res.status(500).send('Ошибка чтения');
    res.json(JSON.parse(data));
  });
});

// Добавить заезд
app.post('/api/rides', (req, res) => {
  fs.readFile(PLANNED_RIDES_FILE, (err, data) => {
    if (err) return res.status(500).send('Ошибка чтения');
    const rides = JSON.parse(data);
    const newRide = { ...req.body, id: uuidv4() };
    rides.push(newRide);
    fs.writeFile(PLANNED_RIDES_FILE, JSON.stringify(rides, null, 2), err => {
      if (err) return res.status(500).send('Ошибка записи');
      res.json(newRide);
    });
  });
});

// Импорт заездов (массовое добавление)
app.post('/api/rides/import', (req, res) => {
  try {
    const ridesToImport = req.body;
    
    if (!Array.isArray(ridesToImport)) {
      return res.status(400).json({ error: true, message: 'Ожидается массив заездов' });
    }
    
    // Читаем существующие заезды
    let existingRides = [];
    if (fs.existsSync(PLANNED_RIDES_FILE)) {
      const data = fs.readFileSync(PLANNED_RIDES_FILE, 'utf8');
      existingRides = JSON.parse(data);
    }
    
    // Добавляем новые заезды с новыми ID
    const importedRides = ridesToImport.map(ride => ({
      ...ride,
      id: uuidv4()
    }));
    
    // Объединяем заезды
    const allRides = [...existingRides, ...importedRides];
    
    // Сохраняем
    fs.writeFileSync(PLANNED_RIDES_FILE, JSON.stringify(allRides, null, 2));
    
    res.json({ 
      success: true, 
      message: `Импортировано ${importedRides.length} заездов`,
      imported: importedRides.length,
      total: allRides.length
    });
  } catch (err) {
    console.error('Error importing rides:', err);
    res.status(500).json({ error: true, message: 'Ошибка импорта заездов' });
  }
});

// Редактировать заезд
app.put('/api/rides/:id', (req, res) => {
  fs.readFile(PLANNED_RIDES_FILE, (err, data) => {
    if (err) return res.status(500).send('Ошибка чтения');
    const rides = JSON.parse(data);
    const idx = rides.findIndex(r => r.id == req.params.id);
    if (idx === -1) return res.status(404).send('Не найдено');
    rides[idx] = { ...rides[idx], ...req.body };
    fs.writeFile(PLANNED_RIDES_FILE, JSON.stringify(rides, null, 2), err => {
      if (err) return res.status(500).send('Ошибка записи');
      res.json(rides[idx]);
    });
  });
});

// Удалить заезд
app.delete('/api/rides/:id', (req, res) => {
  fs.readFile(PLANNED_RIDES_FILE, (err, data) => {
    if (err) return res.status(500).send('Ошибка чтения');
    let rides = JSON.parse(data);
    const idx = rides.findIndex(r => r.id == req.params.id);
    if (idx === -1) return res.status(404).send('Не найдено');
    const removed = rides.splice(idx, 1)[0];
    fs.writeFile(PLANNED_RIDES_FILE, JSON.stringify(rides, null, 2), err => {
      if (err) return res.status(500).send('Ошибка записи');
      res.json(removed);
    });
  });
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
app.get('/api/analytics/summary', async (req, res) => {
  try {
    // Получаем userId, year и period из query (если есть)
    const userId = req.query.userId;
    const filterYear = req.query.year ? parseInt(req.query.year) : null;
    const periodParam = req.query.period || '4w';
    // Получаем все поездки: Strava + ручные
    let activities = [];
    // Strava
    if (activitiesCache && Array.isArray(activitiesCache)) {
      activities = activities.concat(activitiesCache);
    } else if (fs.existsSync(RIDES_FILE)) {
      const stravaData = JSON.parse(fs.readFileSync(RIDES_FILE, 'utf8'));
      activities = activities.concat(stravaData);
    }
    // Ручные
    if (fs.existsSync(PLANNED_RIDES_FILE)) {
      const manualData = JSON.parse(fs.readFileSync(PLANNED_RIDES_FILE, 'utf8'));
      activities = activities.concat(manualData);
    }
    // Фильтрация по userId, если есть
    if (userId) {
      activities = activities.filter(a => !a.userId || a.userId == userId);
    }
    // --- Новое: фильтрация по году ---
    let isAllYears = false;
    if (req.query.year === 'all') {
      isAllYears = true;
      // не фильтруем по году
    } else if (filterYear) {
      activities = activities.filter(a => a.start_date && new Date(a.start_date).getFullYear() === filterYear);
    }
    if (!activities.length) return res.json({ summary: null });

    // --- Новое: фильтрация по period ---
    let filtered = activities;
    const now = new Date();
    let periodStart = null, periodEnd = null;
    if (periodParam === '4w') {
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      filtered = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
      periodStart = fourWeeksAgo;
      periodEnd = now;
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

// SPA fallback — для всех остальных маршрутов отдаём index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../react-spa/dist/index.html'));
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

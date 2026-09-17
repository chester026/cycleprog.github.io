// Weather proxy routes (Open-Meteo), extracted out of server.js (T-4.1).
// Mounted at `/api/weather` in place of the extracted block.
const express = require('express');
const router = express.Router();
const axios = require('../lib/http').externalHttp;
const logger = require('../lib/logger');
const { authMiddleware } = require('../middleware/auth');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const weatherService = require('../services/weather');
patchAsyncRoutes(router);

// Эндпоинт для получения данных о ветре (прокси для Open-Meteo API).
// Fetch + 30min cache now live in services/weather.js (T-3.5) so
// services/power.js's server-side estimation reuses the exact same cached
// lookup instead of calling this endpoint over HTTP for itself.
router.get('/wind', authMiddleware, async (req, res) => {
  try {
    const { latitude, longitude, start_date, end_date } = req.query;

    if (!latitude || !longitude || !start_date || !end_date) {
      return res.status(400).json({ error: 'Missing required parameters', code: 'VALIDATION_ERROR' });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Invalid coordinates', code: 'VALIDATION_ERROR' });
    }

    const data = await weatherService.fetchWind({ latitude: lat, longitude: lng, start_date, end_date });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch weather data', code: 'INTERNAL' });
  }
});

// Эндпоинт для получения прогноза погоды
router.get('/forecast', authMiddleware, async (req, res) => {
  try {
    const { latitude, longitude } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Missing required parameters', code: 'VALIDATION_ERROR' });
    }

    const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code,uv_index_max&temperature_unit=celsius&wind_speed_unit=ms&precipitation_unit=mm&timezone=auto`;

    const cached = weatherService.getWeatherCache(apiUrl);
    if (cached) return res.json(cached);

    const response = await axios.get(apiUrl, { timeout: 8000 });
    weatherService.setWeatherCache(apiUrl, response.data);
    res.json(response.data);

  } catch (error) {
    logger.error({ err: error.message }, 'Weather forecast API error:');
    res.status(500).json({ error: 'Failed to fetch weather forecast', code: 'INTERNAL' });
  }
});

module.exports = router;

// Garage/hero image routes + the Strava image proxy (T-4.1 domain
// extraction from server.js). Mounted at /api with full sub-paths, since
// the domain's paths don't share a single prefix (/proxy, /garage, /hero,
// /imagekit).
const express = require('express');
const router = express.Router();
const logger = require('../lib/logger');
const { pool } = require('../db');
const { authMiddleware, requireAdmin } = require('../middleware/auth');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const { isAllowedImageUrl } = require('../lib/imageProxy');
const axios = require('../lib/http').externalHttp;
// Namespace import (not destructured) so tests can vi.spyOn the service.
const media = require('../services/media');
const {
  upload,
  IMAGE_EXT_BY_MIME,
  FOLDERS,
  uploadToImageKit,
  deleteFromImageKit,
  saveImageMetadata,
  getUserImages,
  deleteImageMetadata
} = require('../services/media');

patchAsyncRoutes(router);

// Прокси для изображений Strava (решает CORS проблему). Intentionally kept
// unauthenticated (used as an <img src>), but hardened against SSRF: only
// https URLs on a small allowlist of known image hosts are fetched, with a
// timeout and a response-size cap.
router.get('/proxy/strava-image', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl || !isAllowedImageUrl(imageUrl)) {
      return res.status(400).json({ error: 'URL parameter is required', code: 'VALIDATION_ERROR' });
    }

    const response = await axios.get(imageUrl, {
      responseType: 'stream',
      timeout: 5000,
      maxContentLength: 5 * 1024 * 1024,
      maxRedirects: 2,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Передаем только content-type от оригинального ответа
    res.setHeader('Content-Type', response.headers['content-type']);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    // Передаем поток данных
    response.data.pipe(res);
  } catch (error) {
    logger.error({ err: error.message }, 'Error proxying image:');
    res.status(500).json({ error: 'Failed to proxy image', code: 'INTERNAL' });
  }
});

// Получить соответствие позиций и файлов (обновлено для многопользовательской архитектуры)
router.get('/garage/positions', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const images = await getUserImages(pool, userId, 'garage');
    res.json(images.garage || {});
  } catch (error) {
    res.status(500).json({ error: 'Failed to load garage images', code: 'INTERNAL' });
  }
});

// Загрузить новое изображение с позицией (ImageKit) - обновлено для многопользовательской архитектуры
router.post('/garage/upload', authMiddleware, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Missing file parameter for upload', code: 'BAD_REQUEST' });
  const pos = req.body.pos;
  if (!['right','left-top','left-bottom'].includes(pos)) return res.status(400).json({ error: 'Некорректная позиция', code: 'VALIDATION_ERROR' });

  try {
    const userId = req.user.userId;

    // Получаем глобальную конфигурацию ImageKit
    const config = media.getImageKitConfig();
    if (!config) {
      return res.status(400).json({ error: 'ImageKit configuration not found', code: 'IMAGEKIT_CONFIG_MISSING' });
    }

    // Получаем текущие изображения пользователя
    const currentImages = await getUserImages(pool, userId, 'garage');
    const currentImage = currentImages.garage?.[pos];

    // Если на этой позиции уже есть файл — удалить старый файл из ImageKit
    if (currentImage && currentImage.fileId) {
      const deleteResult = await deleteFromImageKit(currentImage.fileId, config);
      if (!deleteResult.success) {
        logger.warn('Failed to delete old image:', deleteResult.error);
      }
    }

    // Загружаем файл в ImageKit — имя строится из userId/pos/timestamp и
    // расширения, выведенного из mimetype (никогда из req.file.originalname,
    // которое приходит от клиента и не должно попадать в путь файла).
    const ext = IMAGE_EXT_BY_MIME[req.file.mimetype] || 'jpg';
    const fileName = `${userId}_${pos}_${Date.now()}.${ext}`;
    const uploadResult = await uploadToImageKit(req.file, FOLDERS.GARAGE, fileName, config);

    if (!uploadResult.success) {
      return res.status(500).json({ error: uploadResult.error, code: 'INTERNAL' });
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
      return res.status(500).json({ error: 'Failed to save image metadata', code: 'INTERNAL' });
    }

    res.json({
      filename: uploadResult.name,
      pos,
      url: uploadResult.url,
      fileId: uploadResult.fileId
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to upload image', code: 'INTERNAL' });
  }
});

// Получить hero изображения пользователя
router.get('/hero/images', authMiddleware, async (req, res) => {
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
    logger.error({ err: error }, 'Error getting hero images:');
    res.status(500).json({ error: 'Failed to get hero images', code: 'INTERNAL' });
  }
});

// Загрузить новое hero изображение с позицией (ImageKit)
router.post('/hero/upload', authMiddleware, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided', code: 'BAD_REQUEST' });

    const userId = req.user.userId;
    const pos = req.body.pos;

    if (!['garage','plan','trainings','checklist','nutrition'].includes(pos)) {
      return res.status(400).json({ error: 'Invalid position', code: 'VALIDATION_ERROR' });
    }

    // Получаем глобальную конфигурацию ImageKit
    const config = media.getImageKitConfig();
    if (!config) {
      return res.status(400).json({ error: 'ImageKit configuration not found', code: 'IMAGEKIT_CONFIG_MISSING' });
    }

    // Удаляем старое изображение если есть
    await deleteImageMetadata(pool, userId, 'hero', pos);

    // Загружаем в ImageKit
    const heroExt = IMAGE_EXT_BY_MIME[req.file.mimetype] || 'jpg';
    const uploadResult = await uploadToImageKit(
      req.file,
      `hero/${userId}`,
      `${pos}_${Date.now()}.${heroExt}`,
      config
    );

    if (!uploadResult.success) {
      return res.status(500).json({ error: uploadResult.error, code: 'INTERNAL' });
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
    logger.error({ err: error }, 'Error uploading hero image:');
    res.status(500).json({ error: 'Failed to upload hero image', code: 'INTERNAL' });
  }
});

// Назначить изображение во все hero позиции (ImageKit)
router.post('/hero/assign-all', authMiddleware, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided', code: 'BAD_REQUEST' });

    const userId = req.user.userId;
    const positions = ['garage', 'plan', 'trainings', 'checklist', 'nutrition'];

    // Получаем глобальную конфигурацию ImageKit
    const config = media.getImageKitConfig();
    if (!config) {
      return res.status(400).json({ error: 'ImageKit configuration not found', code: 'IMAGEKIT_CONFIG_MISSING' });
    }

    // Удаляем старые изображения
    for (const pos of positions) {
      await deleteImageMetadata(pool, userId, 'hero', pos);
    }

    // Загружаем в ImageKit
    const allHeroExt = IMAGE_EXT_BY_MIME[req.file.mimetype] || 'jpg';
    const uploadResult = await uploadToImageKit(
      req.file,
      `hero/${userId}`,
      `all_hero_${Date.now()}.${allHeroExt}`,
      config
    );

    if (!uploadResult.success) {
      return res.status(500).json({ error: uploadResult.error, code: 'INTERNAL' });
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
    logger.error({ err: error }, 'Error uploading hero image to all positions:');
    res.status(500).json({ error: 'Failed to upload hero image to all positions', code: 'INTERNAL' });
  }
});

// Удалить изображение и из meta (ImageKit) - обновлено для многопользовательской архитектуры
router.delete('/garage/images/:name', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Получаем глобальную конфигурацию ImageKit
    const config = media.getImageKitConfig();
    if (!config) {
      return res.status(400).json({ error: 'ImageKit configuration not found', code: 'IMAGEKIT_CONFIG_MISSING' });
    }

    // Находим изображение в базе данных
    const result = await pool.query(
      'SELECT * FROM user_images WHERE user_id = $1 AND file_name = $2',
      [userId, req.params.name]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found', code: 'IMAGE_NOT_FOUND' });
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
    res.status(500).json({ error: 'Failed to delete image', code: 'INTERNAL' });
  }
});

// Удалить hero изображение из конкретной позиции (ImageKit)
router.delete('/hero/positions/:position', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const userId = req.user.userId;
    const position = req.params.position;
    const positions = ['garage', 'plan', 'trainings', 'checklist', 'nutrition'];

    if (!positions.includes(position)) {
      return res.status(400).json({ error: 'Invalid position', code: 'VALIDATION_ERROR' });
    }

    // Получаем изображение из базы данных
    const result = await pool.query(
      'SELECT * FROM user_images WHERE user_id = $1 AND image_type = $2 AND position = $3',
      [userId, 'hero', position]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Position is empty', code: 'NOT_FOUND' });
    }

    const image = result.rows[0];

    // Получаем глобальную конфигурацию ImageKit
    const config = media.getImageKitConfig();
    if (!config) {
      return res.status(400).json({ error: 'ImageKit configuration not found', code: 'IMAGEKIT_CONFIG_MISSING' });
    }

    // Удаляем из ImageKit
    if (image.file_id) {
      await deleteFromImageKit(image.file_id, config);
    }

    // Удаляем из базы данных
    await deleteImageMetadata(pool, userId, 'hero', position);

    res.json({ ok: true, message: 'Image deleted successfully' });

  } catch (error) {
    logger.error({ err: error }, 'Error deleting hero image:');
    res.status(500).json({ error: 'Failed to delete hero image', code: 'INTERNAL' });
  }
});

// Получение ImageKit конфигурации (глобальная для всех пользователей)
router.get('/imagekit/config', authMiddleware, async (req, res) => {
  try {
    const config = media.getImageKitConfig();

    if (!config) {
      return res.status(404).json({ error: 'ImageKit configuration not found', code: 'IMAGEKIT_CONFIG_MISSING' });
    }

    // Не возвращаем приватные ключи
    res.json({
      public_key: config.public_key,
      url_endpoint: config.url_endpoint
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get ImageKit configuration', code: 'INTERNAL' });
  }
});

module.exports = router;

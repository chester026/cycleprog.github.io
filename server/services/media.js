// Media (garage/hero image) domain service — filesystem + ImageKit + DB
// helpers used by routes/media.js. Moved verbatim from `imagekit-config.js`
// (T-4.1 domain extraction) plus the multer/dir-setup bits that used to live
// directly in server.js just above the garage/hero routes.
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const ImageKit = require('imagekit');
const config = require('../config');
const logger = require('../lib/logger');

// Local user-uploaded-image directories (legacy filesystem storage,
// pre-ImageKit). Kept in sync with the top-level GARAGE_DIR/HERO_DIR consts
// still declared in server.js (T-4.1: those are left in place, unused, per
// the domain-extraction guide rather than removed).
const GARAGE_DIR = path.join(__dirname, '../../react-spa/src/assets/img/garage');
const HERO_DIR = path.join(__dirname, '../../react-spa/src/assets/img/hero');

if (!fs.existsSync(GARAGE_DIR)) fs.mkdirSync(GARAGE_DIR, { recursive: true });
if (!fs.existsSync(HERO_DIR)) fs.mkdirSync(HERO_DIR, { recursive: true });

// Multer configuration for ImageKit (memory storage) — only real images,
// capped well below the old 25MB so a bad/huge upload can't tie up a
// request or the ImageKit quota.
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024 // 8MB limit
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPEG/PNG/WebP allowed'));
    }
    cb(null, true);
  }
});

// Функция для создания ImageKit экземпляра для конкретного пользователя
const createImageKitInstance = (config) => {
  return new ImageKit({
    publicKey: config.public_key,
    privateKey: config.private_key,
    urlEndpoint: config.url_endpoint
  });
};

// Функция для получения конфигурации ImageKit (глобальная для всех пользователей)
// Regression fixed (T-4.1): T-1.1 replaced process.env with the `config`
// module here while a local `const config` shadowed it → TDZ throw on every
// call, so garage/hero uploads 500'd. Local is now `ik`.
const getImageKitConfig = () => {
  const ik = {
    public_key: config.IMAGEKIT_PUBLIC_KEY,
    private_key: config.IMAGEKIT_PRIVATE_KEY,
    url_endpoint: config.IMAGEKIT_URL_ENDPOINT
  };

  if (!ik.public_key || !ik.private_key || !ik.url_endpoint) {
    return null;
  }

  return ik;
};

// Функция для получения URL изображения с трансформациями
const getImageUrl = (filePath, transformations = {}) => {
  const defaultTransformations = {
    tr: 'q-100,f-webp' // качество 100% и формат WebP
  };

  const finalTransformations = { ...defaultTransformations, ...transformations };

  // Строим строку трансформаций
  const transformString = Object.entries(finalTransformations)
    .map(([key, value]) => `${key}-${value}`)
    .join(',');

  // Если нет трансформаций, возвращаем оригинальный URL
  if (!transformString) {
    return filePath;
  }

  return `${filePath}?tr=${transformString}`;
};

// Функция для загрузки файла в ImageKit
const uploadToImageKit = async (file, folder, fileName, userConfig) => {
  try {
    const imagekit = createImageKitInstance(userConfig);

    const result = await imagekit.upload({
      file: file.buffer,
      fileName: fileName,
      folder: folder,
      useUniqueFileName: false
    });

    return {
      success: true,
      fileId: result.fileId,
      url: result.url,
      filePath: result.filePath,
      name: result.name
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

// Функция для удаления файла из ImageKit
const deleteFromImageKit = async (fileId, userConfig) => {
  try {
    const imagekit = createImageKitInstance(userConfig);
    await imagekit.deleteFile(fileId);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

async function saveImageMetadata(pool, userId, imageType, position, uploadResult, originalFile) {
  try {
    const metadata = {
      userId,
      imageType,
      position,
      imageId: uploadResult.fileId,
      url: uploadResult.url,
      name: uploadResult.name,
      originalName: originalFile.originalname,
      uploadedAt: new Date()
    };

    // Удаляем старую запись для этой позиции и типа
    await pool.query(
      'DELETE FROM user_images WHERE user_id = $1 AND image_type = $2 AND position = $3',
      [userId, imageType, position]
    );

    // Вставляем новую запись
    await pool.query(
      'INSERT INTO user_images (user_id, image_type, position, file_id, file_url, file_path, file_name, original_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [userId, imageType, position, metadata.imageId, metadata.url, metadata.url, metadata.name, metadata.originalName]
    );

    return { success: true, metadata };
  } catch (error) {
    logger.error({ err: error }, 'Error saving metadata:');
    return { success: false, error: error.message };
  }
}

// Функция для получения изображений пользователя из базы данных
const getUserImages = async (pool, userId, imageType = null) => {
  try {
    let query = 'SELECT * FROM user_images WHERE user_id = $1';
    let params = [userId];

    if (imageType) {
      query += ' AND image_type = $2';
      params.push(imageType);
    }

    query += ' ORDER BY image_type, position';

    const result = await pool.query(query, params);

    // Преобразуем в формат, совместимый с существующим кодом
    const images = {};
    result.rows.forEach(row => {
      if (!images[row.image_type]) {
        images[row.image_type] = {};
      }

      images[row.image_type][row.position] = {
        fileId: row.file_id,
        url: row.file_url,
        filePath: row.file_path,
        name: row.file_name,
        originalName: row.original_name
      };
    });

    return images;
  } catch (error) {
    logger.error({ err: error }, 'Error getting user images:');
    return {};
  }
};

// Функция для удаления изображения из базы данных
const deleteImageMetadata = async (pool, userId, imageType, position) => {
  try {
    await pool.query(
      'DELETE FROM user_images WHERE user_id = $1 AND image_type = $2 AND position = $3',
      [userId, imageType, position]
    );

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

// Папки для разных типов изображений
const FOLDERS = {
  GARAGE: '/garage',
  HERO: '/hero',
  GENERAL: '/general'
};

module.exports = {
  GARAGE_DIR,
  HERO_DIR,
  ALLOWED_IMAGE_MIME_TYPES,
  IMAGE_EXT_BY_MIME,
  upload,
  createImageKitInstance,
  getImageKitConfig,
  getImageUrl,
  uploadToImageKit,
  deleteFromImageKit,
  saveImageMetadata,
  getUserImages,
  deleteImageMetadata,
  FOLDERS
};

const ImageKit = require('imagekit');

// Функция для создания ImageKit экземпляра для конкретного пользователя
const createImageKitInstance = (config) => {
  return new ImageKit({
    publicKey: config.public_key,
    privateKey: config.private_key,
    urlEndpoint: config.url_endpoint
  });
};

// Функция для получения конфигурации ImageKit (глобальная для всех пользователей)
const getImageKitConfig = () => {
  const config = {
    public_key: process.env.IMAGEKIT_PUBLIC_KEY,
    private_key: process.env.IMAGEKIT_PRIVATE_KEY,
    url_endpoint: process.env.IMAGEKIT_URL_ENDPOINT
  };
  
  if (!config.public_key || !config.private_key || !config.url_endpoint) {
    return null;
  }
  
  return config;
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
    console.error('Error saving metadata:', error);
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
    console.error('Error getting user images:', error);
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
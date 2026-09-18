// SQL for garage/hero image metadata (T-4.2, S-28: "no pool.query in
// routes/" DoD leftover from T-4.1). Backs services/media.js and
// routes/media.js — see those for the multer/ImageKit/business-logic side.
//
// Every function takes an optional trailing `db` (defaulting to the shared
// pool) so callers that need atomicity (services/media.js's
// saveImageMetadata / assignHeroImageToAllPositions) can pass a
// withTransaction client instead.
const { pool } = require('../db');

async function findImageByName(userId, fileName, db = pool) {
  const result = await db.query(
    'SELECT * FROM user_images WHERE user_id = $1 AND file_name = $2',
    [userId, fileName]
  );
  return result.rows[0] || null;
}

async function findImageByPosition(userId, imageType, position, db = pool) {
  const result = await db.query(
    'SELECT * FROM user_images WHERE user_id = $1 AND image_type = $2 AND position = $3',
    [userId, imageType, position]
  );
  return result.rows[0] || null;
}

async function getUserImages(userId, imageType = null, db = pool) {
  let query = 'SELECT * FROM user_images WHERE user_id = $1';
  const params = [userId];

  if (imageType) {
    query += ' AND image_type = $2';
    params.push(imageType);
  }

  query += ' ORDER BY image_type, position';

  const result = await db.query(query, params);
  return result.rows;
}

async function deleteImage(userId, imageType, position, db = pool) {
  const result = await db.query(
    'DELETE FROM user_images WHERE user_id = $1 AND image_type = $2 AND position = $3',
    [userId, imageType, position]
  );
  return result.rowCount;
}

async function insertImage(userId, imageType, position, metadata, db = pool) {
  await db.query(
    'INSERT INTO user_images (user_id, image_type, position, file_id, file_url, file_path, file_name, original_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [userId, imageType, position, metadata.imageId, metadata.url, metadata.url, metadata.name, metadata.originalName]
  );
}

// Batched equivalent of deleteImage() for N positions at once (hero/
// assign-all) — one round-trip instead of one DELETE per position.
async function deleteImagesForPositions(userId, imageType, positions, db = pool) {
  await db.query(
    'DELETE FROM user_images WHERE user_id = $1 AND image_type = $2 AND position = ANY($3::text[])',
    [userId, imageType, positions]
  );
}

// Batched equivalent of insertImage() for N positions sharing the same
// uploaded file (hero/assign-all: one file assigned to every hero slot) —
// one round-trip instead of one INSERT per position.
async function insertImagesForPositions(userId, imageType, positions, metadata, db = pool) {
  await db.query(
    `INSERT INTO user_images (user_id, image_type, position, file_id, file_url, file_path, file_name, original_name)
     SELECT $1, $2, p, $4, $5, $5, $6, $7 FROM UNNEST($3::text[]) AS p`,
    [userId, imageType, positions, metadata.imageId, metadata.url, metadata.name, metadata.originalName]
  );
}

module.exports = {
  findImageByName,
  findImageByPosition,
  getUserImages,
  deleteImage,
  insertImage,
  deleteImagesForPositions,
  insertImagesForPositions,
};

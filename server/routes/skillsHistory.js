const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

// Проверяем нужен ли SSL (используем ту же логику что и в server.js)
const isProduction = process.env.PGSSLMODE === 'require' || process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

// Middleware для аутентификации
const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }

  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Используем decoded.userId (как в других endpoint'ах) или decoded.id
    req.userId = decoded.userId || decoded.id;
    
    // Проверяем, что пользователь запрашивает свои данные
    const requestedUserId = req.query.user_id || req.body.user_id;
    
    if (requestedUserId && parseInt(requestedUserId) !== req.userId) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    }
    
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token', code: 'UNAUTHORIZED' });
  }
};

// GET /api/skills-history/last
// Получить последний сохраненный снимок навыков
router.get('/last', authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;

    const result = await pool.query(
      `SELECT * FROM skills_history 
       WHERE user_id = $1 
       ORDER BY snapshot_date DESC 
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'No snapshots found', 
        code: 'NOT_FOUND' 
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching last snapshot:', err);
    res.status(500).json({ 
      error: 'Server error', 
      code: 'SERVER_ERROR' 
    });
  }
});

// GET /api/skills-history/compare
// Получить снимок на определенную дату (или ближайший к ней)
router.get('/compare', authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ 
        error: 'Date parameter is required', 
        code: 'VALIDATION_ERROR' 
      });
    }

    // Проверка формата даты
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ 
        error: 'Invalid date format. Use YYYY-MM-DD', 
        code: 'VALIDATION_ERROR' 
      });
    }

    const result = await pool.query(
      `SELECT * FROM skills_history 
       WHERE user_id = $1 
         AND snapshot_date <= $2
       ORDER BY snapshot_date DESC 
       LIMIT 1`,
      [userId, date]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'No snapshots found for the given date', 
        code: 'NOT_FOUND' 
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching comparison snapshot:', err);
    res.status(500).json({ 
      error: 'Server error', 
      code: 'SERVER_ERROR' 
    });
  }
});

// POST /api/skills-history
// Сохранить новый снимок навыков
// Логика: храним только 2 последних снепшота на юзера (текущий + предыдущий для сравнения)
router.post('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    const { climbing, sprint, endurance, tempo, power, consistency, last_activity_id } = req.body;

    // Валидация
    const skills = { climbing, sprint, endurance, tempo, power, consistency };
    
    for (const [key, value] of Object.entries(skills)) {
      if (value === undefined || value === null) {
        return res.status(400).json({ 
          error: `Missing required field: ${key}`, 
          code: 'VALIDATION_ERROR' 
        });
      }
      
      if (typeof value !== 'number' || value < 0 || value > 100) {
        return res.status(400).json({ 
          error: `Invalid value for ${key}. Must be a number between 0 and 100`, 
          code: 'VALIDATION_ERROR' 
        });
      }
    }

    // 1. Вставляем новый снепшот (при конфликте по дате — обновляем существующий)
    const insertResult = await pool.query(
      `INSERT INTO skills_history 
        (user_id, snapshot_date, climbing, sprint, endurance, tempo, power, consistency, last_activity_id)
       VALUES 
        ($1, NOW(), $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, snapshot_date) DO UPDATE SET
        climbing = EXCLUDED.climbing,
        sprint = EXCLUDED.sprint,
        endurance = EXCLUDED.endurance,
        tempo = EXCLUDED.tempo,
        power = EXCLUDED.power,
        consistency = EXCLUDED.consistency,
        last_activity_id = EXCLUDED.last_activity_id,
        created_at = NOW()
       RETURNING id, snapshot_date, created_at`,
      [userId, climbing, sprint, endurance, tempo, power, consistency, last_activity_id]
    );

    // 2. Удаляем старые снепшоты, оставляя только 2 последних
    await pool.query(
      `DELETE FROM skills_history
       WHERE user_id = $1
         AND id NOT IN (
           SELECT id FROM skills_history
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT 2
         )`,
      [userId]
    );

    console.log(`📸 Skills snapshot saved for user ${userId}, keeping last 2 snapshots`);

    res.json({
      success: true,
      ...insertResult.rows[0]
    });
  } catch (err) {
    console.error('Error saving snapshot:', err);
    res.status(500).json({ 
      error: 'Server error', 
      code: 'SERVER_ERROR' 
    });
  }
});

// GET /api/skills-history/range
// Получить последние N снимков или снимки за период
router.get('/range', authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    const { start_date, end_date, limit } = req.query;

    // Если указан limit - возвращаем последние N снимков
    if (limit) {
      const result = await pool.query(
        `SELECT id, snapshot_date, climbing, sprint, endurance, tempo, power, consistency, created_at
         FROM skills_history 
         WHERE user_id = $1 
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, parseInt(limit)]
      );

      return res.json(result.rows);
    }

    // Иначе возвращаем снимки за период
    const result = await pool.query(
      `SELECT snapshot_date, climbing, sprint, endurance, tempo, power, consistency
       FROM skills_history 
       WHERE user_id = $1 
         AND snapshot_date >= COALESCE($2::date, CURRENT_DATE - INTERVAL '3 months')
         AND snapshot_date <= COALESCE($3::date, CURRENT_DATE)
       ORDER BY snapshot_date ASC`,
      [userId, start_date || null, end_date || null]
    );

    res.json({
      user_id: userId,
      snapshots: result.rows
    });
  } catch (err) {
    console.error('Error fetching snapshot range:', err);
    res.status(500).json({ 
      error: 'Server error', 
      code: 'SERVER_ERROR' 
    });
  }
});

// DELETE /api/skills-history/cleanup-month
// Очистка старых снимков: оставляем только последний снимок за предыдущий месяц
router.delete('/cleanup-month', authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    
    // Получаем все снимки за предыдущий месяц
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    
    // Находим последний снимок предыдущего месяца
    const lastSnapshotResult = await pool.query(
      `SELECT id FROM skills_history
       WHERE user_id = $1
         AND created_at >= $2
         AND created_at <= $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, lastMonth, lastMonthEnd]
    );
    
    if (lastSnapshotResult.rows.length === 0) {
      return res.json({ 
        message: 'No snapshots to clean up',
        deleted: 0 
      });
    }
    
    const lastSnapshotId = lastSnapshotResult.rows[0].id;
    
    // Удаляем все снимки предыдущего месяца КРОМЕ последнего
    const deleteResult = await pool.query(
      `DELETE FROM skills_history
       WHERE user_id = $1
         AND created_at >= $2
         AND created_at <= $3
         AND id != $4
       RETURNING id`,
      [userId, lastMonth, lastMonthEnd, lastSnapshotId]
    );
    
    res.json({
      message: 'Cleanup successful',
      deleted: deleteResult.rowCount,
      kept_snapshot_id: lastSnapshotId
    });
  } catch (err) {
    console.error('Error cleaning up snapshots:', err);
    res.status(500).json({ 
      error: 'Server error', 
      code: 'SERVER_ERROR' 
    });
  }
});

module.exports = router;


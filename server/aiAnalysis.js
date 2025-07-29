const OpenAI = require('openai');
const crypto = require('crypto');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Кэш в памяти (очищается при перезапуске сервера)
let aiCache = {};

function getSummaryHash(summary) {
  return crypto.createHash('sha256').update(JSON.stringify(summary)).digest('hex');
}

async function analyzeTraining(summary, pool, userId) {
  const hash = getSummaryHash(summary);
  
  // Сначала проверяем кэш в памяти (с учетом пользователя)
  const memoryKey = `${userId}_${hash}`;
  if (aiCache[memoryKey]) {
    return aiCache[memoryKey];
  }
  
  // Затем проверяем базу данных
  if (pool && userId) {
    try {
      const result = await pool.query(
        'SELECT analysis FROM ai_analysis_cache WHERE user_id = $1 AND hash = $2',
        [userId, hash]
      );
      
      if (result.rows.length > 0) {
        const analysis = result.rows[0].analysis;
        // Сохраняем в память для быстрого доступа
        aiCache[memoryKey] = analysis;
        return analysis;
      }
    } catch (error) {
      console.warn('Ошибка при получении кэша из БД:', error.message);
    }
  }
  const prompt = `
    Ты — опытный тренер по велоспорту. Проанализируй тренировку:
    ${JSON.stringify(summary, null, 2)}
    
    Обрати особое внимание на:
    1. Мощность: сравни расчетную и реальную мощность (если есть), оцени эффективность
    2. Распределение мощности: гравитационная, сопротивление качению, аэродинамика
    3. Уклон и его влияние на мощность
    4. Соотношение мощности к пульсу (если есть данные)
    5. Эффективность педалирования (каденс vs мощность)
    
    Дай советы по восстановлению, питанию, технике, если есть проблемы — укажи их. 
    Если есть данные о мощности, включи рекомендации по тренировке мощности.
    Пиши кратко и по делу.
  `;
  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-nano',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 400,
    temperature: 0.7,
  });
  const analysis = response.choices[0].message.content.trim();
  
  // Сохраняем в память
  aiCache[memoryKey] = analysis;
  
  // Сохраняем в базу данных
  if (pool && userId) {
    try {
      await pool.query(
        'INSERT INTO ai_analysis_cache (user_id, hash, analysis) VALUES ($1, $2, $3) ON CONFLICT (user_id, hash) DO UPDATE SET analysis = $3, updated_at = NOW()',
        [userId, hash, analysis]
      );
    } catch (error) {
      console.warn('Ошибка при сохранении кэша в БД:', error.message);
    }
  }
  
  return analysis;
}

// Функция для очистки старых записей кэша (старше 10 дней)
async function cleanupOldCache(pool) {
  if (!pool) return;
  
  try {
    const result = await pool.query(
      'DELETE FROM ai_analysis_cache WHERE created_at < NOW() - INTERVAL \'10 days\''
    );
    console.log(`Очищено ${result.rowCount} старых записей кэша AI анализа`);
  } catch (error) {
    console.warn('Ошибка при очистке кэша:', error.message);
  }
}

// Функция для получения статистики кэша
async function getCacheStats(pool) {
  if (!pool) return null;
  
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total, 
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as recent,
        COUNT(DISTINCT user_id) as unique_users
      FROM ai_analysis_cache
    `);
    return result.rows[0];
  } catch (error) {
    console.warn('Ошибка при получении статистики кэша:', error.message);
    return null;
  }
}

module.exports = { analyzeTraining, cleanupOldCache, getCacheStats }; 
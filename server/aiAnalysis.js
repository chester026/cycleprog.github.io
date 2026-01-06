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
  console.log(`🔍 AI Analysis request - User: ${userId}, Hash: ${hash.substring(0, 8)}...`);
  
  // Сначала проверяем кэш в памяти (с учетом пользователя)
  const memoryKey = `${userId}_${hash}`;
  if (aiCache[memoryKey]) {
    console.log('⚡ Cache HIT (memory) - returning cached analysis');
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
        console.log('💾 Cache HIT (database) - returning cached analysis');
        const analysis = result.rows[0].analysis;
        // Сохраняем в память для быстрого доступа
        aiCache[memoryKey] = analysis;
        return analysis;
      }
    } catch (error) {
      console.warn('Ошибка при получении кэша из БД:', error.message);
    }
  }
  
  console.log('🤖 Cache MISS - calling OpenAI API...');
  const prompt = `
    You are an experienced cycling coach. Analyze the following ride summary (JSON):
    ${JSON.stringify(summary, null, 2)}

    Produce a compact, actionable report. Use the data if present (distance_km, moving_time_min, elapsed_time_min, average_speed_kmh, max_speed_kmh, average_heartrate, max_heartrate, average_cadence, average_temp, total_elevation_gain_m, max_elevation_m, estimated_power_w, gravity_power_w, rolling_resistance_w, aerodynamic_power_w, average_grade_percent, real_average_power_w, real_max_power_w, date, name).

    Focus on:
    - Intensity & HR: infer effort using avg/max HR; note HR drift (if high HR with dropping speed/power).
    - Speed & pacing: pace consistency and where time was lost/won; comment on speed vs elevation.
    - Power: compare estimated vs real power (if available); explain aero vs rolling vs gravity contributions and what limits speed.
    - Climbing & terrain: elevation gain/grade; gearing & cadence suitability; climbing technique tips.
    - Cadence & technique: is cadence low/high for the context; simple drills to improve efficiency.
    - Nutrition & hydration: estimate carbs (g/h) and fluids (ml/h) from duration and temperature; give simple targets.
    - Recovery: suggest rest/easy work based on intensity and duration.
    - Improvements: 3–6 prioritized, specific actions with short rationale.

    Format strictly (do NOT use markdown):
    - One-line summary of the ride
    - Make headings bold but without markdown formatting (no ** or __).
    - Sections with short bullets using simple text: "Intensity:", "Speed & Pacing:", "Power:", "Climbing:", "Technique:", "Nutrition:", "Recovery:"
    - "Recommendations:" as a numbered list (3–6 items)
    - Be concise (≈180–220 words). No emojis. No bold text (**). Use plain text only.
    `;
  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-nano', // GPT-4.1 nano - быстрая и эффективная для анализа
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 600,
    temperature: 0.7,
  });
  
  // Проверяем, был ли ответ обрезан
  if (response.choices[0].finish_reason === 'length') {
    console.warn('⚠️ GPT response was cut off due to max_tokens limit. Consider increasing max_tokens.');
  }
  
  const analysis = response.choices[0].message.content.trim();
  console.log(`✅ OpenAI response received (${analysis.length} chars)`);
  
  // Сохраняем в память
  aiCache[memoryKey] = analysis;
  console.log('💾 Saved to memory cache');
  
  // Сохраняем в базу данных
  if (pool && userId) {
    try {
      await pool.query(
        'INSERT INTO ai_analysis_cache (user_id, hash, analysis) VALUES ($1, $2, $3) ON CONFLICT (user_id, hash) DO UPDATE SET analysis = $3, updated_at = NOW()',
        [userId, hash, analysis]
      );
      console.log('💾 Saved to database cache');
    } catch (error) {
      console.warn('❌ Error saving cache to DB:', error.message);
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
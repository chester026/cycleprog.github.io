# Система кэширования AI анализа тренировок

## Обзор

Система кэширования AI анализа тренировок оптимизирует производительность и снижает затраты на API вызовы к OpenAI, сохраняя результаты анализа в базе данных.

## Архитектура

### Компоненты системы

1. **In-Memory Cache** - быстрый доступ к недавно использованным анализам
2. **Database Cache** - постоянное хранение в PostgreSQL
3. **Hash-based Lookup** - SHA256 хеш входных данных для уникальной идентификации
4. **Automatic Cleanup** - периодическая очистка старых записей

## Структура базы данных

### Таблица `ai_analysis_cache`

```sql
CREATE TABLE ai_analysis_cache (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    hash VARCHAR(64) NOT NULL,
    analysis TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, hash)
);
```

**Поля:**
- `id` - уникальный идентификатор записи
- `user_id` - ID пользователя (для разделения кэша между пользователями)
- `hash` - SHA256 хеш входных данных
- `analysis` - результат AI анализа
- `created_at` - время создания записи
- `updated_at` - время последнего обновления

**Индексы:**
- `idx_ai_cache_user_hash` - для быстрого поиска по пользователю и хешу
- `idx_ai_cache_created_at` - для очистки старых записей
- `idx_ai_cache_user_id` - для поиска по пользователю

## Алгоритм работы

### 1. Проверка кэша

```javascript
async function analyzeTraining(summary, pool, userId) {
  const hash = getSummaryHash(summary);
  const memoryKey = `${userId}_${hash}`;
  
  // 1. Проверяем кэш в памяти (с учетом пользователя)
  if (aiCache[memoryKey]) {
    return aiCache[memoryKey];
  }
  
  // 2. Проверяем базу данных
  if (pool && userId) {
    const result = await pool.query(
      'SELECT analysis FROM ai_analysis_cache WHERE user_id = $1 AND hash = $2',
      [userId, hash]
    );
    
    if (result.rows.length > 0) {
      const analysis = result.rows[0].analysis;
      aiCache[memoryKey] = analysis; // Сохраняем в память
      return analysis;
    }
  }
  
  // 3. Если нет в кэше - делаем API запрос
  const analysis = await callOpenAI(summary);
  
  // 4. Сохраняем результат
  aiCache[memoryKey] = analysis;
  await saveToDatabase(userId, hash, analysis, pool);
  
  return analysis;
}
```

### 2. Генерация хеша

```javascript
function getSummaryHash(summary) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(summary))
    .digest('hex');
}
```

**Преимущества:**
- Одинаковые входные данные = одинаковый хеш
- Быстрый поиск по хешу
- Уникальная идентификация записей

### 3. Сохранение в базу данных

```javascript
await pool.query(
  'INSERT INTO ai_analysis_cache (user_id, hash, analysis) VALUES ($1, $2, $3) ON CONFLICT (user_id, hash) DO UPDATE SET analysis = $3, updated_at = NOW()',
  [userId, hash, analysis]
);
```

**Особенности:**
- `ON CONFLICT` - обновляет существующую запись при конфликте хеша
- Автоматическое обновление `updated_at`

## API Эндпоинты

### POST /api/ai-analysis

Анализ тренировки с кэшированием.

**Request:**
```json
{
  "summary": {
    "power": 250,
    "distance": 50,
    "time": 120,
    "elevation": 500
  }
}
```

**Response:**
```json
{
  "analysis": "Анализ тренировки от AI..."
}
```

### GET /api/ai-cache-stats

Статистика кэша.

**Response:**
```json
{
  "stats": {
    "total": 150,
    "recent": 25
  }
}
```

## Управление кэшем

### Автоматическая очистка

```javascript
// Очистка записей старше 10 дней
setInterval(async () => {
  await cleanupOldCache(pool);
}, 24 * 60 * 60 * 1000); // Каждые 24 часа
```

### Ручная очистка

```javascript
async function cleanupOldCache(pool) {
  const result = await pool.query(
    'DELETE FROM ai_analysis_cache WHERE created_at < NOW() - INTERVAL \'10 days\''
  );
  console.log(`Очищено ${result.rowCount} старых записей`);
}
```

### Статистика кэша

```javascript
async function getCacheStats(pool) {
  const result = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as recent,
      COUNT(DISTINCT user_id) as unique_users
    FROM ai_analysis_cache
  `);
  return result.rows[0];
}
```

## Производительность

### Преимущества кэширования

1. **Скорость**: In-memory кэш обеспечивает мгновенный доступ
2. **Экономия**: Снижение количества API вызовов к OpenAI
3. **Надежность**: База данных обеспечивает персистентность
4. **Масштабируемость**: Работает с несколькими инстансами сервера

### Метрики производительности

- **Hit Rate**: Процент запросов, найденных в кэше
- **Response Time**: Время ответа (кэш vs API)
- **Cost Savings**: Экономия на API вызовах

## Мониторинг

### Логирование

```javascript
// Успешный кэш-хит
console.log(`AI анализ найден в кэше: ${hash}`);

// Новый API запрос
console.log(`Новый AI анализ: ${hash}`);

// Ошибки
console.warn('Ошибка при получении кэша из БД:', error.message);
```

### Метрики

- Количество кэш-хитов
- Количество новых API запросов
- Размер кэша в памяти
- Размер кэша в базе данных

## Безопасность

### Защита данных

1. **Хеширование**: Входные данные хешируются, не хранятся в открытом виде
2. **Изоляция пользователей**: Кэш разделен по `user_id`, пользователи не видят чужие данные
3. **Очистка**: Автоматическое удаление старых записей
4. **Валидация**: Проверка входных данных перед обработкой
5. **Авторизация**: Проверка JWT токена для получения `user_id`

### Ограничения

- Максимальный размер анализа: 10KB
- Время жизни записи: 10 дней
- Максимальное количество записей: не ограничено (управляется очисткой)

## Развертывание

### Миграция базы данных

```sql
-- Создание таблицы кэша
\i server/create_ai_cache_table.sql
```

### Переменные окружения

```bash
# OpenAI API ключ
OPENAI_API_KEY=your_openai_api_key

# Настройки кэша (опционально)
AI_CACHE_TTL_DAYS=30
AI_CACHE_CLEANUP_INTERVAL_HOURS=24
```

### Мониторинг в продакшене

1. **Логи**: Отслеживание ошибок и производительности
2. **Метрики**: Размер кэша, hit rate, response time
3. **Алерты**: При превышении лимитов или ошибках

## Будущие улучшения

1. **Redis Cache**: Замена in-memory кэша на Redis для лучшей масштабируемости
2. **Compression**: Сжатие данных анализа для экономии места
3. **Analytics**: Детальная аналитика использования кэша
4. **Smart Cleanup**: Умная очистка на основе частоты использования
5. **Cache Warming**: Предварительная загрузка популярных анализов 
# Настройка Skills History API

## 1. Подключение роутов в server.js

Добавь это в `/server/server.js`:

```javascript
// ... другие импорты ...
const skillsHistoryRoutes = require('./routes/skillsHistory');

// ... остальной код ...

// Подключаем роуты для skills history
app.use('/api/skills-history', skillsHistoryRoutes);

// ... остальные роуты ...
```

---

## 2. SQL для создания таблицы (ЧИСТЫЙ, без прелюдий)

```sql
CREATE TABLE skills_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  climbing INTEGER CHECK (climbing >= 0 AND climbing <= 100),
  sprint INTEGER CHECK (sprint >= 0 AND sprint <= 100),
  endurance INTEGER CHECK (endurance >= 0 AND endurance <= 100),
  tempo INTEGER CHECK (tempo >= 0 AND tempo <= 100),
  power INTEGER CHECK (power >= 0 AND power <= 100),
  consistency INTEGER CHECK (consistency >= 0 AND consistency <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_user_snapshot UNIQUE(user_id, snapshot_date)
);

CREATE INDEX idx_skills_history_user_date ON skills_history(user_id, snapshot_date DESC);

CREATE INDEX idx_skills_history_user_daterange ON skills_history(user_id, snapshot_date);
```

**Выполни через psql или pgAdmin:**
```bash
psql -d your_database_name -f create_skills_history.sql
```

---

## 3. Проверка что все работает

### Запусти server:
```bash
cd server
npm start
# или
node server.js
```

### Проверь endpoints (используй Postman или cURL):

**1. Сохранить снимок:**
```bash
curl -X POST http://localhost:3000/api/skills-history \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "climbing": 67,
    "sprint": 45,
    "endurance": 72,
    "tempo": 58,
    "power": 54,
    "consistency": 81
  }'
```

**2. Получить последний снимок:**
```bash
curl http://localhost:3000/api/skills-history/last \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**3. Сравнить с 2 неделями назад:**
```bash
curl "http://localhost:3000/api/skills-history/compare?date=2025-12-15" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 4. Troubleshooting

### Ошибка: "relation skills_history does not exist"
- ✅ Выполни SQL выше (чистый CREATE TABLE без лишнего текста)
- Проверь что таблица создалась: `\dt skills_history` в psql

### Ошибка: "Unauthorized"
- Проверь что JWT token корректный
- Проверь что JWT_SECRET настроен в .env

### Ошибка: "No snapshots found"
- Это нормально для первого запуска
- После первого сохранения ошибка исчезнет

---

## 5. Готово! 🎉

Frontend уже настроен и будет:
1. Автоматически сохранять снимки каждые 2 недели или 1-го числа месяца
2. Загружать тренды при загрузке страницы
3. Отображать `+X/-Y` в легенде Skills Radar Chart

Теперь твои пользователи увидят прогресс! 💪📈


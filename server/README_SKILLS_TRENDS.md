# Skills Trends - Quick Start

## ✅ Что уже готово:

1. **Backend API:** `/server/routes/skillsHistory.js`
2. **Frontend:** Полностью готов (SkillsRadarChart + AnalysisPage + utils)
3. **Документация:** См. `SETUP_SKILLS_HISTORY.md`

---

## 🚀 Быстрый старт (2 минуты):

### 1. Создай таблицу в БД:

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

### 2. Подключи роут в `server.js`:

```javascript
// Добавь одну строку:
app.use('/api/skills-history', require('./routes/skillsHistory'));
```

### 3. Запусти сервер:

```bash
node server.js
```

---

## 🎉 Готово!

Frontend автоматически:
- Сохранит снимки каждые 2 недели
- Покажет тренды `+X/-Y` в Skills Radar Chart

Подробности в `SETUP_SKILLS_HISTORY.md`


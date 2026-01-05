# 🔍 Debug Skills History Save Issue

## Проблема
При первой загрузке навыки не сохраняются в `skills_history`.

## Что проверяем:

### 1. **Открой Console (DevTools)**
При загрузке страницы `/analysis` должны появиться логи:

```javascript
// Шаг 1: Вызов функции
🔍 manageSkillsHistory called: {
  hasUserProfile: true,
  hasCurrentSkills: true,
  hasSummary: true,
  hasPowerStats: true/false,  // может быть false!
  currentSkillsValue: { climbing: 67, sprint: 45, ... }
}

// Шаг 2: Все данные готовы
✅ All data ready, managing skills history...

// Шаг 3: Проверка условий
📊 Skills History Check: {
  today: "2026-01-02",
  lastSnapshot: "NONE",  // Если первый запуск
  shouldSave: true,
  saveReason: "First snapshot ever",  // ⭐ Причина сохранения
  isFirstOfMonth: false,
  currentSkills: { climbing: 67, ... }
}

// Шаг 4: Сохранение
💾 Saving new skills snapshot... {
  user_id: 1,
  skills: { climbing: 67, sprint: 45, ... }
}

// Шаг 5: Результат
✅ Skills snapshot saved! { id: 1, user_id: 1, ... }
```

---

## Возможные проблемы:

### ❌ Проблема 1: "Waiting for data..."
```javascript
🔍 manageSkillsHistory called: {
  hasUserProfile: false,  // ❌
  hasCurrentSkills: false,  // ❌
  ...
}
⏳ Waiting for data...
```

**Причина:** Данные еще не загрузились.

**Решение:** Подожди несколько секунд, должно загрузиться автоматически.

---

### ❌ Проблема 2: "No auth token"
```javascript
✅ All data ready...
❌ No auth token
```

**Причина:** Не залогинен.

**Решение:** Авторизуйся через Strava.

---

### ❌ Проблема 3: API ошибка
```javascript
💾 Saving new skills snapshot...
❌ Error: 401 Unauthorized
```

**Причина:** Токен невалидный или backend не работает.

**Решение:**
1. Проверь, запущен ли backend: `node server/server.js`
2. Проверь логи backend в терминале
3. Проверь что endpoint `/api/skills-history` существует

---

### ❌ Проблема 4: currentSkills = null
```javascript
🔍 manageSkillsHistory called: {
  hasUserProfile: true,
  hasCurrentSkills: false,  // ❌
  currentSkillsValue: null
}
```

**Причина:** `SkillsRadarChart` не вызвал `onSkillsCalculated`.

**Решение:** Проверь логи от `SkillsRadarChart`:
```javascript
🔄 SkillsRadarChart rendered { ... }
🧮 SkillsRadarChart: recalculating skills...
```

Если их нет - значит компонент не рендерится или вылетает с ошибкой.

---

## Что я изменил:

### 1. **Убрал проверку powerStats**
```javascript
// Раньше:
if (!userProfile?.id || !currentSkills || !summary || !powerStats) return;

// Сейчас:
if (!userProfile?.id || !currentSkills || !summary) return;
```

**Почему:** `powerStats` может быть `null` если нет данных мощности - это нормально!

---

### 2. **Добавил debug логи**
- `🔍 manageSkillsHistory called` - показывает что доступно
- `✅ All data ready` - все данные загружены
- `📊 Skills History Check` - условия сохранения
- `💾 Saving new skills snapshot` - что отправляем
- `✅ Skills snapshot saved` - что получили обратно

---

## Как проверить прямо сейчас:

### 1. **Открой Console в DevTools**
- Chrome/Edge: F12 → Console
- Safari: Cmd+Option+C

### 2. **Перезагрузи страницу `/analysis`**
- Cmd+R (Mac) или Ctrl+R (Windows)

### 3. **Смотри логи**
- Если видишь `✅ Skills snapshot saved!` → **ВСЁ РАБОТАЕТ!** 🎉
- Если видишь ошибку → скопируй и отправь мне

### 4. **Проверь базу данных**
```sql
SELECT * FROM skills_history ORDER BY created_at DESC LIMIT 1;
```

Должна быть запись!

---

## Если всё равно не работает:

### Проверь backend логи:
```bash
cd server
node server.js
```

Должны быть логи:
```
POST /api/skills-history
INSERT INTO skills_history ...
```

### Проверь что таблица существует:
```sql
\d skills_history
```

Должны быть колонки: `id`, `user_id`, `snapshot_date`, `climbing`, `sprint`, и т.д.

---

## Важно! 🎯

**Сейчас сохранение происходит если:**

### ✅ Вариант 1: НЕТ снимков вообще
```javascript
📊 Skills History Check: {
  lastSnapshot: "NONE",
  shouldSave: true,
  saveReason: "First snapshot ever"  // Сохраняем независимо от даты!
}
💾 Saving new skills snapshot...
```
**Сохраняем сразу при первой загрузке!**

### ✅ Вариант 2: Сегодня 1-е число + нет снимка за этот месяц
```javascript
📊 Skills History Check: {
  today: "2026-02-01",
  lastSnapshot: "2026-01-01",
  shouldSave: true,
  saveReason: "First day of new month"
}
💾 Saving new skills snapshot...
```
**Сохраняем месячный снимок!**

### ⏭️ Вариант 3: Уже есть снимок за этот месяц
```javascript
📊 Skills History Check: {
  today: "2026-01-15",
  lastSnapshot: "2026-01-01",
  shouldSave: false,
  saveReason: "Not first day of month"
}
⏭️ Skipping save - not yet time
```
**Пропускаем - подождем до 1 февраля!**

### ⏭️ Вариант 4: Сегодня 1-е число, но снимок уже есть
```javascript
📊 Skills History Check: {
  today: "2026-01-01",
  lastSnapshot: "2026-01-01",
  shouldSave: false,
  saveReason: "Already saved for this month"
}
⏭️ Skipping save - not yet time
```
**Уже сохранили сегодня!**

---

## Быстрый тест (для отладки):

Если хочешь протестировать сохранение прямо сейчас:

1. **Открой Console**
2. **Выполни:**
```javascript
// Имитируем первый запуск (удаляем все снимки)
await fetch('/api/skills-history/last', {
  method: 'DELETE',
  headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
});

// Перезагружаем страницу
location.reload();
```

Теперь должно сохранить как первый снимок!

---

**Проверяй Console и отправляй мне логи!** 🔍


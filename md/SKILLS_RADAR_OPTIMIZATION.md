# ⚡ Skills Radar Chart Optimization

## Проблема

`SkillsRadarChart` компонент может вызывать лишние перерасчеты и запросы к Strava API, если не закеширован должным образом.

## Решение

### 1. **React.memo() с custom compare function**

Обернули компонент в `React.memo()` с кастомной функцией сравнения props:

```javascript
export default React.memo(SkillsRadarChart, (prevProps, nextProps) => {
  // Сравниваем только критичные props
  const activitiesEqual = prevProps.activities?.length === nextProps.activities?.length &&
    prevProps.activities?.[0]?.id === nextProps.activities?.[0]?.id;
  
  const powerStatsEqual = prevProps.powerStats?.avgPower === nextProps.powerStats?.avgPower;
  
  const summaryEqual = prevProps.summary?.vo2max === nextProps.summary?.vo2max &&
    prevProps.summary?.totalDistance === nextProps.summary?.totalDistance;
  
  const trendEqual = JSON.stringify(prevProps.skillsTrend) === JSON.stringify(nextProps.skillsTrend);
  
  // true = НЕ обновлять компонент
  return activitiesEqual && powerStatsEqual && summaryEqual && trendEqual;
});
```

**Что проверяется:**
- ✅ Количество активностей и ID первой активности
- ✅ `avgPower` из powerStats
- ✅ `vo2max` и `totalDistance` из summary
- ✅ Изменения в skillsTrend

### 2. **useCallback в AnalysisPage**

Обернули callback-функции в `useCallback` для стабильности:

```javascript
// В AnalysisPage.jsx
const handlePowerStatsCalculated = useCallback((stats) => {
  setPowerStats(stats);
}, []);

const handleSkillsCalculated = useCallback((skills) => {
  setCurrentSkills(skills);
}, []);

// Использование:
<PowerAnalysis 
  activities={activities}
  onStatsCalculated={handlePowerStatsCalculated}
/>

<SkillsRadarChart 
  activities={activities}
  onSkillsCalculated={handleSkillsCalculated}
  // ... other props
/>
```

**Зачем это нужно:**
- Функции из `useState` (`setPowerStats`, `setCurrentSkills`) стабильны, но для явности и консистентности обернули в `useCallback`
- Предотвращает создание новых функций на каждый рендер родителя

### 3. **Debug логирование**

Добавили debug-логи для мониторинга:

```javascript
// В SkillsRadarChart.jsx
useEffect(() => {
  console.log('🔄 SkillsRadarChart rendered', {
    activitiesCount: activities?.length,
    hasPowerStats: !!powerStats,
    hasSummary: !!summary,
    hasTrend: !!skillsTrend
  });
});

// В useMemo для skillsData
console.log('🧮 SkillsRadarChart: recalculating skills...', {
  activitiesCount: activities?.length,
  powerStats,
  summaryVO2: summary?.vo2max
});
```

**Как использовать:**
1. Открой DevTools → Console
2. Зайди на страницу `/analysis`
3. Понаблюдай за логами:
   - `🔄 SkillsRadarChart rendered` - компонент отрендерился (должно быть 1-2 раза!)
   - `🧮 SkillsRadarChart: recalculating skills...` - пересчет навыков (должно быть минимум!)

### 4. **useMemo для тяжелых вычислений**

Уже было, но для полноты:

```javascript
const skillsData = useMemo(() => {
  // Вычисления только при изменении activities, powerStats, summary
  const calculatedSkills = calculateAllSkills(activities, powerStats, summary);
  // ... форматирование
  return skills;
}, [activities, powerStats, summary]);

const riderProfile = useMemo(() => {
  // Вычисления только при изменении skillsData
  return determineRiderProfile(skillsObject);
}, [skillsData]);
```

---

## 📊 Результаты оптимизации

### До оптимизации:
- ❌ Компонент ререндерится при каждом изменении родителя
- ❌ Навыки пересчитываются даже если данные не изменились
- ❌ Возможны лишние запросы к Strava API (через родителя)

### После оптимизации:
- ✅ Компонент ререндерится только при изменении данных
- ✅ Навыки пересчитываются только при изменении activities/powerStats/summary
- ✅ Минимум запросов к API
- ✅ Улучшенная производительность

---

## 🔍 Проверка работы

### 1. Console проверка
```bash
# Ожидаемые логи при загрузке страницы:
🔄 SkillsRadarChart rendered { activitiesCount: 41, hasPowerStats: false, hasSummary: false, hasTrend: null }
🧮 SkillsRadarChart: recalculating skills... { activitiesCount: 41, powerStats: null, summaryVO2: undefined }
🔄 SkillsRadarChart rendered { activitiesCount: 41, hasPowerStats: true, hasSummary: false, hasTrend: null }
🧮 SkillsRadarChart: recalculating skills... { activitiesCount: 41, powerStats: {...}, summaryVO2: undefined }
🔄 SkillsRadarChart rendered { activitiesCount: 41, hasPowerStats: true, hasSummary: true, hasTrend: null }
🧮 SkillsRadarChart: recalculating skills... { activitiesCount: 41, powerStats: {...}, summaryVO2: 60 }
🔄 SkillsRadarChart rendered { activitiesCount: 41, hasPowerStats: true, hasSummary: true, hasTrend: {...} }
# Trend не вызывает пересчет, только ререндер для отображения

# После загрузки - НЕ должно быть больше логов!
```

### 2. Network проверка
```bash
# Открой DevTools → Network → Filter: "strava"
# Должен быть только ОДИН запрос к Strava API при загрузке страницы
# НЕ должно быть повторных запросов при скролле/взаимодействии
```

### 3. React DevTools Profiler
```bash
# Установи React DevTools
# Открой Profiler → Start profiling
# Взаимодействуй со страницей (скролл, hover, клики)
# Stop profiling
# SkillsRadarChart НЕ должен появляться в flame graph после первой загрузки
```

---

## 🛠️ Файлы

- **Компонент:** `react-spa/src/components/SkillsRadarChart.jsx`
  - React.memo() с custom compare
  - Debug логирование
  - useMemo для вычислений
  
- **Родитель:** `react-spa/src/pages/AnalysisPage.jsx`
  - useCallback для callbacks
  - Стабильные props

- **Документация:**
  - `md/SKILLS_RADAR_OPTIMIZATION.md` (этот файл)
  - `md/SKILLS_RADAR_CHART.md` (основная документация)

---

## 💡 Best Practices

### ✅ DO:
- Используй `React.memo()` для тяжелых компонентов с частыми ререндерами
- Используй `useMemo()` для дорогих вычислений
- Используй `useCallback()` для callback-функций, передаваемых в мемоизированные компоненты
- Добавляй debug-логи для проверки оптимизации (можно убрать в продакшене)

### ❌ DON'T:
- Не используй `React.memo()` везде - это overhead
- Не мемоизируй простые компоненты без тяжелых вычислений
- Не оптимизируй преждевременно - сначала измерь проблему
- Не забывай про зависимости в `useMemo`/`useCallback`

---

## 📈 Мониторинг

Если заметишь проблемы с производительностью:

1. **Проверь console** - много логов `🔄 rendered`?
2. **Проверь Network** - много запросов к API?
3. **Используй React Profiler** - где bottleneck?
4. **Проверь зависимости** - `useMemo`/`useCallback` корректны?

Если нужно больше оптимизаций:
- Можно вынести `CustomTooltip` в отдельный мемоизированный компонент
- Можно использовать `React.lazy()` для code splitting
- Можно добавить debounce для user interactions

---

## ⚠️ Важно

**Debug логи можно удалить в продакшене:**

```javascript
// Закомментируй или удали:
useEffect(() => {
  console.log('🔄 SkillsRadarChart rendered', ...);
});

console.log('🧮 SkillsRadarChart: recalculating skills...', ...);
```

Или используй условную компиляцию:

```javascript
if (process.env.NODE_ENV === 'development') {
  console.log('🔄 SkillsRadarChart rendered', ...);
}
```


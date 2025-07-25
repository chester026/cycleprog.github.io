# Анализ компонента ProgressChart.jsx

## Обзор

`ProgressChart.jsx` - это React компонент для отображения прогресса тренировок в виде графика. Показывает общий прогресс тренированности по ключевым метрикам велоспорта за последние 12 периодов (год).

## Архитектура

### Источник данных
- **Входные данные:** проп `data` от `PlanPage.jsx`
- **Формирование:** функция `renderPeriodSummary()` в `PlanPage.jsx`
- **Тип данных:** массив объектов с метриками за каждый 28-дневный период

### Структура данных
```javascript
// Каждый элемент массива data содержит:
{
  avg: 75,           // Средний прогресс за период (%)
  all: [80, 70, 75, 80, 70, 75], // Детали по каждой метрике (%)
  start: "2024-01-01", // Дата начала периода
  end: "2024-01-28"    // Дата окончания периода
}
```

## Логика формирования данных

### Функция `renderPeriodSummary()` в PlanPage.jsx

1. **Разбиение на периоды:**
   - Сортирует активности по дате (от новых к старым)
   - Группирует в 28-дневные периоды
   - Берет только последние 12 периодов (год)
   - Переворачивает массив для отображения от старых к новым

2. **Обработка каждого периода:**
   - Вызывает `percentForPeriod()` для каждого периода
   - Возвращает массив с метриками прогресса

### Функция `percentForPeriod()` - расчет метрик

Рассчитывает 6 ключевых метрик велоспорта:

#### 1. Скорость на равнине (`flatSpeedPct`)
```javascript
const flats = period.filter(a => 
  (a.distance || 0) > 20000 && 
  (a.total_elevation_gain || 0) < (a.distance || 0) * 0.005 && 
  (a.average_speed || 0) * 3.6 < 40
);
const flatSpeeds = flats.map(a => (a.average_speed || 0) * 3.6);
const medianFlatSpeed = median(flatSpeeds);
const flatSpeedGoal = 30;
let flatSpeedPct = Math.min(100, Math.round(medianFlatSpeed / flatSpeedGoal * 100));
```

**Критерии плоских участков:**
- Дистанция > 20км
- Набор высоты < 0.5% от дистанции
- Средняя скорость < 40 км/ч
- **Цель:** 30 км/ч

#### 2. Скорость на подъемах (`hillSpeedPct`)
```javascript
const hills = period.filter(a => 
  (a.distance || 0) > 5000 && 
  (a.total_elevation_gain || 0) > (a.distance || 0) * 0.02 && 
  (a.average_speed || 0) * 3.6 < 20
);
```

**Критерии холмов:**
- Дистанция > 5км
- Набор высоты > 2% от дистанции
- Средняя скорость < 20 км/ч
- **Цель:** 17.5 км/ч

#### 3. Пульсовые зоны (`pulseGoalPct`)
```javascript
const flatsInZone = flats.filter(a => 
  a.average_heartrate && 
  a.average_heartrate >= 109 && 
  a.average_heartrate < 145
).length;
const flatZonePct = flats.length ? Math.round(flatsInZone / flats.length * 100) : 0;

const hillsInZone = hills.filter(a => 
  a.average_heartrate && 
  a.average_heartrate >= 145 && 
  a.average_heartrate < 163
).length;
const hillZonePct = hills.length ? Math.round(hillsInZone / hills.length * 100) : 0;

const pulseGoalPct = flats.length && hills.length ? 
  Math.round((flatZonePct + hillZonePct) / 2) : 
  (flatZonePct || hillZonePct);
```

**Целевые пульсовые зоны:**
- **Плоские участки:** 109-144 bpm (Z2-Z3)
- **Холмы:** 145-162 bpm (Z4)

#### 4. Длинные поездки (`longRidePct`)
```javascript
const longRides = period.filter(a => 
  (a.distance || 0) > 60000 || 
  (a.moving_time || 0) > 2.5 * 3600
);
let longRidePct = Math.min(100, Math.round(longRides.length / 4 * 100));
```

**Критерии длинных поездок:**
- Дистанция > 60км ИЛИ время > 2.5 часа
- **Цель:** 4 длинные поездки за период

#### 5. Интервальные тренировки (`intervalsPct`)
```javascript
const intervals = period.filter(a => 
  (a.name || '').toLowerCase().includes('интервал') || 
  (a.name || '').toLowerCase().includes('interval') || 
  (a.type && a.type.toLowerCase().includes('interval'))
);
let intervalsPct = Math.min(100, Math.round(intervals.length / 4 * 100));
```

**Критерии интервалов:**
- Название содержит "интервал", "interval"
- Или тип активности содержит "interval"
- **Цель:** 4 интервальные тренировки за период

#### 6. Легкие поездки (`easyPct`)
```javascript
const easyRides = period.filter(a => 
  (a.distance || 0) < 20000 && 
  (a.average_speed || 0) * 3.6 < 20
);
let easyPct = Math.min(100, Math.round(easyRides.length / 4 * 100));
```

**Критерии легких поездок:**
- Дистанция < 20км
- Средняя скорость < 20 км/ч
- **Цель:** 4 легкие тренировки за период

### Расчет среднего прогресса
```javascript
const all = [flatSpeedPct, hillSpeedPct, pulseGoalPct, longRidePct, intervalsPct, easyPct];
const avg = Math.round(all.reduce((a, b) => a + b, 0) / all.length);
```

## Визуализация

### Компоненты отображения

#### 1. График (AreaChart)
- **Библиотека:** Recharts
- **Тип:** AreaChart с градиентной заливкой
- **Ось Y:** 0-100% (прогресс)
- **Ось X:** Номера периодов (1-12)
- **Интерактивность:** Tooltip с детальной информацией

#### 2. Большое число справа
- Показывает прогресс за последний период
- Стилизовано как главный индикатор

#### 3. Tooltip
```javascript
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="progress-tooltip">
        <p className="tooltip-label">Period {data.period}</p>
        <p className="tooltip-value">Progress: <strong>{data.progress}%</strong></p>
        <p className="tooltip-details">{data.details}</p>
        <p className="tooltip-date">{data.start} – {data.end}</p>
      </div>
    );
  }
  return null;
};
```

**Информация в tooltip:**
- Номер периода
- Общий прогресс (%)
- Детали по каждой метрике
- Даты начала и окончания периода

## Стилизация

### CSS файл: `ProgressChart.css`

#### Основные стили:
- **Контейнер:** Адаптивная сетка с графиком и большим числом
- **График:** ResponsiveContainer с фиксированной высотой 300px
- **Tooltip:** Темный градиентный фон с белым текстом

#### Адаптивность:
```css
@media (max-width: 768px) {
  .progress-chart {
    padding: 15px;
  }
  
  .summary-grid {
    grid-template-columns: 1fr;
  }
  
  .chart-container {
    min-height: 250px;
  }
}
```

## Утилитарные функции

### Функция `median()`
```javascript
const median = (arr) => {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
```

Используется для расчета медианной скорости, что дает более стабильные показатели чем среднее арифметическое.

## Состояние данных

### Важные особенности:
- **НЕ сохраняет данные** - чисто визуальный компонент
- **Пересчет при каждом рендере** - данные рассчитываются "на лету"
- **Источник истины:** массив `activities` в `PlanPage.jsx`
- **Кэширование:** отсутствует, данные всегда актуальные

## Интеграция с PlanPage

### Использование:
```javascript
// В PlanPage.jsx
const periodSummary = renderPeriodSummary();

// Рендер компонента
<ProgressChart data={periodSummary} />
```

### Расположение:
- Отображается сразу под hero-секцией
- Показывает прогресс по 4-недельным периодам
- Дополняет информацию о текущих целях

## Заключение

`ProgressChart` - это мощный инструмент для анализа тренировочного прогресса, который:

1. **Автоматически классифицирует** активности по типам
2. **Рассчитывает прогресс** по 6 ключевым метрикам
3. **Визуализирует тренды** за год
4. **Предоставляет детальную информацию** через tooltip
5. **Адаптируется** под разные размеры экрана

Компонент показывает **общий прогресс тренированности** и помогает отслеживать долгосрочные тренды в тренировочном процессе. 
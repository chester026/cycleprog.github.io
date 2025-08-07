# Примеры целей (Goals Examples)

## Обзор

Документ содержит примеры различных типов целей, которые можно создать в системе. Каждый пример включает описание, настройки и ожидаемые результаты.

## Типы целей

### 1. Distance (Дистанция)

#### Пример 1: Месячная дистанция
```json
{
  "title": "Проехать 500 км за месяц",
  "description": "Набрать 500 километров за 4 недели",
  "target_value": 500,
  "unit": "km",
  "goal_type": "distance",
  "period": "4w"
}
```

#### Пример 2: Годовая дистанция
```json
{
  "title": "Проехать 5000 км за год",
  "description": "Достичь 5000 километров за год",
  "target_value": 5000,
  "unit": "km",
  "goal_type": "distance",
  "period": "year"
}
```

### 2. Elevation (Набор высоты)

#### Пример 1: Месячный набор высоты
```json
{
  "title": "Набрать 5000м за месяц",
  "description": "Набрать 5000 метров высоты за 4 недели",
  "target_value": 5000,
  "unit": "m",
  "goal_type": "elevation",
  "period": "4w"
}
```

#### Пример 2: Годовой набор высоты
```json
{
  "title": "Набрать 50000м за год",
  "description": "Набрать 50000 метров высоты за год",
  "target_value": 50000,
  "unit": "m",
  "goal_type": "elevation",
  "period": "year"
}
```

### 3. Time (Время)

#### Пример 1: Время в седле
```json
{
  "title": "Провести 50 часов в седле",
  "description": "Накопить 50 часов времени в движении за месяц",
  "target_value": 50,
  "unit": "hours",
  "goal_type": "time",
  "period": "4w"
}
```

### 4. Speed Flat (Скорость на равнине)

#### Пример 1: Средняя скорость на равнине
```json
{
  "title": "Средняя скорость 30 км/ч на равнине",
  "description": "Достичь средней скорости 30 км/ч на равнинных участках",
  "target_value": 30,
  "unit": "km/h",
  "goal_type": "speed_flat",
  "period": "4w"
}
```

### 5. Speed Hills (Скорость в горах)

#### Пример 1: Скорость в горах
```json
{
  "title": "Средняя скорость 20 км/ч в горах",
  "description": "Достичь средней скорости 20 км/ч на горных участках",
  "target_value": 20,
  "unit": "km/h",
  "goal_type": "speed_hills",
  "period": "4w"
}
```

### 6. Pulse (Средний пульс)

#### Пример 1: Контроль пульса
```json
{
  "title": "Средний пульс 140 уд/мин",
  "description": "Поддерживать средний пульс 140 ударов в минуту",
  "target_value": 140,
  "unit": "bpm",
  "goal_type": "pulse",
  "period": "4w"
}
```

### 7. Avg HR Flat (Средний пульс на равнине)

#### Пример 1: Пульс на равнине
```json
{
  "title": "Пульс 135 уд/мин на равнине",
  "description": "Поддерживать пульс 135 уд/мин на равнинных участках",
  "target_value": 135,
  "unit": "bpm",
  "goal_type": "avg_hr_flat",
  "period": "4w"
}
```

### 8. Avg HR Hills (Средний пульс в горах)

#### Пример 1: Пульс в горах
```json
{
  "title": "Пульс 155 уд/мин в горах",
  "description": "Поддерживать пульс 155 уд/мин на горных участках",
  "target_value": 155,
  "unit": "bpm",
  "goal_type": "avg_hr_hills",
  "period": "4w"
}
```

### 9. Avg Power (Средняя мощность)

#### Пример 1: Средняя мощность
```json
{
  "title": "Средняя мощность 200 Вт",
  "description": "Достичь средней мощности 200 Вт",
  "target_value": 200,
  "unit": "W",
  "goal_type": "avg_power",
  "period": "4w"
}
```

### 10. FTP/VO2max Workouts ⭐

#### Пример 1: Высокоинтенсивные тренировки
```json
{
  "title": "120 минут в высокоинтенсивных зонах",
  "description": "Провести 120 минут в зонах выше 160 уд/мин",
  "target_value": 120,
  "unit": "minutes",
  "goal_type": "ftp_vo2max",
  "period": "4w",
  "hr_threshold": 160,
  "duration_threshold": 120
}
```

#### Пример 2: Настройка порогов
```json
{
  "title": "90 минут в зоне VO2max",
  "description": "Провести 90 минут в зонах выше 170 уд/мин",
  "target_value": 90,
  "unit": "minutes",
  "goal_type": "ftp_vo2max",
  "period": "4w",
  "hr_threshold": 170,
  "duration_threshold": 60
}
```

### 11. Long Rides (Длинные поездки)

#### Пример 1: Количество длинных поездок
```json
{
  "title": "4 длинные поездки за месяц",
  "description": "Совершить 4 поездки длиной более 50 км",
  "target_value": 4,
  "unit": "rides",
  "goal_type": "long_rides",
  "period": "4w"
}
```

### 12. Intervals (Интервальные тренировки)

#### Пример 1: Интервальные тренировки
```json
{
  "title": "6 интервальных тренировок",
  "description": "Провести 6 интервальных тренировок за месяц",
  "target_value": 6,
  "unit": "workouts",
  "goal_type": "intervals",
  "period": "4w"
}
```

### 13. Recovery (Восстановительные поездки)

#### Пример 1: Восстановительные поездки
```json
{
  "title": "8 восстановительных поездок",
  "description": "Провести 8 восстановительных поездок за месяц",
  "target_value": 8,
  "unit": "rides",
  "goal_type": "recovery",
  "period": "4w"
}
```

## Комбинированные цели

### Тренировочный план на месяц

```json
[
  {
    "title": "Проехать 800 км",
    "description": "Общая дистанция за месяц",
    "target_value": 800,
    "unit": "km",
    "goal_type": "distance",
    "period": "4w"
  },
  {
    "title": "Набрать 8000м высоты",
    "description": "Общий набор высоты за месяц",
    "target_value": 8000,
    "unit": "m",
    "goal_type": "elevation",
    "period": "4w"
  },
  {
    "title": "60 часов в седле",
    "description": "Время в движении за месяц",
    "target_value": 60,
    "unit": "hours",
    "goal_type": "time",
    "period": "4w"
  },
  {
    "title": "150 минут в высокоинтенсивных зонах",
    "description": "Время в зонах выше 160 уд/мин",
    "target_value": 150,
    "unit": "minutes",
    "goal_type": "ftp_vo2max",
    "period": "4w",
    "hr_threshold": 160,
    "duration_threshold": 120
  },
  {
    "title": "6 длинных поездок",
    "description": "Поездки более 50 км",
    "target_value": 6,
    "unit": "rides",
    "goal_type": "long_rides",
    "period": "4w"
  },
  {
    "title": "8 интервальных тренировок",
    "description": "Интервальные тренировки",
    "target_value": 8,
    "unit": "workouts",
    "goal_type": "intervals",
    "period": "4w"
  }
]
```

### Годовые цели

```json
[
  {
    "title": "Проехать 8000 км за год",
    "description": "Годовая дистанция",
    "target_value": 8000,
    "unit": "km",
    "goal_type": "distance",
    "period": "year"
  },
  {
    "title": "Набрать 80000м высоты",
    "description": "Годовой набор высоты",
    "target_value": 80000,
    "unit": "m",
    "goal_type": "elevation",
    "period": "year"
  },
  {
    "title": "600 часов в седле",
    "description": "Годовое время в движении",
    "target_value": 600,
    "unit": "hours",
    "goal_type": "time",
    "period": "year"
  },
  {
    "title": "1800 минут в высокоинтенсивных зонах",
    "description": "Годовое время в зонах VO2max",
    "target_value": 1800,
    "unit": "minutes",
    "goal_type": "ftp_vo2max",
    "period": "year",
    "hr_threshold": 160,
    "duration_threshold": 120
  }
]
```

## Специальные настройки

### FTP/VO2max цели

#### Настройка порогового пульса
```json
{
  "title": "Индивидуальные зоны",
  "description": "Настройка под ваши зоны пульса",
  "target_value": 120,
  "unit": "minutes",
  "goal_type": "ftp_vo2max",
  "period": "4w",
  "hr_threshold": 175,        // Ваш пороговый пульс
  "duration_threshold": 90    // Минимальная длительность сегмента
}
```

#### Разные зоны интенсивности
```json
[
  {
    "title": "Зона 4 (160-170 уд/мин)",
    "description": "Темповые тренировки",
    "target_value": 180,
    "unit": "minutes",
    "goal_type": "ftp_vo2max",
    "period": "4w",
    "hr_threshold": 160,
    "duration_threshold": 120
  },
  {
    "title": "Зона 5 (170+ уд/мин)",
    "description": "VO2max тренировки",
    "target_value": 60,
    "unit": "minutes",
    "goal_type": "ftp_vo2max",
    "period": "4w",
    "hr_threshold": 170,
    "duration_threshold": 60
  }
]
```

## Рекомендации по постановке целей

### 1. Реалистичность
- Начинайте с достижимых целей
- Учитывайте ваш текущий уровень подготовки
- Постепенно увеличивайте сложность

### 2. Специфичность
- Ставьте конкретные, измеримые цели
- Указывайте точные значения и единицы измерения
- Определяйте временные рамки

### 3. Баланс
- Комбинируйте разные типы целей
- Включайте восстановительные тренировки
- Не забывайте о технических навыках

### 4. Мониторинг
- Регулярно отслеживайте прогресс
- Корректируйте цели при необходимости
- Анализируйте причины успехов и неудач

## Примеры прогресса

### Месячная цель: 500 км

**Неделя 1**: 120 км (24%)  
**Неделя 2**: 110 км (46%)  
**Неделя 3**: 140 км (74%)  
**Неделя 4**: 130 км (100%) ✅

### FTP/VO2max цель: 120 минут

**Неделя 1**: 25 минут (21%)  
**Неделя 2**: 30 минут (46%)  
**Неделя 3**: 35 минут (75%)  
**Неделя 4**: 30 минут (100%) ✅

## Обработка ошибок

### Отсутствующие данные
```javascript
// Если нет данных о пульсе
if (!activity.average_heartrate) {
  return 0; // Цель не может быть рассчитана
}

// Если нет streams данных для FTP целей
if (goal.goal_type === 'ftp_vo2max' && !streamsData) {
  return 0; // Требуются детальные данные
}
```

### Некорректные значения
```javascript
// Проверка на отрицательные значения
if (target_value < 0) {
  throw new Error('Target value cannot be negative');
}

// Проверка на разумные пределы
if (hr_threshold < 100 || hr_threshold > 200) {
  throw new Error('Heart rate threshold out of reasonable range');
}
```

## Будущие улучшения

1. **Шаблоны целей** - готовые наборы для разных уровней
2. **Адаптивные цели** - автоматическая корректировка на основе прогресса
3. **Групповые цели** - цели для команд и клубов
4. **Сезонные планы** - цели с учетом времени года
5. **Интеграция с календарем** - планирование тренировок 
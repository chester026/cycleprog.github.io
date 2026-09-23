# 🚴‍♂️ CycleProg - Вело-тренировочное приложение

Современное React SPA для анализа велосипедных тренировок, планирования и отслеживания прогресса.

## 🛠 Сборка и запуск — команды и порядок

Монорепо на npm workspaces (`packages/shared`, `server`, `react-spa`); `BikeLabApp` — отдельный пакет со
своим `node_modules`. Всё зависит от `@bikelab/shared`, поэтому **shared собирается первым**, остальное — после.
Требования: Node 22 (`.nvmrc`), npm 10+, для iOS — Xcode + CocoaPods, для тестов сервера — локальный Postgres.

### 1. Первый запуск / после `git pull` с изменениями в `package.json`

```bash
npm install                         # корень: shared + server + react-spa (один lock-файл)
cd BikeLabApp && npm install        # аппка отдельно
cd ios && pod install && cd ../..   # нативные зависимости iOS (Skia, Sentry, datetimepicker…)
```

### 2. Собрать shared (перед сервером, вебом и аппкой)

```bash
npm run build -w packages/shared
```

`server`/`react-spa` делают это сами через `prestart`/`predev`, аппка — через `prestart`/`preios`.
Вручную нужно только после правок в `packages/shared`, если процесс уже запущен.

### 3. Локальная разработка

```bash
# сервер (порт 8080, .env в server/) — с автоперезапуском
npm run dev:server            # = npm -w server run dev

# веб (Vite, http://localhost:5173, проксирует /api на сервер)
npm run dev:web               # = npm -w react-spa run dev

# аппка
cd BikeLabApp
npm start                     # Metro
npm run ios                   # сборка и запуск в симуляторе (другой терминал)
```

Порядок: сервер → веб/аппка. Strava-логин работает только через прод-колбэк (`bikelab.app`), поэтому
локально логинься email/паролем или уже сохранённым токеном.

### 4. Проверка перед коммитом (то же, что гоняет CI)

```bash
# shared
npm -w packages/shared run typecheck && npm -w packages/shared run test:coverage

# server (интеграционные тесты — на реальном Postgres)
npm -w server run lint && npm -w server test
PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres PGSSLMODE=disable \
  CONTRACT_VALIDATE_RESPONSES=1 npm -w server run test:integration
npm -w server run routes          # список маршрутов и статус контракта

# web
npm -w react-spa exec -- eslint . --max-warnings 0
npm -w react-spa test && npm -w react-spa run build
PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres PGSSLMODE=disable npm -w react-spa run test:e2e

# app
cd BikeLabApp && npm run typecheck && npx eslint src --max-warnings 0 && npm test && cd ..

# качество по всему репо
npm run lint:dup                  # jscpd, порог 6 %
npm run lint:deadcode             # knip, пока report-only
```

### 5. Продакшен-сборка (то, что делает Render)

```bash
npm run build     # npm install --include=dev → shared → react-spa/dist
npm run start     # node server/server.js — отдаёт API и собранный веб, миграции применяются при старте
```

Переменные окружения сервера — `server/.env.example`. Обязательные: `PG*` (или `DATABASE_URL`), `JWT_SECRET`
(≥32 символа при `NODE_ENV=production`), `STRAVA_CLIENT_ID/SECRET`, `OPENAI_API_KEY`; пока в сторе старая
сборка аппки — `LEGACY_MOBILE_COMPAT=true`.

### 6. Релиз аппки

```bash
cd BikeLabApp
npm run typecheck && npm test
npm run ios -- --mode Release     # проверка Release-сборки в симуляторе
# затем Xcode: Product → Archive → TestFlight
```

Maestro-флоу (`.maestro/*.yaml`) и Sentry — см. `BikeLabApp/docs/maestro.md` и `BikeLabApp/docs/sentry.md`.

### Разовые операции

```bash
npm -w server run migrate                        # применить миграции вручную (обычно не нужно)
npm -w server run skills:recompute -- --sync     # пересчитать историю скиллов после смены формулы
```

Архитектура и правила — `AGENTS.md`, стиль кода — `CODE_STYLE.md`, план и статус миграции —
`docs/audit/00-AUDIT-AND-PLAN.md`.

## 📋 Содержание

- [Сборка и запуск](#-сборка-и-запуск--команды-и-порядок)
- [Возможности](#возможности)
- [Технологии](#технологии)
- [Установка и запуск](#установка-и-запуск)
- [Структура проекта](#структура-проекта)
- [API](#api)
- [Страницы приложения](#страницы-приложения)

## ✨ Возможности

### 🏠 **Гараж (Главная страница)**
- Интерактивная карта с треком последней поездки
- Статистика поездки (дистанция, скорость, набор высоты)
- Кнопка "Анализировать" с детальным анализом
- Блок погоды (Побережье/Горы) с прогнозом
- Гараж велосипедов с изображениями
- Список поездок с возможностью удаления

### 🏃‍♂️ **Тренировки**
- Фильтрация тренировок по дате, типу, дистанции
- Детальные карточки тренировок с метриками
- Модальные окна с анализом и рекомендациями
- Цветовая индикация пульсовых зон
- Экспорт данных в JSON

### 📊 **Анализ и план**
- Hero блок с ключевыми метриками
- Сетка целей с прогресс-барами:
  - FTP/VO₂max (анализ интервалов)
  - Скорость на равнине/подъёмах
  - Пульсовые зоны
  - Длительные поездки
  - Интервалы и восстановление
- Аналитика по 4-недельным периодам
- Графики прогресса
- Недельный и месячный планы
- План-факт анализ
- Профессиональные рекомендации

### ✅ **Чек-лист**
- Список покупок и задач для подготовки
- Сохранение состояния в localStorage
- Анимации при отметке пунктов
- Адаптивный дизайн

### ⚙️ **Админка**
- Управление поездками (добавление, редактирование, удаление)
- Drag & drop для изменения порядка
- Загрузка изображений в гараж
- Управление позициями изображений

## 🛠 Технологии

### Frontend
- **React 18** - основной фреймворк
- **React Router** - навигация
- **Vite** - сборщик и dev сервер
- **Chart.js** - графики и диаграммы
- **React Leaflet** - интерактивные карты
- **CSS3** - стилизация

### Backend
- **Node.js** - серверная платформа
- **Express** - веб-фреймворк
- **Strava API** - данные тренировок
- **Open-Meteo API** - погодные данные

### Хранение данных
- **JSON файлы** - локальное хранение
- **localStorage** - состояние чек-листа
- **Strava** - тренировочные данные

## 🚀 Установка и запуск

### Предварительные требования
- Node.js 16+ 
- npm или yarn
- Аккаунт Strava (для данных тренировок)

### 1. Клонирование репозитория
```bash
git clone <repository-url>
cd cycleprog.github.io
```

### 2. Установка зависимостей
```bash
# Установка зависимостей для React SPA
cd react-spa
npm install

# Установка зависимостей для сервера
cd ../server
npm install
```

### 3. Настройка API ключей
Создайте файл `server/strava_tokens.json`:
```json
{
  "access_token": "your_strava_access_token",
  "refresh_token": "your_strava_refresh_token",
  "expires_at": 1234567890
}
```

### 4. Запуск приложения

#### Вариант 1: Разработка (рекомендуется)
```bash
# Терминал 1: Запуск сервера
cd server
npm start

# Терминал 2: Запуск React приложения
cd react-spa
npm run dev
```

#### Вариант 2: Продакшн
```bash
# Сборка React приложения
cd react-spa
npm run build

# Запуск сервера (он будет обслуживать статические файлы)
cd ../server
npm start
```

### 5. Открытие приложения
- React dev сервер: http://localhost:5173
- Express сервер: http://localhost:8080

## 📁 Структура проекта

```
cycleprog.github.io/
├── react-spa/                 # React приложение
│   ├── src/
│   │   ├── components/        # React компоненты
│   │   │   ├── Sidebar.jsx
│   │   │   ├── HeroTrackBanner.jsx
│   │   │   ├── WeatherBlock.jsx
│   │   │   ├── BikeGarageBlock.jsx
│   │   │   ├── MyRidesBlock.jsx
│   │   │   └── LastRideBanner.jsx
│   │   ├── pages/            # Страницы приложения
│   │   │   ├── GaragePage.jsx
│   │   │   ├── TrainingsPage.jsx
│   │   │   ├── PlanPage.jsx
│   │   │   ├── ChecklistPage.jsx
│   │   │   └── AdminPage.jsx
│   │   ├── App.jsx           # Главный компонент
│   │   └── main.jsx          # Точка входа
│   ├── public/               # Статические файлы
│   └── package.json
├── server/                   # Express сервер
│   ├── server.js            # Основной файл сервера
│   ├── strava_tokens.json   # Токены Strava
│   └── package.json
├── public/                   # Статические файлы
│   ├── img/                 # Изображения
│   └── (удалены - теперь используется многопользовательская архитектура)
└── README.md
```

## 🔌 API

### Основные эндпоинты

#### Тренировки
- `GET /activities` - список всех тренировок
- `GET /activities/:id` - детали тренировки
- `GET /activities/:id/streams` - данные трека

#### Гараж
- `GET /api/garage/positions` - позиции изображений
- `POST /api/garage/upload` - загрузка изображения
- `DELETE /api/garage/:id` - удаление изображения

#### Поездки
- `GET /api/rides` - список поездок
- `POST /api/rides` - добавление поездки
- `PUT /api/rides/:id` - обновление поездки
- `DELETE /api/rides/:id` - удаление поездки

#### Погода
- Интеграция с Open-Meteo API для прогнозов

## 📱 Страницы приложения

### 🏠 **Главная (Гараж)**
- URL: `/`
- Описание: Главная страница с картой, погодой и гаражом
- Компоненты: HeroTrackBanner, WeatherBlock, BikeGarageBlock, MyRidesBlock

### 🏃‍♂️ **Тренировки**
- URL: `/trainings`
- Описание: Анализ и фильтрация тренировок
- Функции: Фильтры, карточки тренировок, модальные окна

### 📊 **Анализ и план**
- URL: `/plan`
- Описание: Цели, прогресс и рекомендации
- Функции: Сетка целей, графики, планы, рекомендации

### ✅ **Чек-лист**
- URL: `/checklist`
- Описание: Список покупок и задач
- Функции: Отметки, сохранение в localStorage

### ⚙️ **Админка**
- URL: `/admin`
- Описание: Управление данными
- Функции: CRUD операции, загрузка файлов

## 🎨 Дизайн

### Цветовая схема
- Основной синий: `#274DD3`
- Фон: `#f8f8fa`
- Текст: `#333`
- Границы: `#e0e0e0`

### Шрифты
- **Inter** - основной шрифт
- Веса: 400, 600, 700, 800

### Адаптивность
- Мобильные устройства: < 600px
- Планшеты: 600px - 900px
- Десктоп: > 900px

## 🔧 Разработка

### Добавление новой страницы
1. Создайте компонент в `src/pages/`
2. Добавьте маршрут в `App.jsx`
3. Добавьте ссылку в `Sidebar.jsx`

### Добавление нового API эндпоинта
1. Добавьте роут в `server/server.js`
2. Обновите прокси в `vite.config.js` если нужно

### Стилизация
- Используйте CSS модули или инлайн стили
- Следуйте существующей цветовой схеме
- Обеспечьте адаптивность

## 📝 Лицензия

MIT License

## 🤝 Вклад в проект

1. Форкните репозиторий
2. Создайте ветку для новой функции
3. Внесите изменения
4. Создайте Pull Request

---

**Создано с ❤️ для велосипедистов** 
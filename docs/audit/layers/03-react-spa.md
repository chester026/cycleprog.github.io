# Аудит WEB SPA (react-spa) — BikeLab / CycleProg

Дата: 2026-09-15. Объект: `/home/claude/repo/react-spa` (Vite 7, React 19, react-router 7). 25 954 строк JS/JSX (pages 9 716, components 13 029, utils 2 996) + 21 824 строк CSS в 51 файле. Бэкенд для сверки контракта: `/home/claude/repo/server/server.js` (109 роутов).

Примечание к снапшоту: в аудируемой копии отсутствуют все бинарные ассеты (`src/assets/img/**/*.png|webp|jpg|mp4` — 26 файлов, на которые есть import'ы), поэтому `vite build` падает на `LandingPage.jsx` (`Could not resolve "../assets/img/trainings/mostrecomended.png"`). Для анализа бандла ассеты были временно заглушены и удалены после сборки. Оценка размеров/оптимизации картинок по этой копии невозможна; ниже — только структурные замечания по их использованию.

---

## Summary

1. **/admin доступен любому залогиненному пользователю** — ни клиентского gating (`App.jsx:76`), ни серверной проверки роли (`server.js:6860-6915`, только `authMiddleware`): список всех e-mail, удаление любого пользователя, деавторизация Strava. Блокер релиза.
2. **JWT утекает через URL**: сервер отдаёт токен как `?jwt=` (`ExchangeTokenPage.jsx:11-17`), клиент кладёт JWT в `state=` Strava OAuth (`Sidebar.jsx:127`, `OnboardingModal.jsx:304`) — токен попадает в history, referer, логи Strava и прокси.
3. **Половина «фич» молча сломана из-за неверного контракта `apiFetch`**: он возвращает JSON, а код проверяет `response.ok`/`response.json()` (`AdminPage.jsx` ×6, `heroImages.js:17`, `LastRideBanner.jsx:87-94`). Hero-картинки никогда не загружаются, баннер последней поездки в сайдбаре не работает без прогретого кэша, удаление hero-изображений в админке всегда выдаёт ошибку.
4. **Бизнес-логика прогресса целей живёт в браузере и перезаписывает БД**: `goalsCache.js` (689 строк) считает прогресс, тянет `/api/activities/:id/streams` последовательно по каждой активности в localStorage и делает `PUT /api/goals/:id` (`GoalAssistantPage.jsx:180`), хотя сервер уже считает прогресс сам (`server.js:4089-4135`). Три копии формулы мощности (PowerAnalysis, TrainingsPage, goalsCache) + четвёртая на сервере.
5. **~3 000 строк мёртвого кода в репозитории и в бандле**: `PlanPage.jsx` (1 931), `HeroTrackBanner`, `BikeGarageBlock`, `GoalsAnalysis`, `ImageUploadModal`, `OptimizedImage`, `ProgressRing`, `SkillsRadarChart.jsx.bak`, `HRZonesChart.css`, `public/sw.js`; 6 неиспользуемых npm-пакетов (в т.ч. `openai`, `chart.js`, `@dnd-kit/*`, `fontawesome`). ESLint: 196 ошибок, включая 2× `rules-of-hooks` и `no-undef`.

Дополнительно: `manualChunks` заставляет `index.html` `modulepreload`-ить recharts (472 KB) и html2canvas (208 KB) даже на лендинге; 19 отдельных вызовов `/api/user-profile` из разных компонентов; 492 `!important` и 8 определений `.error-message` в глобальном CSS; 260 `console.*`, 42 `alert/confirm`; тестов нет.

---

## Module map

LOC — строки файла. Endpoints — фактические вызовы `apiFetch`/`fetch` (grep). ✗ — модуль не достижим из `main.jsx` (мёртвый).

### Оболочка / auth
| Файл | LOC | Endpoints |
|---|---|---|
| `src/main.jsx`, `src/App.jsx` | 10 / 91 | — (роутинг, lazy pages, `isAuthenticated()` по наличию токена) |
| `components/ProtectedRoute.jsx` | 15 | — (только проверка наличия токена) |
| `components/Sidebar.jsx` | 277 | — (jwt-decode, Strava OAuth URL, logout) |
| `components/LastRideBanner.jsx` | 145 | GET `/api/activities` |
| `contexts/OnboardingContext.jsx` | 112 | GET `/api/user-profile` |
| `components/OnboardingModal.jsx` | 734 | GET/PUT `/api/user-profile`, POST `/api/user-profile/email`, POST `/api/user-profile/onboarding` |
| `pages/LoginPage.jsx` | 154 | POST `/api/login`, POST `/api/resend-verification` |
| `pages/RegisterPage.jsx` | 73 | POST `/api/register` |
| `pages/VerifyEmailPage.jsx` | 94 | GET `/api/verify-email?token=` |
| `pages/ExchangeTokenPage.jsx` | 76 | — (читает `?jwt=`, `?name=`, `?avatar=` в localStorage) |
| `pages/LandingPage.jsx` | 594 (+1 513 CSS) | — |
| `utils/api.js` | 43 | обёртка fetch + Bearer + редирект на 401 |

### Garage (главная)
| Файл | LOC | Endpoints |
|---|---|---|
| `pages/GaragePage.jsx` | 161 | GET `/api/bikes` |
| `utils/garageData.js` | 323 | GET `/api/activities`, `/api/analytics-snapshot/latest`, `/api/analytics-snapshot/history?limit=`, `/api/analytics/summary`, `/api/achievements/me`, `/api/user-profile` |
| `components/GarageLastRideCard.jsx` | 152 | — (react-leaflet) |
| `components/GarageWidgets.jsx`, `GarageAchievements.jsx`, `GarageCalculators.jsx` | 179 / 61 / 401 | — |
| `components/RideAnalysisModal.jsx` | 97 | — |
| `components/MyRidesBlock.jsx` | 146 | GET/DELETE `/api/rides`, `/api/rides/:id` |
| `components/RideAddModal.jsx` | 180 | POST `/api/rides` |
| `components/WeatherBlock.jsx` | 156 | GET `/api/weather/forecast?latitude=34.9333&longitude=32.8667` и `35.1264/33.4299` (Кипр, захардкожено) |
| `components/EventsHero.jsx` / `EventsManager.jsx` | 253 / 340 | GET/POST/PUT/DELETE `/api/events`, `/api/events/:id` |
| ✗ `components/HeroTrackBanner.jsx` | 374 | GET `/api/activities`, `/api/analytics/summary` |
| ✗ `components/BikeGarageBlock.jsx` | 338 | GET `/api/bikes`, `/api/garage/positions` |
| ✗ `components/ImageUploadModal.jsx` | 156 | POST `/api/garage/upload` |

### Goal Assistant
| Файл | LOC | Endpoints |
|---|---|---|
| `pages/GoalAssistantPage.jsx` | 830 | GET `/api/meta-goals`, `/api/activities`, `/api/user-profile`, `/api/goals`; PUT `/api/goals/:id`; POST `/api/meta-goals/ai-generate` |
| `components/MetaGoalRow.jsx` | 170 | GET `/api/goals` (на каждую строку!), PUT `/api/meta-goals/:id` |
| `pages/GoalDetailPage.jsx` | 760 | GET `/api/meta-goals/:id`, `/api/activities`, `/api/user-profile`, `/api/calendar?goal_id=` |
| `components/GoalsManager.jsx` | 618 | GET/PUT/DELETE `/api/goals`, `/api/goals/:id`; GET `/api/user-profile` |
| `components/AddGoalModal.jsx` | 183 | POST `/api/goals` (сырой `fetch`, не `apiFetch`) |
| `components/GoalCard.jsx` | 189 | — |
| `components/WeeklyTrainingCalendar.jsx` | 1 156 | GET `/api/training-plan`, `/api/training-types`, `/api/user-profile`; PUT `/api/user-profile`; POST/DELETE `/api/training-plan/custom[/:dayKey]` |
| `components/TrainingDayModal.jsx`, `TrainingDetailsModal.jsx`, `TrainingLibraryModal.jsx`, `TrainingCard.jsx` | 338 / 433 / 138 / 61 | GET `/api/training-types` (×2) |
| `utils/goalsCache.js` | 689 | GET `/api/activities/:id/streams` (в цикле) |
| `utils/vo2max.js`, `utils/trainingPlans.js` | 53 / 175 | — |
| ✗ `components/GoalsAnalysis.jsx` | 197 | — |

### Analysis
| Файл | LOC | Endpoints |
|---|---|---|
| `pages/AnalysisPage.jsx` | 996 | GET `/api/activities`, `/api/user-profile`, `/api/analytics/summary`, `/api/skills-history/last`, `/api/skills-history/range?limit=2`; POST `/api/analytics-snapshot`, `/api/skills-history`; DELETE `/api/skills-history/cleanup-month` |
| `components/PowerAnalysis.jsx` | 1 300 | GET `/api/user-profile`, `/api/weather/wind?...` (на каждую активность без кэша) |
| `components/SkillsRadarChart.jsx` (+`.bak` 587) | 233 | — |
| `utils/skillsCalculator.js` | 619 | — |
| `components/FTPAnalysis.jsx` | 256 | — |
| `components/HeartRateZonesChart.jsx` | 467 | GET `/api/user-profile` |
| `utils/heartRateZones.js` | 271 | GET `/api/activities/:id/streams` |
| `components/ProgressChart.jsx` | 309 | — |
| HR/Cadence charts ×7 (`AverageHeartRateTrendChart`, `MinMaxHeartRateBarChart`, `HeartRateVsSpeedChart`, `HeartRateVsElevationChart`, `AverageCadenceTrendChart`, `CadenceVsSpeedChart`, `CadenceVsElevationChart`) | 149–180 каждый | — |
| `components/CadenceStandardsAnalysis.jsx` | 307 | — |
| `components/ChartErrorBoundary.jsx` | 50 | — (используется только внутри ProgressChart и HeartRateZonesChart) |
| ✗ `pages/PlanPage.jsx` | 1 931 | GET `/api/activities`, `/api/activities/:id/streams`, `/api/analytics/summary`, `/api/goals`, `/api/user-profile`; PUT `/api/goals/:id`; POST `/api/goals/recalc-vo2max/:id` |

### Activities (Trainings)
| Файл | LOC | Endpoints |
|---|---|---|
| `pages/TrainingsPage.jsx` | 949 | GET `/api/activities`, `/api/analytics/summary?year=`, `/api/analytics/activity/:id`; POST `/api/ai-analysis` |
| `components/AILoadingSpinner.jsx`, `PartnersLogo.jsx` | 44 / 188 | GET `/api/activities/:id` (PartnersLogo, определение бренда устройства) |

### Maintenance / Nutrition / Checklist / Profile
| Файл | LOC | Endpoints |
|---|---|---|
| `pages/MaintenancePage.jsx` | 503 | GET `/api/bikes`, `/api/bikes/:id/health`; POST `/api/bikes/:id/components/:c/reset`; PUT `/api/bikes/:id/labels` |
| `pages/NutritionPage.jsx` (нет в навигации) | 548 | GET `/api/activities`, `/api/analytics/summary`, `/api/user-profile` |
| `components/GpxElevationChart.jsx` | 343 | — (gpxparser, html2canvas) |
| `pages/ChecklistPage.jsx` (нет в навигации) | 440 | GET/POST/PUT/DELETE `/api/checklist[/:id]`, DELETE `/api/checklist/section/:s` |
| `pages/ProfilePage.jsx` | 553 | GET/PUT `/api/user-profile`, POST `/api/unlink_strava` |

### Admin (нет в навигации, доступен по URL)
| Файл | LOC | Endpoints |
|---|---|---|
| `pages/AdminPage.jsx` | 1 054 | GET `/api/strava/tokens`, `/api/hero/images`, `/api/admin/users`, `/api/strava/limits`; POST `/api/strava/tokens`, `/api/strava/limits/refresh`, `/api/hero/upload`, `/api/hero/assign-all`, `/api/admin/users/:id/unlink-strava`; DELETE `/api/hero/positions/:p`, `/api/admin/users/:id` |
| `components/DatabaseMemoryInfo.jsx` | 398 | GET `/api/database/memory`, `/api/database/table-stats`, `/api/database/profiles`; POST `/api/database/clear-cache`, `/api/database/optimize` |
| `components/CacheStatus.jsx` | 227 | — (localStorage) |
| `utils/cacheCheckup.js` | 479 | GET `/api/activities` |

### Кэш / утилиты
`utils/cache.js` (84, localStorage TTL), `utils/cacheConstants.js` (35), `utils/imageCache.jsx` (157, base64 картинок в localStorage), `utils/heroImages.js` (52), `utils/imageProxy.js` (16), ✗ `components/OptimizedImage.jsx` (92), ✗ `components/ProgressRing.jsx` (74).

### Эндпоинты сервера, которые SPA не использует
`/api/coach/*` (AI-чат), `/api/oura/*`, `/api/achievements` (кроме `/me`), `/api/activities/:id/ai-analysis`, `/api/activities/:id/meta-goals-progress`, `/api/goals/:goalId/recommendations`, `/api/goals/update-current`, `/api/training-plan/stats`, `/api/calendar` POST/PUT/DELETE, `/api/rides/import`, `/api/imagekit/config`, `/api/account` DELETE, `/api/bikes/:id/onboarding`, `/api/garage/images` — всё это есть только в мобильном приложении (см. раздел 9).

---

## Findings

Severity: **Critical** — блокер релиза / утечка данных; **High** — сломанная функциональность или системный риск; **Medium** — техдолг, влияющий на скорость/качество; **Low** — гигиена.

### Security

**W-01 · Critical · security — /admin без авторизации по роли**
`src/App.jsx:76` — `<Route path="/admin" element={<AdminPage />} />` внутри `ProtectedRoute`, который проверяет лишь наличие токена (`ProtectedRoute.jsx:4-10`). На сервере `GET /api/admin/users`, `DELETE /api/admin/users/:userId`, `POST .../unlink-strava` защищены только `authMiddleware` (`server/server.js:6860, 6887, 6915`) — никакой проверки `is_admin`. Также `/api/database/*` (`server.js:5944-6135`), `/api/hero/upload` (`1733`), `/api/strava/limits`.
Impact: любой зарегистрированный пользователь, набрав `/admin`, видит e-mail всех пользователей, может удалить любого пользователя со всеми данными, загрузить произвольные hero-картинки, дёргать `VACUUM`/`optimize` БД.
Fix: добавить `is_admin` в users + `requireAdmin` middleware на сервере (первично); на клиенте — `AdminRoute`, читающий роль из JWT/профиля, и не грузить чанк `AdminPage` не-админам.

**W-02 · Critical · security — JWT в URL и в OAuth `state`**
`pages/ExchangeTokenPage.jsx:11-17` — токен приходит как `?jwt=...&name=...&avatar=...` и сохраняется в localStorage. `components/Sidebar.jsx:127` и `components/OnboardingModal.jsx:304` — `...&state=${token}` при редиректе на `strava.com/oauth/authorize`.
Impact: JWT оказывается в истории браузера, `Referer`, логах CDN/прокси и в логах Strava; при живом токене — полный захват аккаунта.
Fix: одноразовый короткоживущий `code` в URL → `POST /api/auth/exchange` → JWT в ответе (лучше httpOnly cookie); в `state` — случайный nonce, сохранённый на сервере вместе с userId.

**W-03 · High · security — токен в localStorage + без expiry-проверки на клиенте**
`utils/api.js:2-5`, `App.jsx:40-42`, `Sidebar.jsx:26-27` (плюс `user_name`, `user_avatar`). Любая XSS = кража токена; логаут не инвалидирует токен. `dangerouslySetInnerHTML`/`innerHTML` в коде нет (проверено grep) — это плюс, но `CachedImage` (`utils/imageCache.jsx:73-116`) хранит аватары как base64 в localStorage по ключу `btoa(url)`, что даёт до сотен КБ бинарных данных в storage.
Fix: httpOnly Secure cookie + CSRF-токен, либо хотя бы память + refresh-token; убрать base64-кэш картинок (браузерный HTTP-кэш делает это лучше).

**W-04 · Medium · security — `openai` в dependencies браузерного приложения**
`package.json:19` — `"openai": "^5.9.2"`. В `src/` ни одного импорта (grep по `openai`/`OpenAI`/`apiKey` — 0 совпадений), ключей в клиенте нет; `.env`/`VITE_*` переменные не используются вовсе (единственное обращение к `import.meta.env` — `Sidebar.jsx:122`). Т.е. ключ **не** утекает, но пакет тянет ~2 МБ в node_modules и создаёт риск, что кто-то «удобно» его подключит.
Fix: `npm rm openai`.

**W-05 · Medium · security — сырой `fetch` мимо `apiFetch`**
`components/AddGoalModal.jsx:53-59` — собственный `fetch('/api/goals', { Authorization: Bearer ... })`, без обработки 401 → при протухшем токене форма покажет «Failed to create goal» вместо редиректа на логин. Единственный обход единого клиента.
Fix: заменить на `apiFetch`.

**W-06 · Low · security — postMessage-обработчики принимают любые данные с того же origin**
`Sidebar.jsx:70-79`, `OnboardingModal.jsx:311-333` — проверяется `event.origin`, но `event.data.token` без валидации сохраняется в localStorage. Приемлемо, но при появлении любого iframe/расширения это канал подмены токена.
Fix: валидировать структуру сообщения и источник (`event.source === popup`).

### Correctness / контракт API

**W-07 · High · correctness — `apiFetch` возвращает JSON, а код читает `response.ok` / `response.json()`**
`utils/api.js:41-42` возвращает `data`. Тем не менее:
- `utils/heroImages.js:16-21` — `if (response.ok) {...}` → **всегда false** → hero-картинки никогда не загружаются, 5-минутный кэш никогда не заполняется, каждая страница делает бесполезный `GET /api/hero/images`. Затрагивает Analysis, Trainings, Nutrition, Checklist.
- `components/LastRideBanner.jsx:85-94` — `if (res.status === 429)`, `if (!res.ok) return;` → баннер последней поездки в сайдбаре **никогда** не загружает данные из сети, работает только если `cycleprog_cache_activities_*` уже заполнен другой страницей.
- `pages/AdminPage.jsx:110-118, 130-136, 150, 177, 959-965, 980-986` — удаление hero-картинки всегда показывает `Error deleting (undefined): ...`, «Delete all» всегда «Error getting image list», сохранение Strava-токенов всегда «Error updating keys», upload → `alert('Error uploading (undefined)')`, хотя запросы на сервере **успешно выполняются**.
Fix: единый тип ответа; все места переписать на `try { const data = await apiFetch(...) } catch`. Добавить в `apiFetch` возврат `{ data, status }` только если реально нужен статус.

**W-08 · High · correctness — прогресс целей считается в браузере и записывается в БД**
`utils/goalsCache.js:278-497` (`calculateGoalProgress`) + `pages/GoalAssistantPage.jsx:140-190` (`PUT /api/goals/:id { current_value }` в цикле по каждой цели) + `components/GoalsManager.jsx:190-215`. Сервер уже вычисляет `current_value` через `goalCalculator` при `GET /api/goals` (`server.js:4089-4135`, комментарий там прямо говорит, что клиентский пересчёт «becomes redundant»).
Impact: два источника истины; клиент с устаревшими данными/другой формулой перетирает серверное значение; N запросов PUT при каждом заходе на страницу; расхождение web vs mobile.
Fix: удалить клиентский расчёт для activity-source целей, доверять `current_value`/`percent` из API; PUT только на явное редактирование пользователем.

**W-09 · High · correctness — `updateGoalsOnActivitiesChange.lastHash` хранится на функции, пересоздаваемой каждый рендер**
`pages/GoalAssistantPage.jsx:79-89` — `isFirstLoad = !updateGoalsOnActivitiesChange.lastHash` всегда `true`, ветка «пропустить hills/flat на первой загрузке» срабатывает всегда, эффект перезапускается при каждом изменении `activities`/`metaGoals.length`.
Fix: `useRef` для hash, либо убрать целиком вместе с W-08.

**W-10 · High · correctness — нарушение rules-of-hooks: `useMemo` после early return**
`components/ProgressChart.jsx:30-39, 65` — `if (!data || data.length === 0) return <...>` перед `useMemo`. ESLint `react-hooks/rules-of-hooks` ×2. Если `data` меняется с пустого на непустой при живом компоненте — React бросает «Rendered more hooks than during the previous render» и страница падает (ErrorBoundary верхнего уровня нет).
Fix: перенести early return после хуков.

**W-11 · High · correctness — `L` не определён**
`components/HeroTrackBanner.jsx:32` — `L.latLngBounds(positions)` без `import L from 'leaflet'` (ESLint `no-undef`). Компонент мёртвый (см. W-20), но если его вернут — ReferenceError.
Fix: удалить файл или добавить импорт.

**W-12 · High · correctness — необработанные reject'ы вешают страницу в состоянии загрузки**
`pages/AnalysisPage.jsx:170-177` — `try { ... } finally {}` без `catch` вокруг `/api/analytics/summary`; при ошибке `loadData()` (вызванный без `.catch`, строка 182) падает до `setPageLoading(false)` → `PageLoadingOverlay` висит навсегда. Аналогично `pages/TrainingsPage.jsx:399-409`. `contexts/OnboardingContext.jsx:57-59` вызывает `checkOnboardingStatus()` без await/catch.
Fix: `catch` с `setError`, единый хук `useQuery`-типа (см. архитектуру).

**W-13 · Medium · correctness — гонки и утечки в эффектах**
- `AnalysisPage.jsx:120-183` — `useEffect` с зависимостью `[selectedPeriod]` перезапускает полную загрузку без abort/`alive`-флага; `selectedPeriod` меняется только внутри FTPAnalysis, но при смене — двойной `POST /api/analytics-snapshot`/skills-history защищён только `useRef`.
- `pages/TrainingsPage.jsx:411-425` — зависимость эффекта `[localStorage.getItem('token')]` (side-effect в deps).
- `components/OnboardingModal.jsx:341-353` — `setInterval` опроса `popup.closed` не очищается при unmount; замыкание на устаревший `currentStep`.
- `components/AdminPage.jsx:11-15` — `Notification` перезапускает таймер при каждом новом `onClose` (нестабильная ссылка) → уведомление может не исчезнуть.
- 34 предупреждения `react-hooks/exhaustive-deps`.
Fix: `AbortController`/`alive`-флаг в каждом async-эффекте, `useCallback` для колбэков, вынос загрузки в хуки.

**W-14 · Medium · correctness — даты и часовые пояса**
- `components/PowerAnalysis.jsx:169, 193-195, 263` — ключ дня `toISOString().split('T')[0]` (UTC), а час — `getHours()` (локальный) → для активностей вечером/ночью погода берётся за другой день; сравнение `activityDateStr >= threeDaysAgoStr` смешивает UTC и локаль.
- `AnalysisPage.jsx:431-446` — самописные ISO-week функции, `getDateOfISOWeek` мутирует `simple`; `WeeklyTrainingCalendar.jsx:196-200` «номер недели» = `floor((now - Jan1)/7d)` — не ISO, ротация «Priority Workouts» сдвигается в разные годы по-разному.
- `pages/TrainingsPage.jsx:70` — `new Date(filters.dateTo + 'T23:59:59')` — локальное время, а `start_date` — UTC.
- Локали: 21× `'ru-RU'` и 5× `'en-US'` в `toLocaleDateString` при англоязычном UI (`AnalysisPage.jsx:545, 567`, `AdminPage.jsx:165`, `ProgressChart.jsx:44-45`).
Fix: одна утилита `formatDate(date, opts)` с локалью из профиля/`navigator.language`; для дневных ключей — локальная дата (`date-fns/format` или `Intl`).

**W-15 · Medium · correctness — `key={index}` в динамических списках**
27 вхождений в 12 файлах (`WeeklyTrainingCalendar.jsx`, `FTPAnalysis.jsx`, `EventsHero.jsx`, `TrainingLibraryModal.jsx`, `CacheStatus.jsx`, `DatabaseMemoryInfo.jsx` и др.). В списках с удалением/сортировкой (события, тренировки) — потеря состояния инпутов и лишние ремаунты.
Fix: использовать `id`.

**W-16 · Medium · correctness — `JSON.parse(localStorage.getItem(...))` и логика по русским строкам**
`utils/cacheCheckup.js:114, 163, 402, 427, 452`, `utils/goalsCache.js:24, 588`, `utils/heartRateZones.js:196`, `AnalysisPage.jsx:592` — парс без проверки `null` (обёрнут в try/catch, но `null` → `data.timestamp` бросает TypeError и удаляет ключ). `cacheCheckup.js:381, 395, 420, 444` — ветвление `rec.action.includes('Загрузить')` по тексту UI-сообщения. Лимит «50 MB» (`cacheCheckup.js:206`) при реальной квоте localStorage 5 MB.
Fix: удалить `cacheCheckup.js` и `CacheStatus.jsx` целиком (см. W-22).

**W-17 · Medium · correctness — `AILoadingSpinner`/`EventsHero` интервалы и `document.body.style.overflow`**
`pages/TrainingsPage.jsx:427-435` — устанавливает `body.overflow = 'hidden'` при открытии AI-модалки; при ошибке/навигации cleanup есть, но другие модалки (`GoalDetailPage`, `WeeklyTrainingCalendar`) управляют overflow независимо — при двух открытых модалках вторая сбрасывает прокрутку первой.
Fix: один `useLockBodyScroll` хук с счётчиком.

### Architecture

**W-18 · High · architecture — localStorage как база данных**
Пять несовместимых кэш-слоёв: `utils/cache.js` (`cycleprog_cache_*`, TTL 30 мин), `goalsCache.js` (`goals_progress_v2_*` + `streams_*` — heartrate-стримы каждой активности, до 50+ ключей по десяткам КБ), `PowerAnalysis.jsx:34-46, 810-818` (`powerAnalysisCache` — весь объект перезаписывается при каждом изменении), `imageCache.jsx` (base64 картинок), `heroImages.js` (in-memory). Логика очистки при `QuotaExceededError` (`goalsCache.js:134-165`) — «удалить всё и попробовать снова». Ключи `streams_*`, `goals_progress_*`, `powerAnalysis*` **не привязаны к userId** → на общем компьютере данные одного пользователя отдаются другому (`activities_*` привязаны, `Sidebar.jsx:107-110` чистит только 4 ключа).
Fix: перенести тяжёлые вычисления (стримы, HR-зоны, мощность) на сервер (частично уже есть: `/api/analytics/*`, `analytics_snapshot`); на клиенте — TanStack Query с `staleTime`, персист в IndexedDB через `persistQueryClient` с ключом, включающим userId; при logout — `queryClient.clear()`.

**W-19 · High · architecture — нет единого data-layer; 19 вызовов `/api/user-profile` из 12 модулей**
Каждый компонент сам делает `apiFetch('/api/user-profile')`: `OnboardingContext`, `AnalysisPage`, `PowerAnalysis`, `HeartRateZonesChart`, `WeeklyTrainingCalendar`, `GoalsManager`, `GoalDetailPage`, `GoalAssistantPage`, `NutritionPage`, `ProfilePage`, `garageData`, `OnboardingModal`. На странице Analysis профиль запрашивается 3 раза, на GoalDetail — 3-4. `/api/activities` — 13 модулей. `components/MetaGoalRow.jsx:22-34` — **каждая** строка мета-цели делает `GET /api/goals` и фильтрует на клиенте (N+1).
Fix: TanStack Query (`useUserProfile()`, `useActivities()`, `useGoals()`), запрос выполняется один раз и раздаётся через кэш; на сервере — `GET /api/goals?meta_goal_id=`.

**W-20 · High · architecture — мёртвый код в репозитории**
Недостижимо из `main.jsx` (построен граф импортов): `pages/PlanPage.jsx` (1 931 — предыдущая версия AnalysisPage, единственный потребитель `RecommendationsCollapsible.css`, `bgvid.mp4`, `rec_banner.jpg`), `components/HeroTrackBanner.jsx` (374), `BikeGarageBlock.jsx` (338), `GoalsAnalysis.jsx` (197), `ImageUploadModal.jsx` (156), `OptimizedImage.jsx` (92), `ProgressRing.jsx` (74) + их CSS (`BikeGarageBlock.css` 314, `GoalsAnalysis.css` 217, `ImageUploadModal.css` 231, `PlanPage.css` 1 182). Не импортируется ни одним файлом: `components/HRZonesChart.css` (107), `components/SkillsRadarChart.jsx.bak` (587). `public/sw.js` — не регистрируется нигде (grep `serviceWorker` = 0), кэширует несуществующие в prod пути `/src/assets/img/...`. `test.txt` («test»), пустая `src/utils/logs/`, пустая `src/hooks/`, пустые `assets/img/{achieve,garage,hero,landing,trainings}` (в снапшоте), `src/assets/react.svg` (0 байт), `public/vite.svg`. `README.md` в `react-spa/` — шаблон Vite; корневой README говорит «React 18», «JSON файлы — локальное хранение».
Итого ≈ 5 700 строк JS/CSS к удалению.
Fix: удалить; включить `eslint-plugin-import/no-unused-modules` или `knip` в CI.

**W-21 · Medium · architecture — гигантские компоненты со смешанной ответственностью**
- `PowerAnalysis.jsx` (1 300): физическая модель (константы, плотность воздуха, Crr, ветер), клиент погоды, localStorage-кэш, статистика, 3 recharts-графика и настройки в одном компоненте; 14 `useState`; ~830 строк логики до `return`.
- `WeeklyTrainingCalendar.jsx` (1 156): 17 `useState`, загрузка плана/профиля/типов, редактор профиля, 3 модалки, ротация «приоритетов», две ветки режима (`mode==='ai-generated'`), 890 строк до JSX.
- `AnalysisPage.jsx` (996): расчёт HR-зон (дубль `HeartRateZonesChart`/`OnboardingModal`/`ProfilePage`), 4-недельные периоды, «plan-fact», управление skills-history (записывает в БД из рендер-эффекта, `648-817`), snapshot-эффекты.
- `AdminPage.jsx` (1 054): 4 вкладки (API/hero/users/cache), собственный `Notification`, import/export JSON — 50 inline `style={{}}`.
- `TrainingsPage.jsx` (949): фильтры (12 полей) + расчёт мощности (дубль) + эвристический «анализ» тренировки с текстами советов (`252-330`) + AI-модалка.
- `GoalAssistantPage.jsx` (830): мета-цели + AI-генерация + клиентский «фильтр релевантности» по списку слов на двух языках (`203-234`) + калькуляторы VO2max и питания.
План декомпозиции — в разделе «Proposed target architecture».

**W-22 · Medium · architecture — «Cache checkup» и Admin-инструменты кэша как продуктовые фичи**
`utils/cacheCheckup.js` (479) + `components/CacheStatus.jsx` (227) + `AnalysisPage.jsx:139-152` (авто-«чек-ап» перед каждой загрузкой страницы, пробегающий весь localStorage и парсящий каждый ключ). Это диагностический инструмент разработчика, включённый в hot path пользовательской страницы.
Fix: удалить; при необходимости — dev-only панель за `import.meta.env.DEV`.

**W-23 · Medium · architecture — CSS: 51 глобальных файла, коллизии классов**
Все `.css` — глобальные, подключаются из lazy-чанков, поэтому порядок применения зависит от того, какие страницы пользователь уже открыл. Дубли определений: `.error-message` — 8 файлов, `.main` — 7, `.loading` — 7, `.form-group` — 6, `.period-info` — 5, `.charts-container` — 4, `.modal-overlay`/`.modal-content` — App.css и GoalDetailPage.css. 492 `!important`. Целые блоки скопированы: `.vomax-calc-*`/`.nutrition-calc-*` присутствуют в 3-4 файлах (GoalAssistantPage.css, NutritionPage.css, GarageCalculators.css, PlanPage.css).
Fix: CSS Modules (`*.module.css`, поддерживается Vite из коробки) или один design-token слой + компонентные стили; общие `Modal`, `ErrorMessage`, `Loader` компоненты.

**W-24 · Medium · architecture — нет ErrorBoundary верхнего уровня, нет 404**
`App.jsx` — `Suspense`, но ни одного `ErrorBoundary` вокруг роутов; `ChartErrorBoundary` используется только внутри двух графиков. Внутренний `<Routes>` без `path="*"` → неизвестный URL под `/` рендерит пустой `main-content` с сайдбаром.
Fix: `react-error-boundary` вокруг `Outlet`, `<Route path="*" element={<NotFound/>}/>`; перейти на `createBrowserRouter` + `errorElement`.

**W-25 · Low · architecture — состояние «залогинен» читается синхронно из storage в 6 местах**
`App.jsx:40`, `ProtectedRoute.jsx:4`, `Sidebar.jsx:33`, `AnalysisPage.jsx:121`, `TrainingsPage.jsx:412`, `cacheCheckup.js:33` и т.д.; `jwtDecode(token)` — в 12 файлах для получения `userId`/`strava_id`. Нет `AuthContext`.
Fix: `AuthProvider` с `{ user, token, isAdmin, login, logout }`, `useAuth()`.

### Duplication

**W-26 · High · duplication — формула мощности в 3 клиентских копиях + сервер**
`components/PowerAnalysis.jsx:106-130, 318-324, 468-508`, `pages/TrainingsPage.jsx:168-250` (упрощённая: вес 75+8 захардкожен), `utils/goalsCache.js:403-464`, плюс `server/server.js:4565-4598` и `BikeLabApp/src/components/PowerAnalysis.tsx`. Разные Crr/учёт ветра → одна и та же поездка показывает разные ватты на Analysis, Activities и в целях.
Fix: единая реализация на сервере (`/api/analytics/activity/:id` уже отдаёт аналитику) или общий пакет `shared/` (сейчас `shared/utils/api.js` — 43 строки, `backend/` пуст).

**W-27 · Medium · duplication — HR-зоны считаются в 5 местах**
`AnalysisPage.jsx:250-303`, `PlanPage.jsx`, `HeartRateZonesChart.jsx`, `OnboardingModal.jsx`, `ProfilePage.jsx` (grep `lactateThreshold * 0.75`/`hrReserve * 0.5`). `utils/heartRateZones.js` существует, но пороги дублируются в компонентах.
Fix: `utils/hrZones.js` → `getUserHRZones(profile)`, одна точка.

**W-28 · Medium · duplication — 5 вариантов построения Strava OAuth URL**
`LoginPage.jsx:9-11` (redirect на `/exchange_token` фронта), `Sidebar.jsx:120-128` (на `bikelab.app/link_strava`, scope `activity:read_all,profile:read_all`), `OnboardingModal.jsx:298-304` (popup, `approval_prompt=force`, scope `read,activity:read_all`), `TrainingsPage.jsx:49-52, 333-336` (scope только `activity:read_all`), `ProfilePage.jsx:193-196`. Разные scope → пользователь, подключивший Strava через Activities, не даст `profile:read_all`, и аватар/имя не придут.
Fix: `utils/strava.js` → `getStravaAuthUrl({ mode: 'login'|'link', popup })`; backend base из `import.meta.env.VITE_API_URL`.

**W-29 · Medium · duplication — boilerplate загрузки данных**
Паттерн «`useState(loading/error/data)` + `useEffect(() => { load() }, [])` + `getUserId()` из JWT + чтение `cycleprog_cache_activities_${userId}` + `apiFetch('/api/activities')` + `cacheUtils.set(..., 30 мин)`» скопирован в `AnalysisPage.jsx:199-224`, `TrainingsPage.jsx:346-373`, `LastRideBanner.jsx:60-100`, `PlanPage.jsx`, `NutritionPage.jsx`, `garageData.js:37-46`, `cacheCheckup.js:380-390`. `getUserId()` объявлена локально в 12 файлах. `formatDate` — 14 локальных копий с разными форматами.
Fix: `useActivities()`, `useUserProfile()`, `utils/format.js`.

**W-30 · Low · duplication — «калькуляторы» VO2max/питания в 3 местах**
`GoalAssistantPage.jsx` (state `vo2maxData`, `input/result`, ~400 строк JSX калькуляторов), `NutritionPage.jsx`, `GarageCalculators.jsx` — одинаковые формы, одинаковый CSS (`.vomax-calc-*`).
Fix: один `Calculators` компонент.

### Performance

**W-31 · High · performance — `manualChunks` заставляет предзагружать recharts и html2canvas на лендинге**
`vite.config.js:9-15` — объектная форма `manualChunks`. Сборка (с заглушками ассетов): `charts` 472 KB (132 KB gz, только recharts — `chart.js` не используется и в бандл не попал), `utils` 208 KB (49 KB gz — html2canvas + jwt-decode + gpxparser), `maps` 162 KB, `router` 51 KB, `vendor` **0 KB** (react/react-dom слились в `index` 244 KB). В `dist/index.html`: `<link rel="modulepreload" href="/assets/charts-*.js">` и `utils-*.js` — т.е. незалогиненный посетитель лендинга качает ~180 KB gz библиотек для графиков и скриншотов. Из-за общего чанка `utils` `jwt-decode` (1 KB) тянет за собой `html2canvas` (200 KB) на **каждую** страницу.
Fix: убрать `manualChunks` целиком (Vite сам разрежет по lazy-роутам) или использовать функцию с `id.includes('node_modules/recharts')`; `html2canvas` и `gpxparser` — динамический `import()` в `GpxElevationChart` по клику.

**W-32 · Medium · performance — тяжёлые вычисления в рендере без мемоизации**
- `AnalysisPage.jsx:605` — `renderPlanFactHero(activities, lastRealIntervals)` вызывается на каждом рендере и внутри дважды сортирует/группирует все активности (`calculatePeriods`); `period` (607) — новый объект каждый рендер.
- `TrainingsPage.jsx:55-81` — `years`, `yearFiltered`, `types`, `filteredActivities` пересчитываются при каждом нажатии клавиши в любом из 12 фильтров (без `useMemo`), при 1 000+ активностей — заметно.
- `PowerAnalysis.jsx:820-830` — эффект с 6 зависимостями запускает `analyzeActivities()` (последовательные запросы погоды с задержкой 100 мс каждый, `223`) при изменении `sortBy`, хотя сортировка не влияет на расчёт.
- `AnalysisPage.jsx` рендерит 12 графиков одновременно на одной странице; каждый график сам итерируется по `activities`.
Fix: `useMemo` для производных, вынести расчёты в воркер/на сервер, виртуализация/ленивый монтаж графиков по `IntersectionObserver`.

**W-33 · Medium · performance — N+1 и последовательные запросы**
`goalsCache.js:92-185` — `for (const act of activities) await apiFetch('/api/activities/:id/streams')` (сотни последовательных запросов при первом входе с FTP-целью); `PowerAnalysis.jsx:659-680` — до 50 последовательных `/api/weather/wind`; `MetaGoalRow.jsx:22-34` — `GET /api/goals` на каждую мета-цель; `GoalAssistantPage.jsx:174-190` — PUT по каждой цели.
Fix: batch-эндпоинты (`/api/activities/streams?ids=`), серверный расчёт, `Promise.all` с лимитом параллелизма.

**W-34 · Low · performance — картинки**
Импортируются 26 бинарных ассетов (в снапшоте отсутствуют, размеры оценить нельзя): `bgvid.mp4` — только из мёртвого `PlanPage`; `mostrecomended.png` и `mostrecomended.webp` — оба варианта; `banner_bg.png` и `banner_bg.webp` — оба. На лендинге (`LandingPage.jsx:272, 330, 423`) 4 скриншота `s1-s4-web.jpg` без `loading="lazy"`/`srcset`. `OptimizedImage.jsx` (компонент с lazy/webp) написан, но не используется.
Fix: `vite-imagetools` или предконвертация в webp/avif, `loading="lazy"` ниже first fold, `<picture>`.

### Dependencies

**W-35 · Medium · dependencies — 6 неиспользуемых пакетов**
По grep импортов в `src/`: `openai`, `chart.js`, `react-chartjs-2`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@fortawesome/fontawesome-svg-core`, `@fortawesome/free-solid-svg-icons`, `@fortawesome/react-fontawesome`, `react-loading-skeleton` — ни одного импорта. `leaflet` импортируется только как `leaflet/dist/leaflet.css` (нужен как peer для react-leaflet — оставить). Используются: recharts (13 файлов), react-leaflet (2), @mapbox/polyline (2), gpxparser (1), html2canvas (1), jwt-decode (13), react-router-dom.
Fix: `npm rm openai chart.js react-chartjs-2 @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @fortawesome/fontawesome-svg-core @fortawesome/free-solid-svg-icons @fortawesome/react-fontawesome react-loading-skeleton`. Две библиотеки графиков по факту нет — только recharts; README упоминает Chart.js ошибочно.

**W-36 · Low · dependencies — версии**
`vite ^7.0.0` (ок), `react ^19.1.0` + `@vitejs/plugin-react ^4.5.2` (для Vite 7 актуален plugin-react 5.x), `eslint-plugin-react-hooks ^5.2.0` (6.x знает React 19 compiler-правила). `recharts ^3.0.2` — major с breaking changes, `SkillsRadarChart.jsx.bak` похоже на остаток миграции. Нет `package-lock.json` в `react-spa/` при `packageManager: pnpm` в корне — несогласованный менеджер пакетов, невоспроизводимая сборка.
Fix: закоммитить lockfile одного менеджера; обновить plugin-react/eslint-plugin-react-hooks.

### Production readiness

**W-37 · High · prod — захардкоженные URL и отсутствие env-конфига**
`Sidebar.jsx:122-124` — `import.meta.env.PROD ? 'https://bikelab.app' : 'http://localhost:8080'`; `OnboardingModal.jsx:299-301` — `window.location.hostname === 'localhost' ? ... : 'https://bikelab.app'`; `index.html:27` — `<link rel="dns-prefetch" href="//localhost:8080">` уходит в production; Strava `client_id=165560` в 5 местах; координаты Кипра в `WeatherBlock.jsx` и `PowerAnalysis.jsx:217-218`. Ни одного `VITE_*`. Staging-окружение невозможно без правки кода.
Fix: `.env.[mode]` с `VITE_API_URL`, `VITE_STRAVA_CLIENT_ID`; `utils/config.js`.

**W-38 · Medium · prod — lint красный, тестов нет, CI отсутствует**
`npx eslint .` → **231 проблема (196 errors, 35 warnings)**: `no-unused-vars` 150, `exhaustive-deps` 34, `no-case-declarations` 33 (`goalsCache.js:311-489`), `no-empty` 8, `rules-of-hooks` 2, `no-undef` 1, `only-export-components` 2. `package.json` — только `dev/build/lint/preview`, ни одного теста (Vitest/RTL/Playwright), ни `typecheck`. Нет `.github/`/CI-конфига в репозитории.
Fix: `lint` в CI как обязательный шаг, `vitest` для `utils/*` (чистые функции — идеальные кандидаты), Playwright smoke на login → garage → analysis.

**W-39 · Medium · prod — 260 `console.*` и 42 `alert/confirm` в production**
`console.log` с эмодзи и данными пользователя (`AnalysisPage.jsx:743-753` печатает ID активностей; `AddGoalModal.jsx:50` — все данные цели; `OnboardingContext.jsx:25-27`). `window.confirm`/`alert` для удаления (`AdminPage.jsx:107, 126, 190, 202, 226`, `ChecklistPage.jsx:99, 114, 125`, `MyRidesBlock.jsx:38`, `EventsManager.jsx:146`) — блокируют UI, не стилизуются, ломают e2e.
Fix: `esbuild.drop: ['console','debugger']` в `vite.config.js` для prod + логгер с уровнями; общий `ConfirmDialog`/toast.

**W-40 · Medium · prod — SEO/мета лендинга**
`index.html` — только `<title>Bike Lab</title>`; нет `<meta name="description">`, Open Graph, Twitter card, canonical, favicon кроме `vite.svg`, `manifest.json`, `theme-color`. `<html lang="en">`, но часть UI на русском: `ExchangeTokenPage.jsx:68` «Обработка авторизации Strava...», `AdminPage.jsx:202-246` (confirm-диалоги), `ProgressChart.jsx:32` «Нет данных для отображения», `CacheStatus.jsx`. Три `<link rel="preload" as="style" onload=...>` шрифтов Google без `font-display` контроля (Material Symbols — ~200 KB).
Fix: мета-теги в `index.html` (лендинг статичен — достаточно), `react-helmet-async` для страниц; i18n или хотя бы единый язык; self-host шрифтов с subset.

**W-41 · Low · prod — доступность**
31 `<div onClick>` без `role`/`tabIndex`/`onKeyDown` (`MetaGoalRow.jsx:104`, `Sidebar.jsx:220-224`, `ChecklistPage`), 11 `aria-*` на 26k строк, 1 `role=`. 95 `<label>`, из них 30 с `htmlFor`. Иконки-кнопки без текста (`Sidebar.jsx:258-272` — logout только иконка, без `aria-label`). Модалки без focus-trap/`aria-modal`/Escape.
Fix: `eslint-plugin-jsx-a11y`, `<button>` вместо кликабельных div, Radix/Headless UI для модалок.

**W-42 · Low · prod — `mobile-redirect.html`, AASA и `sw.js` в `public/`**
`public/.well-known/apple-app-site-association` дублирует серверные роуты `server.js:502-508` (два источника истины для Universal Links; в статике `apps: []` и пути `/auth*`). `public/sw.js` не регистрируется; если когда-то был зарегистрирован у пользователей — старый SW продолжает перехватывать fetch и отдавать `/` из кэша `bike-lab-v2` навсегда.
Fix: удалить `sw.js` и заменить на self-unregistering SW на один релиз; AASA — только с сервера.

### Relation to mobile

**W-43 · Info · product — расхождение экранов web ↔ mobile (BikeLabApp/src/screens)**
Только в web: `LandingPage`, `RegisterPage`/`VerifyEmailPage` (email/пароль; mobile — `LoginScreen` + Apple/Strava), `ChecklistPage` (нет в навигации), `NutritionPage` (нет в навигации, дублирует калькуляторы), `AdminPage`, `MaintenancePage` (портирован из `BikeGarageScreen`/health, комментарии `MaintenancePage.jsx:3-4`), `EventsHero/EventsManager` (события — `/api/events` мобильное не вызывает), `MyRidesBlock/RideAddModal` (`/api/rides` — legacy JSON-эпоха), `WeatherBlock` (Кипр).
Только в mobile: `CoachChatScreen` (`/api/coach/*` — web не использует; в web только «AI generate goal»), `CalendarScreen` (полный календарь; web — только `WeeklyTrainingCalendar` внутри GoalDetail), `AchievementsScreen` (web — 6 бейджей в Garage), `HRZonesScreen`, `RideAnalyticsScreen`, `AppleHealthScreen`, `OuraIntegrationScreen`, `StravaIntegrationScreen`, `TrainingSettingsScreen`/`PersonalInfoScreen`/`AccountSettingsScreen` (web — вкладки `ProfilePage`), `OnboardingScreen` (web — `OnboardingModal`), ShareStudio, KnowledgeCenter.
Общие: Garage, GoalAssistant, GoalDetails, Analysis (Power/FTP/Skills/HR/Cadence — компоненты одинаковых имён `PowerAnalysis`, `FTPAnalysis`, `SkillsRadarChart`, `ProgressChart`, `TrainingCard`, `TrainingLibraryModal`, `WeatherBlock`, `BlobOrb` — но написаны отдельно на JS и TS), Activities, Profile, Login.
Кандидаты в legacy для решения владельца продукта: Checklist, Nutrition, Rides (ручные поездки), Events, Admin (перенести в отдельный internal tool), WeatherBlock с координатами Кипра, `PlanPage`.

**W-44 · Info · product — web пишет в те же таблицы историй, что и mobile, по своей логике**
`AnalysisPage.jsx:79-95` (`POST /api/analytics-snapshot`) и `648-817` (`POST /api/skills-history`, `DELETE /api/skills-history/cleanup-month` — **удаление истории из клиентского эффекта 1-го числа месяца**). Комментарии в коде описывают уже случившиеся баги (дубли снапшотов, BIGINT-как-строка). Два клиента с разными версиями формул пишут в одну историю навыков.
Fix: снапшоты и skills-history должны создаваться сервером (cron/после синка Strava), клиенты — только читать.

---

## Proposed target architecture

```
src/
  app/            App.jsx (createBrowserRouter, ErrorBoundary, Providers), routes.jsx
  config/         env.js  (VITE_API_URL, VITE_STRAVA_CLIENT_ID)
  api/            client.js (fetch + auth + typed errors), endpoints/*.js (activities, goals, profile, bikes, admin…)
  auth/           AuthProvider.jsx, useAuth(), AdminRoute.jsx, strava.js (единый OAuth URL)
  queries/        TanStack Query hooks: useActivities, useUserProfile, useGoals, useMetaGoal(id), useBikes…
  features/
    garage/       GaragePage + widgets
    goals/        GoalAssistantPage, GoalDetailPage, MetaGoalRow, GoalsManager, calendar/ (WeeklyTrainingCalendar → PlanHeader, DayGrid, PriorityWorkouts, ProfileSettingsForm, modals)
    analysis/     AnalysisPage (композиция) + power/ (PowerSettings, PowerChart, PowerStats, usePowerModel), hr/, cadence/, skills/
    activities/   TrainingsPage → ActivityFilters, ActivityList, ActivityDetailsModal, AIAnalysisModal
    maintenance/, profile/, auth-pages/, landing/, admin/ (lazy, только для isAdmin)
  ui/             Modal, ConfirmDialog, Toast, ErrorMessage, Loader, Button — с *.module.css
  lib/            format.js (даты/единицы, одна локаль), hrZones.js, power.js (или удалить — считает сервер), iso-week.js
  styles/         tokens.css, reset.css
```

Принципы: (1) серверный источник истины для всех производных метрик (прогресс целей, мощность, HR-зоны, снапшоты) — SPA только отображает; (2) один `api/client.js`, весь доступ к данным через query-хуки, никакого `localStorage` для данных; (3) `AuthProvider` — единственное место, знающее про токен; (4) CSS Modules или единый токен-слой; (5) lint+typecheck+vitest в CI; постепенный переход на TypeScript (`allowJs`), начиная с `api/` и `lib/`, чтобы делить типы с `BikeLabApp` через `shared/`.

### Порядок миграции (инкрементально, каждый шаг деплоится отдельно)

1. **Неделя 0 — стоп-кран (Critical):** серверный `requireAdmin` + `AdminRoute`; JWT из URL → одноразовый code; nonce в OAuth `state`. Удалить `openai` и прочие неиспользуемые пакеты. Удалить мёртвые файлы (W-20). Починить W-07 (`response.ok`) — 3 файла.
2. **Неделя 1 — фундамент:** `config/env.js`, `AuthProvider`, `api/client.js` (тот же `apiFetch`, но с `AbortSignal` и типизированными ошибками), ErrorBoundary + 404, убрать `manualChunks`, `esbuild.drop console`. ESLint в CI (сначала `--max-warnings` на текущем уровне, затем вниз).
3. **Неделя 2 — data layer:** TanStack Query; `useActivities/useUserProfile/useGoals`; заменить все прямые `apiFetch` в компонентах; выкинуть `cache.js`, `cacheCheckup.js`, `CacheStatus`, `imageCache.jsx`, `heroImages.js` → query-хуки. Logout = `queryClient.clear()`.
4. **Неделя 3 — цели:** убрать клиентский расчёт прогресса (`goalsCache.js`, PUT в `GoalAssistantPage`, `GoalsManager`), доверять `current_value/percent` из API; серверный `GET /api/goals?meta_goal_id=`; разбить `WeeklyTrainingCalendar`.
5. **Неделя 4 — analysis:** снапшоты/skills-history переезжают на сервер; `PowerAnalysis` → `usePowerModel` + 3 презентационных компонента (или использовать `/api/analytics/*`); `AnalysisPage` — композиция с ленивой подгрузкой графиков; единые `hrZones.js`, `format.js`.
6. **Неделя 5 — UI-гигиена:** CSS Modules по фичам (начать с новых/переписанных), общие `Modal/Confirm/Toast`, a11y-линт, SEO-мета лендинга, i18n-выравнивание языка.
7. **Далее:** TypeScript постепенно; продуктовое решение по legacy-страницам (W-43); общий `shared/` пакет с mobile для типов и формул.

---

## Quick wins (≤ 1 дня каждый)

1. `npm rm openai chart.js react-chartjs-2 @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @fortawesome/* react-loading-skeleton` — минус ~10 пакетов, README перестаёт врать про Chart.js.
2. Удалить `PlanPage.jsx/.css`, `HeroTrackBanner`, `BikeGarageBlock`, `GoalsAnalysis`, `ImageUploadModal`, `OptimizedImage`, `ProgressRing`, `SkillsRadarChart.jsx.bak`, `HRZonesChart.css`, `RecommendationsCollapsible.css`, `public/sw.js`, `test.txt`, `utils/logs/`, `hooks/` (пустая) — ≈5 700 строк.
3. Починить `response.ok` в `heroImages.js`, `LastRideBanner.jsx`, `AdminPage.jsx` (6 мест) — hero-картинки и баннер последней поездки заработают.
4. Убрать `manualChunks` из `vite.config.js` — лендинг перестанет предзагружать 180 KB gz графиков и html2canvas.
5. `dns-prefetch localhost:8080` из `index.html` — удалить; добавить `<meta name="description">`, OG-теги, favicon.
6. `esbuild: { drop: ['console', 'debugger'] }` для prod-сборки.
7. `useMemo` для `filteredActivities/years/types` в `TrainingsPage.jsx:55-81` и для `renderPlanFactHero` в `AnalysisPage.jsx:605`.
8. Перенести `useMemo` над early return в `ProgressChart.jsx:30-39` (rules-of-hooks).
9. Один `utils/strava.js` для OAuth URL + `VITE_API_URL`/`VITE_STRAVA_CLIENT_ID` в `.env`.
10. Добавить `catch` в `AnalysisPage.jsx:170-177` и `TrainingsPage.jsx:399-409`, чтобы оверлей загрузки не висел вечно.
11. Закоммитить lockfile (`pnpm-lock.yaml` или `package-lock.json`) и сделать `npm run lint` обязательным в CI.
12. `MetaGoalRow`: получать `goals` пропом от родителя (уже загружены в `GoalAssistantPage`) вместо `GET /api/goals` на каждую строку.

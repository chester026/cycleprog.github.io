# BikeLab Mobile App — аудит кода (React Native 0.83 / React 19 / TS)

Объём: `src/` ≈ 33.2k строк (из них ≈ 9.7k — блоки `StyleSheet.create`), `App.tsx` 431 строка. 20 экранов, ~70 компонентов, 1 контекст, 3 хука, 10 утилит. Нативные папки, бинарные ассеты и `node_modules` в копии для аудита отсутствуют — всё, что зависит от них (Info.plist, entitlements, `ScreenshotDetect` native module, наличие `require()`-картинок), не проверялось.

---

## Summary

Приложение работоспособно как MVP, но архитектурно это «один большой экран на файл»: нет слоя данных (каждый экран сам делает `apiFetch` + `useState` loading/error + свой AsyncStorage-кеш), нет типов API-ответов (112 `any`), нет темы (186 hex-цветов, 83 `StyleSheet.create`), нет ErrorBoundary/crash-reporting, 280 `console.log` уходят в prod. Главные риски перед массовым запуском:

1. **Auth/аккаунты (Critical):** «Привязать Strava» в профиле идёт через login-flow `/exchange_token`, а не `/link_strava` → email-пользователь логинится в *другой* (Strava-созданный) аккаунт (A-01). При sign-out не очищается in-memory состояние (`AppDataContext.clearAll` и `clearSnapshotCache` не вызываются) → активности/профиль предыдущего пользователя видны следующему (A-02). JWT живёт 7 дней без refresh → раз в неделю всех выбрасывает с алертом на старте (A-05).
2. **Краши без страховки (High):** нет ни одного ErrorBoundary; в `PowerAnalysis` `{count && count > 0 && (...)}` рендерит `0` как текст вне `<Text>` → инвариант RN и падение вкладки Analysis у пользователей без power-meter/wind-данных (A-03). Полные Strava-streams складываются в AsyncStorage (сотни КБ на заезд, на Android лимит 6 МБ) (A-04).
3. **Неверные расчёты (High):** `AnalysisScreen` читает поля профиля `max_heart_rate/lthr/max_heartrate/resting_heartrate`, которых в API нет (канон: `max_hr/resting_hr/lactate_threshold`) → HR-зоны/VO2max всегда считаются по дефолтам 190/60 (A-06). Snapshot навыков сохраняется до завершения PowerAnalysis → `power` = 0/устаревший (A-07).
4. **Deep-link/навигация:** `firedInitialPromptRef` никогда не сбрасывается → второй «Discuss with Coach»/«Ask coach» на живом табе игнорируется (A-08); после email-логина не проверяется onboarding (A-09).
5. **Prod-готовность/Store:** захардкоженный LAN IP в `__DEV__`, prod-URL прокси картинок захардкожен вне конфига, `debug: true` в SSE, токен в AsyncStorage (не Keychain), в логах — токен/e-mail/профиль, единственный тест не запустится, нет CI/lint-gate, нет версии в `app.json`, отсутствует Sign in with Apple при наличии стороннего OAuth (Guideline 4.8) (A-10…A-16). Дубликаты зависимостей: 5 неиспользуемых пакетов, Skia ради одного шейдера.

---

## Module map

LOC — строки файла целиком. Endpoints — фактические вызовы `apiFetch`/`fetch`/`EventSource` (grep по `src/`, шаблоны `${id}` заменены на `:id`).

### Bootstrap / навигация
| Файл | LOC | Endpoints |
|---|---|---|
| `App.tsx` (root stack + 4 nested stacks + tabs, deep-link handler, session-expired alert, ProfileIcon) | 431 | `GET /api/user-profile` ×3 (init, deep link, tab icon) |
| `index.js` | 12 | — |
| `src/constants/tabBar.ts` | 15 | — |
| `src/i18n/{i18n.ts,en.json,ru.json,dateLocale.ts}` | 48 + 958 ключей ×2 | — |

### Shared data / infra
| Файл | LOC | Endpoints / хранение |
|---|---|---|
| `utils/api.ts` (apiFetch, TokenStorage, API_BASE_URL) | 93 | AsyncStorage `token`/`sessionToken` |
| `contexts/AppDataContext.tsx` (activities + userProfile, TTL 1h/30m) | 129 | `GET /api/activities`, `GET /api/user-profile`; AsyncStorage `activities_cache` |
| `utils/cache.ts` (generic TTL cache) | 119 | AsyncStorage `bikelab_cache_*` |
| `utils/streamsCache.ts` | 237 | `GET /api/activities/:id/streams`; AsyncStorage `bikelab_cache_streams_:id` |
| `utils/goalsCache.ts` (типы Goal/MetaGoal + legacy калькулятор, по комментарию — не на критическом пути) | 301 | AsyncStorage `goals_progress_v2_*` |
| `utils/analyticsSnapshot.ts` | 112 | `GET /api/analytics-snapshot/latest`, `GET /api/analytics-snapshot/history?limit=:n` |
| `utils/healthService.ts` (HealthKit) | 407 | AsyncStorage `bikelab_health_cache_v1` |
| `utils/calendarSync.ts` (EventKit) | 130 | `PUT /api/calendar/:id` |
| `utils/coachSSE.ts` | 175 | `POST /api/coach/chat` (SSE) |
| `utils/skillsCalculator.ts` | 684 | — (вызывается только из `SkillsRadarChart`) |
| `utils/ftpAnalysis.ts` | 178 | через streamsCache |
| `hooks/useCoachChat.ts` | 318 | `GET /api/coach/conversations`, `GET/DELETE /api/coach/conversations/:id` |
| `hooks/useHealthData.ts` | 117 | HealthKit |
| `hooks/useChartOverlay.tsx` | 77 | — |
| `types/activity.ts`, `types/coach.ts` | 27 / 101 | — |

### Feature: Auth / Onboarding
| Файл | LOC | Endpoints |
|---|---|---|
| `screens/LoginScreen.tsx` | 338 | `POST /api/login`, `GET /api/user-profile`; Strava OAuth (`Linking.openURL`) |
| `screens/OnboardingScreen.tsx` | 734 | `POST /api/user-profile/onboarding` ×2 |
| `components/SplashLoader.tsx` | 72 | — |

### Feature: Garage (home)
| Файл | LOC | Endpoints |
|---|---|---|
| `screens/GarageScreen.tsx` | 1725 | `GET /api/achievements/me`, `GET /api/bikes`, `GET /api/garage/positions` ×2, streams, snapshot latest/history; AsyncStorage `bikes_cache`, `garage_images_cache`; hardcoded `https://bikelab.app/api/proxy/strava-image` |
| `screens/BikeGarageScreen.tsx` | 740 | `GET /api/bikes`, `GET /api/bikes/:id/health`, `POST /api/bikes/:id/components/:c/reset`, `PUT /api/bikes/:id/labels` |
| `components/BikeOnboarding.tsx` | 256 | `POST /api/bikes/:id/onboarding` |
| `components/BikesWidget.tsx` | 146 | — |
| `components/BikesModal.tsx` **(не используется)** | 207 | — |
| `components/BestAvgSpeedWidget.tsx` | 243 | — |
| `components/PlannedRidesWidget.tsx` | 255 | `GET /api/calendar?type=planned_ride` |
| `components/VO2maxWidget.tsx` | 312 | — |
| `components/WeatherBlock.tsx` | 305 | `GET /api/weather/forecast?…` ×2 (координаты Кипра захардкожены); AsyncStorage |
| `components/ImageUploadModal.tsx` | 398 | raw `fetch POST /api/garage/upload` |
| `components/TrendBadge.tsx` | 35 | — |
| `components/ShareStudio/*` (Modal 616, 6 шаблонов 1742, 5 BackgroundPicker'ов 946, types, useScreenshotListener) | ≈3 400 | — (ViewShot, Share, CameraRoll, NativeModules.ScreenshotDetect) |

### Feature: Activities / Ride analytics
| Файл | LOC | Endpoints |
|---|---|---|
| `screens/ActivitiesScreen.tsx` | 395 | через AppDataContext |
| `screens/RideAnalyticsScreen.tsx` (root stack) | 960 | `GET /api/activities/:id/meta-goals-progress` ×2, streams, `GET /api/coach/conversations/by-activity/:id`; Cache `ride_meta_goals_:id` |
| `components/ActivityCard.tsx`, `ActivityDetailsModal.tsx`, `StatsCard.tsx`, `VideoHeaderWithStats.tsx`, `TrainingCard.tsx` | 156/369/110/154/242 | — |
| `components/AIAnalysisModal.tsx` | 215 | `GET /api/activities/:id/ai-analysis` |

### Feature: Analysis tab
| Файл | LOC | Endpoints |
|---|---|---|
| `screens/AnalysisScreen.tsx` | 1111 | `GET /api/skills-history/last`, `POST /api/skills-history`, `GET /api/skills-history/range?limit=2`, `POST /api/analytics-snapshot`, snapshot history |
| `components/PowerAnalysis.tsx` | 1131 | `GET /api/user-profile` (свой!), `GET /api/weather/wind?…` до 50 раз; AsyncStorage `powerAnalysis_windCache`, `powerAnalysis_powerCache` |
| `components/HeartAnalysis.tsx` | 850 | — |
| `components/SpeedAnalysis.tsx` | 670 | — |
| `components/CadenceAnalysis.tsx` | 572 | — |
| `components/FTPAnalysis.tsx` | 565 | streams (preload до 28 дней); Cache `ftp_analysis_result` |
| `components/SkillsRadarChart.tsx` | 509 | — |
| `components/ProgressChart.tsx` | 473 | — |
| `components/KnowledgeCenter/*` | 269 + 122 | — |

### Feature: Coach / Goals
| Файл | LOC | Endpoints |
|---|---|---|
| `screens/CoachChatScreen.tsx` | 863 | `GET /api/bikes` (warm-up) + useCoachChat |
| `screens/GoalDetailsScreen.tsx` | 1391 | `GET /api/meta-goals/:id`, `PUT/DELETE /api/meta-goals/:id`, `GET /api/training-types`, `GET /api/calendar?goal_id=:id` |
| `screens/GoalAssistantScreen.tsx` **(не в навигаторе — мёртвый код)** | 669 | `GET /api/meta-goals`, `POST /api/meta-goals/ai-generate` |
| `components/MetaGoalCard.tsx` | 261 | `GET /api/goals` (на каждую карточку!) |
| `components/coach/GoalsPanel.tsx` | 164 | `GET /api/meta-goals` |
| `components/coach/*` (18 файлов: ChatMessageBubble 389, ActivityPickerModal 276, OvertrainingTrendCard 271, ChatInput 201, RecoveryCard 179, CoachCardChrome 171, …) | ≈2 700 | — |
| `components/TrainingDetailsModal.tsx`, `TrainingLibraryModal.tsx` | 274 / 233 | `GET /api/training-types` |

### Feature: Calendar
| Файл | LOC | Endpoints |
|---|---|---|
| `screens/CalendarScreen.tsx` | 1312 | `GET /api/calendar?from&to`, `PUT/DELETE /api/calendar/:id` |

### Feature: Profile / Settings / Integrations
| Файл | LOC | Endpoints |
|---|---|---|
| `screens/ProfileScreen.tsx` | 500 | `GET /api/user-profile`, `DELETE /api/account` |
| `screens/PersonalInfoScreen.tsx` | 231 | `GET/PUT /api/user-profile` |
| `screens/AccountSettingsScreen.tsx` | 153 | `GET/PUT /api/user-profile` |
| `screens/HRZonesScreen.tsx` | 334 | `GET/PUT /api/user-profile` |
| `screens/TrainingSettingsScreen.tsx` | 214 | `GET/PUT /api/user-profile` |
| `screens/StravaIntegrationScreen.tsx` | 242 | `GET /api/user-profile`, `POST /api/unlink_strava`; Strava OAuth |
| `screens/AppleHealthScreen.tsx` | 240 | HealthKit |
| `screens/OuraIntegrationScreen.tsx` | 344 | `GET /api/oura/status`, `GET /api/oura/connect-state`, `POST /api/oura/sync`, `POST /api/oura/unlink` |
| `screens/AchievementsScreen.tsx` | 569 | `GET /api/achievements/me`, `POST /api/achievements/evaluate` ×2 |
| `components/achievements/*` | ≈560 | — |

Итого приложение использует 44 уникальных endpoint'а из 109 на сервере; все они существуют (проверено по `server.js` и `routes/{oura,skillsHistory}.js`). `GET /api/user-profile` вызывается из 13 мест минуя контекст.

---

## Findings

Формат: **ID · Severity · Category** — где / что / почему / как починить.

### Critical

**A-01 · Critical · auth/correctness — «Link Strava» логинит в другой аккаунт.**
`src/screens/StravaIntegrationScreen.tsx:46-49` использует `redirectUri = 'https://bikelab.app/exchange_token?mobile=true'` без `state`. На сервере `/exchange_token` (`server.js:537-640`) — это *login*-flow: находит/создаёт `users` по `strava_id` и выдаёт новый JWT; для привязки к существующему аккаунту есть отдельный `GET /link_strava?code&state=<JWT>` (`server.js:5715`). Deep link `bikelab://auth?token=…` затем обрабатывается в `App.tsx:308-350` как логин: токен перезаписывается, навигация сбрасывается на Main. Итог: email-пользователь после «Привязать Strava» оказывается в новом пустом аккаунте, а его данные остаются в старом.
Фикс: в `StravaIntegrationScreen` использовать `redirect_uri=https://bikelab.app/link_strava` + `state=<текущий JWT>` (или серверный одноразовый state), обрабатывать возврат отдельной схемой `bikelab://strava-linked` и не трогать токен.

**A-02 · Critical · security/correctness — данные предыдущего пользователя переживают sign-out.**
`ProfileScreen.tsx:135-146` при выходе делает `TokenStorage.removeToken()` + `AsyncStorage.clear()`, но in-memory состояние не сбрасывается: `AppDataContext.clearAll` (`contexts/AppDataContext.tsx:116-123`) не вызывается ни в одном файле, module-level `memoryCache` в `utils/analyticsSnapshot.ts:28` (`clearSnapshotCache` также нигде не вызывается), состояние PowerAnalysis-кешей и т.д. TTL активностей — 1 час (`ACTIVITIES_TTL`). Следующий залогинившийся пользователь на этом устройстве в течение часа видит чужие активности/профиль во всех экранах, идущих через `useAppData()` (11 мест). Тот же путь — при 401 в `api.ts:47-63`.
Фикс: единый `logout()` в auth-слое: очистка токена, `clearAll()`, `clearSnapshotCache()`, сброс QueryClient (см. целевую архитектуру), затем `resetToLogin()`.

**A-03 · Critical · crash — рендер числа `0` вне `<Text>` в PowerAnalysis.**
`src/components/PowerAnalysis.tsx:651` и `:657`:
```tsx
{stats.activitiesWithWindData && stats.activitiesWithWindData > 0 && (<View …/>)}
{stats.activitiesWithRealPower && stats.activitiesWithRealPower > 0 && (<View …/>)}
```
Когда счётчик равен `0`, выражение вычисляется в `0`, который React Native пытается отрендерить как текстовый узел внутри `ScrollView` → инвариант «Text strings must be rendered within a <Text> component» → падение всего дерева. ErrorBoundary в приложении нет ни одного (grep `ErrorBoundary|componentDidCatch` пуст) → белый экран/крэш вкладки Analysis у любого пользователя без power-meter (`activitiesWithRealPower === 0`) или при недоступном wind-API. Аналогичный паттерн `{x && x > 0 && …}` есть в `TrainingDetailsModal.tsx:105-157`, но там `x` — массив/undefined (безопасно).
Фикс: `{stats.activitiesWithWindData > 0 && …}` / `!!x &&`. Добавить ESLint-правило `react/jsx-no-leaked-render`. Обернуть каждый tab-навигатор в ErrorBoundary с fallback «Что-то пошло не так — повторить».

**A-04 · Critical (Android) / High (iOS) · storage — полные stream-массивы в AsyncStorage.**
`utils/streamsCache.ts:60-88` кладёт весь ответ `/api/activities/:id/streams` (heartrate, cadence, watts, altitude, velocity_smooth, time — посекундные массивы) в AsyncStorage на 7 дней; `preloadStreamsForPeriod` (`:120-176`) грузит все заезды за 28 дней, `GarageScreen.tsx:409` и `RideAnalyticsScreen.tsx:74` — ещё по одному. 3-часовой заезд ≈ 10 800 точек × 6 полей ≈ 300-500 КБ JSON. 15-20 заездов превышают дефолтный лимит AsyncStorage на Android (6 МБ) → `SQLiteFullException`/тихий отказ кеша, а `Cache.get` + `JSON.parse` мегабайтных строк на JS-потоке даёт заметные фризы на iOS. `cleanupOldStreams` (`AnalysisScreen.tsx:124`) при каждом открытии Analysis полностью читает и парсит каждый stream ради проверки timestamp.
Фикс: хранить streams в файловой системе (`react-native-fs`/`expo-file-system`) или MMKV; кешировать только даунсэмпл (≤ 400 точек) для графиков; агрегаты FTP считать на сервере (там уже есть `analytics/activity/:id`).

### High

**A-05 · High · auth — нет refresh токена; 401 → алерт и вылет каждые 7 дней.**
Сервер выдаёт JWT `expiresIn: '7d'` (`server.js:3988` и ещё 4 места), refresh-эндпоинта нет. `api.ts:47-63` на любой 401 стирает токен и вызывает `setSessionExpiredHandler` → `Alert` «Session expired» (`App.tsx:241-248`). На холодном старте `initApp` (`App.tsx:268`) получает 401 → сначала алерт, потом `resetToLogin` на ещё не смонтированном `navigationRef` (no-op). Пользователь еженедельно видит алерт при запуске и логинится заново.
Фикс: refresh-token (или sliding-session на сервере) + один retry в клиенте; на старте при 401 молча уходить на Login без алерта.

**A-06 · High · correctness — Analysis использует несуществующие поля профиля.**
Канонические поля API/БД: `max_hr`, `resting_hr`, `lactate_threshold` (см. `server.js:6552`, `HRZonesScreen.tsx:17-19`, `RideAnalyticsScreen.tsx:219-226`). `AnalysisScreen.tsx:153-155` читает `userProfile?.max_heart_rate`, `userProfile?.lthr`; `:398-402` — `resting_heartrate`, `max_heartrate`; `:475` — `lthr`. Все они `undefined` → HR-зоны, «pulse goal %», VO2max и `summary.lthr` всегда считаются по дефолтам (190 / 220-age / 60 / null), независимо от заполненного профиля. HR-зоны при этом вычисляются в 4 местах тремя разными формулами (`AnalysisScreen:153`, `RideAnalyticsScreen:229-246`, `HRZonesScreen:66-90`, `OnboardingScreen`).
Фикс: типизировать `UserProfile` централизованно (см. A-31), вынести `computeHrZones(profile)` в один модуль, использовать канонические имена.

**A-07 · High · correctness/race — snapshot навыков сохраняется до готовности PowerAnalysis; возможен двойной POST.**
`AnalysisScreen.tsx:488-630` (`manageSkillsHistory`) зависит от `[userProfile, currentSkills, summary]`. `currentSkills` приходит из `SkillsRadarChart` → `onSkillsCalculated` (`SkillsRadarChart.tsx:142-154`), причём первый раз — до того как `PowerAnalysis` асинхронно (до 50 запросов wind с паузой 100 мс, `PowerAnalysis.tsx:234`) отдаст `powerStats`. При новой активности первый прогон видит «activity id изменился» и делает `POST /api/skills-history` с `power = 0` (костыль на `:558-563` только переносит предыдущее значение). Эффект не отменяемый: два параллельных прогона (изменились `summary` и `currentSkills` в соседних рендерах) оба читают `/last` до записи → два снапшота. Аналогично `useEffect` на `:633-658` полагается на `snapshotSavedRef` без учёта смены пользователя.
Фикс: перенести вычисление и запись snapshot'ов на сервер (там уже есть все данные и `analytics-snapshot`), либо в клиенте сохранять только когда `powerStats !== null` и дедуплицировать через `useRef<Promise>`.

**A-08 · High · navigation — deep-link параметры срабатывают только один раз за жизнь таба.**
`CoachChatScreen.tsx:105,199-222` и `:228-238`: `firedInitialPromptRef`/`firedOpenConversationRef` ставятся в `true` и никогда не сбрасываются, а tab-экран остаётся смонтированным. Второй `navigate('CoachChat', {initialPrompt})` из `GoalDetailsScreen:447`, `CalendarScreen:287-315`, `RideAnalyticsScreen:613-640` не отправляет сообщение и не открывает чат (параметры при этом обнуляются `setParams`).
Фикс: убрать ref-гарды, полагаться на `setParams(undefined)` + сравнение с предыдущим значением, или использовать `useFocusEffect` + уникальный `requestId` в params.

**A-09 · High · auth flow — после email-логина не проверяется onboarding.**
`LoginScreen.tsx:97-100`: `navigation.replace('Main')` без запроса `onboarding_completed`, тогда как в `App.tsx:267-269`, `App.tsx:340-342` и `LoginScreen.tsx:66-69` проверка есть. Новый email-пользователь минует онбординг и попадает на Main с пустым профилем (все калькуляторы на дефолтах). Кроме того `OnboardingScreen.tsx:167-179` (`handleSkip`) при ошибке сети всё равно делает `reset` на Main — при следующем запуске пользователь снова окажется в онбординге.
Фикс: единая функция `resolvePostAuthRoute()` в auth-слое; при ошибке skip — показывать ошибку, не навигировать.

**A-10 · High · security — токен, e-mail и профиль в prod-логах; SSE в debug-режиме.**
280 `console.*` в `src/`+`App.tsx`, никакого `babel-plugin-transform-remove-console`/обёртки логгера (`babel.config.js` — только worklets). Конкретно: `App.tsx:328-336` пишет длину и первые 20 символов JWT и факт сохранения; `AnalysisScreen.tsx:98-102` — `JSON.stringify(profileData)` целиком, включая e-mail, `:109` — декодированный JWT; `coachSSE.ts:69,96,120-129` — `debug: true` у `react-native-sse` (библиотека логирует сырые chunks ответа коуча) и каждое событие. На iOS всё это доступно через Console.app/сysdiagnose, на Android — `adb logcat`.
Фикс: `logger` с уровнями и no-op в prod, babel-plugin для вырезания `console.*`, `debug: __DEV__`.

**A-11 · High · security — JWT в AsyncStorage, не в Keychain/Keystore.**
`api.ts:21-24,74-91`: токен хранится в plain AsyncStorage (SQLite/файл в sandbox без шифрования, попадает в незашифрованные бэкапы Android если `allowBackup` не выключен). Также `healthService.ts:306` — Apple Health данные (RHR, HRV, вес, сон) в plain AsyncStorage. Apple требует для HealthKit-данных «appropriate security» (Guideline 5.1.3).
Фикс: `react-native-keychain` для токена; для health-снапшота — либо не кешировать, либо шифровать (`react-native-mmkv` с `encryptionKey` из Keychain).

**A-12 · High · App Store — сторонний OAuth (Strava) без Sign in with Apple.**
`LoginScreen.tsx:112-127` предлагает «Connect with Strava» как social login. По Guideline 4.8 приложение, использующее сторонний/социальный логин, обязано предлагать эквивалентный privacy-логин (Sign in with Apple или соответствующий критериям). Риск reject при ревью.
Фикс: добавить Sign in with Apple (`@invertase/react-native-apple-authentication`) + серверный endpoint, либо убрать Strava-логин, оставив Strava только как интеграцию (что также решает A-01).

**A-13 · High · perf/N+1 — каждая карточка цели грузит все цели и запускает HealthKit.**
`MetaGoalCard.tsx:44` — `useHealthData()` на карточку (каждый инстанс хука независимо читает кеш и, если он старше 4 ч, запускает `fetchHealthSnapshot` = 8 HealthKit-запросов, `useHealthData.ts:45-57`); `:61-72` — `GET /api/goals` (все цели пользователя) в каждой карточке с фильтрацией на клиенте. 10 целей = 10 одинаковых запросов + 80 HealthKit-запросов при каждом показе списка. `healthContext` пересобирается на каждом рендере (`useHealthData.ts:113`) и стоит в deps `useEffect` (`MetaGoalCard.tsx:51-55`) → эффект на каждом рендере.
Фикс: `GoalsPanel` один раз грузит `/api/goals` и раздаёт sub-goals пропсом (или сервер возвращает их в `/api/meta-goals`); `useHealthData` — в один провайдер/queryKey; `useMemo` для `buildHealthContext`.

**A-14 · High · perf — PowerAnalysis: 50 последовательных сетевых вызовов, дублирующий fetch профиля, неотменяемый эффект, мертвый AbortController.**
`PowerAnalysis.tsx:477-506`: на каждое изменение `activities`/весов — цикл `for … await calculatePower()` по 50 активностям, каждая — `await sleep(100)` (`:234`) + `apiFetch('/api/weather/wind')` (`:251`), т.е. минимум 5 с чистой задержки, без отмены при смене props (после unmount продолжаются `setState`). `:247-252`: создаётся `AbortController` с таймаутом 2 с, но `controller.signal` не передаётся в `apiFetch` — таймаут ничего не делает. `:147-171` — собственный `GET /api/user-profile` вместо `useAppData().loadUserProfile`. `:132-144` — сохранение двух кешей в AsyncStorage при *каждом* изменении state (до 100 записей за прогон), причём при первом рендере эффект сохраняет пустые `{}` до завершения `loadCache` (`:110-129`) — гонка.
Фикс: посчитать оценочную мощность и ветер на сервере одним запросом (`/api/analytics/summary` уже существует) либо батч-эндпоинт `/api/weather/wind?dates=…`; `apiFetch` принимать `signal`; эффект с флагом `cancelled`.

**A-15 · High · prod config — окружения захардкожены в коде.**
`api.ts:8`: `__DEV__ ? 'http://192.168.10.40:8080' : 'https://bikelab.app'` (LAN IP разработчика в репозитории; staging невозможен). `GarageScreen.tsx:517` — `https://bikelab.app/api/proxy/strava-image` всегда prod, даже в dev (закомментированный второй IP `192.168.10.82` на `:518`). `LoginScreen.tsx:113`, `StravaIntegrationScreen.tsx:45` — `clientId = '165560'` продублирован. `WeatherBlock.tsx:57-63` и `PowerAnalysis.tsx:229-230` — координаты Кипра захардкожены (продукт географически привязан к одному региону).
Фикс: `react-native-config`/`.env.{dev,staging,prod}` + `src/config.ts`; прокси-URL строить от `API_BASE_URL`; координаты погоды — из последней активности/геолокации.

**A-16 · High · prod readiness — нет crash-reporting, аналитики, CI, рабочих тестов и версии приложения.**
`package.json` без Sentry/Crashlytics/Firebase; `__tests__/App.test.tsx` рендерит `<App/>` целиком без моков нативных модулей (HealthKit/Nitro, Skia, Maps, Blur, SSE) — тест гарантированно падает в jest-preset RN; `jest.config.js` — одна строка; `.eslintrc.js` — только `@react-native` без `react-native/no-inline-styles`, `no-console`; никаких `.github/workflows`, husky, `tsc --noEmit` в скриптах; `app.json` без `version`, `package.json version: 0.0.1`; `README.md` — стандартный шаблон RN.
Фикс: Sentry RN SDK (+ source maps в build-скриптах), GitHub Actions: `tsc`, `eslint`, `jest`; Detox/Maestro smoke для login→Garage; версионирование через fastlane.

### Medium

**A-17 · Medium · architecture — нет слоя данных: 44 endpoint'а вызываются напрямую из 30 файлов.**
`apiFetch(): Promise<any>` (`api.ts:17-20`) → каждый экран держит свои `useState` для `loading/refreshing/error/data` и свой TTL-кеш в AsyncStorage (`GarageScreen.tsx:423-480`, `WeatherBlock.tsx:40-80`, `RideAnalyticsScreen.tsx:91-120`, `FTPAnalysis.tsx:40-60`, `PowerAnalysis.tsx:110-144`, `AppDataContext`, `Cache`, `goalsCache`, `analyticsSnapshot` — 7 независимых кеш-механизмов с 6 разными форматами ключей). Инвалидация ручная и рассыпана (`AsyncStorage.multiRemove(['activities_cache','bikes_cache','garage_images_cache'])` в `GarageScreen.tsx:223`, `removeItem('garage_images_cache')` в `ImageUploadModal.tsx:119`). 13 мест независимо грузят `/api/user-profile`.
Фикс: TanStack Query + типизированный клиент (см. «Целевая архитектура»).

**A-18 · Medium · hooks — `useCallback` в контексте зависит от state → каскадные рефетчи.**
`AppDataContext.tsx:48-88`: `loadActivities = useCallback(…, [activities])` меняет идентичность после каждой загрузки. Потребители используют её в deps: `CalendarScreen.tsx:184-215` (`loadCalendarData` → `useFocusEffect`) → после первого ответа `activities` эффект перезапускается и `GET /api/calendar` уходит второй раз; `RideAnalyticsScreen.tsx:201-211` (`[loadUserProfile]`) — второй запрос профиля. Также внутри `loadActivities` при in-flight промисе читается устаревший `activities` из замыкания.
Фикс: хранить данные в `useRef`/reducer или использовать TanStack Query.

**A-19 · Medium · hooks — эффекты без cleanup/отмены → setState после unmount, гонки при быстрых переходах.**
65 `useEffect`, из них с флагом отмены только 2 (`AnalysisScreen.tsx:663-672`, `useHealthData`). Примеры: `GoalDetailsScreen.tsx:77-82` (4 параллельных загрузки, deps `[goalId]`, при быстром переходе goal A→B ответ A может перезаписать B); `CalendarScreen.tsx:184-200` (быстрый prev/next месяца — ответ старого месяца приходит после нового); `PowerAnalysis` (A-14); `useChartOverlay.tsx:41-49` и `PowerAnalysis.tsx:594-603`, `HeartAnalysis.tsx:47-51` — `setTimeout`, не очищаемые при unmount (21 таймер без cleanup по grep).
Фикс: паттерн `let alive = true … return () => { alive = false }` или AbortController; при миграции на TanStack Query проблема исчезает.

**A-20 · Medium · correctness — мутация shared-объекта профиля из контекста.**
`AnalysisScreen.tsx:106-118`: `profileData.id = decoded.userId` мутирует объект, который живёт в `AppDataContext.userProfile` и раздаётся всем экранам; сервер и так возвращает `id` (`server.js:6357`), так что jwt-decode избыточен (и зависимость `jwt-decode` нужна только ради этого).
Фикс: удалить блок и `jwt-decode`.

**A-21 · Medium · correctness — HealthKit: «подключено» даже при полном отказе в правах.**
`healthService.ts:92-101` `initHealthKit` возвращает `true` сразу после закрытия диалога (комментарий это признаёт); `fetchHealthSnapshot` (`:268-300`) всегда ставит `isConnected: true`. При отказе во всех разрешениях `AppleHealthScreen` показывает «Connected» с прочерками, `healthContext` с null'ами уходит в чат коуча. Нет проверки `Platform.OS === 'ios'` перед показом пункта в профиле на Android.
Фикс: считать подключение успешным, если хотя бы одна метрика вернула данные; хранить `isConnected` отдельно от «есть данные»; скрывать пункт на Android.

**A-22 · Medium · deep links — разбор URL строковыми `includes`/regex.**
`App.tsx:302-360`: `url.includes('bikelab://')` ловит *любую* ссылку схемы (включая будущие `bikelab://strava-linked`, `bikelab://oura` обрабатывается отдельным `if` выше), токен вытаскивается regex'ом; `getInitialURL` обрабатывается до готовности `navigationRef` (первые ~100-300 мс) — `reset` на `null` теряется. Нет `linking`-конфига в `NavigationContainer`, нет типизации маршрутов (`createRef<any>`, `navigation: any` в 9 экранах, `(navigation as any).navigate` в `GarageScreen.tsx:644,815,…`).
Фикс: `linking={{prefixes, config}}` в `NavigationContainer`, парсинг через `new URL()`/`expo-linking`, `RootStackParamList` + `useNavigation<NativeStackNavigationProp<…>>`.

**A-23 · Medium · i18n — ~40 захардкоженных английских строк и весь Knowledge Center.**
Хотя `en.json`/`ru.json` синхронны (958 ключей), мимо i18n идут: ярлыки табов (`App.tsx:176,186,203,213,224`), `GarageScreen.tsx:625-633,650,666,806,1024,1031,1039,1063-1065`, `GoalDetailsScreen.tsx:332-335,399,783`, `ActivityCard.tsx:57,75`, `ImageUploadModal.tsx:201,220,232`, `SpeedAnalysis.tsx:201-209`, `TrainingDetailsModal.tsx:66-96`, `AIAnalysisModal.tsx:89,98`, ShareStudio-шаблоны, `KnowledgeCenter/topics.ts` (122 строки только на английском), `CoachChatScreen.tsx:48` (`toLocaleDateString('en-US')`). Плюс конкатенация вместо интерполяции (`t('analysis.hWeek') + ridesPerWeek + t('analysis.ridesWeek')`, `AnalysisScreen.tsx:774`) ломает порядок слов в RU.
Фикс: ESLint `i18next/no-literal-string`, перевести topics в `en.json/ru.json`, интерполяция `{{count}}`.

**A-24 · Medium · duplication — 5 Analysis-компонентов: 129 идентичных строк во всех четырёх, 200-250 попарно.**
`Power/Heart/Speed/CadenceAnalysis` (3 223 строки): одинаковые заголовок/подзаголовок/горизонтальный ряд stat-карточек/`TrendBadge`/`?`-кнопка help/`LineChart` из gifted-charts с одним и тем же набором из ~30 пропсов/`detailOverlay`. Попарно общих строк: Heart↔Cadence 253, Heart↔Speed 221, Speed↔Cadence 200. Стили: 44+36+26+28+38 ключей, из которых `container/title/subtitle/statsScroll/statCard/statValue/statLabel/sectionTitle/titleRow/helpButton/helpIcon/chartSection/chartContainer` повторяются во всех. `PowerAnalysis.tsx:78-82,567-606` дублирует готовый `hooks/useChartOverlay.tsx` целиком; `HeartAnalysis.tsx:34-38` держит неиспользуемый `hapticTriggeredRef` от старой версии. Каждый компонент вызывает `onStatsCalculated` через `useEffect` → родитель хранит 4 `any`-стейта.
Фикс: `<MetricAnalysisSection title stats chartSeries onHelp/>` + `<StatCardRow/>` + `<TrendLineChart/>`; расчёты вынести в чистые функции `analytics/*.ts` c unit-тестами; ожидаемое сокращение ≈ 1 500-1 800 строк.

**A-25 · Medium · duplication — ShareStudio: 5 BackgroundPicker'ов на 85-95 % идентичны, 6 шаблонов дублируют хелперы.**
`BackgroundPicker{,Minimal,Charts,Simple,BigStats}.tsx` (946 строк): попарно 96-113 общих строк из ~105-125 (т.е. различаются 1-2 строками). Шаблоны A-F (1 742 строки) заново объявляют `formatDuration` (A, B, E, F) и `formatDate` (A, C), общие 47-95 строк попарно. `StreamData` объявлен дважды (`ShareStudio/types.ts:5`, `utils/streamsCache.ts:5`).
Фикс: один `BackgroundPicker` с пропом `variant`, `shared/format.ts`, общий `TemplateFrame`.

**A-26 · Medium · duplication — типы и хелперы объявлены по несколько раз.**
`interface UserProfile` — 9 раз (`AppDataContext`, `GarageScreen`, `VO2maxWidget`, `TrainingSettings`, `PersonalInfo`, `AccountSettings`, `Strava`, `HRZones`, `ProfileScreen`), с разными наборами полей; `interface Bike` — 4 раза; `TIER_CONFIG` — 2 (`MetaGoalCard.tsx:12`, `GoalDetailsScreen.tsx:32`); `formatDate/formatDuration/…` — 18 локальных определений в 13 файлах; расчёт totals — `StatsCard.calculateStats` и `GarageScreen.overallStats:118-132`; медиана — `AnalysisScreen.tsx:144` и `skillsCalculator.ts:33`; ISO-week утилиты — `AnalysisScreen.tsx:30-55`.
Фикс: `src/shared/types/api.ts` (генерировать из OpenAPI/zod), `shared/format.ts`, `shared/date.ts`.

**A-27 · Medium · design system — нет темы: 186 hex + 140 rgba, 83 `StyleSheet.create`, 9 674 строки стилей.**
`#fff` 220 раз, `#1a1a1a` 184, `#274dd3` 117 (акцент), `#888` 93, `#8e8e93` 40, `#666` 39 — серые задаются 8+ способами; `Dimensions.get('window')` на уровне модуля в 15 файлах (не реагирует на split-view/поворот на iPad). Единственный «токен» — `constants/tabBar.ts`. Нет `useColorScheme`/dark-mode.
Фикс: `theme/{colors,spacing,typography,radii}.ts` + `useTheme()`, `useWindowDimensions`, постепенная замена.

**A-28 · Medium · perf — тяжёлые вычисления и лишние ререндеры на Analysis.**
`AnalysisScreen` пересчитывает `calculate4WeekPeriods`/`percentForPeriod` по всем активностям (без ограничения периода) на JS-потоке; `SkillsRadarChart` (единственный `React.memo`) вызывает `calculateAllSkills` (684 строки, полный проход по активностям с сортировками) при каждом изменении `powerStats`/`summary` — а `powerStats` пересобирается объектом в `PowerAnalysis` (A-14); `console.log` внутри IIFE в JSX (`AnalysisScreen.tsx:894-909`) — на каждом рендере; `handleSkillsCalculated` → `setCurrentSkills(newObject)` → `manageSkillsHistory` (A-07). Ни один из 5 Analysis-компонентов не мемоизирован, `onStatsCalculated` в `AnalysisScreen:920-980` передаются инлайн-стрелками. `ScrollView + .map` для достижений/категорий (`AchievementsScreen.tsx:200-253`, `GarageScreen.tsx:887`), `renderDay` не мемоизирован (`CalendarScreen.tsx:426`).
Фикс: расчёты навыков/прогресса — на сервер (есть `skills-history`, `analytics-snapshot`) или в `useMemo` с стабильными входами; `React.memo` + `useCallback` для секций; `FlatList` для списков >10.

**A-29 · Medium · perf/bundle — библиотеки для графиков и анимаций избыточны.**
Используются: `react-native-gifted-charts` (8 файлов), `react-native-svg` напрямую (радар, кольца, иконки), `@shopify/react-native-skia` + `react-native-reanimated` + `react-native-worklets` — только ради `BlobOrb.tsx` (116 строк, шейдер-фон в 3 местах). `react-native-chart-kit` установлен, но не импортируется ни разу; в `HeartAnalysis.tsx:99-115` осталась структура данных chart-kit (`datasets[].color: () => …`), которую gifted-charts игнорирует. Skia добавляет ≈ 8-10 МБ к IPA и время сборки.
Фикс: удалить chart-kit; BlobOrb переписать на `LinearGradient` + Reanimated или статичное изображение (`blob*.png` уже в assets) и выкинуть Skia; один charting-примитив на gifted-charts или полностью на svg.

**A-30 · Medium · deps — неиспользуемые и рискованные пакеты.**
Не импортируются ни разу: `react-native-chart-kit`, `react-native-fast-image` (при этом все картинки через `Image` без кеш-политики — 0 использований FastImage), `react-native-video` (файл называется `VideoHeaderWithStats`, но видео нет), `react-native-vector-icons` + `@types/react-native-vector-icons` (иконки — свои SVG), `@react-native/new-app-screen`. `react-native-fast-image` не поддерживается (последний релиз 2021, проблемы с New Arch), `react-native-chart-kit` — заброшен, `@react-native-community/blur` — с New Arch работает через interop. `uuid` + `react-native-get-random-values` — ради одного `uuidv4()` в `useCoachChat.ts:14` (можно `Crypto.randomUUID()` из Hermes ≥ RN 0.73 или `nanoid/non-secure`). `@types/react-native-vector-icons@6` vs пакет v10 — рассинхрон типов.
Фикс: `npx depcheck`, удалить 5 пакетов, заменить uuid.

**A-31 · Medium · type safety — `any` как норма для данных API.**
112 вхождений `any` (топ: `healthService` 11, `AnalysisScreen` 11, `RideAnalyticsScreen` 9, `GoalDetailsScreen` 9, `GarageScreen` 7). Все `useState<any>` для `summary/powerStats/heartStats/speedStats/cadenceStats/currentSkills/skillsTrend/userProfile` (`AnalysisScreen.tsx:63-70`); `React.FC<any>` (`GoalDetailsScreen.tsx:56`), `({route, navigation}: any)` (`RideAnalyticsScreen.tsx:20`); `apiFetch → Promise<any>`. `tsconfig.json` наследует `strict` от `@react-native/typescript-config`, но без `noUncheckedIndexedAccess`, `noImplicitReturns`; ESLint не запрещает `any`. Из-за этого A-06 (несуществующие поля) компилируется молча.
Фикс: `zod`-схемы ответов + `apiFetch<T>(schema)`; `@typescript-eslint/no-explicit-any: error` с постепенным baseline.

**A-32 · Medium · correctness — `AsyncStorage.clear()` при выходе стирает настройки приложения.**
`ProfileScreen.tsx:103,139`: `clear()` удаляет `@app_language` (`i18n.ts:9`), health-кеш и все user-agnostic данные. После sign-out язык сбрасывается на системный. При этом in-memory данные не очищаются (A-02).
Фикс: очищать по префиксу пользователя (`user:<id>:*`) или через список известных ключей.

**A-33 · Medium · correctness — `apiFetch` не учитывает форматы ошибок и пустые ответы.**
`api.ts:66`: `new Error(errorData.error || …)` — для `DELETE /api/calendar/:id` сервер возвращает `{error: true, message}` (`server.js:1536`) → пользователь видит текст `true`. `:69` — безусловный `response.json()` упадёт на 204/пустом теле. `ImageUploadModal.tsx:109-115` — отдельный `fetch` без обработки 401/таймаута. Нет таймаута запросов вообще (`fetch` в RN без `signal` висит до системного таймаута ~60 с).
Фикс: единый `ApiError {status, code, message}`, `AbortSignal.timeout(15000)`, поддержка `multipart` внутри клиента.

**A-34 · Medium · UX/network — тяжёлые POST'ы при каждом открытии экрана.**
`AchievementsScreen.tsx:72-76` делает `POST /api/achievements/evaluate` при каждом монтировании (плюс при refresh) — серверная переоценка всех ачивок по всем активностям; `CoachChatScreen.tsx:124-130` «прогревает» `/api/bikes` при каждом входе на таб; `App.tsx:106-121` `ProfileIcon` тянет `/api/user-profile` отдельно ради аватара. Weekly-ограничений/ETag нет.
Фикс: evaluate — по webhook новой активности на сервере; аватар — из контекста профиля.

### Low

**A-35 · Low · dead code — 876+ строк неиспользуемого кода и 12 неиспользуемых SVG.**
`screens/GoalAssistantScreen.tsx` (669 строк, не зарегистрирован ни в одном навигаторе), `components/BikesModal.tsx` (207), `goalsCache.ts` legacy-калькулятор (`calculateGoalProgress/getCachedGoals/updateGoalsWithCache`, ~200 строк, по собственному комментарию «unused by any current screen»), `streamsCache.getStreamsCacheStats`, `analyticsSnapshot.clearSnapshotCache`, `AppDataContext.clearAll` (см. A-02), `Cache.getInfo` только для cleanup. SVG-файлы `assets/img/icons/*.svg` (8), `logo/*.svg` (2), `btn_strava_connect_with_*.svg` (2) не импортируются — при этом `metro.config.js` добавляет `svg` в `assetExts`, что ломает возможность использовать `react-native-svg-transformer` в будущем.
Фикс: удалить; `knip`/`ts-prune` в CI.

**A-36 · Low · hooks — `messagesRef.current = messages` во время рендера.**
`useCoachChat.ts:38-39` — присваивание ref в теле рендера (React 19 StrictMode/конкурентный режим: значение может относиться к отброшенному рендеру). `sendMessage` в deps имеет `conversationId`, который не используется (используется ref) → лишние пересоздания.
Фикс: обновлять ref в `useEffect` или использовать `useLatest`.

**A-37 · Low · hooks — окно неотменяемости SSE.**
`useCoachChat.ts:186-200`: `cancelRef.current = await streamChat(...)` — до резолва (чтение токена из AsyncStorage) `cancelRef.current` ещё старый/`null`; `cancelStream()`/unmount в этот момент не закроют соединение, и callbacks выполнят `setState` на размонтированном хуке.
Фикс: `streamChat` возвращать `{cancel}` синхронно, а токен читать внутри.

**A-38 · Low · keys — индексные `key` в динамических списках.**
`HeartAnalysis.tsx:304,610`, `BestAvgSpeedWidget.tsx:86`, `FTPAnalysis.tsx:216`, `coach/RecoveryCard.tsx:106`, `coach/MetricComparisonCard.tsx:37`, `coach/SkillsDeltaCard.tsx:26`, все `BackgroundPicker*.tsx`. Для статичных списков безвредно, для пересортировываемых (Heart zones) даёт неверную анимацию/состояние.
Фикс: ключ по id/label.

**A-39 · Low · JSON.parse без валидации.**
11 мест (`AppDataContext.tsx:63`, `GarageScreen.tsx:428,456`, `WeatherBlock.tsx:47`, `PowerAnalysis.tsx:119,122`, `healthService.ts:318`, …) парсят AsyncStorage/SSE без схемы: формат изменился между версиями → `undefined.timestamp` → TypeError на старте (у `AppDataContext` catch есть, у `GarageScreen.loadBikes` — да, но данные всё равно попадают в state «как есть»).
Фикс: версионировать ключи кеша (`…_v2`) и валидировать через zod.

**A-40 · Low · Android-совместимость.**
`GarageScreen.tsx:566-567` — `userInterfaceStyle`, `mapType="mutedStandard"` iOS-only; `useScreenshotListener.ts:56-59` — только iOS, на Android native module отсутствует; `BlurView` таббара на Android рендерится как полупрозрачный фон; `Platform.OS` проверок для пунктов «Apple Health»/«Sync to Apple Calendar» в UI нет. Не проверялось: `google_maps_api_key`, `allowBackup`.
Фикс: `Platform.select`, скрывать iOS-only пункты.

**A-41 · Low · i18n/локаль дат.**
`CoachChatScreen.tsx:48` — `'en-US'`; `RideAnalyticsScreen.tsx:38-43` — ручной `dd.mm.yyyy`; `PowerAnalysis.tsx:552-555` — `${getDate()}/${getMonth()+1}`. `dateLocale.ts` возвращает только `ru-RU`/`en-US` — для RU-пользователя с локалью `ru-UA` формат корректен, но `en-GB` получит US-формат.
Фикс: `Intl.DateTimeFormat(getLocales()[0].languageTag)` централизованно.

**A-42 · Low · security — OAuth без `state`, открытие в системном браузере.**
`LoginScreen.tsx:118` и `StravaIntegrationScreen.tsx:49` формируют URL без `state` (CSRF) и открывают через `Linking.openURL` вместо `ASWebAuthenticationSession`/`react-native-inappbrowser-reborn` (Apple рекомендует для OAuth; также улавливает возврат без deep-link-гонок). JWT возвращается в query-параметре URL → попадает в историю браузера/логи.
Фикс: `state` + PKCE на стороне сервера, InAppBrowser `openAuth`.

**A-43 · Low · lint hygiene.**
7 `eslint-disable-next-line react-hooks/exhaustive-deps` (`CoachChatScreen.tsx:129,221,237`, `GoalsPanel.tsx:45`, `ActivityPickerModal.tsx:87`, `CoachHomeHero.tsx:21`), 1 `@ts-ignore` (`LoginScreen.tsx:48`), 32 `useEffect(() => { loadX(); }, [])` с функциями, объявленными *после* эффекта и зависящими от props (`goalId`, `activity.id`) без указания в deps — правило `exhaustive-deps` для них не сработало, потому что функции не в замыкании `useCallback`.
Фикс: включить `react-hooks/exhaustive-deps: error`, `react/jsx-no-leaked-render`, `no-console`.

**A-44 · Low · SplashLoader завязан на Garage.**
`SplashLoader` скрывается только из `GarageScreen.tsx:211-215` (`useHideSplash`). Если `initialRoute === 'Main'`, но Garage не смонтирован первым (deep link на `RideAnalytics`, восстановление state) — сплэш-модалка не закроется никогда.
Фикс: скрывать по `onReady` `NavigationContainer` + таймаут-предохранитель.

**A-45 · Low · `react-native.config.js` линкует `./src/assets/` и `./src/assets/img/` как шрифты/ассеты** — вся папка (включая `.tsx`-иконки и `.webp`) попадает в `assets` link-процесс; `metro.config.js` добавляет `svg` в `assetExts`, хотя SVG используются как inline-строки (`SvgXml`). Убрать лишнее.

---

## Proposed target architecture

### Структура
```
src/
  app/                      # композиция: providers, навигация, linking config, ErrorBoundary
    App.tsx
    navigation/{RootStack,MainTabs,GarageStack,…}.tsx  + types.ts (ParamLists)
    providers.tsx           # QueryClientProvider, SafeArea, Theme, Auth, Health
  features/
    auth/        {api.ts, hooks.ts, screens/Login,Onboarding, deepLink.ts, session.ts}
    garage/      {api.ts, hooks.ts, screens/Garage,BikeGarage, components/…}
    activities/  {api.ts, hooks.ts, screens/Activities,RideAnalytics, components/…}
    analysis/    {api.ts, hooks.ts, screens/Analysis, components/MetricSection…, lib/*.ts (чистые расчёты + тесты)}
    coach/       {api.ts, sse.ts, hooks/useCoachChat.ts, screens/CoachChat, components/…}
    goals/       {api.ts, hooks.ts, screens/GoalDetails, components/MetaGoalCard…}
    calendar/    {api.ts, hooks.ts, screens/Calendar, appleCalendar.ts}
    profile/     {api.ts, hooks.ts, screens/Profile,PersonalInfo,HRZones,…}
    health/      {healthkit.ts, useHealthData.ts (один провайдер)}
    share-studio/{ShareStudioModal, templates/, BackgroundPicker.tsx, lib/format.ts}
  shared/
    api/         {client.ts (typed fetch + zod + timeout + auth interceptor), errors.ts, queryKeys.ts}
    storage/     {secure.ts (Keychain), kv.ts (MMKV), fileCache.ts (streams)}
    ui/          {Button, Card, StatCard, SectionHeader, Chip, Skeleton, ErrorState, EmptyState, TrendBadge, ProgressRing}
    charts/      {TrendLineChart, BarChart, RadarChart, useChartOverlay}
    format/      {date.ts, units.ts, number.ts}
    hooks/       {useAppState, useOnline, useLatest}
    lib/         {logger.ts, analytics.ts, config.ts (env)}
    types/       {api.generated.ts или zod-схемы}
  theme/         {colors.ts, spacing.ts, typography.ts, radii.ts, useTheme.ts}
  i18n/
```

### Слой данных
- **TanStack Query v5** как единственный кеш серверных данных: `queryKey` по feature (`['activities']`, `['profile']`, `['goals', metaGoalId]`, `['calendar', {from,to}]`), `staleTime` вместо ручных TTL, `persistQueryClient` + MMKV для offline-first (заменяет `activities_cache`, `bikes_cache`, `garage_images_cache`, `Cache`, `goalsCache`, `analyticsSnapshot.memoryCache`, `powerAnalysis_*`, weather cache). Инвалидация — `invalidateQueries` после мутаций (upload картинки → `['garage','positions']`; коуч создал событие → `['calendar']`).
- **Типизированный клиент**: `api.get('/api/user-profile', UserProfileSchema)` → `UserProfile` (zod). Сервер — источник схем; один `UserProfile` вместо 9. Таймаут, `AbortSignal` из Query, единый `ApiError`, `multipart` helper.
- **Streams**: только даунсэмпл для графиков; кеш в файлах (`fileCache.ts`), не в KV. Тяжёлые агрегаты (FTP-минуты, оценочная мощность/ветер, skills snapshot) — серверные endpoint'ы; клиент их лишь отображает.
- **Auth**: `features/auth/session.ts` — Keychain, `useSession()`, refresh (после появления на сервере), единый `signOut()` = clear Keychain + `queryClient.clear()` + MMKV user-scope + `resetToLogin()`. Deep links — через `linking` конфиг `NavigationContainer` (`bikelab://auth`, `bikelab://strava-linked`, `bikelab://oura`, universal links).
- **Health**: один `HealthProvider` (или query `['health','snapshot']` с `staleTime: 4h`), потребители читают из него; `healthContext` мемоизирован.

### Состояние
- Серверные данные — Query. UI-состояние экрана — локальный `useState`. Глобальное клиентское (язык, выбранный год в Activities, флаги онбординга) — маленький zustand-store, персист в MMKV. `AppDataContext` упраздняется.

### UI/тема
- `theme/` токены (цвета: `bg`, `surface`, `text.primary/secondary/tertiary`, `accent #274dd3`, `strava #ff5e00`, семантические `success/danger`), spacing 4-8-12-16-24, типографика. Компоненты `shared/ui` вместо повторов `statCard/statValue/statLabel`. `useWindowDimensions` вместо `Dimensions.get`.
- ErrorBoundary на уровне каждого таба + `Sentry.wrap`.

### Порядок безопасной миграции (инкрементально, без «большого переписывания»)
1. **Неделя 1 — стоп-краны:** A-01, A-02, A-03, A-05 (клиентская часть), A-09, A-10 (logger + babel strip), A-11 (Keychain), ErrorBoundary + Sentry, конфиг env (A-15), удалить мёртвый код и 5 пакетов (A-30, A-35). Никаких структурных изменений — только точечные правки и CI (`tsc && eslint && jest`).
2. **Неделя 2 — shared/api + Query:** ввести `shared/api/client.ts` с zod и `QueryClientProvider`; перевести `user-profile` и `activities` (13 + 11 мест) на `useProfile()/useActivities()`, удалить `AppDataContext` и связанные AsyncStorage-кеши. Это закрывает A-06, A-17, A-18, A-20, A-26 (частично).
3. **Неделя 3 — Analysis:** вынести расчёты в `features/analysis/lib` с тестами (или на сервер), собрать `MetricSection`/`TrendLineChart`, переписать 5 компонентов поверх них (A-07, A-14, A-24, A-28), убрать streams из AsyncStorage (A-04).
4. **Неделя 4 — Goals/Coach/Calendar:** sub-goals в ответ `/api/meta-goals`, `HealthProvider` (A-13, A-21), deep-link через `linking` (A-08, A-22), типизированные ParamList'ы.
5. **Неделя 5 — декомпозиция гигантов и тема:** `GarageScreen` → `LastRideHero`, `SnapshotWidgets`, `GarageGallery`, `OverallStats`, `NutritionCalculator` (+ `lib/nutrition.ts`), `AchievementsPreview`; `GoalDetailsScreen` → `GoalHeader`, `MetricsTab`, `TrainingsTab`, `ScheduleTab`, `lib/goalProgress.ts`; `CalendarScreen` → `MonthHeader`, `WeekStrip`, `DayList`, `EventDetailSheet`, `lib/calendarDates.ts`; `AnalysisScreen` → `PeriodHeader`, `SkillsSection`, `lib/periods.ts`. Параллельно — `theme/` и `shared/ui`, замена цветов файл за файлом (A-27). ShareStudio — один `BackgroundPicker`, общий `TemplateFrame` (A-25).
6. **Далее:** i18n-долг (A-23), Sign in with Apple (A-12), InAppBrowser OAuth (A-42), Android-полировка (A-40), Detox/Maestro smoke.

---

## Quick wins (≤ 1 дня каждый, без рефакторинга)

1. `PowerAnalysis.tsx:651,657` → `stats.activitiesWithWindData > 0 && …` (устраняет крэш A-03); включить `react/jsx-no-leaked-render`.
2. `ProfileScreen` sign-out и 401-handler → вызывать `clearAll()` и `clearSnapshotCache()` (A-02).
3. `StravaIntegrationScreen.tsx:46` → redirect на `/link_strava` + `state=<JWT>` (A-01, серверный route уже есть).
4. `AnalysisScreen.tsx:153-155,398-402,475` → `max_hr`, `resting_hr`, `lactate_threshold` (A-06).
5. `LoginScreen.tsx:100` → проверять `onboarding_completed` перед `replace` (A-09).
6. `CoachChatScreen.tsx:105,228` → убрать `fired*Ref`, полагаться на `setParams(undefined)` (A-08).
7. `coachSSE.ts:96` → `debug: __DEV__`; `babel.config.js` → `transform-remove-console` для prod; удалить логи токена/профиля в `App.tsx:328-336`, `AnalysisScreen.tsx:98-118` (A-10).
8. `api.ts:8` и `GarageScreen.tsx:517` → `react-native-config` (A-15); в `apiFetch` добавить `AbortSignal.timeout(15000)` и `signal` passthrough (A-14, A-33).
9. `npm rm react-native-chart-kit react-native-fast-image react-native-video react-native-vector-icons @types/react-native-vector-icons @react-native/new-app-screen jwt-decode`; удалить `GoalAssistantScreen.tsx`, `BikesModal.tsx`, 12 SVG (A-20, A-30, A-35).
10. `PowerAnalysis.tsx:147-171` → `useAppData().loadUserProfile()`; `PowerAnalysis.tsx:78-82,567-606` → `useChartOverlay()` (−60 строк).
11. `MetaGoalCard`: грузить `/api/goals` один раз в `GoalsPanel` и передавать пропсом; `useMemo` для `buildHealthContext` (A-13).
12. Обернуть `MainTabs` и root stack в `ErrorBoundary` (10 строк) + `@sentry/react-native` init в `index.js` (A-16).
13. `app.json` → добавить `version`, `package.json` → `"typecheck": "tsc --noEmit"`, минимальный GitHub Actions workflow (`npm ci && npm run typecheck && npm run lint`).
14. Табы `App.tsx:176-224` и ~40 строк из A-23 → `t()` (ключи уже есть для большинства: `stats.*`, `common.*`).

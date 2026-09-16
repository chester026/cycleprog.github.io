# Cross-layer анализ: server / BikeLabApp / react-spa / shared

Дата: 2026-09-15. Репозиторий: `/home/claude/repo`. Инструменты: jscpd 4.x (два прогона: по умолчанию и с `--formats-exts "typescript:js,jsx,ts,tsx"`, чтобы видеть клоны jsx↔tsx), `diff`, ручной трейс. Сырые данные: `scratchpad/jscpd/jscpd-report.json`, `scratchpad/jscpd-unified/jscpd-report.json`, `scratchpad/jscpd-analysis.txt`, `scratchpad/twins.txt`, `scratchpad/contract.txt`.

---

## 1. Summary

1. Механическая дупликация умеренная (8.05% строк, 313 клонов при min 60 токенов / 8 строк), но распределена неравномерно: react-spa 17.7%, BikeLabApp 11.9%, server 8.2%. Cross-layer клонов 52 (872 строки), из них 44 — SPA↔App.
2. `shared/utils/api.js` (43 строки) **никем не импортируется**; это побайтовая копия `react-spa/src/utils/api.js` (отличие — один пробел на строке 35). `shared/constants/` и `backend/routes/` — пустые каталоги. Корневой `package.json` не объявляет workspaces, хотя указывает `packageManager: pnpm`.
3. Самая опасная дупликация — бизнес-логика, реализованная в 2–3 местах с уже случившимся дрифтом: **skills** (SPA считает по «3 полных календарных месяца», App — по rolling 90 дней × confidence-factor; оба пишут результат в одну таблицу `skills_history`), **goal progress** (3 реализации: `server.js:4488`, `react-spa/.../goalsCache.js:278`, `BikeLabApp/.../goalsCache.ts:100`; SPA-версия с багом единиц в `recovery`), **VO2max** (3 реализации, две из которых читают несуществующие поля профиля `resting_heartrate`/`max_heartrate`, тогда как в БД колонки `resting_hr`/`max_hr`).
4. HR-зоны (Karvonen и LTHR-формулы) скопированы inline в **9 файлах** клиентов (≈18 копий), сервер их не считает, а хранит JSON `hr_zones`, присланный клиентом.
5. Физическая модель мощности (CdA=0.4, Crr, плотность воздуха) продублирована в 5 местах (`server.js:4560`, `goalsCache.js:409`, `PowerAnalysis.jsx:108`, `PowerAnalysis.tsx:96`, `TrainingsPage.jsx:186`).
6. API-контракт: 118 серверных маршрутов (109 в `server.js` + 9 в двух роутерах); SPA вызывает 73 уникальных эндпоинта, App — 44, общих — 28. **Dead-вызовов у клиентов нет**, dead-маршрутов на сервере — 19 (+7 OAuth/статик-маршрутов, которые вызывает браузер, а не код).
7. Формат ошибок на сервере двойной: `{error:'text'}` (≈140 мест) и `{error:true, message:'text'}` (50 мест). Оба `apiFetch` читают только `errorData.error`, т.е. во втором случае пользователь видит текст ошибки `"true"`.
8. Auth: три копии JWT-middleware (`server.js:3997`, `routes/skillsHistory.js:9`, `routes/oura.js:12`) с разными полями (`req.user` vs `req.userId`) и разными телами 401; 5 ручных `jwt.verify` внутри хендлеров; 13 `/api/*` маршрутов без middleware, включая `DELETE /api/hero/images/:name` (server.js:1883) и открытые прокси `/api/weather/*`, `/api/proxy/strava-image`.
9. Base URL: SPA — относительные пути + Vite proxy на `localhost:8080`, но два места хардкодят `https://bikelab.app`/`localhost:8080` (`Sidebar.jsx:122`, `OnboardingModal.jsx:300`); App — константа `API_BASE_URL` в `utils/api.ts:8` (dev-IP `192.168.10.40`), при этом `GarageScreen.tsx:518` хардкодит другой IP `192.168.10.82`.
10. Рекомендация: монорепо (pnpm workspaces) с `packages/shared` (типы, чистые расчёты, константы, API-клиент), при этом skills/goal-progress/VO2max перенести на сервер как single source of truth (клиенты только рендерят); порядок извлечения — в разделе 7. Оценка снятия кода: ≈2 900–3 400 строк в клиентах + ≈600 в сервере.

---

## 2. Duplication metrics (jscpd)

Команда (unified-прогон, чтобы jsx↔tsx сравнивались между собой):

```
npx jscpd --absolute --min-tokens 60 --min-lines 8 --reporters json,console \
  --formats-exts "typescript:js,jsx,ts,tsx" \
  --ignore "**/node_modules/**,**/ios/**,**/android/**,**/*.md,**/*.json,**/*.css" \
  server BikeLabApp/src BikeLabApp/App.tsx react-spa/src shared
```

| Прогон | Файлов | Строк | Клонов | Дублир. строк | % строк | % токенов |
|---|---|---|---|---|---|---|
| default (форматы раздельно: js / jsx / tsx / ts) | 228 | 73 943 | 221 | 4 788 | 6.48% | 7.10% |
| unified (js+jsx+ts+tsx как один язык) | 224 | 73 571 | 313 | 5 954 | 8.05% | 8.29% |

Разница между прогонами (92 клона, ~1 170 строк) — это ровно cross-format клоны, т.е. в основном SPA(jsx/js)↔App(tsx/ts).

### 2.1 По слоям (unified-прогон; «дублир. строк» = уникальные строки файла, попавшие хотя бы в один клон)

| Слой | LOC (js/jsx/ts/tsx) | Дублир. строк | % |
|---|---|---|---|
| react-spa/src | 25 954 | 4 580 | **17.65%** |
| BikeLabApp/src + App.tsx | 33 619 | 4 012 | 11.93% |
| server | 13 973 | 1 151 | 8.24% |
| shared | 43 | 44 | 100% (весь файл — клон `react-spa/src/utils/api.js`) |

### 2.2 Intra vs cross-layer

| Пара слоёв | Клонов | Строк |
|---|---|---|
| spa ↔ spa | 114 | 2 388 |
| app ↔ app | 115 | 2 325 |
| server ↔ server | 32 | 682 |
| **app ↔ spa** | **44** | **708** |
| server ↔ spa | 5 | 87 |
| app ↔ server | 2 | 33 |
| shared ↔ spa | 1 | 44 |
| Итого intra / cross | 261 / 52 | 5 395 / 872 |

### 2.3 Top-25 клонов (по токенам)

| # | Тип | A | B | Строк | Токенов |
|---|---|---|---|---|---|
| 1 | INTRA spa | `react-spa/src/components/GarageCalculators.jsx:132-399` | `react-spa/src/pages/GoalAssistantPage.jsx:554-826` | 268 | 2 769 |
| 2 | INTRA spa | `components/HeroTrackBanner.jsx:60-130` | `components/RideAnalysisModal.jsx:27-97` | 71 | 1 246 |
| 3 | INTRA spa | `components/GarageCalculators.jsx:282-347` | `pages/NutritionPage.jsx:309-362` | 66 | 930 |
| 4 | INTRA spa | `components/GarageCalculators.jsx:203-275` | `pages/PlanPage.jsx:1836-1909` | 73 | 731 |
| 5 | INTRA spa | `components/GarageCalculators.jsx:36-131` | `pages/GoalAssistantPage.jsx:299-394` | 96 | 604 |
| 6 | INTRA spa | `components/GarageCalculators.jsx:357-393` | `pages/NutritionPage.jsx:404-440` | 37 | 442 |
| 7 | INTRA app | `ShareStudio/BackgroundPickerBigStats.tsx:58-108` | `ShareStudio/BackgroundPickerCharts.tsx:67-117` | 51 | 433 |
| 8 | INTRA spa | `components/OnboardingModal.jsx:46-75` | `pages/ProfilePage.jsx:62-91` | 30 | 390 |
| 9 | INTRA app | `screens/OuraIntegrationScreen.tsx:260-303` | `screens/StravaIntegrationScreen.tsx:150-193` | 44 | 353 |
| 10 | INTRA app | `ShareStudio/BackgroundPickerCharts.tsx:105-182` | `ShareStudio/BackgroundPickerMinimal.tsx:87-164` | 78 | 345 |
| 11 | **CROSS** | `BikeLabApp/src/utils/skillsCalculator.ts:486-534` | `react-spa/src/utils/skillsCalculator.js:416-469` | 49 | 340 |
| 12 | INTRA app | `ShareStudio/BackgroundPickerBigStats.tsx:66-108` | `ShareStudio/BackgroundPickerMinimal.tsx:57-99` | 43 | 335 |
| 13 | INTRA app | `ShareStudio/BackgroundPickerBigStats.tsx:67-100` | `ShareStudio/BackgroundPickerSimple.tsx:46-78` | 34 | 302 |
| 14 | INTRA spa | `pages/AnalysisPage.jsx:356-370` | `pages/PlanPage.jsx:675-689` | 15 | 298 |
| 15 | **CROSS** | `BikeLabApp/src/screens/AnalysisScreen.tsx:167-230` | `react-spa/src/pages/AnalysisPage.jsx:312-355` | 64 | 286 |
| 16 | INTRA spa | `components/GarageCalculators.jsx:135-178` | `pages/PlanPage.jsx:1750-1794` | 44 | 284 |
| 17 | INTRA app | `ShareStudio/BackgroundPickerBigStats.tsx:110-173` | `ShareStudio/BackgroundPickerCharts.tsx:119-182` | 64 | 282 |
| 18 | **CROSS** | `BikeLabApp/src/utils/goalsCache.ts:154-193` | `react-spa/src/utils/goalsCache.js:339-374` | 40 | 282 |
| 19 | **CROSS** | `BikeLabApp/src/utils/goalsCache.ts:104-132` | `react-spa/src/utils/goalsCache.js:278-316` | 29 | 281 |
| 20 | INTRA app | `screens/AccountSettingsScreen.tsx:100-141` | `screens/HRZonesScreen.tsx:243-284` | 42 | 277 |
| 21 | INTRA spa | `components/AverageCadenceTrendChart.jsx:48-70` | `components/AverageHeartRateTrendChart.jsx:32-54` | 23 | 277 |
| 22 | INTRA spa | `components/HeroTrackBanner.jsx:40-57` | `components/RideAnalysisModal.jsx:8-25` | 18 | 276 |
| 23 | INTRA server | `server/server.js:1076-1119` | `server/server.js:2132-2173` (Strava token refresh) | 44 | 258 |
| 24 | **CROSS** | `react-spa/src/utils/goalsCache.js:431-464` | `server/server.js:4583-4614` (power physics в avg_power) | 34 | 248 |
| 25 | INTRA spa | `components/AverageCadenceTrendChart.jsx:70-110` | `components/AverageHeartRateTrendChart.jsx:54-95` | 41 | 247 |

Полный список cross-layer клонов (52 шт.) — в `scratchpad/jscpd-analysis.txt`, секция «CROSS clones». Заметные из них помимо таблицы: `skillsCalculator.ts:558-575 ↔ server.js:3014-3028` (`determineRiderProfile` — третья копия на сервере), `react-spa/src/utils/trainingPlans.js:71-87 ↔ server/trainingPlans.js:53-69`, `BikeGarageScreen.tsx:200-215 ↔ MaintenancePage.jsx:183-198`, `GarageScreen.tsx:307-327 ↔ GarageCalculators.jsx:69-89`.

### 2.4 Top файловых пар по суммарному объёму клонов

| Пара | Клонов | Строк |
|---|---|---|
| `server/server.js` ↔ сам с собой | 22 | 523 |
| `react-spa/.../AnalysisPage.jsx` ↔ `PlanPage.jsx` | 28 | 458 |
| `GarageCalculators.jsx` ↔ `GoalAssistantPage.jsx` | 3 | 376 |
| `BikeLabApp/.../CadenceAnalysis.tsx` ↔ `HeartAnalysis.tsx` | 12 | 231 |
| **`skillsCalculator.ts` ↔ `skillsCalculator.js`** | 13 | 224 |
| `HeartAnalysis.tsx` ↔ `SpeedAnalysis.tsx` | 5 | 143 |
| **`goalsCache.ts` ↔ `goalsCache.js`** | 7 | 127 |
| `AnalysisScreen.tsx` ↔ `AnalysisPage.jsx` | 2 | 83 |
| `goalsCache.js` ↔ `server.js` | 4 | 70 |

Внутри `server.js`: блок обновления Strava-токена (`oauth/token` встречается 12 раз, при наличии `getUserStravaToken` на `server.js:1036`), два экземпляра `estimateVO2max` (`2370` и `2595`, 46 общих строк), парные обработчики `/api/activities/:id` и `/api/activities/:id/streams` (1159-1194 ↔ 1214-1250), удаление аккаунта (5892-5916 ↔ 6921-6945 админский вариант).

---

## 3. Twin files (SPA ↔ App)

Метод: `diff` после trim-пробелов; «norm common» — совпадающие непустые строки после удаления TS-аннотаций, `;`, комментариев (см. `scratchpad/twindiff.sh`). Prettier-переформатирование в App (разбиение длинных строк) занижает «строчное» сходство; для skillsCalculator семантическое сходство существенно выше строчного.

| SPA | App | LOC | Общих норм. строк | % от меньшего | Что разошлось / кто новее |
|---|---|---|---|---|---|
| `utils/goalsCache.js` | `utils/goalsCache.ts` | 689 / 301 | 146 | 62% | App — урезанный порт: нет `loadStreamsData`, `loadStreamsForFTPGoals`, `cleanupOldStreams`, нет кейсов `avg_power`, `avg_hr_flat/hills`, `ftp_vo2max`, `recovery`; кэш на AsyncStorage + TTL 5 мин вместо localStorage. **В App `calculateGoalProgress`/`updateGoalsWithCache` мертвы** — импортируются только типы `Goal`, `MetaGoal` (GoalsPanel.tsx:5, MetaGoalCard.tsx:6, GoalDetailsScreen.tsx:13, GoalAssistantScreen.tsx:21). Новее по смыслу — сервер (`goalCalculator.js`), см. §4. |
| `utils/skillsCalculator.js` | `utils/skillsCalculator.ts` | 619 / 684 | 301 | 64% (семантически ~95%) | Все 6 шкал (climbing/sprint/endurance/tempo/power/consistency) и `determineRiderProfile` идентичны по коэффициентам. Различия: (a) окно — SPA `endDate = последний день прошлого месяца, start = -2 мес` (`.js:44-47`), App `endDate = сегодня, start = now-90д` (`.ts:73-77`); (b) App умножает 5 шкал на `confidenceFactor = min(1, sqrt(n/20))` (`.ts:87-104`), SPA — нет; (c) SPA содержит ~40 `console.log`; (d) в App убран неиспользуемый параметр `userProfile` у `calculateClimbing`. **App новее** (комментарий в `.ts:69` «3 ПОЛНЫХ месяца» уже не соответствует коду). |
| `components/PowerAnalysis.jsx` | `components/PowerAnalysis.tsx` | 1300 / 1131 | 172 | 18% | Одна физическая модель (GRAVITY, CD_A=0.4, CRR по покрытию, `calculateAirDensity`, ветер через `/api/weather/wind`, cacheKey по весу/покрытию/ветру), но реализована внутри UI-компонента дважды. SPA хранит кэш в localStorage, App — AsyncStorage. App новее (i18n, типы). Чистого модуля «power model» нет ни в одном слое. |
| `components/ProgressChart.jsx` | `components/ProgressChart.tsx` | 309 / 473 | 15 | 5% | Только `getCategory` общий. Разные чарт-библиотеки (recharts vs react-native-gifted-charts) — это легитимно разные компоненты; общим может быть только подготовка данных. |
| `components/OnboardingModal.jsx` | `screens/OnboardingScreen.tsx` | 734 / 734 | 82 | 13% | Одинаковая длина случайна. Общее: `calculateHRZones` (`.jsx:46-75` ↔ HRZonesScreen.tsx:68-112 — в App вынесено в отдельный экран), шаги профиля, `POST /api/user-profile/onboarding`. SPA включает Strava-connect шаг с хардкодом URL (`.jsx:300-301`). App новее (i18n). |
| `pages/GoalAssistantPage.jsx` | `screens/GoalAssistantScreen.tsx` | 830 / 669 | 106 | 17% | Общие: `isRelevantToCycling`, `handleGenerateGoal`, `handleQuickTemplate`, `loadMetaGoals`. SPA дополнительно содержит копию калькуляторов из `GarageCalculators.jsx` (клон #1, 268 строк) и `updateGoalsOnActivitiesChange` (клиентский пересчёт прогресса). |
| `pages/GoalDetailPage.jsx` | `screens/GoalDetailsScreen.tsx` | 760 / 1391 | 123 | 19% | Общие чистые функции: `formatDate`, `formatScheduleDate`, `getGoalTypeLabel`, `getGoalUnit`, `getPaceBadge`, `overallProgress`. App новее и шире (Training Center, `groupTrainings`, библиотека тренировок). |
| `pages/AnalysisPage.jsx` | `screens/AnalysisScreen.tsx` | 996 / 1111 | 153 | 20% | Общие чистые функции: `calculateUserHRZones`, `getISOWeekNumber`, `getISOYear`, `getDateOfISOWeek`, `median`, `percentForPeriod`, `manageSkillsHistory` (оба пишут в `/api/skills-history`). App дополнительно считает VO2max локально (`calculateVO2max`, `.tsx:385`), SPA берёт его с сервера (`/api/analytics/summary`). |
| `components/HeartRateZonesChart.jsx` | `components/HeartAnalysis.tsx` | 467 / 850 | 14 | 3% | Разные компоненты, но обе содержат таблицу зон `maxHR*0.5…0.9` (`.jsx:40-44,65-69` ↔ `.tsx:227-231`). |
| `components/HeartRateZonesChart.jsx` / `utils/heartRateZones.js` | `screens/HRZonesScreen.tsx` | 467+271 / 334 | 21 / 14 | 7% | Формулы LTHR (0.75/0.85/0.92/0.97/1.03) и Karvonen (0.5…0.9) совпадают 1-в-1. |
| `utils/garageData.js` | `utils/analyticsSnapshot.ts` + `components/achievements/helpers.ts` | 323 / 121+~50 | — | — | `computeMetricTrend` (`.js:195` ↔ `.ts:90`) и `formatBadgeValue` (`.js:263` ↔ `helpers.ts:5`) — одна логика, разный стиль (switch vs if-цепочка). `buildSnapshotPayload` (`.js:143`) фильтрует по `RIDE_TYPES` и сортирует по дате; App-аналог inline в `AnalysisScreen.tsx:633-655` берёт `activities[0]` и `activities.length` без фильтра типа. |
| `components/FTPAnalysis.jsx` + `utils/vo2max.js` | `components/FTPAnalysis.tsx` + `utils/ftpAnalysis.ts` | 256+53 / 565+178 | 38 / 10 | 18% | `analyzeHighIntensityTime` (порог 160 bpm / 120 с) — один алгоритм; SPA читает streams из localStorage синхронно, App — async с загрузкой. `getFTPLevel` есть только в App. |
| `components/SkillsRadarChart.jsx` | `components/SkillsRadarChart.tsx` | 233 / 509 | 67 | 35% | Общая подготовка данных и вызовы `calculateAllSkills`/`determineRiderProfile`; отрисовка разная (recharts vs react-native-svg). |
| `components/WeatherBlock.jsx` | `components/WeatherBlock.tsx` | 156 / 305 | 50 | 39% | Одинаковые хардкод-координаты Кипра (`/api/weather/forecast?latitude=35.1264&longitude=33.4299` и Troodos) и агрегирование. |
| `components/BlobOrb.jsx` | `components/BlobOrb.tsx` | 171 / 116 | 26 | 31% | Анимационная утилита, общая математика точек. |
| `components/ImageUploadModal.jsx` | `components/ImageUploadModal.tsx` | 156 / 398 | 25 | 19% | Оба `POST /api/garage/upload` (App — сырой `fetch` с `API_BASE_URL`, без apiFetch). |
| `components/TrainingCard.jsx` / `TrainingDetailsModal.jsx` / `TrainingLibraryModal.jsx` | одноимённые `.tsx` | 61/433/138 ↔ 242/274/233 | 17/17/11 | 6–31% | Одинаковые вызовы `GET /api/training-types` и группировка по категориям. |
| `components/ProgressRing.jsx` | `components/coach/ProgressRing.tsx` | 74 / 65 | 12 | 21% | SVG-кольцо; общая геометрия. |
| `components/StravaLogo.jsx` | `assets/img/logo/StravaLogo.tsx` | 17 / 23 | 5 | 31% | Один SVG-path. |
| `utils/api.js` (+ `shared/utils/api.js`) | `utils/api.ts` | 43 / 93 | 16 | 57% | Один алгоритм (Bearer из storage → fetch → 401 → logout → `errorData.error`). App добавляет `API_BASE_URL`, `setSessionExpiredHandler`, `TokenStorage`. |
| `utils/cache.js` | `utils/cache.ts` | 84 / 119 | 22 | 34% | Одинаковые ключи/TTL-схема поверх localStorage vs AsyncStorage. |
| `pages/MaintenancePage.jsx` | `screens/BikeGarageScreen.tsx` | 503 / 740 | 132 | 29% | Общие: загрузка `/api/bikes`, `/api/bikes/:id/health`, `reset`, `labels`; форматирование износа компонентов. |
| `components/GarageCalculators.jsx` | `screens/GarageScreen.tsx` + `components/VO2maxWidget.tsx` | 401 / 1725+312 | 72 | 20% | Cooper-test VO2max (`dist*0.02241-11.288`: `GarageCalculators.jsx:196`, `PlanPage.jsx:1826`, `GoalAssistantPage.jsx:620`, `VO2maxWidget.tsx:36`) — 4 копии одной формулы. |
| `utils/trainingPlans.js` | **`server/trainingPlans.js`** | 175 / 110 | 78 | 86% | Клиент↔сервер-близнец. Клиентский план имеет `weeklyStructure` и `validatePlanParams`, серверный — нет; расчёт `weeklyRidesModifier` **различается** (`.js:98` `workoutsPerWeek / basePlan.weeklyStructure.rides` vs `server:76` `workoutsPerWeek / Math.round(basePlan.rides/4)`). |

Прочие обнаруженные совпадения по имени: `ImageUploadModal`, `TrainingCard`, `TrainingDetailsModal`, `TrainingLibraryModal`, `WeatherBlock`, `BlobOrb`, `ProgressRing`, `StravaLogo`, `api`, `cache`, `goalsCache`, `skillsCalculator`, `PowerAnalysis`, `ProgressChart`, `SkillsRadarChart`, `FTPAnalysis` (16 совпадающих basename). Мусор: `react-spa/src/components/SkillsRadarChart.jsx.bak`, `test_preferred_days.js` в корне, `server/test_goalCalculator.js`.

---

## 4. Client ↔ Server logic duplication (самый опасный класс)

### 4.1 Skills (6 шкал + rider profile) — считаются на клиентах и пишутся в БД

| Сторона | Функции | Файл:строка |
|---|---|---|
| SPA | `calculateAllSkills`, `calculateClimbing/Sprint/Endurance/Tempo/Power/Consistency`, `determineRiderProfile` | `react-spa/src/utils/skillsCalculator.js:22,67,220,271,304,366,386,489` |
| App | те же | `BikeLabApp/src/utils/skillsCalculator.ts:47,109,248,310,351,420,440,553` |
| Server | `determineRiderProfile` (копия без `description`), `computeRidingStyle` (**другая**, упрощённая линейная шкала climbing/sprint/power) | `server/server.js:3013`, `server/server.js:2965` |

Поток данных: оба клиента считают skills локально и делают `POST /api/skills-history` (`AnalysisPage.jsx:772`, `AnalysisScreen.tsx:565`), сервер валидирует и сохраняет (`routes/skillsHistory.js:120-160`), затем читает последний снапшот для Bike Health (`server.js:3122-3142`) и для goal-progress по skills (`goalCalculator.js:115 calculateSkillsProgress`). **Дрифт уже есть**: одному и тому же пользователю web и app запишут разные числа (разное окно + confidenceFactor), а сервер потом использует «последний» снапшот, не зная, какой клиент его создал. Рекомендация: перенести расчёт на сервер (`GET /api/skills` считает и сохраняет снапшот; клиенты только читают), формулы вынести в `packages/shared/calc/skills.ts`, чтобы сервер и тесты использовали один модуль.

### 4.2 Goal progress — три реализации

| Сторона | Функция | Файл:строка | Особенности |
|---|---|---|---|
| Server (новая, универсальная) | `calculateProgress`, `calculateActivityProgress`, `calculateSkillsProgress`, `addPaceData` | `server/goalCalculator.js:134,73,115,160` | metric-based (`source/aggregate/field/filter`), fallback на legacy |
| Server (legacy) | `calculateGoalProgress(goal, activities, userProfile)` | `server/server.js:4488` | switch по `goal_type`; `recovery` — `avg_speed*3.6 < 20` км/ч; `intervals` → всегда 0; период `>=`, `all` поддержан, default 28 д |
| SPA | `calculateGoalProgress` | `react-spa/src/utils/goalsCache.js:278` | `recovery` — `(a.average_speed||0) < 20` **без ×3.6, т.е. 20 м/с = 72 км/ч → почти все поездки «восстановительные»** (`.js:490`); `intervals` — эвристика по названию/`workout_type`/вариативности скорости (`.js:345-372`); `ftp_vo2max` возвращает объект `{minutes, intervals}`; период `>`; неизвестный период = все активности; default → `goal.current_value` |
| App | `calculateGoalProgress` | `BikeLabApp/src/utils/goalsCache.ts:100` | нет `avg_power`, `avg_hr_*`, `ftp_vo2max`, `recovery` (падают в default → `current_value` с сервера). **Не вызывается** — мёртвый код |

Дополнительно SPA **записывает** клиентский результат обратно: `PlanPage.jsx:455-469` (`PUT /api/goals/:id` с `current_value`), `GoalsManager.jsx:197-215`. Сервер при `GET /api/goals` (`server.js:4097-4133`) пересчитывает `current_value` заново и сам пишет в комментарии, что клиентский пересчёт «становится избыточным». Итог: web показывает свои числа до перезагрузки, app — серверные. Рекомендация: удалить клиентские реализации (кроме health-source, которые сервер не может считать — см. комментарий `server.js:4100-4104`), клиенты рендерят `current_value`, `percent`, `pace` из ответа. Пример правильного паттерна уже есть: `pace` считается только на сервере (`addPaceData`), клиенты лишь маппят в бейдж (`GoalDetailPage.jsx:315`, `GoalDetailsScreen.tsx:307`).

### 4.3 VO2max — три реализации, две с багом полей

| Сторона | Функция | Файл:строка | Поля профиля |
|---|---|---|---|
| Server, `/api/analytics/summary` | `estimateVO2max` (inline) | `server.js:2370` | `userProfile.resting_heartrate`, `max_heartrate` — **таких колонок нет** (в `user_profiles` — `resting_hr`, `max_hr`, см. `recommendations/index.js:144`) → всегда дефолты 60 / 220-age |
| Server, для целей | `calculateVO2maxForPeriod` → inline `estimateVO2max` | `server.js:2517`, `2595` | `resting_hr`, `max_hr` — корректно |
| App | `calculateVO2max` | `AnalysisScreen.tsx:385-430` | `resting_heartrate`, `max_heartrate` — тот же баг |
| SPA | берёт `summary.vo2max` с сервера | `AnalysisPage.jsx:173-174` | — |

Итого пользователь с заданным resting HR видит в web/app одно значение, а в целях (`recalc-vo2max`) — другое. Плюс 4 копии Cooper-теста (`dist*0.02241-11.288`) и формула Jackson (`PlanPage.jsx:322`). Рекомендация: один модуль `shared/calc/vo2max.ts`, вызывать его на сервере; убрать расчёт из App.

### 4.4 HR-зоны — только клиенты, 9 файлов

Функции `calculateHRZones`/`calculateUserHRZones` с формулами LTHR (0.75/0.85/0.92/0.97/1.03) и Karvonen (rest + reserve×0.5…0.9): `OnboardingModal.jsx:46-75`, `ProfilePage.jsx:62-91`, `AnalysisPage.jsx:280-300`, `PlanPage.jsx:595-616`, `HeartRateZonesChart.jsx:40-90` (три варианта, включая `%maxHR`), `HRZonesScreen.tsx:68-112`, `AnalysisScreen.tsx` (calculateUserHRZones), `RideAnalyticsScreen.tsx:221-244`, `HeartAnalysis.tsx:227-231` (`%maxHR`). Сервер зон не считает: принимает `hr_zones` JSON от клиента (`recommendations/index.js:114,135,159`) и хранит. `aiCoach.js:878-879` использует `profile.max_hr`/`resting_hr` для собственной интенсивности. Рекомендация: `shared/calc/hrZones.ts` + сервер вычисляет и отдаёт зоны в `/api/user-profile` (поле `hr_zones` становится derived, а не user-supplied).

### 4.5 Оценка мощности (physics model) — 5 копий

`GRAVITY=9.81`, `CD_A=0.4`, `CRR=0.005` (или по покрытию), `calculateAirDensity(temp, elev)`, `rolling + aero + gravity`, `minPowerOnDescent=20`: `server.js:4560-4620` (avg_power цель), `goalsCache.js:409-470`, `PowerAnalysis.jsx:105-140`, `PowerAnalysis.tsx:92-120`, `TrainingsPage.jsx:186+`. Рекомендация: `shared/calc/power.ts` (`estimateRidePower(activity, {riderWeight, bikeWeight, crr, wind})`), сервер считает `estimated_power` при кэшировании активностей; клиенты используют готовое поле (App уже кэширует результаты в AsyncStorage — исчезнет).

### 4.6 FTP / high-intensity intervals — только клиенты

`analyzeHighIntensityTime` (`react-spa/src/utils/vo2max.js:2`, `BikeLabApp/src/utils/ftpAnalysis.ts:69`) — работает по streams, которые сервер проксирует (`GET /api/activities/:id/streams`), но не анализирует. Сервер для `intervals` возвращает 0 (`server.js:4652`). Возможно перенести на сервер (streams уже проходят через него), либо оставить в shared как чистую функцию с единым порогом.

### 4.7 Training plans — клиент↔сервер близнецы с расхождением

`react-spa/src/utils/trainingPlans.js:71 getTrainingPlan` ↔ `server/trainingPlans.js:53`: разная база для `weeklyRidesModifier` (см. §3). Сервер отдаёт план через `GET /api/training-plan` (`server.js:6333`), но SPA параллельно считает `getPlanFromProfile` локально (`PlanPage.jsx:42`, `AnalysisPage.jsx:34`). App использует только серверный. Рекомендация: удалить клиентскую копию.

### 4.8 Achievements — корректно (только сервер)

`server/achievements.js:592 evaluateAchievements` — единственная реализация; клиенты лишь форматируют (`formatBadgeValue` в `garageData.js:263` и `achievements/helpers.ts:5` — кандидат в shared). Заметим: SPA не вызывает `POST /api/achievements/evaluate`, только `GET /me`, т.е. web-пользователь без app никогда не получит новые ачивки.

### 4.9 Прочее

* `formatDate`/ISO-week утилиты (`getISOWeekNumber`, `getISOYear`, `getDateOfISOWeek`) — в `AnalysisPage.jsx` и `AnalysisScreen.tsx`.
* `computeMetricTrend` — `garageData.js:195` ↔ `analyticsSnapshot.ts:90`.
* Метки/единицы целей `getGoalTypeLabel`, `getGoalUnit` — `GoalDetailPage.jsx` ↔ `GoalDetailsScreen.tsx`; серверные константы `VALID_FIELDS`, `VALID_SKILLS`, `VALID_HEALTH_METRICS` (`goalCalculator.js:25-31`) на клиентах повторены строками.
* Unit-конверсии `*3.6` (м/с→км/ч), `/1000`, `/3600` рассыпаны по всем трём слоям без хелпера.

---

## 5. API contract audit

### 5.1 Инвентарь

* Серверных маршрутов: **118** = 109 `app.*` в `server.js` (из них 7 — OAuth/статик без `/api`: `/exchange_token`, `/auth/success`, `/oura/exchange_token`, `/link_strava`, `/strava-auth-status`, `/privacy`, `/.well-known/…`) + 5 в `routes/skillsHistory.js` (префикс `/api/skills-history`) + 4 в `routes/oura.js` (`/api/oura`).
* SPA: 127 call-sites → **73** уникальных `METHOD path`. App: 70 call-sites → **44** уникальных. Общих: **28**, SPA-only: 45, App-only: 16.
* Каждый клиентский вызов резолвится в существующий маршрут — **dead calls = 0** (после ручной проверки template-URL: `/api/weather/wind` в обоих PowerAnalysis, `/api/proxy/strava-image` в `imageProxy.js:7` и `GarageScreen.tsx:517`).

### 5.2 Dead routes (сервер, не вызываются ни одним клиентом)

| Маршрут | Где | Комментарий |
|---|---|---|
| GET `/api/activities/debug/types` | server.js:1269 | debug |
| POST `/api/activities/cache/clear` | 1328 | |
| PUT `/api/rides/:id` | 1376 | SPA использует только GET/POST/DELETE rides |
| POST `/api/rides/import` | 1401 | |
| POST `/api/calendar` | 1473 | события создаёт только AI-coach напрямую в БД (`aiCoach.js:355 create_calendar_event`) |
| GET `/api/garage/images` | 1577 | без auth |
| GET `/api/hero/positions` | 1641 | без auth; клиент использует только DELETE `/api/hero/positions/:position` |
| DELETE `/api/garage/images/:name` | 1846 | |
| DELETE `/api/hero/images/:name` | 1883 | **без auth** |
| GET `/api/imagekit/config` | 2007 | |
| POST `/api/meta-goals` | 4463 | ручное создание мета-цели; клиенты используют только `ai-generate` |
| POST `/api/goals/update-current` | 5635 | 80 строк, дублирует пересчёт |
| GET `/api/goals/:goalId/recommendations` | 6630 | |
| GET `/api/training-types/:type` | 6652 | |
| GET `/api/training-plan/stats` | 6680 | |
| GET `/api/ai-cache-stats` | 6735 | без auth |
| GET `/api/achievements` | 7095 | клиенты используют `/me` |
| GET `/api/skills-history/compare` | routes/skillsHistory.js:70 | |
| GET `/strava-auth-status` | 1558 | |

### 5.3 Эндпоинты только одного клиента (разрыв функциональности)

* **SPA-only (45)**: весь admin (`/api/admin/*`, `/api/database/*`, `/api/hero/*`, `/api/strava/tokens|limits`), checklist, events, rides CRUD, `POST /api/register`, `verify-email`, `resend-verification`, `POST/PUT/DELETE /api/goals`, `POST /api/goals/recalc-vo2max/:id`, `GET /api/analytics/summary`, `GET /api/analytics/activity/:id`, `POST /api/ai-analysis`, `GET/POST/DELETE /api/training-plan*`, `GET /api/weather/forecast`, `POST /api/user-profile/email`, `DELETE /api/skills-history/cleanup-month`.
* **App-only (16)**: `/api/coach/*` (5), `/api/oura/*` (4), `PUT/DELETE /api/calendar/:id`, `POST /api/achievements/evaluate`, `POST /api/bikes/:id/onboarding`, `DELETE /api/account`, `GET /api/activities/:id/ai-analysis`, `GET /api/activities/:id/meta-goals-progress`.
* Следствие: в App нельзя зарегистрироваться (только login), создать/править обычную цель без AI; в SPA нет коуча, Oura, редактирования календаря и запуска evaluate ачивок.

### 5.4 Одни эндпоинты — разные payload / чтение ответа

| Эндпоинт | SPA | App | Сервер |
|---|---|---|---|
| `POST /api/skills-history` | `{user_id, last_activity_id: mostRecentActivityId, ...skills}` (`AnalysisPage.jsx:778-782`); значения по формуле «3 полных месяца» | `{user_id, last_activity_id: activities[0]?.id, ...skills}` (`AnalysisScreen.tsx:570-574`); формула «90 дней × confidence» | `routes/skillsHistory.js:123` — принимает оба, `user_id` сверяет с токеном (403 при несовпадении) |
| `POST /api/analytics-snapshot` | `buildSnapshotPayload` (`garageData.js:143`): фильтр `RIDE_TYPES`, `lastActivityId` = самая свежая по `start_date`, `vo2max` с сервера | inline (`AnalysisScreen.tsx:643-655`): `activities[0]`, `activities.length` без фильтра типа, `vo2max` локальный | `server.js:6997` — `{lastActivityId, power, heart, speed, cadence, vo2max, activitiesCount}` |
| `GET /api/goals` | получает `current_value/percent/pace`, но затем **перезаписывает** `current_value` клиентским расчётом и делает `PUT` (`PlanPage.jsx:388,463`) | доверяет серверу (`MetaGoalCard.tsx:63`) | `server.js:4089-4133` |
| `POST /api/garage/upload` | через `apiFetch` (`ImageUploadModal.jsx:62`) | сырой `fetch(\`${API_BASE_URL}/api/garage/upload\`)` с ручным Bearer (`ImageUploadModal.tsx:109`) | multipart |
| `POST /api/login` | читает `res.token`, remember → localStorage/sessionStorage (`LoginPage.jsx:68-70`) | `response.token` → AsyncStorage `token`/`sessionToken` (`LoginScreen.tsx:97-99`) | `{token, user}` (`server.js:3990`) |
| `PUT /api/user-profile` | шлёт весь профиль (в т.ч. `hr_zones`, рассчитанные клиентом) | 4 экрана шлют частичные объекты (`TrainingSettingsScreen.tsx:57`, `PersonalInfoScreen.tsx:55`, `HRZonesScreen`, `AccountSettingsScreen`) | merge с existing (`recommendations/index.js:92`) |
| `POST /api/coach/chat` | — | через `react-native-sse` EventSource POST (`coachSSE.ts:71`) — единственный SSE-эндпоинт, не через apiFetch | |

### 5.5 Naming inconsistencies

* Разделители: `/api/unlink_strava`, `/link_strava`, `/exchange_token` (snake) vs `/api/skills-history`, `/api/analytics-snapshot`, `/api/meta-goals`, `/api/training-plan` (kebab) vs `/api/user-profile/onboarding`; параметры `:dayKey`, `:bikeId`, `:goalId` (camel) vs `:id`, `:name`.
* Без префикса `/api`: `/exchange_token`, `/auth/success`, `/oura/exchange_token`, `/link_strava`, `/strava-auth-status` — при этом Vite-proxy (`vite.config.js:22-38`) проксирует `/activities` (маршрута нет) и `/exchange_token`.
* Envelope ответов: массив напрямую (`/api/goals`, `/api/bikes`, `/api/activities`, `/api/meta-goals`, `/api/training-types`), объект напрямую (`/api/user-profile`), обёртки `{summary}`, `{analysis}`, `{stats}`, `{saved, reason}`, `{token}`, `{token, user}`. Клиентский код каждый раз знает конкретную форму.
* Поля: тело и БД — snake_case (`goal_type`, `hr_threshold`, `max_hr`), но `analytics-snapshot` — camelCase (`lastActivityId`, `activitiesCount`), Strava-passthrough — snake (`total_elevation_gain`). Внутри сервера баг именования профиля (`resting_heartrate` vs `resting_hr`, см. §4.3).

### 5.6 Формат ошибок

* `{ error: '<text>' }` — ≈140 мест в `server.js` + 8 в роутерах (`authMiddleware`: `{error:'No token'}`/`{error:'Invalid token'}`).
* `{ error: true, message: '<text>' }` — 50 мест (например `server.js:1167,1222,1276,2939-2942,7000`).
* `routes/*`: `{ error: 'Unauthorized', code: 'UNAUTHORIZED' }` — единственное место с `code`.
* Plain-text: `res.status(400).send('Некорректное имя')` (`server.js:1885`).
* Оба `apiFetch` (`react-spa/src/utils/api.js:38`, `BikeLabApp/src/utils/api.ts:66`) делают `throw new Error(errorData.error || …)` → для 50 маршрутов сообщение ошибки — строка `"true"`.

### 5.7 Auth

* Три middleware: `authMiddleware` (`server.js:3997`, кладёт `req.user = payload`, хендлеры читают `req.user.userId || req.user.id`), `authenticateUser` (`routes/skillsHistory.js:9`, кладёт `req.userId`, дополнительно 403 при несовпадении `user_id` в body/query), копия в `routes/oura.js:12` (комментарий в файле прямо говорит, что скопировано, т.к. `authMiddleware` не экспортируется).
* 5 ручных `jwt.verify` внутри хендлеров (`/api/ai-analysis` 3514, `/api/activities/:id/ai-analysis` 3536 и др.) с другим текстом 401 (`'Authorization required'`).
* Глобальная защита отключена (`server.js:4011`, закомментировано). 13 `/api/*` маршрутов без middleware: `/api/garage/images`, `/api/proxy/strava-image`, `/api/hero/positions`, **`DELETE /api/hero/images/:name`**, `/api/ai-analysis` (ручная), `/api/activities/:id/ai-analysis` (ручная), `/api/register|login|verify-email|resend-verification` (ожидаемо), `/api/weather/wind`, `/api/weather/forecast` (открытый прокси к погодному API), `/api/ai-cache-stats`.
* Клиенты: одинаковая схема Bearer из двух ключей (`token`/`sessionToken` в App, `token` в localStorage/sessionStorage в SPA); 401 → SPA `window.location.href='/login?session_expired=true'`, App — `setSessionExpiredHandler`. SPA вдобавок иногда дублирует заголовок вручную (`AnalysisPage.jsx:774` передаёт `Authorization` в `apiFetch`, который его и так ставит).

### 5.8 Конфигурация base URL

| | SPA | App |
|---|---|---|
| Основной механизм | относительные `/api/...` + Vite dev-proxy → `http://localhost:8080` (`vite.config.js:21-38`); в prod сервер отдаёт `react-spa/dist` сам (`server.js:520`) | `export const API_BASE_URL = __DEV__ ? 'http://192.168.10.40:8080' : 'https://bikelab.app'` (`utils/api.ts:8`); ни `.env`, ни `react-native-config` |
| Хардкоды в обход | `Sidebar.jsx:122-124` (`import.meta.env.PROD ? 'https://bikelab.app' : 'http://localhost:8080'`), `OnboardingModal.jsx:300-301` — то же самое, `LoginPage.jsx:10` `window.location.origin + '/exchange_token'` | `GarageScreen.tsx:517-518` — `https://bikelab.app` / `http://192.168.10.82:8080` (другой IP, чем в api.ts), `LoginScreen.tsx:116,189`, `StravaIntegrationScreen.tsx:46` — `https://bikelab.app/exchange_token?mobile=true`, `ImageUploadModal.tsx:109` |
| Env-переменные | `VITE_*` не используются | нет |

---

## 6. Shared package proposal

Целевая структура (pnpm workspaces; корень уже объявляет `packageManager: pnpm@10`, но без `workspaces`):

```
/
├─ package.json            # "private": true, pnpm-workspace.yaml: packages: [server, react-spa, BikeLabApp, packages/*]
├─ packages/
│  └─ shared/              # @bikelab/shared
│     ├─ package.json      # "type":"module", "exports": {".":…, "./calc":…, "./api":…}, "main"→dist/cjs для server
│     ├─ tsconfig.json     # composite: true, declaration, outDir dist
│     └─ src/
│        ├─ types/         # Activity, Goal, MetaGoal, GoalMetric, GoalPace, UserProfile, Bike, BikeHealth, Skills, RiderProfile, AnalyticsSnapshot, Achievement, CalendarEvent, CoachMessage…
│        ├─ calc/          # skills.ts, goalProgress.ts, vo2max.ts, hrZones.ts, power.ts, ftp.ts, trainingPlans.ts, trend.ts, units.ts, dates.ts
│        ├─ constants/     # goalTypes.ts (VALID_FIELDS/SKILLS/HEALTH_METRICS + labels + units), zones.ts (коэффициенты), bikeComponents.ts (BIKE_COMPONENTS), achievementsFormat.ts, colors.ts (только семантические, не UI)
│        └─ api/           # endpoints.ts (typed paths), client.ts (createApiClient({baseUrl, getToken, onUnauthorized})), errors.ts (ApiError с нормализацией {error}|{error,message})
├─ server/                 # CommonJS сейчас → потребует либо dist/cjs билд shared, либо перевод server на ESM
├─ react-spa/
└─ BikeLabApp/
```

### 6.1 Что извлекать

| Модуль shared | Источники (SPA / App / server) | Снимаемые LOC (оценка) | Риск | Single source of truth |
|---|---|---|---|---|
| `types/*` | `BikeLabApp/src/types/activity.ts`, `types/coach.ts`, `utils/goalsCache.ts:31-99` (Goal/MetaGoal/GoalMetric/GoalPace), `utils/analyticsSnapshot.ts:6-30`, `achievements/types.ts`, `ftpAnalysis.ts:5-20`; 9 локальных `interface UserProfile` и 4 `interface Bike` в App (`VO2maxWidget.tsx:11`, `AppDataContext.tsx:6`, `GarageScreen.tsx:52,68`, `BikesModal.tsx:17`, …); SPA — JSDoc/нет типов; сервер — `goalCalculator.js:23-31` как источник enum'ов | ~250 в App; +типизация SPA через `// @ts-check`/JSDoc или миграция на TS | Низкий | Типы генерировать из серверных схем (zod) — см. api |
| `calc/skills.ts` | `react-spa/src/utils/skillsCalculator.js` (619), `BikeLabApp/src/utils/skillsCalculator.ts` (684), `server.js:3013-3060 determineRiderProfile` | ~1 250 (оставить один файл ~600) | **Средний**: нужно выбрать окно и confidenceFactor (рекомендуется App-вариант) и один раз пересчитать `skills_history` | **Сервер**: `GET /api/skills` считает + пишет снапшот; клиенты только отображают. Shared-модуль используется сервером и тестами |
| `calc/goalProgress.ts` | `server.js:4488-4667` (legacy), `goalsCache.js:278-498`, `goalsCache.ts:100-207` (мёртв) | ~600 в клиентах, ~180 в server.js после слияния с `goalCalculator.js` | **Средний-высокий**: SPA пишет `current_value` в БД (`PlanPage.jsx:463`), надо убрать write-path; чинится баг `recovery` | **Сервер** (уже фактически так, `server.js:4097`). Клиентский расчёт оставить только для `health`-source (данные HealthKit не покидают телефон) через тот же shared-модуль |
| `calc/vo2max.ts` | `server.js:2370-2460` и `2595-2680` (два inline `estimateVO2max`), `AnalysisScreen.tsx:385-430`, Cooper-test ×4 (`GarageCalculators.jsx:196`, `PlanPage.jsx:1826`, `GoalAssistantPage.jsx:620`, `VO2maxWidget.tsx:36`), Jackson (`PlanPage.jsx:322`) | ~300 | Низкий (чистые формулы); попутно исправляется `resting_heartrate`→`resting_hr` | **Сервер** для «оценённого» VO2max (нужен профиль + вся история); Cooper/Jackson-калькуляторы — чистые функции из shared на клиентах |
| `calc/hrZones.ts` | 9 файлов (§4.4), ~20 строк каждая копия | ~350 | Низкий | Сервер отдаёт `hr_zones` как derived-поле профиля; клиенты вызывают shared только для превью при вводе |
| `calc/power.ts` | `server.js:4555-4620`, `goalsCache.js:409-470`, `PowerAnalysis.jsx:105-200`, `PowerAnalysis.tsx:92-200`, `TrainingsPage.jsx:186-230` | ~400 | Средний: в UI-компонентах модель переплетена с кэшем/ветром; нужен `estimateRidePower(activity, params, wind?)` | **Сервер** считает `estimated_power` при кэше активностей (ветер он уже проксирует), клиенты рендерят; параметры (вес, покрытие) — в профиле |
| `calc/ftp.ts` | `react-spa/src/utils/vo2max.js` (53), `BikeLabApp/src/utils/ftpAnalysis.ts` (178, включая `getFTPLevel`) | ~120 | Низкий | Пока клиенты (streams-тяжёлый расчёт), потом сервер, когда `intervals`-цели переедут в `goalCalculator` |
| `calc/trainingPlans.ts` | `react-spa/src/utils/trainingPlans.js` (175), `server/trainingPlans.js` (110) | ~175 (удалить клиентский) | Низкий; согласовать `weeklyRidesModifier` | **Сервер** (`GET /api/training-plan` уже есть) |
| `calc/trend.ts`, `calc/dates.ts`, `calc/units.ts` | `computeMetricTrend` (`garageData.js:195`, `analyticsSnapshot.ts:90`), ISO-week функции (`AnalysisPage.jsx`, `AnalysisScreen.tsx`), `median` (3 копии), `*3.6`/`/1000`/`/3600` по всему коду | ~150 | Низкий | Клиенты |
| `constants/goalTypes.ts` | `goalCalculator.js:23-31`, `getGoalTypeLabel/getGoalUnit` в `GoalDetailPage.jsx`/`GoalDetailsScreen.tsx`, `AddGoalModal.jsx`, `aiGoals.js` prompt-enum'ы | ~120 | Низкий | Shared, сервер валидирует по нему |
| `constants/bikeComponents.ts` | `server.js:2952-2965 BIKE_COMPONENTS`, метки в `MaintenancePage.jsx`, `BikeGarageScreen.tsx` | ~60 | Низкий | Shared |
| `constants/achievementsFormat.ts` | `garageData.js:263 formatBadgeValue`, `achievements/helpers.ts:5,35` | ~70 | Низкий | Shared |
| `api/client.ts` + `api/endpoints.ts` | `react-spa/src/utils/api.js`, `shared/utils/api.js` (удалить), `BikeLabApp/src/utils/api.ts`, `coachSSE.ts` (оставить как адаптер), сырой fetch в `ImageUploadModal.tsx:109`, хардкоды base URL (§5.8), 127+70 строк-литералов путей | ~200 прямых + устранение 197 строковых путей | Средний: DI для storage (localStorage vs AsyncStorage) и `onUnauthorized`; нормализация ошибок `{error}` vs `{error,message}` | Shared. Схемы ответов — zod в shared, сервер валидирует тело запроса теми же схемами (`goalCalculator.validateMetric` уже частично это делает) |
| Цвета/UI-константы | `#10b981/#ef4444` (pace), `#274dd3`, зоны `#22c55e…#ef4444` в `HeartAnalysis.tsx:227-231` и `HeartRateZonesChart.jsx COLORS` | ~30 | Низкий | Только семантические токены (zone1…zone5, success/danger); стили остаются в клиентах |

Итого реалистично снять ≈2 900–3 400 строк в клиентах и ≈600 в `server.js` (legacy `calculateGoalProgress`, второй `estimateVO2max`, `determineRiderProfile`, 12 копий refresh-токена — последнее не shared, а внутренний рефакторинг сервера).

Не выносить в shared: UI-компоненты (recharts vs gifted-charts/react-native-svg несовместимы), storage/кэш (`cache.js`/`cache.ts` — разные бэкенды; можно вынести интерфейс `KeyValueStore` и TTL-логику), i18n (есть только в App).

### 6.2 Tooling

* **pnpm workspaces** (`pnpm-workspace.yaml`), `@bikelab/shared` как `workspace:*` в трёх `package.json`. Корневые скрипты `build`/`start` в `package.json` сейчас делают `cd … && npm install` — заменить на `pnpm -r`.
* **TypeScript project references**: `packages/shared/tsconfig.json` с `composite: true`, `declaration: true`; `BikeLabApp/tsconfig.json` (`extends @react-native/typescript-config`) добавляет `references: [{path: "../packages/shared"}]` и `paths: {"@bikelab/shared/*": ["../packages/shared/src/*"]}`; для `react-spa` (JS) — `jsconfig.json` + `// @ts-check` либо постепенная миграция на TS (Vite 7 поддерживает `.ts/.tsx` без настройки).
* **Сборка shared**: `tsup`/`tsc` в два таргета — ESM (`dist/esm`, для Vite и Metro) и CJS (`dist/cjs`, для `server` без `"type":"module"`), `exports` map с `import`/`require`. Альтернатива для сервера: перейти на ESM или `tsx`/`ts-node` — но CJS-билд дешевле.
* **Metro (RN 0.83)**: `metro.config.js` дополнить `watchFolders: [path.resolve(__dirname, '../packages/shared'), path.resolve(__dirname, '../node_modules')]` и `resolver.nodeModulesPaths` на корневой `node_modules`; pnpm по умолчанию создаёт symlink-структуру — Metro нужен `resolver.unstable_enableSymlinks: true` (в 0.83 включён по умолчанию) либо `node-linker=hoisted` в `.npmrc` для BikeLabApp (рекомендуется, т.к. iOS Pods/autolinking чувствительны к symlink'ам). Импортировать `src` напрямую (Metro сам транспилирует TS через babel), не `dist`, чтобы не гонять watch-сборку. Убедиться, что `react`/`react-native` не дублируются (`resolver.extraNodeModules` или `dedupe` в pnpm).
* **Vite**: `resolve.alias` `@bikelab/shared` → `../packages/shared/src`; для линкованного пакета указать `optimizeDeps.exclude: ['@bikelab/shared']` и `server.fs.allow: ['..']`.
* **Jest в App / Vitest в SPA / node:test на сервере** — тесты на `calc/*` пишутся один раз в `packages/shared` (сейчас есть только `server/test_goalCalculator.js`, 314 строк).
* CI: `pnpm -r typecheck`, `jscpd --threshold 8` как gate (текущее 8.05%) с `--formats-exts` из этого отчёта.

---

## 7. Recommended order of extraction

1. **Неделя 0 — гигиена**: удалить `shared/utils/api.js`, пустые `shared/constants`, `backend/routes`, `SkillsRadarChart.jsx.bak`, мёртвые `calculateGoalProgress`/`updateGoalsWithCache`/`getCachedGoals`/`cacheGoals` из `BikeLabApp/src/utils/goalsCache.ts` (оставить типы, переехать в `types/goal.ts`), 19 dead routes (§5.2, по согласованию — `POST /api/calendar` и `POST /api/meta-goals` могут быть нужны для будущего UI). Один экспортируемый `authMiddleware` вместо трёх, единый формат ошибок `{error: {code, message}}` + адаптер в `apiFetch`. Закрыть `DELETE /api/hero/images/:name` middleware'ом.
2. **Поднять workspace**: `pnpm-workspace.yaml`, `packages/shared` с одним модулем — `types/` (перенос из App) и `api/client.ts` (объединение двух `apiFetch`, DI storage/onUnauthorized, `API_BASE_URL` из env: `VITE_API_URL` / `react-native-config`). Это убирает хардкоды §5.8 и даёт инфраструктуру без изменения бизнес-логики.
3. **Server-first расчёты (устраняют дрифт чисел)**, по одному PR:
   1. `calc/hrZones.ts` → сервер начинает вычислять `hr_zones` в `GET /api/user-profile`; удалить 9 клиентских копий.
   2. `calc/vo2max.ts` → заменить оба inline `estimateVO2max` в `server.js`, починить имена полей, удалить `AnalysisScreen.calculateVO2max`; App берёт `summary.vo2max` с сервера как SPA.
   3. `calc/skills.ts` → новый `GET /api/skills` (считает по shared-модулю, сохраняет снапшот, отдаёт `skills + riderProfile + trend`); убрать `POST /api/skills-history` из клиентов и `manageSkillsHistory` из обеих Analysis-страниц. Зафиксировать одну формулу (предлагается App: rolling 90 д + confidenceFactor).
   4. `calc/goalProgress.ts` → слить legacy `server.js:4488` с `goalCalculator.js`; удалить `react-spa/utils/goalsCache.js` расчёт и write-back (`PlanPage.jsx:455-469`, `GoalsManager.jsx:197-215`, `GoalAssistantPage.jsx:151`); `health`-source оставить клиентским через shared.
   5. `calc/power.ts` → сервер обогащает активности `estimated_power`; `PowerAnalysis.*` становятся чисто визуальными.
4. **Клиентские чистые утилиты**: `trend.ts`, `dates.ts`, `units.ts`, `constants/*`, `achievementsFormat.ts`, `ftp.ts`, удаление `react-spa/utils/trainingPlans.js`.
5. **Внутри-слойный рефакторинг** (не блокирует shared, но снимает ~2 000 строк intra-клонов): в SPA — вынести калькуляторы из `GarageCalculators.jsx` (клоны #1,3,4,5,6 с `GoalAssistantPage`, `NutritionPage`, `PlanPage`), общий `TrendChart` для 6 `*Chart.jsx`, общий период-селектор для `AnalysisPage`/`PlanPage` (28 клонов); в App — базовый `BackgroundPicker` (4 варианта), общий `SettingsForm` для `AccountSettings/PersonalInfo/TrainingSettings/HRZones`, общий `IntegrationScreen` для Oura/Strava/AppleHealth; в сервере — `withStravaToken(userId, fn)` вместо 12 копий refresh-блока и разбиение `server.js` на роутеры (`routes/goals.js`, `routes/activities.js`, …) с общим `authMiddleware`.
6. **Контракт**: описать эндпоинты в `shared/api/endpoints.ts` (zod-схемы запросов/ответов), включить валидацию на сервере; после этого — генерация типизированного клиента и удаление 197 строковых путей из клиентов. Ввести `jscpd`-gate в CI.

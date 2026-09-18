# BikeLab / CycleProg — аудит кодовой базы и план подготовки к массовому проду

Дата: 15.09.2026. Ветка `main`, коммит `92475da`. Три слоя: `server/` (Express + Postgres), `BikeLabApp/` (React Native 0.83 + TS), `react-spa/` (Vite + React 19).

Этот файл — сводка и план. Детальные отчёты с построчными ссылками лежат рядом в `layers/`:

| Файл | Что внутри | Находок |
|---|---|---|
| `layers/01-server.md` | Бекенд: карта всех 118 маршрутов с auth-статусом, 46 находок, целевая структура, порядок извлечения | 5 Critical / 10 High / 19 Medium / 12 Low |
| `layers/02-bikelabapp.md` | Мобильное приложение: карта модулей с эндпоинтами, 45 находок, целевая архитектура | 4 Critical / 12 High / 18 Medium / 11 Low |
| `layers/03-react-spa.md` | Веб: карта модулей, 44 находки, что легаси относительно мобилки | 2 Critical / 13 High / 20 Medium / 7 Low / 2 Info |
| `layers/04-cross-layer.md` | Дубли между слоями (jscpd), логика клиент↔сервер, аудит API-контракта, дизайн shared-пакета | — |

Все ID находок (S-xx сервер, A-xx аппка, W-xx веб) в плане ниже ссылаются на эти файлы. Каждое утверждение в отчётах имеет `файл:строка`; критические я перепроверил вручную по исходникам.

> **Статус выполнения** (ветка `to-prod-state`)
>
> | Фаза | Статус | Дата | Примечания |
> |---|---|---|---|
> | 0 — стоп-кран | ✅ протестировано локально (web + iOS-симулятор: логин, привязка, выход), готово к мержу и деплою | 16.09.2026 | Все T-0.x выполнены. В ходе теста добавлены: защита от двойного обмена auth-code (web `ExchangeTokenPage`, app deep-link), защита от двойного запуска OAuth в аппке, убран старый Vite-proxy `/exchange_token`. Ручные шаги владельца — см. §0.1 ниже. `react/jsx-no-leaked-render` включено как `warn` (110 легаси-мест → фаза 5). Строки в `layers/*.md` даны по состоянию ДО фазы 0 — в `server.js` сдвиг ≈ −160 строк после удаления маршрутов. |
> | 1 — фундамент сервера | ✅ код на машине, ждёт ручного теста | 16.09.2026 | T-1.1…T-1.7 выполнены. Сервер: 98 unit + 17 integration тестов (реальный Postgres), web 5, mobile 6, GitHub Actions CI. Ручные шаги — §1.1 ниже. Отступление от плана: формат ошибок `{error: string, code}` вместо `{error:{code,message}}` — обратно совместимо с клиентами. |
> | 2 — монорепо и shared | ✅ код на машине, tsc/тесты зелёные | 16.09.2026 | T-2.1…T-2.4. **Отступление:** npm workspaces вместо pnpm (нет pnpm на машине, RN+Pods хрупки к symlink-раскладке); `BikeLabApp` не в workspaces (peer-конфликт reanimated/worklets), подключён через `file:../packages/shared`. `packages/shared`: zod-схемы всех доменных типов (54 теста), типизированный API-клиент (24), константы и чистые утилиты (56) — 134 теста. Сервер валидирует тела 13 маршрутов (`validateBody`). Из клиентов убрано ≈365 строк дублей, 9 `UserProfile` + 4 `Bike` → один тип; баг имён HR-полей (A-06, §4.3) закрыт по построению. Ручные шаги — §2.1. |
> | 3 — сервер как источник истины | ✅ код на машине, ждёт ручного теста | 16.09.2026 | T-3.1…T-3.6. HR-зоны, VO2max, skills, прогресс целей, мощность, FTP — по одной реализации в `packages/shared/calc`, считает сервер; клиенты только рендерят. Новые маршруты: `GET /api/skills`, `GET /api/analytics/ftp`, `GET /api/activities/:id/ftp-analysis`, `?downsample` у streams; `GET /api/meta-goals` отдаёт `sub_goals`; `summary.power`. Новые колонки/таблицы (аддитивно): `synced_activities.estimated_power`, `activity_analysis`, UNIQUE на `skills_history`. Из клиентов удалено ≈5 000 строк. Тесты: shared 244, сервер 137 unit + 55 integration. Ручные шаги — §3.1. |
> | 4 — декомпозиция сервера | ✅ код на машине, ждёт ручного теста | 17.09.2026 | **T-4.1**: `server.js` 5 403 → ~240 строк (bootstrap); 25 роутеров `routes/`, логика в `services/`, SQL в `repositories/` (ни одного `pool.query` в `routes/`). **T-4.2**: транзакции (`withTransaction`) в ai-generate, rides/import, bikes labels, hero assign-all, Oura upsert, admin delete; батч-записи через UNNEST вместо N запросов; opt-in пагинация `GET /api/activities?limit&cursor` (+ `X-Total-Count`, `X-Next-Cursor`; без `limit` — как раньше), `GET /api/coach/conversations/:id?limit` (default 200), кап 1000 на events/calendar, `skills-history/range?limit` ≤ 500; миграция индексов (`users(verification_token)`, `activity_meta_goals_progress(user_id,activity_id)`, `analytics_snapshots(user_id,last_activity_id)`); N+1 в коуче (`ANY($1)`), 5-сек мемо токена Strava. **T-4.3**: `lib/cache.js` (async интерфейс, memory | Redis по `REDIS_URL`) — activities/bikes/weather/AI-кеши, общий вид квоты Strava, store для express-rate-limit; очередь запросов к Strava остаётся per-instance. CI гоняет интеграцию и с Redis. **T-4.4**: история коуча берётся с сервера (`coach_messages`, ≤30 сообщений / 24k символов), `max_tokens`, `token_usage` заполняется, таблица `ai_usage_daily` + дневной бюджет 200k токенов → 429 `AI_BUDGET_EXCEEDED`, `GET /api/admin/ai-usage`, убран 3-модельный fallback в aiGoals. **T-4.5** (без Apple — решение владельца): `users.token_version` (ревокация всех токенов), таблица `refresh_tokens` + `POST /api/auth/refresh|logout|logout-all` (аддитивно: `login`/`exchange` возвращают ещё `refreshToken`; TTL access-токена пока 7d), `POST /api/forgot-password` + `/api/reset-password`, единый `changeEmail` (409 `EMAIL_TAKEN`, сброс `email_verified`). Тесты: unit 172, integration 271 (в т.ч. с Redis). Регрессии, найденные по ходу: ImageKit config shadowing (T-1.1), онбординг без строки профиля, `consistency` float → INTEGER. Ручные шаги — §4.1. |
> | 5–7 | ⏳ | | |
>
> **Стратегия тестов (решение 16.09):** тесты пишутся по ходу, а не в конце. Правило для каждого задания: новая middleware / чистая функция / helper — обязателен unit-тест в том же PR (сервер: `vitest`, `server/test/`; каркас поднят в фазе 0 — 26 тестов). Интеграционные тесты маршрутов (supertest + testcontainers) и клиентские тесты (Jest/Vitest/Maestro) — в T-1.7, T-5.5, T-6.5; покрытие `shared/calc` 100 % — в T-7.2. **Правило с 16.09 (после инцидента с потерянным `NOW()` в UNNEST-апсерте):** любое изменение SQL сопровождается интеграционным тестом на реальном Postgres (`npm run test:integration`), юнит-теста с фейковым пулом недостаточно.
>
> **Правило с 17.09 (фаза 4):** каждый маршрут, которого касается задание, получает smoke-тест на реальном Postgres (минимум 401 без токена + happy path); серверный ESLint с `no-undef: error` — обязательный gate в CI (после инцидента с `ReferenceError` в `/api/weather/forecast`). При работе несколькими агентами над одним файлом — каждый в своём worktree, правки строго локальны к извлекаемому блоку, монтирование роутера ставится на место первого удалённого блока.
>
> **§4.1 Ручные шаги после фазы 4 (владелец):** в корне репо `npm install` (новые зависимости сервера: `ioredis`, `rate-limit-redis` — подгружаются лениво, без `REDIS_URL` не используются). Env — ничего обязательного; опциональные переменные фазы 4 перечислены в `server/.env.example` (бюджет OpenAI, TTL токенов, `REDIS_URL`). Миграции 0005–0007 (индексы, `ai_usage_daily`, `token_version`/`refresh_tokens`/reset-колонки) применятся сами при старте (`MIGRATE_ON_START`) или `npm run migrate`. Изменение контракта, о котором должны знать клиенты (фазы 5/6): `POST /api/coach/chat` теперь ждёт `message` (старое поле `messages` принимается, но история берётся из БД); `POST /api/user-profile/email` при занятом адресе — 409 `EMAIL_TAKEN` (было 400 `EMAIL_ALREADY_EXISTS`); в ответах логина появилось поле `refreshToken`. После `git pull`: `cd server && npm run lint && npm test && npm run test:integration` (нужен локальный Postgres; `DATABASE_URL` тестов автоматически переписывается на scratch-БД `bikelab_it`). Перед деплоем — быстрый прогон в браузере и симуляторе: логин, привязка Strava, гараж, анализ, коуч (SSE), цели — пути роутов не менялись, но это первый запуск с новой раскладкой.
>
> **§0.1 Ручные шаги после фазы 0 (владелец):**
> 1. Strava API settings → сгенерировать новый Client Secret (старый скомпрометирован историей git).
> 2. Render → Environment: `STRAVA_CLIENT_ID=165560`, `STRAVA_CLIENT_SECRET=<новый>`, `BACKEND_BASE=https://bikelab.app`, `NODE_ENV=production`. Те же в локальный `server/.env`. Полный список переменных — `server/.env.example`.
> 3. После первого деплоя (миграция добавит колонку): `UPDATE users SET is_admin = true WHERE email = '<твой email>';` — иначе админка недоступна никому.
> 4. Мобилка: `cd BikeLabApp/ios && pod install` (добавлены `react-native-config`, `react-native-keychain`; удалены 5 пакетов). Для `react-native-config` на iOS — схема выбора `.env` через `ENVFILE` в build phase по документации пакета; Android — через gradle-плагин пакета.
> 5. **Координация релиза:** новый сервер ломает Strava-логин и привязку в СТАРЫХ сборках аппки (убраны `?mobile=true` без `state` и токен в URL). Деплоить сервер одновременно с выкладкой новой сборки приложения (или сначала TestFlight → прод сервера → App Store).
> 6. Веб-сборка: `VITE_*` переменные опциональны (дефолты — прод), см. `react-spa/.env.example`.
>
> **§1.1 Ручные шаги после фазы 1 (владелец):**
> 1. Снять baseline-схему прода **один раз** (из этой среды база недоступна): `cd server && node scripts/dump-schema.js > migrations/1758000000000_baseline.sql` (читает `.env`), просмотреть, закоммитить. После этого удалить `server/test/fixtures/base-schema.sql` и его подключение в `test/integration/setup.js` — это временная замена baseline для тестов.
> 2. `cd server && npm run migrate` один раз против прода — создаст `pgmigrations` и отметит baseline + startup-iife как применённые (всё `IF NOT EXISTS`, данные не меняются). Дальше миграции идут при старте (`MIGRATE_ON_START=true` по умолчанию); при >1 инстансе — `MIGRATE_ON_START=false` и отдельный шаг деплоя.
> 3. Render env (опционально): `LOG_LEVEL=info`, `SENTRY_DSN=<если заведёшь проект в Sentry>`. Логи теперь JSON (pino) — в Render читаются нормально.
> 4. **Хранение активностей.** `synced_activities` теперь хранит slim-JSON каждой активности (~1–1.5 КБ: только используемые поля + полилиния карты). Оценка: 1000 пользователей × 500 заездов ≈ 0.5–0.75 ГБ. Кеш в памяти остаётся как быстрый слой (2 ч). При отвязке Strava и удалении аккаунта данные удаляются (требование Strava API Agreement). Ретеншн (например, сырой JSON только за 2 года) — при необходимости, отдельной задачей.
> 5. Ручной тест (сервер локально + web + симулятор): первый вход в Garage → одна полная загрузка истории Strava (заполняется `synced_activities.raw`), перезапуск сервера → к Strava уходит только `after=…`; числа в Analysis/Goals/BikeGarage прежние; ошибки в UI читаемые (не «true»).
>
> **§2.1 Ручные шаги после фазы 2 (владелец):**
> 1. Монорепо: `npm install` в корне ставит зависимости `server`, `react-spa`, `packages/shared` (hoisting в корневой `node_modules`; в `server/node_modules` теперь мало пакетов — это нормально). `BikeLabApp` — отдельно, как раньше (`npm install` внутри).
> 2. После любого изменения в `packages/shared/src` — `npm run build` в `packages/shared` (или `npm run dev` для watch): Metro и сервер читают собранный `dist`, Vite в dev читает исходники напрямую.
> 3. Metro перезапустить с `--reset-cache` один раз после появления `watchFolders`.
> 4. Render: корневые `build`/`start` теперь сначала собирают shared — менять команды в Render не нужно.
>
> **§3.1 Ручные шаги после фазы 3 (владелец):**
> 1. Разовый пересчёт истории навыков по единой формуле: `cd server && npm run skills:recompute -- --dry-run` (показать), затем без `--dry-run` (переписать). Читает только из `synced_activities`, в Strava не ходит.
> 2. Ручной тест: HR-зоны совпадают в аппке и вебе (аппка Analysis теперь по Карвонену при заполненном пульсе покоя — это исправление); VO2max одинаков в обоих клиентах; радар навыков в вебе может измениться (теперь формула аппки); цели `recovery`/`intervals` могут разово поменять значение (починены единицы и «всегда 0»); Analysis не делает ни одного запроса к `/api/weather/wind`; FTP Workload при первом открытии после новых заездов прогревает серверный кеш (до 20 stream-загрузок за запрос).
> 3. Веб `npm test` сейчас без тестов (утилиты переехали в shared) — вернётся в T-6.5.

---

## 1. Резюме

**Состояние.** ~74 000 строк кода (server 14k, app 34k, spa 26k). Код работоспособен как MVP одного разработчика, но в архитектурном смысле это «один большой файл на экран/сервер»: `server.js` — 7 200 строк и 109 маршрутов в одном файле, миграции схемы выполняются при каждом старте, бизнес-логика продублирована между сервером и двумя клиентами (и уже разошлась), слоя данных на клиентах нет, тестов нет (1 нерабочий файл), CI нет.

**Вердикт: в текущем виде выпускать в массовый прод нельзя** — не из-за архитектуры, а из-за 11 критических дыр, которые закрываются за 1–2 дня без рефакторинга (фаза 0 ниже). После фазы 0 продукт можно выпускать ограниченно; фазы 1–3 (≈4–6 недель) делают его масштабируемым и поддерживаемым.

**Что хорошо** (чтобы не переписывать зря): параметризованный SQL везде — инъекций нет; bcrypt; IDOR почти везде закрыт `AND user_id = $N`; уже есть `synced_activities`, `analytics_snapshots`, `goalCalculator.js` с метрик-based моделью целей — то есть сервер уже готов стать единственным источником истины; в аппке есть i18n (958 ключей, en/ru синхронны); Oura OAuth сделан правильно с `state`.

### Топ-10 рисков (все Critical/High, все подтверждены)

| # | Риск | Где | ID |
|---|---|---|---|
| 1 | Любой залогиненный пользователь видит e-mail всех пользователей и **может удалить любой аккаунт** — админ-роуты защищены только `authMiddleware`, понятия «admin» в системе нет вообще (ни колонки, ни claim) | `server.js:6860, 6887, 6915`; `react-spa App.jsx:76` | S-01, W-01 |
| 2 | **Strava `CLIENT_SECRET` захардкожен в исходнике** и лежит в git-истории | `server.js:37` | S-02 |
| 3 | Любой пользователь может выполнить `ALTER SYSTEM SET` / `DISCARD ALL` на прод-Postgres и читать `pg_stat_activity` с чужими запросами | `server.js:5944–6170` | S-03 |
| 4 | **JWT утекает через URL**: сервер редиректит `?jwt=…`, оба клиента кладут сессионный JWT в OAuth `state=` Strava → токен в истории браузера, Referer, логах Strava | `server.js:634,638,5717`; `Sidebar.jsx:127`; `OnboardingModal.jsx:304` | S-07, W-02 |
| 5 | «Привязать Strava» в аппке идёт через **login**-flow `/exchange_token`, а не `/link_strava` → email-пользователь оказывается в другом (пустом) аккаунте | `StravaIntegrationScreen.tsx:46` | A-01 |
| 6 | При sign-out не очищается in-memory состояние → следующий пользователь на устройстве в течение часа видит чужие активности и профиль | `ProfileScreen.tsx:135`; `AppDataContext.clearAll` не вызывается нигде | A-02 |
| 7 | **Крэш вкладки Analysis** у любого пользователя без power-meter: `{count && count > 0 && …}` рендерит `0` вне `<Text>`; ErrorBoundary в приложении нет ни одного | `PowerAnalysis.tsx:651,657` | A-03 |
| 8 | Любая ошибка БД в хендлерах без try/catch (`/api/rides*`, `/api/checklist*`, `GET /api/goals`) = unhandled rejection = **падение всего процесса** на Node 20 | `server.js:1354–1420, 4016–4134` | S-20 |
| 9 | `DELETE /api/account` может вернуть `success:true`, ничего не удалив: ошибка внутри транзакции глотается, Postgres абортит транзакцию, `COMMIT` молча становится `ROLLBACK` (GDPR) | `server.js:5897–5926` | S-04 |
| 10 | Открытый SSRF-прокси произвольных URL без auth и без таймаута; удаление файлов с диска без auth | `server.js:1603, 1883` | S-05, S-06 |

Плюс системные: нет rate-limit (брутфорс паролей, спам через Brevo, неограниченный расход OpenAI одним пользователем), нет helmet/CORS-origin, нет health-check и graceful shutdown, `PORT` захардкожен, Strava-квота приложения (300 запросов/15 мин на всех) выжигается полной перезагрузкой истории при каждом cache-miss — ~20 активных пользователей после деплоя положат интеграцию для всех.

---

## 2. Что не так структурно (почему трудно масштабировать)

### 2.1 Дублирование

jscpd (60 токенов / 8 строк, jsx↔tsx как один язык): **8.05 % строк, 313 клонов**. По слоям: react-spa **17.7 %**, BikeLabApp **11.9 %**, server 8.2 %. Cross-layer клонов 52 (872 строки), из них 44 — SPA↔App.

Но цифры jscpd — не главное. Главное — **бизнес-логика реализована в 2–5 местах и уже разошлась**, поэтому пользователь видит разные числа в web, в аппке и в целях:

| Логика | Копий | Где | Дрифт |
|---|---|---|---|
| Skills (6 шкал + rider profile) | 3 | `skillsCalculator.js`, `skillsCalculator.ts`, `server.js:3013` | SPA считает по «3 полных календарных месяца», App — rolling 90 дней × confidence-factor. **Оба пишут в одну таблицу `skills_history`**, сервер потом берёт «последний» снапшот, не зная, кто его создал |
| Goal progress | 3 | `server.js:4488` (legacy) + `goalCalculator.js`, `goalsCache.js:278`, `goalsCache.ts:100` (мёртв) | SPA-версия: баг единиц в `recovery` (порог 20 м/с вместо км/ч → почти всё «восстановительное»); **SPA перезаписывает серверный `current_value` через PUT** |
| VO2max | 3 | `server.js:2370`, `server.js:2595`, `AnalysisScreen.tsx:385` | Две из трёх читают несуществующие поля `resting_heartrate`/`max_heartrate` (в БД `resting_hr`/`max_hr`) → всегда дефолты 60 / 220−age |
| HR-зоны (Karvonen + LTHR) | ~18 | 9 файлов клиентов | Сервер зон не считает, хранит JSON, присланный клиентом |
| Физическая модель мощности (CdA, Crr, плотность воздуха) | 5 | `server.js:4560`, `goalsCache.js:409`, `PowerAnalysis.jsx:108`, `PowerAnalysis.tsx:96`, `TrainingsPage.jsx:186` | Разные Crr и учёт ветра → одна поездка показывает разные ватты на разных экранах |
| Training plans | 2 | `react-spa/utils/trainingPlans.js`, `server/trainingPlans.js` | Разный `weeklyRidesModifier` |
| Refresh Strava-токена | 11 | внутри `server.js` | одинаковые блоки; готовый `stravaRequest()` с очередью написан и не вызывается ни разу |
| Cooper-test VO2max | 4 | клиенты | — |
| `interface UserProfile` | 9 | App | разные наборы полей |
| `formatDate`/`formatDuration` | 18 + 14 | App / SPA | разные форматы и локали |

`shared/utils/api.js` (43 строки) никем не импортируется — побайтовая копия `react-spa/src/utils/api.js`; `shared/constants/` и `backend/routes/` — пустые каталоги. Корневой `package.json` объявляет `pnpm`, но не `workspaces`.

### 2.2 Нет слоя данных ни в одном клиенте

Аппка: 44 эндпоинта вызываются напрямую из 30 файлов; `apiFetch(): Promise<any>`; **7 независимых кеш-механизмов** в AsyncStorage с 6 форматами ключей; `/api/user-profile` грузится из 13 мест; полные посекундные Strava-streams складываются в AsyncStorage (300–500 КБ на заезд, Android-лимит 6 МБ). Веб: 5 несовместимых кеш-слоёв в localStorage, ключи `streams_*`/`powerAnalysis*` **не привязаны к userId**; 19 вызовов `/api/user-profile` из 12 модулей; каждая карточка цели делает `GET /api/goals` (N+1) — в обоих клиентах.

### 2.3 Мёртвый код

Веб: ≈5 700 строк недостижимы из `main.jsx` (`PlanPage.jsx` 1 931 + CSS 1 182, `HeroTrackBanner`, `BikeGarageBlock`, `GoalsAnalysis`, `ImageUploadModal`, `OptimizedImage`, `ProgressRing`, `.bak`, `public/sw.js`), 10 неиспользуемых npm-пакетов (`openai`, `chart.js`, `@dnd-kit/*`, `fontawesome/*`…), ESLint: 196 ошибок. Аппка: `GoalAssistantScreen` (669 строк, не в навигаторе), `BikesModal`, legacy-калькулятор в `goalsCache.ts`, 12 SVG, 5 пакетов (`chart-kit`, `fast-image`, `video`, `vector-icons`, `new-app-screen`), Skia + Reanimated + Worklets ради одного шейдера `BlobOrb`. Сервер: 19 dead-маршрутов, `stravaRequest`, `estimateFTP`, CLI-скрипты и `server.log` в деплое, `/api/activities/debug/types`.

### 2.4 API-контракт

118 маршрутов; SPA вызывает 73, App — 44, общих 28. Dead-вызовов у клиентов нет. Формат ошибок двойной: `{error:'text'}` (~140 мест) и `{error:true, message}` (50 мест) — оба `apiFetch` читают только `.error`, так что в 50 случаях пользователь видит ошибку **`"true"`**. Три копии JWT-middleware с разными полями (`req.user` vs `req.userId`). В `react-spa` `apiFetch` возвращает JSON, а `heroImages.js`, `LastRideBanner.jsx`, `AdminPage.jsx` (×6) проверяют `response.ok` → **hero-картинки никогда не загружаются**, баннер последней поездки не работает, удаление в админке всегда «ошибка» при успешном запросе (W-07).

### 2.5 Конфигурация окружений

Ни один слой не использует env для клиентских URL: в аппке dev-IP разработчика `192.168.10.40` в `api.ts:8` и другой IP `192.168.10.82` в `GarageScreen.tsx:518`; в вебе `https://bikelab.app`/`localhost:8080` в `Sidebar.jsx`, `OnboardingModal.jsx`, `dns-prefetch localhost:8080` уходит в prod `index.html`. Strava `client_id` продублирован в 7 местах. Координаты Кипра захардкожены в погоде обоих клиентов. Staging-окружение невозможно без правки кода.

---

## 3. Целевая архитектура (кратко)

Полные схемы папок — в `layers/01-server.md` §«Proposed target architecture», `layers/02-bikelabapp.md`, `layers/03-react-spa.md`, `layers/04-cross-layer.md` §6.

**Принцип №1 — сервер единственный источник истины для всех производных метрик** (skills, goal progress, VO2max, HR-зоны, estimated power, снапшоты). Клиенты только рендерят. Исключение — `health`-source цели (данные HealthKit не покидают телефон) — считаются на клиенте через тот же shared-модуль.

**Монорепо** (pnpm workspaces):
```
/
├─ pnpm-workspace.yaml          # packages: server, react-spa, BikeLabApp, packages/*
├─ packages/shared/             # @bikelab/shared — ESM+CJS билд (server сейчас CommonJS)
│  └─ src/{types, calc, constants, api}
├─ server/src/{config, db/migrations, middleware, lib, services, repositories, routes, domain}
├─ BikeLabApp/src/{app, features/*, shared/{api,ui,charts,format,storage}, theme}
└─ react-spa/src/{app, config, api, auth, queries, features/*, ui, lib}
```

**Сервер:** route = zod-валидация + вызов сервиса + ответ; сервис = логика без `req/res`; repository = SQL с обязательным `userId`; ни одного `pool.query` вне `repositories/`, ни одного `axios` вне `lib/http.js`, ни одного `process.env` вне `config/`. Миграции — `node-pg-migrate`, отдельный шаг деплоя. Кеши и Strava rate-limit — в Redis (иначе >1 инстанса невозможен).

**Клиенты:** TanStack Query как единственный кеш серверных данных (заменяет все 7 + 5 кеш-механизмов), типизированный клиент `api.get(path, zodSchema)`, `AuthProvider`/`session.ts` — единственное место, знающее про токен (Keychain в аппке, httpOnly cookie или память+refresh в вебе). Тема-токены вместо 186 hex-цветов. ErrorBoundary на каждый таб/роут + Sentry.

**Shared:** `types/*` (генерировать из zod-схем сервера), `calc/{skills,goalProgress,vo2max,hrZones,power,ftp,trainingPlans,trend,units,dates}`, `constants/{goalTypes,zones,bikeComponents}`, `api/{client,endpoints,errors}`. Оценка снятия кода: ≈2 900–3 400 строк в клиентах + ≈600 в `server.js`.

---

## 4. План работ — задания для агентов

Формат: каждое задание автономно, с файлами, шагами и критериями готовности (DoD). Порядок внутри фазы — рекомендуемый; зависимости указаны явно. Каждое задание = отдельная ветка/PR; поведение API не меняется, если не сказано обратное. Перед фазой 0 — сделать бэкап прод-БД и снять `pg_dump --schema-only` (понадобится в T-1.4).

Общие правила для агента-исполнителя:
- Прочитать соответствующий раздел `layers/*.md` перед началом — там точные строки и код.
- Не менять поведение и формат ответов API в фазах 0–1 (клиенты не готовы).
- После каждого задания: `node --check`/`tsc --noEmit`/`eslint` должны быть не хуже, чем до; smoke-проверка вручную описана в DoD.
- Не удалять ничего из БД. Не трогать `ios/`, `android/` без явного задания.

### Фаза 0 — стоп-кран (1–2 дня, без рефакторинга)

Цель: закрыть все Critical и High-security. Только точечные правки. После фазы 0 можно выпускать ограниченную аудиторию.

**T-0.1 Ротировать Strava-секрет и вынести в env** — S-02
Файлы: `server/server.js:36-37`, `server/.env`, `.env.example` (создать).
Шаги: (1) В Strava API settings сгенерировать новый Client Secret (делает Дмитрий вручную — агент готовит код). (2) `const CLIENT_ID = process.env.STRAVA_CLIENT_ID; const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;` (3) Fail-fast при старте, если не заданы. (4) Добавить `.env.example` со всеми переменными без значений. (5) Проверить `git log -p -S'CLIENT_SECRET' | head` — секрет остаётся в истории; решение: после ротации старый секрет недействителен, историю переписывать не нужно.
DoD: grep `165560\|CLIENT_SECRET = '` по `server/` пуст; сервер не стартует без переменных; логин через Strava работает.

**T-0.2 Закрыть/удалить опасные маршруты** — S-01, S-03, S-05, S-06, S-08, S-17, S-39
Файлы: `server/server.js`.
Удалить целиком (клиентами не используются или используются только dev-админкой): `GET /api/garage/images` (1577), `GET /api/proxy/strava-image` (1603) — **проверить**: его вызывают `imageProxy.js` (SPA) и `GarageScreen.tsx:517` (App) — заменить на auth + allowlist хостов `*.cloudfront.net, *.strava.com` + `timeout: 5000` + `maxContentLength: 5MB`, не удалять; `GET /api/hero/positions` (1641), `DELETE /api/hero/images/:name` (1883), `GET/POST /api/strava/tokens` (1954, 1983), `GET /strava-auth-status` (1558), `GET /api/activities/debug/types` (1269), `GET /api/ai-cache-stats` (6735), все `/api/database/*` (5944–6170).
Добавить `requireAdmin` (см. T-0.3) на `/api/admin/*` (6860–6977), `POST /api/hero/upload`, `POST /api/hero/assign-all`, `DELETE /api/hero/positions/:position`, `/api/strava/limits*`.
Добавить `authMiddleware` на `/api/weather/wind`, `/api/weather/forecast` + server-side кеш ответа по `(lat,lng,date)` на 30 мин.
DoD: карта маршрутов в `layers/01-server.md` §Route map не содержит ❌ на `/api/*` кроме `register/login/verify-email/resend-verification`; SPA `AdminPage` и `DatabaseMemoryInfo` — либо удалены, либо помечены `import.meta.env.DEV`; аппка и веб открываются, Garage и Analysis работают.

**T-0.3 Ввести роль admin** — S-01, W-01
Файлы: `server/server.js` (миграционный IIFE ~136–499), новый `server/middleware/auth.js`.
Шаги: `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`; `requireAdmin = async (req,res,next) => { SELECT is_admin FROM users WHERE id=$1; if !is_admin → 403 }` (по БД, не по JWT-claim); экспортировать `authMiddleware` и `requireAdmin` из `middleware/auth.js`; заменить копии в `routes/oura.js:12` и `routes/skillsHistory.js:9` импортом (внимание: `skillsHistory` использует `req.userId`, `server.js` — `req.user.userId`; в middleware выставлять оба до фазы 1). В SPA: `AdminRoute`, читающий `is_admin` из `GET /api/user-profile` (добавить поле в ответ), `/admin` только для админов.
DoD: обычный пользователь получает 403 на `/api/admin/users`; `UPDATE users SET is_admin=true WHERE email='d.krikunov@…'` даёт доступ; три копии middleware заменены одной.

**T-0.4 OAuth `state` и токен не в URL** — S-07, W-02, A-42
Файлы: `server/server.js:537-660, 5715-5845`; `react-spa/src/pages/{LoginPage,ExchangeTokenPage}.jsx`, `components/{Sidebar,OnboardingModal}.jsx`, `pages/{TrainingsPage,ProfilePage}.jsx`; `BikeLabApp/src/screens/{LoginScreen,StravaIntegrationScreen}.tsx`, `App.tsx:302-360`.
Шаги: (1) Login-flow: сервер генерирует одноразовый `state` (таблица `oauth_states(state, purpose, user_id NULL, expires_at)` или JWT purpose-token на 10 мин, как уже сделано для Oura в `routes/oura.js:37-41`); клиент получает `state` через `GET /api/auth/strava/start` и подставляет в URL. (2) После callback сервер редиректит не с `?jwt=`, а с одноразовым `code` (`/auth/success?code=…`), клиент обменивает `POST /api/auth/exchange {code}` → `{token}`. Для мобилки — deep link `bikelab://auth?code=…`. (3) Link-flow: `state` = purpose-token `{purpose:'link_strava', userId}` на 10 мин, не сессионный JWT. (4) Один helper `getStravaAuthUrl({mode})` в каждом клиенте вместо 5 копий в SPA (разные scope! — W-28) и 2 в App; scope единый `read,activity:read_all,profile:read_all`.
DoD: в URL никогда не появляется сессионный JWT; повторное использование `code`/`state` → 400; логин и привязка работают в вебе и аппке.

**T-0.5 Аппка: «Link Strava» через `/link_strava`** — A-01 (зависит от T-0.4 по формату `state`)
Файлы: `BikeLabApp/src/screens/StravaIntegrationScreen.tsx:46-49`, `App.tsx:302-360`.
Шаги: redirect на `https://bikelab.app/link_strava`, `state` от сервера; сервер после привязки редиректит на `bikelab://strava-linked?ok=1` (новый маршрут), приложение по этой схеме **не трогает токен**, а инвалидирует профиль и показывает «Strava подключена».
DoD: email-пользователь после привязки остаётся в своём аккаунте, `strava_id` появляется в профиле.

**T-0.6 Аппка: очистка состояния при выходе и 401** — A-02, A-32
Файлы: `BikeLabApp/src/screens/ProfileScreen.tsx:103,135-146`, `src/utils/api.ts:47-63`, `src/contexts/AppDataContext.tsx`, `src/utils/analyticsSnapshot.ts:72`.
Шаги: единая функция `signOut()` в новом `src/auth/session.ts`: `TokenStorage.removeToken()` → `clearAll()` → `clearSnapshotCache()` → `AsyncStorage.multiRemove(<явный список пользовательских ключей>)` (не `clear()`, чтобы не терять `@app_language`) → `resetToLogin()`. Вызывать из sign-out, delete-account и из 401-хендлера.
DoD: после logout и логина другим пользователем Garage/Activities пусты до загрузки его данных; язык приложения сохраняется.

**T-0.7 Аппка: крэш `0` вне `<Text>` и ErrorBoundary** — A-03, A-16
Файлы: `BikeLabApp/src/components/PowerAnalysis.tsx:651,657`, `App.tsx`, новый `src/components/ErrorBoundary.tsx`, `.eslintrc.js`.
Шаги: `{stats.activitiesWithWindData > 0 && …}`; grep всего `src/` по `&& \w+ > 0 &&` и `&& \w+\.length &&` — исправить аналогичные; ErrorBoundary с fallback «Повторить» вокруг каждого tab-навигатора и root stack; ESLint `react/jsx-no-leaked-render: error`.
DoD: у пользователя с `activitiesWithRealPower === 0` вкладка Analysis открывается; искусственный `throw` в экране показывает fallback, а не белый экран.

**T-0.8 Сервер: асинхронные ошибки, error-handler, health, shutdown** — S-20, S-15, S-30, S-21
Файлы: `server/server.js` (маршруты 1354–1420, 4016–4134, 4303–4313; `:24`, `:7208`), `server/brevo-config.js:4-7`.
Шаги: `asyncHandler = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next)`; обернуть **все** `app.<verb>` (можно sed-скриптом с ручной проверкой); глобальный `app.use((err,req,res,next) => …)` → `{error:{code,message}}` без `stack`/`details`; `process.on('unhandledRejection'|'uncaughtException', log)`; `GET /healthz` (`SELECT 1`); `PORT = process.env.PORT || 8080`; `SIGTERM → server.close() → pool.end()` с таймаутом 10 с; убрать `process.exit(1)` из `brevo-config.js` — проверка при отправке; `NODE_ENV=production` в деплое.
DoD: `POST /api/rides {start:'abc'}` возвращает 500 JSON, процесс жив; `/healthz` → 200; `kill -TERM` завершает без обрыва in-flight запросов.

**T-0.9 Сервер: helmet, CORS origin, rate-limit** — S-10, S-11
Файлы: `server/server.js:11-23`.
Шаги: `helmet()`; `cors({origin: [FRONTEND_URL, 'https://bikelab.app'], credentials: true})` (для RN origin отсутствует — разрешить `!origin`); `express-rate-limit`: глобально 300/15 мин по IP; `/api/login|register|resend-verification` — 5/15 мин по IP; `/api/coach/chat`, `/api/meta-goals/ai-generate`, `/api/ai-analysis` — 20/час по `userId`.
DoD: 6-й логин за 15 мин → 429; аппка и веб работают.

**T-0.10 Сервер: удаление аккаунта, транзакции, upload, XSS** — S-04, S-12, S-16, S-09, S-41 (coach role)
Файлы: `server/server.js:5887-5940, 6915-6977, 753-755, 652, 1569-1574, 4140-4164, 5205-5213`.
Шаги: убрать per-statement `try/catch` внутри транзакций удаления; один `DELETE FROM users WHERE id=$1` с опорой на `ON DELETE CASCADE` — предварительно миграцией добавить FK с каскадом на таблицы без них; проверять `rowCount`, при 0 → 404. Экранировать `oauthError` и `err.message` (`escape-html`). `multer` `fileFilter` по `image/(jpeg|png|webp)` + лимит 8 МБ + имя без `originalname`. `POST /api/goals`: проверка `meta_goal_id` принадлежит `user_id`; `AND user_id=$2` в `:4390, :4333, :4915`. `/api/coach/chat`: `messages.filter(m => ['user','assistant'].includes(m.role))`.
DoD: удаление аккаунта на тестовой БД реально удаляет строки во всех таблицах; загрузка `.html` в garage → 400; чужой `meta_goal_id` → 403.

**T-0.11 Сервер: таймауты внешних вызовов** — S-22
Файлы: все `axios.*` в `server/*.js`, `aiAnalysis.js:4`, `aiGoals.js:4`, `aiCoach.js:668`.
Шаги: `lib/http.js` с `axios.create({timeout: 10000})` для Strava/Open-Meteo; `new OpenAI({timeout: 60000, maxRetries: 2})`; в SSE-стриме `res.on('close', () => stream.controller.abort())`.
DoD: grep `axios\.(get|post)\(` без `timeout` пуст (или через общий инстанс).

**T-0.12 Аппка: логи, конфиг окружения, Keychain, SSE debug** — A-10, A-11, A-15
Файлы: `BikeLabApp/src/utils/api.ts:8`, `src/screens/GarageScreen.tsx:517-518`, `src/utils/coachSSE.ts:96`, `App.tsx:328-336`, `src/screens/AnalysisScreen.tsx:98-118`, `babel.config.js`, новый `src/config.ts`, новый `src/lib/logger.ts`.
Шаги: `react-native-config` с `.env.development/.env.staging/.env.production` (`API_BASE_URL`, `STRAVA_CLIENT_ID`); все URL — от `config.API_BASE_URL`; `react-native-keychain` для токена внутри `TokenStorage` (миграция: при старте прочитать из AsyncStorage, перенести, удалить); `logger` с уровнями, `console.*` → `logger.*`, `babel-plugin-transform-remove-console` для prod; `debug: __DEV__` в SSE; удалить логи токена/профиля.
DoD: grep `192\.168\.` и `bikelab\.app` в `src/` пуст; `grep -c console.log src` = 0; токен в Keychain; SSE в prod без debug.

**T-0.13 Веб: контракт `apiFetch`, stop-краны, мусор** — W-07, W-10, W-12, W-20, W-35, W-31, W-37
Файлы: `react-spa/src/utils/heroImages.js:16-21`, `components/LastRideBanner.jsx:85-94`, `pages/AdminPage.jsx` (×6), `components/ProgressChart.jsx:30-65`, `pages/AnalysisPage.jsx:170-182`, `pages/TrainingsPage.jsx:399-409`, `vite.config.js`, `index.html:27`, `package.json`.
Шаги: переписать `response.ok`-места на `try { const data = await apiFetch() } catch`; `useMemo` над early return; `catch` вокруг загрузок, чтобы оверлей не висел; удалить ≈5 700 строк мёртвого кода (список в W-20) и 10 пакетов (W-35); убрать `manualChunks`; удалить `dns-prefetch localhost`; `esbuild.drop: ['console','debugger']` для prod; `VITE_API_URL`, `VITE_STRAVA_CLIENT_ID` в `.env.[mode]`; закоммитить lockfile.
DoD: hero-картинки загружаются; баннер последней поездки работает на чистом localStorage; `npm run build` проходит; лендинг не предзагружает recharts/html2canvas; `eslint` без `rules-of-hooks`/`no-undef` ошибок.

**T-0.14 Мусор в репозитории**
Файлы: корень, `server/`.
Удалить: `OnJSBackup.zip` (7 МБ), `test_preferred_days.js`, `logs`, `server/server.log`, `server/sqlstatus.txt`, `.DS_Store` (×5), `react-spa/test.txt`, `_audit_src.tgz` (создан этим аудитом); перенести `server/{optimize_postgres,apply_profile,test_goalCalculator}.js` в `server/scripts/` и `server/test/`; `.gitignore` дополнить `*.log`, `.DS_Store` (уже есть, но файлы закоммичены — `git rm --cached`).
DoD: `git ls-files | grep -E '\.(zip|log|DS_Store)$'` пуст.

### Фаза 1 — фундамент сервера (1–1.5 недели)

Цель: сервер тестируем, конфигурируем, воспроизводим; ни одного изменения контракта.

**T-1.1 `config/` + `db/`** — S-14, S-19, S-37
Создать `server/src/config/index.js` (zod-валидация всех env, fail-fast), `db/pool.js` (`Pool`, `types.setTypeParser(1700, parseFloat)` после проверки мест, где ожидается строка, `pool.on('error')`, SSL с CA вместо `rejectUnauthorized:false`), `db/tx.js` (`withTransaction`), `lib/jwt.js` (`issueSessionToken`, `issuePurposeToken`, `verify` с `algorithms:['HS256']` — заменить 5 копий `jwt.sign`). `server.js` импортирует их; больше ничего не меняется.
DoD: `grep process.env server/server.js` пуст; `grep jwt.sign server/server.js` пуст; все тесты фазы 0 проходят.

**T-1.2 `services/strava/`** — S-38, S-23, S-25, S-24 (частично)
`tokens.js`: `withStravaToken(userId, fn)` — единый refresh (заменить 11 копий); `client.js`: axios-инстанс с очередью и rate-limiter (использовать уже написанный `stravaRequest`, `server.js:1006-1033`), обработка 429 с backoff, `updateLimits` из заголовков; `activities.js`: `getAll(userId)` — единая пагинация + фильтр по типу + кеш; запретить прямую запись в `activitiesCache` (S-23: `calculateVO2maxForPeriod:2536-2544` отравляет кеш). Заменить 4 копии полной пагинации и 3 частичные.
DoD: `grep 'oauth/token' server/server.js` = 0; `grep 'activitiesCache.set'` только в `services/strava/activities.js`; Garage/Analysis/Goals отдают те же данные.

**T-1.3 Инкрементальный Strava-синк** — S-25, S-24
`synced_activities` уже есть. `activities.js`: при cache-miss тянуть только `after=<max(start_date) из synced_activities>`; читать полный список из БД, не из Strava. Все места, читающие «все активности», переводятся на `repositories/syncedActivities.getAll(userId)`. Опционально — Strava webhook вместо polling (отдельная задача).
DoD: повторный `GET /api/activities` после рестарта сервера делает ≤1 запрос к Strava; Strava-квота при 50 одновременных пользователях не исчерпывается.

**T-1.4 Миграции** — S-29
Снять `pg_dump --schema-only` прода как `db/migrations/001_baseline.sql`; перенести IIFE `server.js:136-499` в `002_…`; `node-pg-migrate`; `npm run migrate` перед `node server.js` в деплое; `await migrate()` до `listen` в dev.
DoD: пустая БД + `npm run migrate` = рабочая схема; `server.js` не содержит `CREATE TABLE`/`ALTER TABLE`.

**T-1.5 Единый формат ошибок и ответов** — §5.6 cross, A-33
Сервер: `{error:{code,message}}` везде (заменить 50 мест `{error:true,message}` и plain-text `send`); клиенты: `ApiError {status, code, message}` в обоих `apiFetch` с адаптером на старый формат (на переходный период поддерживать оба). Это единственное изменение контракта в фазе 1 — делать одновременно с клиентскими адаптерами.
DoD: `grep "error: true" server/` = 0; в UI не появляется ошибка `"true"`.

**T-1.6 Логи, наблюдаемость** — S-42
`pino` + `pino-http` с request-id, redaction `authorization`, `code`, `token`, `password`; заменить ~300 `console.log`; Sentry (`@sentry/node`) с `NODE_ENV`.
DoD: логи в JSON, в них нет токенов и OAuth-кодов.

**T-1.7 Тесты и CI сервера** — S-46
`vitest` + `supertest`; unit на чистые функции (`goalCalculator`, `trainingPlans`, `recommendations/training-utils`, `computeRidingStyle`, `BoundedCache`); integration с `testcontainers` Postgres на `auth`, `goals`, `calendar`, `admin` (403). GitHub Actions: `npm ci && npm run lint && npm test` для `server/`, `tsc --noEmit && eslint && jest` для `BikeLabApp/`, `eslint && vitest && build` для `react-spa/`. `npm audit` / Dependabot.
DoD: CI зелёный на `main`; покрытие `domain/` ≥ 80 %.

### Фаза 2 — монорепо и shared (1 неделя, параллельно с фазой 1 после T-1.1)

**T-2.1 pnpm workspaces + `packages/shared`** — cross §6.2
`pnpm-workspace.yaml`; `packages/shared` с `tsup` (ESM + CJS), `exports` map; `BikeLabApp/metro.config.js`: `watchFolders`, `nodeModulesPaths`, `.npmrc node-linker=hoisted` для RN (Pods чувствительны к symlink); Vite: `resolve.alias`, `optimizeDeps.exclude`, `server.fs.allow`. Корневые скрипты — `pnpm -r`. Удалить `shared/utils/api.js`, `shared/constants/`, `backend/`.
DoD: пустой модуль `@bikelab/shared` импортируется во всех трёх слоях; iOS-сборка и `vite build` проходят.

**T-2.2 `shared/types` + zod-схемы** — A-26, A-31, cross §6.1
Перенести из App: `types/activity.ts`, `types/coach.ts`, Goal/MetaGoal/GoalMetric/GoalPace (`goalsCache.ts:31-99`), `analyticsSnapshot.ts:6-30`, `achievements/types.ts`; собрать один `UserProfile` (канонические имена `max_hr`, `resting_hr`, `lactate_threshold`) вместо 9, один `Bike` вместо 4. zod-схемы ответов для `user-profile`, `activities`, `goals`, `meta-goals`, `bikes`, `calendar`, `skills-history`, `analytics-snapshot`. Сервер валидирует **тела запросов** теми же схемами (`goalCalculator.validateMetric` уже частично делает).
DoD: в `BikeLabApp/src` нет локальных `interface UserProfile|Bike`; `AnalysisScreen` использует `max_hr`/`resting_hr` (закрывает A-06).

**T-2.3 `shared/api/client.ts`** — A-17 (часть), W-19 (часть), §5.8
`createApiClient({baseUrl, getToken, onUnauthorized, fetch})` с `AbortSignal.timeout(15000)`, `signal` passthrough, `ApiError`, multipart-helper, zod-парсинг ответа: `api.get(path, schema)`. Оба `apiFetch` становятся тонкими адаптерами (storage через DI: localStorage / Keychain). `coachSSE.ts` — отдельный адаптер. Убрать сырые `fetch` (`ImageUploadModal.tsx:109`, `AddGoalModal.jsx:53`).
DoD: `grep -r "fetch(" BikeLabApp/src react-spa/src` — только внутри клиента и SSE.

**T-2.4 `shared/constants` + чистые утилиты** — cross §4.9, A-26, W-29
`constants/{goalTypes (VALID_FIELDS/SKILLS/HEALTH_METRICS + labels + units), zones (коэффициенты Karvonen/LTHR), bikeComponents, achievementsFormat}`; `calc/{units (m/s→km/h и т.п.), dates (ISO-week, median), trend (computeMetricTrend)}`. Заменить 18+14 локальных `formatDate/formatDuration`, 3 `median`, 2 ISO-week набора, 2 `computeMetricTrend`, 2 `formatBadgeValue`, 2 `TIER_CONFIG`.
DoD: jscpd cross-layer клонов ≤ 20 (сейчас 52).

### Фаза 3 — сервер как источник истины (2 недели; каждый пункт — отдельный PR)

Порядок выбран от самого изолированного к самому связанному. Каждый шаг: добавить в `shared/calc`, подключить на сервере, отдать в API, **затем** удалить клиентские копии. Продуктовое решение требуется в T-3.3.

**T-3.1 `calc/hrZones.ts`** — cross §4.4, W-27, A-06
Одна функция `computeHrZones(profile)` (Karvonen + LTHR + %maxHR). Сервер в `GET /api/user-profile` отдаёт `hr_zones` как derived-поле (клиентский `hr_zones` в `PUT` игнорируется). Удалить 9 клиентских копий; оставить вызов shared только для live-превью при вводе в `HRZonesScreen`/`OnboardingModal`.
DoD: `grep -r "0\.75\|hrReserve" react-spa/src BikeLabApp/src` — только импорты из shared.

**T-3.2 `calc/vo2max.ts`** — cross §4.3, S-33, A-06
`estimateVO2max(activities, profile)`, `cooperTest(dist)`, `jackson(...)`. Заменить два inline `estimateVO2max` в `server.js` (2370, 2595) — исправить `resting_heartrate→resting_hr`; удалить `AnalysisScreen.calculateVO2max` и 4 копии Cooper. App берёт `summary.vo2max` с сервера, как SPA.
DoD: web и app показывают одинаковый VO2max одному пользователю; `recalc-vo2max` даёт то же число.

**T-3.3 `calc/skills.ts` + `GET /api/skills`** — cross §4.1, A-07, W-44
**Решение владельца продукта:** какую формулу зафиксировать (рекомендуется App-вариант: rolling 90 дней × confidence-factor) и пересчитать ли `skills_history` разово. Новый `GET /api/skills` считает по shared-модулю, сохраняет снапшот (idempotent по `last_activity_id`), отдаёт `{skills, riderProfile, trend}`. Убрать `POST /api/skills-history` и `manageSkillsHistory` из `AnalysisPage.jsx:648-817` и `AnalysisScreen.tsx:488-658`, `DELETE /cleanup-month` из клиентского эффекта. Analytics snapshot — тоже серверный (`POST /api/analytics-snapshot` из клиентов убрать; сервер создаёт после синка активностей).
DoD: клиенты не делают ни одного POST в `skills-history`/`analytics-snapshot`; дубли снапшотов невозможны; гонка A-07 исчезает.

**T-3.4 `calc/goalProgress.ts`** — cross §4.2, W-08, W-09
Слить legacy `server.js:4488-4667` с `goalCalculator.js` (исправить `recovery` — единицы, `intervals` — не 0); удалить `react-spa/utils/goalsCache.js` расчёт и write-back (`PlanPage` уже удалён; `GoalsManager.jsx:197-215`, `GoalAssistantPage.jsx:140-190`); удалить мёртвый калькулятор из `goalsCache.ts`; `health`-source цели — клиентский расчёт через shared. Сервер: `GET /api/meta-goals` возвращает sub-goals inline (убирает N+1 в `MetaGoalCard`/`MetaGoalRow`).
DoD: `PUT /api/goals/:id` из клиентов — только на явное редактирование пользователем; карточка цели не делает `GET /api/goals`.

**T-3.5 `calc/power.ts` + `estimated_power`** — cross §4.5, W-26, A-14
`estimateRidePower(activity, {riderWeight, bikeWeight, crr, wind})`. Сервер обогащает `synced_activities.estimated_power` при синке (ветер уже проксирует; батч-запрос к Open-Meteo с кешем). `PowerAnalysis.*` становятся чисто визуальными: убрать 50 последовательных запросов погоды, AsyncStorage/localStorage-кеши, дублирующий fetch профиля. Удалить копии в `TrainingsPage.jsx`, `goalsCache.js`.
DoD: открытие Analysis не делает запросов к `/api/weather/wind`; ватты одинаковы на всех экранах и в целях.

**T-3.6 `calc/ftp.ts`, `calc/trainingPlans.ts`** — cross §4.6, §4.7
Единый `analyzeHighIntensityTime`; удалить `react-spa/utils/trainingPlans.js` (сервер `GET /api/training-plan` уже есть), согласовать `weeklyRidesModifier`. Streams: сервер отдаёт даунсэмпл ≤400 точек для графиков (`?downsample=400`), полные streams клиентам не нужны → закрывает A-04 (streams в AsyncStorage).
DoD: в AsyncStorage нет ключей `bikelab_cache_streams_*`; размер кеша приложения < 2 МБ после 30 заездов.

### Фаза 4 — декомпозиция сервера (1–1.5 недели, параллельно с фазой 3)

**T-4.1 Вынос доменов из `server.js`** — порядок из `layers/01-server.md` §«Безопасный порядок извлечения» п.6: `calendar → events → checklist → rides → achievements/skills/snapshots → media → profile/training → goals/metaGoals → analytics (разбить /summary, убрать self-call S-26) → bikes → coach (SSE в services/coach/chat.js) → auth/strava-oauth`. Каждый домен: `routes/x.js` (zod + вызов сервиса) + `services/x.js` + `repositories/x.js`. По одному PR на домен.
DoD (на домен): маршруты домена отсутствуют в `server.js`; integration-тесты домена зелёные; ни одного `pool.query` в `routes/`.

**T-4.2 Транзакции, N+1, пагинация, индексы** — S-28, S-34, S-35, S-36
`withTransaction` в `ai-generate`, `rides/import`, `labels`, `assign-all`, `ouraService`; `WHERE meta_goal_id = ANY($1)`; один `SELECT users` на запрос; `LIMIT` по умолчанию 500 и `?cursor` на `/api/activities`, `/api/coach/conversations/:id`; верхняя граница `limit` в `skills-history/range`; индексы `users(verification_token)`, `activity_meta_goals_progress(user_id, activity_id)`, `analytics_snapshots(user_id, last_activity_id)`.
DoD: `EXPLAIN` основных запросов без seq scan по большим таблицам; `/api/activities` отдаёт ≤500 записей за страницу.

**T-4.3 Redis и горизонтальное масштабирование** — S-24
`lib/cache.js` интерфейс → Redis для `activitiesCache`, `bikesCache`, AI-cache, Strava rate-limit (`INCR` с TTL), rate-limit store. `server.js` без module-level mutable state.
DoD: два инстанса за балансировщиком дают консистентные ответы; лимит Strava общий.

**T-4.4 Контроль стоимости OpenAI** — S-31
История диалога — с сервера (`coach_messages`), не от клиента; обрезка до N последних сообщений/токенов; `max_tokens`; заполнять `token_usage`; per-user дневной бюджет; убрать 3-модельный fallback в `aiGoals.js:434-460`.
DoD: запрос в coach с 200 сообщениями в body отклоняется/усекается; в БД видна стоимость по пользователю.

**T-4.5 Auth: refresh-токен, password reset, email-смена** — S-13, S-14, S-27, A-05
Access 1 ч + refresh-таблица (или `token_version` в users для ревокации); `POST /api/auth/refresh`; `/api/forgot-password` + `/api/reset-password` (`crypto.randomBytes`, хэш токена в БД); единый `changeEmail()` с проверкой уникальности и сбросом `email_verified`; клиенты — один retry на 401 с refresh, на старте при 401 молча на Login без алерта.
DoD: пользователь не выбрасывается раз в неделю; удаление аккаунта инвалидирует выданные токены; восстановление пароля работает.

### Фаза 5 — аппка: слой данных и декомпозиция (2–3 недели)

**T-5.1 TanStack Query + `features/`** — A-17, A-18, A-19, A-13, A-34
`QueryClientProvider` + `persistQueryClient` (MMKV); хуки `useProfile`, `useActivities`, `useBikes`, `useGoals`, `useMetaGoals`, `useCalendar(range)`, `useSkills`, `useSnapshot`; заменить 13 мест загрузки профиля и 11 — активностей; удалить `AppDataContext`, `utils/cache.ts`, `goalsCache.ts` (кеш-часть), `analyticsSnapshot.ts` (кеш-часть), все `AsyncStorage`-кеши в экранах; `invalidateQueries` после мутаций; `signOut()` → `queryClient.clear()`. `HealthProvider` один на приложение (сейчас `useHealthData` на каждую карточку). Убрать `POST /api/achievements/evaluate` при монтировании (evaluate — на сервере после синка).
DoD: `grep -r AsyncStorage src` — только `@app_language`, `TokenStorage` (миграция) и `persistQueryClient`; ни одного `useEffect` с ручным `loading/error` под fetch.

**T-5.2 Навигация и deep links** — A-08, A-09, A-22, A-44
`linking={{prefixes, config}}` в `NavigationContainer`; парсинг через `new URL()`; `RootStackParamList` + типизированный `useNavigation` (убрать `navigation: any` в 9 экранах и `as never`); убрать `fired*Ref` в `CoachChatScreen`, использовать `requestId` в params; `resolvePostAuthRoute()` (onboarding-check после email-логина); Splash скрывать по `onReady`.
DoD: второй «Discuss with Coach» с живого таба отправляет сообщение; новый email-пользователь попадает в онбординг; `tsc` без `any` в навигации.

**T-5.3 Analysis: общие компоненты вместо 5 копий** — A-24, A-28
`<MetricAnalysisSection/>`, `<StatCardRow/>`, `<TrendLineChart/>` (gifted-charts), один `useChartOverlay`; `Power/Heart/Speed/Cadence/FTPAnalysis` — тонкие обёртки; расчёты — из shared/сервера (после фазы 3); `React.memo` + стабильные колбэки; `FlatList` для списков >10.
DoD: сумма LOC пяти компонентов ≤ 1 500 (сейчас 3 800); jscpd внутри `components/` ≤ 5 %.

**T-5.4 Декомпозиция гигантов** — A-27 (тема), §Module map
`GarageScreen` (1 725) → `LastRideHero`, `SnapshotWidgets`, `GarageGallery`, `OverallStats`, `NutritionCalculator`, `AchievementsPreview`; `GoalDetailsScreen` (1 391) → `GoalHeader`, `MetricsTab`, `TrainingsTab`, `ScheduleTab`; `CalendarScreen` (1 312) → `MonthHeader`, `WeekStrip`, `DayList`, `EventDetailSheet`; `AnalysisScreen` (1 111) → `PeriodHeader`, `SkillsSection`. Параллельно `theme/{colors,spacing,typography,radii}` + `useTheme()`, `useWindowDimensions` вместо `Dimensions.get` (15 файлов), замена hex файл за файлом. ShareStudio: один `BackgroundPicker` с `variant` вместо 5, общий `TemplateFrame`, `shared/format`.
DoD: ни одного файла > 600 строк в `src/screens`; `grep -c "#[0-9a-fA-F]\{3,6\}" src` ≤ 20 (только `theme/`).

**T-5.5 Зависимости и Store-готовность** — A-12, A-29, A-30, A-21, A-40, A-23
Удалить `react-native-chart-kit`, `react-native-fast-image`, `react-native-video`, `react-native-vector-icons` + types, `@react-native/new-app-screen`, `jwt-decode`, `uuid` + `get-random-values` (→ `Crypto.randomUUID`); `BlobOrb` на `LinearGradient` + Reanimated или статичный PNG → убрать Skia (−8–10 МБ IPA); Sign in with Apple (Guideline 4.8 при Strava-логине) — **продуктовое решение**: либо добавить, либо убрать Strava как login, оставив как интеграцию; HealthKit `isConnected` по факту данных, iOS-only пункты скрывать на Android; i18n-долг (~40 строк + `KnowledgeCenter/topics.ts`), ESLint `i18next/no-literal-string`; Sentry RN + source maps; `app.json version`; Maestro smoke `login → Garage → Analysis`.
DoD: `npx depcheck` чист; IPA меньше на ≥ 8 МБ; Sentry получает тестовый крэш; `eslint` без литеральных строк.

### Фаза 6 — веб: слой данных, чистка, продуктовые решения (1.5–2 недели)

**T-6.1 `AuthProvider` + `api/client` + ErrorBoundary + 404** — W-03, W-24, W-25, W-05
`AuthProvider {user, isAdmin, login, logout}` — единственное место с токеном (сейчас 6 синхронных чтений storage и `jwtDecode` в 12 файлах); `createBrowserRouter` + `errorElement`, `path="*"`; токен — память + refresh (T-4.5) или httpOnly cookie + CSRF; убрать base64-кеш картинок в localStorage (`imageCache.jsx`).
DoD: `grep -r "localStorage.getItem('token')" src` — только в `AuthProvider`.

**T-6.2 TanStack Query** — W-18, W-19, W-22, W-29, W-33
Хуки как в T-5.1; выкинуть `cache.js`, `cacheCheckup.js`, `CacheStatus.jsx`, `heroImages.js`, `goalsCache.js`; ключи с `userId`; logout → `queryClient.clear()`; `MetaGoalRow` получает goals пропом.
DoD: `grep -r localStorage src` — только `AuthProvider` и `persistQueryClient`.

**T-6.3 Декомпозиция гигантов и CSS** — W-21, W-23, W-32
`PowerAnalysis.jsx` (1 300) → `PowerSettings`, `PowerChart`, `PowerStats` (расчёт — с сервера после T-3.5); `WeeklyTrainingCalendar` (1 156) → `PlanHeader`, `DayGrid`, `PriorityWorkouts`, `ProfileSettingsForm`, modals; `AnalysisPage` (996) → композиция с ленивым монтажом графиков (`IntersectionObserver`); `TrainingsPage` (949) → `ActivityFilters` (`useMemo`), `ActivityList`, modals; `AdminPage` (1 054) → отдельный lazy-чанк только для `isAdmin` или вынести в internal tool. CSS Modules для переписанных компонентов; общие `Modal/ConfirmDialog/Toast/ErrorMessage/Loader` (42 `alert/confirm` → диалоги; 8 определений `.error-message` → одно; 492 `!important` → по мере переписывания). Общий `TrendChart` для 7 `*Chart.jsx`, калькуляторы — один компонент вместо 3.
DoD: ни одного файла > 600 строк в `pages/`; jscpd `react-spa/src` ≤ 8 % (сейчас 17.7 %).

**T-6.4 Продуктовые решения по легаси (нужен Дмитрий)** — W-43
Кандидаты в удаление или вынос: `ChecklistPage` и `NutritionPage` (нет в навигации), `MyRidesBlock/RideAddModal` + `/api/rides*` (legacy JSON-эпоха), `EventsHero/EventsManager` + `/api/events*` (мобилка не использует), `WeatherBlock` с координатами Кипра (оба клиента — либо геолокация/последняя активность, либо убрать), `AdminPage` → отдельный internal tool. Также: регистрация по email есть только в вебе — нужна ли в аппке; коуч и Oura есть только в аппке — нужны ли в вебе. После решения — удалить соответствующие серверные маршруты (19 dead-routes из cross §5.2).
DoD: список решений зафиксирован в `docs/`; удалённые маршруты отсутствуют в route map.

**T-6.5 Prod-гигиена веба** — W-38, W-39, W-40, W-41, W-42, W-14
ESLint зелёный (196 → 0) и обязателен в CI; `vitest` на `lib/*`; Playwright smoke `login → garage → analysis`; SEO-мета лендинга (`description`, OG, favicon, `manifest`), self-host шрифтов; единый язык UI (сейчас смесь ru/en); `eslint-plugin-jsx-a11y`, `<button>` вместо кликабельных `div`, focus-trap в модалках; self-unregistering `sw.js` на один релиз, AASA только с сервера; одна `formatDate` с локалью из профиля, локальные дневные ключи вместо `toISOString().split('T')[0]`.
DoD: Lighthouse лендинга ≥ 90 по Performance/SEO/Accessibility; CI зелёный.

### Фаза 7 — контракт и защита от регресса

**T-7.1 Типизированный контракт API** — cross §6, §5.5
`shared/api/endpoints.ts` — zod-схемы запросов/ответов всех маршрутов; сервер валидирует вход ими; генерация типизированного клиента → удаление ~197 строковых путей из клиентов; единый naming (kebab-case пути, snake_case поля, единый envelope `{data}` или без — выбрать одно; переименования через алиасы на переходный период). Опционально OpenAPI из zod (`zod-to-openapi`) для документации.
DoD: `tsc` падает при расхождении контракта; список маршрутов генерируется из кода.

**T-7.2 Гейты качества в CI**
`jscpd --threshold 6` (после фаз 3–6 реально ≤ 5 %), `knip`/`ts-prune` на мёртвый код, `depcheck`, `eslint --max-warnings 0`, `tsc --noEmit` во всех трёх, `npm audit --audit-level=high`, покрытие `shared/calc` 100 % (это чистые функции), Sentry release + source maps на каждый деплой.

---

## 5. Решения, которые нужны от владельца продукта

> **Принято 16.09.2026:** (1) формула skills — вариант аппки: rolling 90 дней × confidence-фактор; исторические снапшоты `skills_history` пересчитываются разово скриптом по новой формуле (T-3.3). (2) Strava-логин остаётся; **добавляем Sign in with Apple и в аппку, и в веб** (T-4.5; нужны Service ID + ключ `.p8` из Apple Developer от владельца). Остальные пункты — открыты.

1. **Формула skills** (T-3.3): App-вариант (rolling 90 дней × confidence) или SPA-вариант (3 календарных месяца)? Пересчитывать ли историю?
2. **Strava как логин** (T-5.5, A-12): оставить (тогда обязателен Sign in with Apple) или сделать Strava только интеграцией?
3. **Легаси веба** (T-6.4): Checklist, Nutrition, ручные Rides, Events, WeatherBlock — удалить, оставить или перенести в мобилку?
4. **Админка** (T-6.3): отдельный internal tool или lazy-чанк в SPA за `is_admin`?
5. **Redis** (T-4.3): готов ли хостинг (какой провайдер сейчас — в коде намёки на Render)? Без Redis — только один инстанс.
6. **Хранение токена в вебе** (T-6.1): httpOnly cookie (нужен CSRF и общий домен) или память + refresh?

---

## 6. Оценка объёма

| Фаза | Срок | Результат |
|---|---|---|
| 0 | 1–2 дня | Все Critical закрыты, можно выпускать ограниченно |
| 1 | 1–1.5 нед | Сервер конфигурируем, тестируем, с миграциями, не выжигает Strava-квоту |
| 2 | 1 нед (параллельно) | Монорепо, shared types/client, единый контракт ошибок |
| 3 | 2 нед | Числа одинаковы во всех клиентах; клиенты не пишут производные данные |
| 4 | 1–1.5 нед (параллельно с 3) | `server.js` разобран на домены; Redis; refresh-токены; контроль OpenAI |
| 5 | 2–3 нед | Аппка на TanStack Query, без гигантов, с темой, готова к Store |
| 6 | 1.5–2 нед | Веб на том же слое данных, без мёртвого кода, CI зелёный |
| 7 | 1 нед | Типизированный контракт, гейты качества |

Итого ≈ 8–10 недель одним потоком агентов; фазы 3/4 и 5/6 хорошо параллелятся. Ожидаемое снятие кода: ≈ 5 700 (мёртвый веб) + ≈ 900 (мёртвая аппка) + ≈ 3 000–3 400 (дубли в клиентах) + ≈ 600 (сервер) ≈ **10 000+ строк из 74 000** при одновременном добавлении тестов, типов и схем.

---

## 7. Ограничения аудита

Анализировалась копия исходников без `node_modules`, `ios/`, `android/` и бинарных ассетов; не проверялись Info.plist/entitlements, нативный модуль `ScreenshotDetect`, `allowBackup`, размеры картинок, `vite build` с реальными ассетами. Живая БД не смотрелась — утверждения о схеме сделаны по коду и `md/*.md`; перед T-1.4 снять реальную схему. `.env` не читался (только имена переменных).

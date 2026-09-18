# Аудит backend (server/) — BikeLab / CycleProg

Объём: `server/server.js` (7208 строк, 109 регистраций `app.<verb>`), `routes/oura.js` (4), `routes/skillsHistory.js` (5) — итого 118 HTTP-маршрутов; плюс `aiCoach.js` (1835), `aiGoals.js`, `achievements.js`, `recommendations/`, `ouraService.js`, `aiAnalysis.js`, `imagekit-config.js`, `brevo-config.js`, `goalCalculator.js`, `trainingPlans.js`, `database_profiles.js`, `optimize_postgres.js`, `apply_profile.js`, `test_goalCalculator.js`. Все ссылки на строки — по текущему состоянию файлов в репозитории.

---

## Summary

Сервер — типичный AI-сгенерированный монолит: 7200 строк в одном файле, миграции схемы в IIFE при старте, бизнес-логика, SQL и HTTP-plumbing перемешаны внутри каждого хендлера, один и тот же блок refresh Strava-токена скопирован 11 раз. Функционально работает для одного разработчика, но **в текущем виде к массовому запуску не готов**: есть несколько дыр класса «любой залогиненный пользователь управляет всей базой». Хорошее: везде параметризованный SQL (инъекций через пользовательский ввод не найдено), bcrypt, IDOR практически везде закрыт `AND user_id = $N`, есть `pool.on('error')`, транзакции в двух местах.

Топ-5 рисков:
1. **Админ-маршруты без проверки admin** (`/api/admin/users`, `DELETE /api/admin/users/:userId`, unlink-strava) — любой пользователь с JWT видит всех и удаляет любого (S-01).
2. **Захардкоженный Strava `CLIENT_SECRET` в исходнике** (server.js:37) — компрометация OAuth-приложения при любой утечке кода (S-02).
3. **`/api/database/optimize` и `clear-cache` доступны любому пользователю** — `ALTER SYSTEM SET` и `DISCARD ALL` на проде (S-03).
4. **Удаление аккаунта «успешно» без реального удаления**: цикл DELETE внутри транзакции глотает ошибки, а Postgres после первой ошибки абортит транзакцию; COMMIT превращается в ROLLBACK, ответ — `success:true` (S-04, GDPR).
5. **Крэш процесса от любой ошибки БД** в async-хендлерах без try/catch (`/api/rides*`, `/api/checklist*`, `GET /api/goals`, …) — unhandled rejection = завершение процесса на Node 20 (S-20); плюс отсутствие rate-limit, helmet, health-check, graceful shutdown.

---

## Route map

Легенда: ✅ auth есть + запросы scoped по `user_id`; ❌ auth нет; ⚠️ auth есть, но нет scoping/проверки прав или иная проблема доступа. `AUTH` = `authMiddleware` (server.js:3997) либо `authenticateUser` в роутерах (идентичные копии).

### 1. `auth` — регистрация/логин/верификация/OAuth
| Маршрут | Строка | Статус | Комментарий |
|---|---|---|---|
| GET `/exchange_token` | 537 | ❌ (публичный OAuth callback) | нет `state` → login-CSRF; JWT уходит в URL |
| GET `/auth/success` | 663 | ❌ (публичный) | токен в query, отражается в HTML (encodeURIComponent — ок) |
| GET `/oura/exchange_token` | 750 | ❌ (state = JWT purpose-token, ок) | XSS через `oauthError` (S-12) |
| GET `/link_strava` | 5715 | ❌ (state = полный сессионный JWT) | JWT в URL Strava-редиректа |
| POST `/api/register` | 3833 | ❌ (публичный) | нет валидации email/пароля, нет rate-limit |
| GET `/api/verify-email` | 3878 | ❌ (публичный) | токен из `Math.random` |
| POST `/api/resend-verification` | 3916 | ❌ (публичный) | user enumeration, нет rate-limit |
| POST `/api/login` | 3960 | ❌ (публичный) | нет rate-limit; 500 при Strava-only аккаунте |
| POST `/api/unlink_strava` | 5847 | ✅ | |
| DELETE `/api/account` | 5887 | ✅ | логическая ошибка транзакции (S-04) |
| POST `/api/user-profile/email` | 6589 | ✅ | смена email без переверификации |
| GET `/strava-auth-status` | 1558 | ❌ | ReferenceError (`access_token` не определён) → 500 со stack |

### 2. `strava` — активности, велосипеды, токены, лимиты
| Маршрут | Строка | Статус |
|---|---|---|
| GET `/api/activities` | 1059 | ✅ |
| GET `/api/activities/:id` | 1159 | ✅ (владение проверяется Strava по токену пользователя) |
| GET `/api/activities/:id/streams` | 1214 | ✅ |
| GET `/api/activities/debug/types` | 1269 | ✅ (debug, удалить) |
| POST `/api/activities/cache/clear` | 1328 | ✅ |
| GET `/api/activities/:id/ai-analysis` | 3536 | ⚠️ ручная проверка JWT вместо middleware; ошибки → `details: e.message` |
| GET `/api/activities/:id/meta-goals-progress` | 3614 | ✅ |
| GET `/api/analytics/activity/:id` | 3384 | ✅ |
| GET `/api/bikes` | 2690 | ✅ |
| GET `/api/bikes/:bikeId/health` | 3074 | ✅ |
| PUT `/api/bikes/:bikeId/labels` | 3271 | ✅ |
| POST `/api/bikes/:bikeId/components/:component/reset` | 3313 | ✅ |
| POST `/api/bikes/:bikeId/onboarding` | 3344 | ✅ |
| GET `/api/strava/tokens` | 1954 | ⚠️ отдаёт access/refresh Strava-токены клиенту |
| POST `/api/strava/tokens` | 1983 | ⚠️ клиент может подменить серверные Strava-токены |
| GET `/api/strava/limits` | 2028 | ✅ (глобальное состояние, не per-user) |
| POST `/api/strava/limits/refresh` | 2054 | ✅ |
| GET `/api/proxy/strava-image` | 1603 | ❌ **SSRF: произвольный URL без auth** |

### 3. `analytics` — сводка, снапшоты, skills
| Маршрут | Строка | Статус |
|---|---|---|
| GET `/api/analytics/summary` | 2114 | ✅ (~400 строк, см. S-33) |
| POST `/api/analytics-snapshot` | 6994 | ✅ |
| GET `/api/analytics-snapshot/latest` | 7061 | ✅ |
| GET `/api/analytics-snapshot/history` | 7075 | ✅ |
| GET `/api/skills-history/last` | routes/skillsHistory.js:39 | ✅ |
| GET `/api/skills-history/compare` | :70 | ✅ |
| POST `/api/skills-history` | :120 | ✅ |
| GET `/api/skills-history/range` | :193 | ✅ (`parseInt(limit)` без верхней границы) |
| DELETE `/api/skills-history/cleanup-month` | :238 | ✅ |
| POST `/api/ai-analysis` | 3514 | ⚠️ ручной JWT; `summary` из body напрямую в промпт OpenAI без лимита размера |
| GET `/api/ai-cache-stats` | 6735 | ❌ статистика по всем пользователям без auth |

### 4. `goals` — цели, мета-цели
| Маршрут | Строка | Статус |
|---|---|---|
| GET `/api/goals` | 4089 | ✅ (без try/catch) |
| POST `/api/goals` | 4137 | ✅ (`meta_goal_id` не проверяется на принадлежность — S-09) |
| PUT `/api/goals/:id` | 4173 | ✅ |
| POST `/api/goals/recalc-vo2max/:id` | 4246 | ✅ |
| DELETE `/api/goals/:id` | 4303 | ✅ (без try/catch) |
| POST `/api/goals/update-current` | 5635 | ✅ (HTTP-вызов самого себя) |
| GET `/api/goals/:goalId/recommendations` | 6630 | ✅ (scoped в recommendations/index.js:347) |
| GET `/api/meta-goals` | 4318 | ✅ |
| GET `/api/meta-goals/:id` | 4374 | ✅ |
| POST `/api/meta-goals` | 4463 | ✅ |
| POST `/api/meta-goals/ai-generate` | 4669 | ✅ (без транзакции, OpenAI-вызов без лимита) |
| PUT `/api/meta-goals/:id` | 4937 | ✅ |
| DELETE `/api/meta-goals/:id` | 4967 | ✅ |

### 5. `calendar` + legacy `rides` + `events` + `checklist`
| Маршрут | Строка | Статус |
|---|---|---|
| GET/POST `/api/calendar`, PUT/DELETE `/api/calendar/:id` | 1436–1528 | ✅ |
| GET/POST `/api/rides`, PUT/DELETE `/api/rides/:id`, POST `/api/rides/import` | 1354–1401 | ✅ но **без try/catch** (крэш процесса) |
| GET/POST/PUT/DELETE `/api/events*` | 6750–6836 | ✅ |
| GET/POST `/api/checklist`, PUT/DELETE `/api/checklist/:id`, DELETE `/api/checklist/section/:section` | 4016–4071 | ✅ но **без try/catch** |

### 6. `coach` — AI Coach
| Маршрут | Строка | Статус |
|---|---|---|
| GET `/api/coach/conversations` | 5001 | ✅ |
| GET `/api/coach/conversations/by-activity/:activityId` | 5024 | ✅ |
| GET `/api/coach/conversations/:id` | 5042 | ✅ |
| DELETE `/api/coach/conversations/:id` | 5065 | ✅ |
| POST `/api/coach/chat` | 5108 | ✅ (SSE; до 6 итераций + 1 доп. вызов OpenAI за запрос, без per-user лимита) |

### 7. `profile` / `training`
| Маршрут | Строка | Статус |
|---|---|---|
| GET/PUT `/api/user-profile` | 6345/6375 | ✅ (PUT меняет `users.email` без проверки уникальности — S-27) |
| POST `/api/user-profile/onboarding` | 6515 | ✅ |
| GET `/api/training-plan`, `/stats` | 6333/6680 | ✅ |
| POST `/api/training-plan/custom`, DELETE `/custom/:dayKey` | 6692/6710 | ✅ |
| GET `/api/training-types`, `/api/training-types/:type` | 6669/6652 | ✅ (статика, auth не нужен) |

### 8. `achievements`
| GET `/api/achievements`, GET `/api/achievements/me`, POST `/api/achievements/evaluate` | 7095–7126 | ✅ |

### 9. `oura`
| GET `/api/oura/connect-state`, `/status`, POST `/sync`, `/unlink` | routes/oura.js:35–124 | ✅ |

### 10. `media` — ImageKit / legacy файловые картинки
| Маршрут | Строка | Статус |
|---|---|---|
| GET `/api/garage/positions` | 1630 | ✅ |
| POST `/api/garage/upload` | 1646 | ✅ (нет проверки mimetype) |
| DELETE `/api/garage/images/:name` | 1846 | ✅ |
| GET `/api/hero/images` | 1707 | ✅ |
| POST `/api/hero/upload`, `/api/hero/assign-all` | 1733/1789 | ✅ |
| DELETE `/api/hero/positions/:position` | 1909 | ✅ |
| GET `/api/imagekit/config` | 2007 | ✅ |
| GET `/api/garage/images` | 1577 | ❌ листинг файлов на диске без auth (legacy) |
| GET `/api/hero/positions` | 1641 | ❌ legacy JSON с диска без auth |
| DELETE `/api/hero/images/:name` | 1883 | ❌ **удаление файлов с диска без auth**, обход `startsWith` |

### 11. `admin` / `database` — служебные
| Маршрут | Строка | Статус |
|---|---|---|
| GET `/api/admin/users` | 6860 | ⚠️ **нет проверки роли** |
| POST `/api/admin/users/:userId/unlink-strava` | 6887 | ⚠️ **нет проверки роли, чужой userId** |
| DELETE `/api/admin/users/:userId` | 6915 | ⚠️ **нет проверки роли, удаляет любого** |
| GET `/api/database/memory`, `/table-stats`, `/profiles` | 5944/6071/6119 | ⚠️ любой пользователь видит `pg_stat_activity` c текстами запросов |
| POST `/api/database/clear-cache` | 6097 | ⚠️ `DISCARD ALL` любым пользователем |
| POST `/api/database/optimize` | 6135 | ⚠️ `ALTER SYSTEM SET` любым пользователем |

### 12. `weather` — прокси Open-Meteo
| GET `/api/weather/wind`, `/api/weather/forecast` | 6240/6308 | ❌ без auth → открытый прокси/усилитель нагрузки на чужой API; `details` пробрасывает upstream-ошибку |

### 13. `static` / SPA
| `/.well-known/apple-app-site-association`, `/apple-app-site-association`, `/privacy`, `express.static`×5, `app.get('*')` | 502–530, 7188 | ❌ (публичные, норм.) — но раздаётся `react-spa/src/assets/img/*` из **исходников** |

---

## Findings

### Security

**S-01 · Critical · authz** — Админ-маршруты не проверяют роль.
`server.js:6860` `app.get('/api/admin/users', authMiddleware, …)`, `:6887` `app.post('/api/admin/users/:userId/unlink-strava', authMiddleware, …)`, `:6915` `app.delete('/api/admin/users/:userId', authMiddleware, …)`. Внутри — только `const { userId } = req.params;` и сразу `DELETE … WHERE user_id = $1`. Комментарии «только для админа» ничем не подкреплены; в схеме `users` нет колонки роли, в JWT (`:617-621`) нет claim `role`.
Impact: любой зарегистрированный пользователь получает email/strava_id всех пользователей и может удалить любой аккаунт.
Fix: добавить `users.is_admin BOOLEAN DEFAULT false`, `requireAdmin` middleware (проверять по БД, не по JWT-claim), либо вынести админку за отдельный секрет/IP-allowlist. До этого — закомментировать маршруты.

**S-02 · Critical · secrets** — Strava `CLIENT_SECRET` захардкожен.
`server.js:36-37`: `const CLIENT_ID = '165560'; const CLIENT_SECRET = '<REDACTED>';`
Impact: секрет в git-истории, в любом бэкапе, у любого подрядчика; позволяет выпускать токены от имени приложения BikeLab и деавторизовывать пользователей.
Fix: ротировать секрет в Strava немедленно; читать из `STRAVA_CLIENT_ID/SECRET`; проверять наличие при старте.

**S-03 · Critical · authz** — Управление конфигурацией PostgreSQL доступно любому пользователю.
`server.js:6097-6100` `app.post('/api/database/clear-cache', authMiddleware, …) { await pool.query('DISCARD ALL;') }`; `:6135-6170` `/api/database/optimize` выполняет `ALTER SYSTEM SET ${name} = '${setting.value}'` и fallback `SET ${name} = …` на пуловом соединении; `:5944-6061` `/api/database/memory` возвращает `pg_stat_activity … query` (тексты чужих запросов).
Impact: DoS (сброс `max_connections=10`, `shared_buffers=16MB` из профиля `low-end`), утечка SQL с данными других пользователей; `SET` на пуловом клиенте меняет поведение соединения для следующих запросов других пользователей.
Fix: удалить маршруты из прод-сборки (это dev-утилиты, дублирующие `optimize_postgres.js`/`apply_profile.js`).

**S-04 · Critical · data-integrity/GDPR** — `DELETE /api/account` и `DELETE /api/admin/users/:userId` могут вернуть `success:true`, ничего не удалив.
`server.js:5897-5926`: `BEGIN`, затем `for (const query of deleteQueries) { try { await client.query(query,[userId]) } catch (tableErr) { console.warn('Skipping…') } }`, затем `COMMIT`. В PostgreSQL первая ошибка внутри транзакции (например, отсутствующая таблица `custom_training_plans`/`generated_weekly_plans`/`events`) переводит её в состояние aborted: все последующие statements падают с `current transaction is aborted`, а `COMMIT` молча выполняется как `ROLLBACK` (pg не бросает исключение). Ответ — `res.json({ success: true })`.
Impact: пользователь считает аккаунт удалённым, данные (включая Strava/Oura токены) остаются.
Fix: убрать per-statement try/catch внутри транзакции; опираться на `ON DELETE CASCADE` (уже есть у новых таблиц) и одиночный `DELETE FROM users WHERE id=$1`; добавить FK с каскадом на старые таблицы миграцией; проверять `rowCount` удаления users и возвращать 404/500 при 0.

**S-05 · High · SSRF** — Открытый прокси произвольных URL.
`server.js:1603-1627`: `app.get('/api/proxy/strava-image', async (req, res) => { const imageUrl = req.query.url; … axios.get(imageUrl, { responseType: 'stream' }) … response.data.pipe(res)`. Нет auth, нет allowlist доменов, нет timeout, нет лимита размера.
Impact: чтение внутренних адресов (metadata-эндпоинты облака, внутренний Postgres-порт через HTTP-ошибки), анонимный трафик через сервер, DoS большим файлом.
Fix: auth; allowlist хостов (`dgalywyr863hv.cloudfront.net`, `*.strava.com`); `timeout`, `maxContentLength`; либо заменить на прямую загрузку в клиенте (Strava CDN отдаёт CORS).

**S-06 · High · authz/filesystem** — Удаление файлов с диска без аутентификации + обход path-check.
`server.js:1883-1906`: `app.delete('/api/hero/images/:name', (req,res)=>{ const file = path.join(HERO_DIR, req.params.name); if (!file.startsWith(HERO_DIR)) …; fs.unlink(file, …)`. Нет middleware. `startsWith` обходится соседним каталогом с тем же префиксом (`../heroX/...` → `…/img/heroX/...` начинается с `…/img/hero`). Аналогично без auth: `GET /api/garage/images` (`:1577`, листинг каталога), `GET /api/hero/positions` (`:1641`).
Impact: анонимное удаление ассетов фронтенда из `react-spa/src/assets/img/hero`.
Fix: удалить legacy файловые маршруты (все картинки уже в ImageKit + `user_images`); если оставлять — auth и `path.relative()`-проверка.

**S-07 · High · auth-flow** — Strava login без `state` (login-CSRF) и JWT в URL.
`server.js:537-545`: `/exchange_token` принимает только `code`, `state` не генерируется и не проверяется. `:634` `res.redirect('/auth/success?token=' + jwt)`, `:638` `res.redirect('/exchange_token?jwt=…&name=…&avatar=…')`. `:5717` `/link_strava` использует **сессионный JWT как state** → он попадает в URL авторизации Strava, их логи и историю браузера.
Impact: атакующий может заставить жертву залогиниться в аккаунт атакующего (подсунуть свой `code`), после чего жертва загружает свои данные/цели в чужой аккаунт; долгоживущие (7d) JWT оседают в Referer/логах/истории.
Fix: генерировать одноразовый `state` (как уже сделано для Oura: `routes/oura.js:37-41`), передавать токен через POST-обмен `code→JWT` из клиента или через fragment `#token=`; для `link_strava` — короткоживущий purpose-токен `{purpose:'link_strava'}` на 10 минут.

**S-08 · High · authz** — Клиент может читать и подменять серверные Strava-токены.
`server.js:1954-1975` `GET /api/strava/tokens` возвращает `strava_refresh_token`; `:1983-1996` `POST /api/strava/tokens` пишет произвольные `access_token/refresh_token/expires_at` в `users`.
Impact: refresh-токен уходит на устройство (утечка через логи/бэкапы устройства); пользователь A может записать в свой аккаунт refresh-токен пользователя B (если добудет) — сервер будет тянуть чужие активности; расширяет поверхность атаки на OAuth-приложение.
Fix: удалить оба маршрута (весь Strava-трафик уже идёт через сервер).

**S-09 · Medium · IDOR** — `meta_goal_id` при создании цели не проверяется на принадлежность.
`server.js:4140,4150,4161-4164`: `const validatedMetaGoalId = meta_goal_id || null; INSERT INTO goals (user_id, …, meta_goal_id) VALUES ($1 … $12)`.
Impact: пользователь A привязывает свои sub-goals к meta-goal пользователя B; B видит их в `GET /api/meta-goals/:id` (`:4390` `SELECT * FROM goals WHERE meta_goal_id = $1` — без `user_id`) и в `/api/meta-goals/ai-generate`/`aiCoach` подсчётах.
Fix: `SELECT 1 FROM meta_goals WHERE id=$1 AND user_id=$2` перед INSERT; добавить `AND user_id = $2` в `:4390`, `:4333`, `:4915`.

**S-10 · Medium · ratelimit** — Нет rate limiting нигде.
`server.js:23` `app.use(express.json())` — единственные глобальные middleware: CORS (`:11-21`) и Cache-Control (`:27-34`). `/api/login` (`:3960`), `/api/register` (`:3833`), `/api/resend-verification` (`:3916`), `/api/coach/chat` (`:5108`, до 7 вызовов OpenAI за запрос), `/api/meta-goals/ai-generate` (`:4669`), `/api/weather/*` — без ограничений.
Impact: брутфорс паролей, спам верификационными письмами через Brevo (платно), неограниченный расход OpenAI-бюджета одним пользователем, DoS Strava-квоты приложения.
Fix: `express-rate-limit` (глобально 300/15min по IP; `/api/login|register|resend` 5/15min; AI-маршруты 20/час по `userId`); учёт токенов OpenAI per-user/день в таблице.

**S-11 · Medium · headers/CORS** — CORS `*`, нет `helmet`, нет `X-Content-Type-Options`.
`server.js:12` `res.header('Access-Control-Allow-Origin', '*')`, `:14` разрешает `Authorization`. Нет helmet, CSP, HSTS.
Impact: любой сайт может вызывать API с украденным Bearer; XSS-страницы (S-12) без CSP.
Fix: `cors({ origin: [FRONTEND_URL, 'https://bikelab.app', 'capacitor://…'] })`, `helmet()`.

**S-12 · Medium · XSS** — Отражённый XSS в OAuth-callback.
`server.js:753-755`: `if (oauthError) return res.status(400).send(\`<h1>Oura authorization failed</h1><p>${oauthError}</p>\`)` — `oauthError = req.query.error` без экранирования. Аналогично `:652` `<p …>${err.message}</p>` (частично внешне управляемое сообщение от Strava).
Impact: ссылка `https://bikelab.app/oura/exchange_token?error=<script>…</script>&code=x&state=y` выполняет JS в origin приложения (где в localStorage/URL живут JWT).
Fix: экранировать (`escape-html`) или отдавать статические страницы с кодом ошибки в query.

**S-13 · Medium · auth** — Слабые verification-токены и отсутствие password reset.
`brevo-config.js:10-12`: `Math.random().toString(36).substring(2,15) + …` — не криптостойко, ~62 бита из предсказуемого PRNG. `sendPasswordResetEmail` (`:63`) импортируется (`server.js:68`) но **маршрута сброса пароля нет вообще** (grep `reset-password|forgot` — 0 совпадений).
Impact: восстановление доступа невозможно для email-пользователей; токены предсказуемы.
Fix: `crypto.randomBytes(32).toString('hex')`; хранить хэш токена; реализовать `/api/forgot-password` + `/api/reset-password`.

**S-14 · Medium · auth** — JWT: 7 дней, без ревокации, без `algorithms`, секрет не валидируется при старте.
`server.js:617-621, 3979-3989, 5776-5780, 5868-5878, 6612-6616` — 5 копий `jwt.sign({userId,email,strava_id,name,avatar}, process.env.JWT_SECRET, {expiresIn:'7d'})`; `:4002` `jwt.verify(token, process.env.JWT_SECRET)` без `{algorithms:['HS256']}`. При отсутствии `JWT_SECRET` `sign` бросит только при первом логине (неявная конфигурационная ошибка). Удаление аккаунта/смена email не инвалидирует уже выданные токены (payload содержит устаревший `email`, `strava_id`).
Fix: единый `issueToken(user)`; `algorithms:['HS256']`; fail-fast при старте если `JWT_SECRET.length < 32`; short-lived access (1h) + refresh-token таблица либо `token_version` в users для ревокации.

**S-15 · Medium · info-leak** — Утечка внутренних ошибок клиенту и stack-trace через дефолтный обработчик Express.
`server.js:3531,3609,4931,6111,6234,6301,6325` — `details: e.message` / `details: error.response?.data`; `:2512,4241,5708` `message: err.message`. Нет `app.use((err,req,res,next)=>…)`: синхронная ошибка (например `/strava-auth-status:1559` `!!access_token` → ReferenceError) отдаёт HTML со stack, т.к. `NODE_ENV` не выставлен в `production`.
Fix: централизованный error-handler, `message` только из whitelist, `NODE_ENV=production`.

**S-16 · Medium · upload** — Нет валидации MIME/расширения при загрузке, имя файла из клиента.
`server.js:1569-1574`: `multer({ storage: memoryStorage(), limits:{fileSize:25MB} })` без `fileFilter`; `:1673` `fileName = \`${userId}_${pos}_${Date.now()}_${req.file.originalname}\``.
Impact: в ImageKit можно залить любой файл до 25 МБ (HTML/SVG с JS → отдаётся с публичного CDN-домена); 25 МБ в памяти × параллельные запросы = OOM на маленьком инстансе.
Fix: `fileFilter` по `image/(jpeg|png|webp)` + проверка magic bytes (`file-type`), лимит 5–8 МБ, генерировать имя без `originalname`.

**S-17 · Medium · authz** — Внешние API-прокси и служебные эндпоинты без аутентификации.
`server.js:6240` `/api/weather/wind`, `:6308` `/api/weather/forecast` (без `timeout` в `:6318`), `:6735` `/api/ai-cache-stats`.
Impact: анонимный трафик через сервер к Open-Meteo (нарушение их ToS/квот), утечка агрегатов (`unique_users`).
Fix: `authMiddleware` + короткий server-side кэш ответов по (lat,lng,date).

**S-18 · Low · info-leak** — User enumeration.
`/api/register:3839-3840` — 400 «already exists»; `/api/resend-verification:3928-3935` — 404 vs 400; `/api/login:3967` — для Strava-only пользователя `password_hash = null` → `bcrypt.compare(password, null)` бросает → 500, отличимо от 401.
Fix: единообразные ответы; проверять `user.password_hash` перед compare.

**S-19 · Low · TLS** — `ssl: { rejectUnauthorized: false }` для PG в проде (`server.js:110`, `optimize_postgres.js:12`).
Fix: `ssl: { ca: fs.readFileSync(process.env.PGSSLROOTCERT) }` или системный CA хостера.

### Reliability

**S-20 · Critical · crash** — Async-хендлеры без try/catch → unhandled rejection → падение процесса.
`server.js:1354-1358` `GET /api/rides` (`await pool.query` без try), `:1361-1373` POST, `:1376-1386` PUT, `:1389-1398` DELETE, `:1401-1420` import; `:4016-4084` все 5 маршрутов `/api/checklist*`; `:4089-4134` `GET /api/goals`; `:4303-4313` `DELETE /api/goals/:id`. Express 4 не перехватывает rejected promise; Node ≥15 завершает процесс (авторы сами это описали в комментарии `:1429-1435`, но починили только calendar). Нет `process.on('unhandledRejection')`.
Impact: любой транзиентный сбой БД или невалидный ввод (например `start: 'abc'` в `/api/rides` → PG error 22007) роняет весь сервер для всех пользователей.
Fix: обёртка `asyncHandler(fn)` для всех маршрутов + глобальный error middleware; `process.on('unhandledRejection', log)` как страховка.

**S-21 · High · reliability** — Стартовая зависимость от `BREVO_API_KEY`.
`brevo-config.js:4-7`: `if (!process.env.BREVO_API_KEY) { console.error(…); process.exit(1); }` выполняется при `require` в `server.js:68`.
Impact: отсутствие ключа опционального email-провайдера = сервер не стартует; в тестах/CI модуль вообще нельзя импортировать.
Fix: убрать `process.exit`; ленивая проверка при отправке; единый `config.js` со списком обязательных переменных.

**S-22 · High · external-calls** — Внешние HTTP-вызовы без timeout.
Refresh Strava-токена без `timeout`: `server.js:1081, 1177, 1232, 2072, 2137, 2718, 3096, 3191, 3405, 5731, 7144`, обмен кода `:548`; streams `:1249-1255`; `:2536` (VO2max), `:3108`, `:3201`, `:3568`, `:3820`; deauthorize `:1047`; proxy `:1610`; weather `:6318`; Brevo `brevo-config.js:48,96`; OpenAI-клиенты без `timeout`/`maxRetries` (`aiAnalysis.js:4`, `aiGoals.js:4`, `aiCoach.js:668`). Внутренний self-call `:5557, 5640` без timeout.
Impact: зависшие соединения держат pg-клиентов и HTTP-сокеты; при деградации Strava/OpenAI очередь запросов растёт до OOM.
Fix: `axios.create({ timeout: 10000 })` для Strava; `new OpenAI({ timeout: 60_000, maxRetries: 2 })`; на SSE-потоке — abort-controller при `res.on('close')`.

**S-23 · High · correctness** — Отравление кэша активностей неполными/нефильтрованными данными.
`server.js:2536-2544` (`calculateVO2maxForPeriod`): при промахе кэша грузится `per_page: 100` **без фильтра по типу и без пагинации**, и результат пишется в общий `activitiesCache.set(userId, …)` (`:2544`). Далее `/api/activities` (`:1065-1067`) отдаёт этот усечённый набор 2 часа; `/api/goals` (`:4106`), `/api/bikes/:id/health` (`:3087`), achievements — считают по 100 активностям всех типов (бег/ходьба). Аналогично `:4715` (ai-generate, 200 без пагинации, но с фильтром).
Fix: один `stravaService.getAllActivities(userId)` с пагинацией+фильтром+кэшем; запретить прямую запись в кэш из других мест.

**S-24 · High · scalability** — In-memory состояние ломается при >1 инстансе и при рестарте.
`server.js:869-870` `activitiesCache`/`bikesCache` (BoundedCache 200 пользователей × полная история активностей — при 2000 активностей ≈ 2–4 МБ на пользователя → до 800 МБ RAM); `:980` `stravaRateLimits` — глобальный счётчик на процесс; `aiAnalysis.js:9` `aiCache`; `:1006` `stravaQueuePromise`. Все per-process.
Impact: при горизонтальном масштабировании каждый инстанс отдельно выбирает Strava-квоту приложения (300/15 мин на всё приложение!), кэш-промахи множатся; после деплоя все пользователи одновременно триггерят полную перезагрузку истории.
Fix: Redis (или сама PG `synced_activities`, которая уже есть) как основной источник; Strava rate-limit в Redis INCR с TTL; читать активности из `synced_activities` с инкрементальным `after=` синком.

**S-25 · High · strava-quota** — Полная перезагрузка всей истории при каждом cache-miss; rate-limiter реализован, но не используется.
`server.js:1100-1112` `while(true) { axios.get(…athlete/activities, {per_page:200, page}) }` — для пользователя с 3000 активностей = 15 запросов на каждый miss (раз в 2 часа, после каждого деплоя, для каждого из 4 копий этого цикла: `:1100`, `:2155`, `:7161`). `stravaRequest()` с очередью (`:1015-1033`) **не вызывается ни разу** (grep — только определение). `checkStravaLimits` проверяется только в 2 маршрутах (`:1070`, `:2700`). При 429 от Strava нет backoff/ретрая.
Impact: лимит 300 чтений/15 мин на всё приложение исчерпывается ~20 активными пользователями после деплоя; все получают 429/500.
Fix: инкрементальный синк через `after=<last synced_at>` в `synced_activities`; единый клиент с очередью/лимитером; webhook Strava вместо polling.

**S-26 · Medium · self-call** — HTTP-вызов самого себя через localhost.
`server.js:5557` и `:5640`: `axios.get(\`http://localhost:${PORT}/api/analytics/summary\`, { headers: { Authorization: authHeader } })` внутри `updateUserGoals` (вызывается синхронно из `POST /api/rides:1370` и `/api/rides/import:1417`).
Impact: удвоение нагрузки, зависимость от `PORT=8080` и от того, что процесс слушает на localhost; при нескольких инстансах за балансировщиком поведение случайно; ошибки глотаются (`:5629-5631`).
Fix: вынести расчёт summary в `analyticsService.computeSummary(userId, opts)` и вызывать напрямую.

**S-27 · Medium · integrity** — Смена email через `PUT /api/user-profile` без проверки уникальности и без переверификации.
`server.js:6409-6411`: `if (profileData.email !== undefined) await pool.query('UPDATE users SET email = $1 WHERE id = $2', …)` — при наличии `idx_users_email UNIQUE` (`:465`) это упадёт 500; `email_verified` не сбрасывается ни здесь, ни в `/api/user-profile/email:6606`.
Fix: единый `changeEmail()` с проверкой, сбросом `email_verified`, повторной отправкой письма.

**S-28 · Medium · transactions** — Многошаговые записи без транзакций.
`server.js:4797-4879` `/api/meta-goals/ai-generate`: INSERT meta_goals + N × INSERT goals + N × UPDATE — без транзакции (в `aiCoach.js:1181-1244` тот же сценарий уже обёрнут в BEGIN/COMMIT — расхождение). `:1408-1414` `/api/rides/import` — N INSERT по одному. `:3295-3303` labels — N upsert. `:1803-1829` assign-all — 5 DELETE + 5 INSERT. `ouraService.js:267-328` — upsert по дням в цикле. `imagekit-config.js:103-112` DELETE+INSERT без транзакции.
Impact: осиротевшие meta_goals без sub-goals при ошибке на N-й вставке; частичные импорты.
Fix: `withTransaction(pool, async client => …)`; batch-UPSERT через `UNNEST` (как уже сделано в `syncActivitiesToDb:906-929`).

**S-29 · Medium · migrations** — Схема мигрирует при каждом старте из IIFE, без версионирования и без блокировки.
`server.js:136-499`: 40+ `CREATE TABLE IF NOT EXISTS`/`ALTER TABLE … ADD COLUMN IF NOT EXISTS`/`ALTER COLUMN … DROP NOT NULL`, data-backfill `INSERT INTO calendar_events … SELECT FROM rides` (`:360-368`) и `UPDATE users SET strava_athlete_id` (`:379`) — на **каждом** запуске каждого инстанса; ошибки глотаются (`:490` `catch (e) { /* table may not exist yet */ }`). Базовые таблицы (`users`, `goals`, `rides`, `checklist`, `events`, `user_profiles`, `user_images`, `ai_analysis_cache`, `skills_history`, `custom_training_plans`, `generated_weekly_plans`, `activity_meta_goals_progress`) **в коде не создаются вообще** — схема живёт только в живой БД (schema drift; см. `md/GOALS_SYSTEM.md` vs комментарий `:205-220`).
Impact: невоспроизводимое окружение (нельзя поднять staging с нуля), гонки миграций при 2+ инстансах, `app.listen` (`:7208`) стартует до завершения миграций → первые запросы бьют в неполную схему.
Fix: `node-pg-migrate`/`knex migrate` с таблицей версий, запуск как отдельный шаг деплоя (`npm run migrate && node server.js`); `await migrate()` перед `listen`.

**S-30 · Medium · shutdown/health** — Нет health-check, graceful shutdown, `PORT` захардкожен.
`server.js:24` `const PORT = 8080;` (не `process.env.PORT`); `:7208` `app.listen(PORT, …)` без сохранения `server` и без `SIGTERM` handler; `pool.end()` не вызывается; `setInterval` (`:6726`) без `unref()`. Нет `/health` (`GET /api/*` неизвестных путей → 404 из `app.get('*')`).
Impact: на Render/K8s деплой убивает in-flight SSE-стримы `/api/coach/chat` и незакоммиченные транзакции; балансировщик не может проверить готовность.
Fix: `/healthz` (SELECT 1), `server.close()` + `pool.end()` по SIGTERM с таймаутом 10 с, `PORT = process.env.PORT || 8080`.

**S-31 · Medium · ai-cost** — Отсутствие контроля стоимости OpenAI.
`server.js:5260` цикл до 6 итераций `chat.completions.create` со всей историей (`conversation`) + `:5475` дополнительный вызов для suggestions, при `COACH_MODEL=gpt-4.1-mini`; `express.json()` дефолт 100 КБ — клиент шлёт **полную историю каждый ход** (`:5110`, `:5207`), без truncation по токенам. `aiGoals.js:434-460` — fallback на 3 модели последовательно (при сбое = 3 платных попытки). `/api/ai-analysis:3516` — `summary` из body любого размера в промпт.
Impact: один пользователь с длинным диалогом = десятки тысяч токенов за сообщение; нет per-user дневного бюджета.
Fix: серверное хранение истории (она уже в `coach_messages`) и обрезка до N последних сообщений/токенов; per-user лимит в `coach_messages.token_usage` (колонка есть, но не заполняется — `:5528-5538`); `max_tokens` на все вызовы.

**S-32 · Low · sse** — При обрыве клиента поток OpenAI не отменяется.
`server.js:5282` `for await (const chunk of stream) { if (clientClosed) break; …}` — `break` не вызывает `stream.controller.abort()`; параллельно инструменты продолжают выполняться.
Fix: `stream.controller.abort()` в `res.on('close')`.

### Data layer

**S-33 · Medium · perf** — Тяжёлые вычисления и повторные загрузки в request path.
`server.js:2114-2514` `/api/analytics/summary` — ~400 строк, ~10 проходов `.filter/.reduce` по всей истории активностей (в памяти), плюс возможная полная загрузка Strava (`:2155`); вызывается на каждое `POST /api/rides` через self-call (S-26). `estimateVO2max` продублирован (`:2370-2456` и `:2595-2672`) с **разными** формулами бонусов и **разными** именами полей профиля (`resting_heartrate/max_heartrate` vs `resting_hr/max_hr` — первая копия всегда берёт дефолты 60/220-age, т.к. таких колонок в `user_profiles` нет).
Fix: `analyticsService` с мемоизацией по `(userId, lastActivityId, period)`; одна реализация `estimateVO2max`.

**S-34 · Medium · unbounded** — Запросы без LIMIT/пагинации.
`server.js:1356` `SELECT * FROM rides WHERE user_id=$1`; `:4093` goals; `:5054` все сообщения диалога; `:6755` events; `aiCoach.js:700-702` `SELECT * FROM synced_activities WHERE user_id=$1` (вся история на каждый tool-call); `routes/skillsHistory.js:206` `LIMIT $2` с `parseInt(limit)` без верхней границы (`?limit=99999999`). `/api/activities` (`:1141`) отдаёт полный JSON всех активностей (мегабайты) без пагинации.
Fix: `?limit/cursor`, `LIMIT 500` по умолчанию, отдавать облегчённые поля.

**S-35 · Medium · n+1** — N+1 и повторные чтения одних и тех же данных.
`server.js:2803-2817` `/api/bikes`: `bikes.map(async bike => axios.get(/gear/${id}))` — по запросу Strava на каждый велосипед при каждом miss; `:4892-4906` UPDATE каждой sub-goal в цикле; `aiCoach.js:1029-1031` `SELECT * FROM goals WHERE meta_goal_id=$1` в цикле по meta_goals; `recommendations/index.js:477-520` DELETE+INSERT по каждому дню. `getUserStravaToken` (`:1037`) делает `SELECT * FROM users` (включая все токены) до 3 раз за один запрос `/api/bikes/:id/health` (`:3091`, `:3186`).
Fix: `WHERE meta_goal_id = ANY($1)` (уже сделано в `:3679`), один `SELECT` пользователя на запрос через `req.user` кэш.

**S-36 · Low · indexes** — Отсутствуют индексы под фактические запросы.
`users.verification_token` (`:3886-3889` `WHERE verification_token=$1` — seq scan), `oura_daily_data` есть; `analytics_snapshots (user_id,last_activity_id)` (`:7003`); `activity_meta_goals_progress (user_id, activity_id)` (`:3620-3624`, индекс только `(user_id, meta_goal_id)` `:463`); `bike_component_labels` покрыт UNIQUE. `coach_messages.tool_calls` читается целиком в `:5244` для подсчёта — лучше хранить `analysis_count` на conversation.
Fix: добавить в миграцию.

**S-37 · Low · types** — `NUMERIC` возвращается строкой, местами это не учитывается.
`routes/oura.js:68-95` — конвертация `Number()` сделана; но `server.js:3696-3699` `sg.current_value || 0` / `sg.target_value || 1` из `goals` (NUMERIC) — деление строк работает через коэрцию, а `newCurrentValue !== goal.current_value` (`:5618`, `:5692`) сравнивает number со string → всегда true → лишние UPDATE.
Fix: `types.setTypeParser(1700, parseFloat)` рядом с `:100` или явные касты.

### Code quality / duplication / dead code

**S-38 · High · duplication** — Refresh Strava-токена скопирован 11 раз.
`server.js:1080-1095, 1176-1191, 1231-1247, 2071-2087, 2136-2150, 2717-2732, 3095-3107, 3190-3200, 3404-3418, 7143-7157` (+ `link_strava`). Блок `getUserStravaToken → if (now >= expires_at) axios.post(oauth/token) → UPDATE users` идентичен. Аналогично 4 копии полной пагинации активностей (`:1100`, `:2155`, `:7161` + частичные `:2536`, `:3108`, `:3420`, `:4701`), 5 копий `jwt.sign(...)` (S-14), 3 копии `authMiddleware` (`server.js:3997`, `routes/oura.js:12`, `routes/skillsHistory.js:9`), 2 копии `deleteQueries` (`:5899-5916`, `:6928-6945`), 2 копии `updateUserGoals` switch (`:5588-5615` и `:5662-5689`), 2 копии `estimateVO2max` (S-33), 2 копии списка `positions` hero (`:1713`, `:1794`, `:1913`).
Fix: `services/strava.js` с `withStravaToken(userId, fn)`, `lib/jwt.js`, `middleware/auth.js`.

**S-39 · Medium · dead-code** — Мёртвый и debug-код в проде.
`stravaRequest`/`stravaQueuePromise` (`:1006-1033`) не используются; `estimateFTP(){return null}` (`:2457`); `loadGarageMeta/saveGarageMeta/GARAGE_META` (`:43, 1586-1592`) не используются; `getImageUrl`, `sendPasswordResetEmail` импортируются и не используются; `/strava-auth-status` (`:1558`) ссылается на несуществующую переменную; `/api/activities/debug/types` (`:1269`); закомментированный legacy (`:38-41, 532-535, 4011, 4178-4185`); `require('dotenv').config()` дважды (`:1`, `:85`); `require('./trainingPlans')` внутри хендлера (`:2337`) и `require('./database_profiles')` посреди файла (`:6116`). В `server/` лежат CLI-скрипты `optimize_postgres.js`, `apply_profile.js`, `test_goalCalculator.js`, `sqlstatus.txt`, `server.log` — попадают в прод-деплой (`npm start` = `cd server && npm install && node server.js`).
Fix: удалить; скрипты — в `scripts/`, тесты — в `test/`.

**S-40 · Medium · hygiene** — Раздача исходников фронта как статики, cwd-зависимые пути.
`server.js:516-517` `express.static('../react-spa/src/assets/img/*')` — отдаёт каталог **исходников** SPA; `:513` `express.static('public')` — относительно `process.cwd()`, а не `__dirname`; `:42-45, 1565-1566` `fs.mkdirSync` в дереве исходников при старте (падение на read-only FS).
Fix: статика только из `dist`/CDN; `path.join(__dirname, …)`.

**S-41 · Low · validation** — Нет схемной валидации входа.
Примеры: `/api/register:3835` — `email/password/name` без проверок (пустой пароль хэшируется); `/api/rides:1363` — `start` любого формата (PG error → крэш, S-20); `/api/calendar PUT:1503-1512` — allowlist ключей есть, но типы/значения нет (`completed: "yes"`); `/api/analytics-snapshot:6997` — числовые поля без проверки; `/api/coach/chat:5110` — `messages[].role` не валидируется (клиент может прислать `role:'system'` и переписать системный промпт — prompt injection в `:5205-5213`).
Fix: `zod`/`joi` схемы per-route; в coach — принимать только `role in ['user','assistant']`, системный промпт всегда серверный.

**S-42 · Low · logging** — `console.log` с emoji повсюду (~300 вызовов), без уровней и correlation-id; логируются query-параметры (`:626` `'query:', req.query` — содержит `code`), длины токенов, `args` инструментов coach (`:5335` — могут содержать персональные данные из сообщений).
Fix: `pino` с уровнями, redaction (`authorization`, `code`, `token`), request-id middleware.

**S-43 · Low · ops** — Нет lockfile и пин версий; Node engine `20.x` (`server/package.json`), при этом корневой `package.json` объявляет `pnpm@10.28.1` и `fit-file-parser`, а серверный — свой `dependencies` без lockfile → `npm install` на деплое тянет плавающие версии (`express ^4.18.2`, `axios ^1.10.0`, `multer ^2.0.1`, `openai ^5.9.2`). `debug` и `uuid`(Node 20 имеет `crypto.randomUUID`) лишние.
Fix: `package-lock.json` в git, `npm ci`, `npm audit` в CI, Dependabot.

**S-44 · Low · correctness** — `/api/analytics/summary` фильтр `?userId=` (`:2194-2196`) сравнивает `a.userId` (поля не существует ни у Strava, ни у `rides`, где `user_id`) — dead-filter, вводит в заблуждение. `avgPerWeek` (`:2309-2315`) для `period=all` делит на 52. `calculateGoalProgress` `'recovery'` (`:4654`) фильтрует по `a.type`, но ручные `rides` не имеют `type`.

**S-45 · Low · achievements** — `evaluateAchievements` запускается fire-and-forget на каждом cache-miss `/api/activities` (`:1135-1139`) и параллельно по `POST /api/achievements/evaluate` — гонка двух upsert'ов одного пользователя (`achievements.js:516-530` без транзакции с предварительным SELECT `:492-503`) → возможен ложный `newly_unlocked` дважды.

### Testing

**S-46 · Medium · tests** — Автотестов у сервера нет.
Единственный файл — `server/test_goalCalculator.js` (assert-скрипт, запуск вручную `node …`, не в `package.json scripts`). Нет `test` скрипта, нет CI, нет фикстур БД. Тестируемы уже сейчас (чистые функции): `goalCalculator.js`, `trainingPlans.js`, `recommendations/training-utils.js`, `computeRidingStyle/determineRiderProfile/computeStyleFactor` (`server.js:2967-3072`), `calculateGoalProgress` (`:4488`), `BoundedCache` (`:825`), `aiGoals.calculateRecentStats/analyzePerformanceTrends`. Не тестируемы без рефакторинга: все хендлеры (замкнуты на глобальный `pool`, `axios`, `activitiesCache`).
Fix: `vitest`/`node:test` + `supertest`; `testcontainers` Postgres; после выделения сервисов — контрактные тесты на маршруты с моком Strava/OpenAI (`nock`).

---

## Proposed target architecture

```
server/
  src/
    app.js                  # express() + middleware, без listen
    server.js               # bootstrap: config → migrate → app.listen, SIGTERM
    config/
      index.js              # zod-валидация env: PG*, JWT_SECRET, STRAVA_*, OPENAI_*, IMAGEKIT_*, BREVO_*, OURA_*, FRONTEND_URL, PORT
    db/
      pool.js               # Pool + types.setTypeParser + pool.on('error')
      tx.js                 # withTransaction(fn)
      migrations/           # node-pg-migrate: 001_baseline.sql (снятый pg_dump -s), 002_…  
    middleware/
      auth.js               # requireAuth, requireAdmin, optionalAuth
      asyncHandler.js
      errorHandler.js       # единый формат {error, code}, без stack
      rateLimit.js          # global / auth / ai
      requestId.js, logger.js (pino-http)
    lib/
      jwt.js                # issueSessionToken, issuePurposeToken, verify(purpose)
      http.js               # axios instances с timeout
      cache.js              # интерфейс get/set/del → Redis или in-memory (dev)
      openai.js             # клиент с timeout/maxRetries + учёт токенов
    services/
      strava/
        client.js           # rate-limiter (Redis), очередь, updateLimits
        tokens.js           # withStravaToken(userId) — единый refresh
        activities.js       # syncIncremental(userId), getAll(userId) ← synced_activities
        bikes.js
      analytics/summary.js, vo2max.js, bikeHealth.js
      goals/{goals,metaGoals,progress}.js  (+ goalCalculator.js как lib)
      coach/{chat,tools,prompt}.js          (из aiCoach.js)
      calendar.js, rides.js, events.js, checklist.js
      achievements.js, skills.js, snapshots.js
      oura/{service,sync}.js
      media/imagekit.js
      auth/{register,login,verify,reset,strava-oauth}.js
      email/brevo.js
    repositories/           # только SQL, все методы принимают userId
      users.js, goals.js, metaGoals.js, calendarEvents.js, rides.js, events.js,
      checklist.js, coachConversations.js, coachMessages.js, syncedActivities.js,
      syncedBikes.js, bikeComponents.js, userImages.js, skillsHistory.js,
      analyticsSnapshots.js, achievements.js, ouraDaily.js, aiAnalysisCache.js
    routes/
      index.js              # монтирует всё под /api
      auth.js strava.js activities.js bikes.js analytics.js goals.js metaGoals.js
      calendar.js rides.js events.js checklist.js coach.js profile.js training.js
      achievements.js skills.js oura.js media.js admin.js health.js
    domain/                 # чистые функции: trainingPlans, ridingStyle, goalProgress, vo2max
  scripts/                  # optimize_postgres.js, apply_profile.js (не деплоятся)
  test/                     # unit (domain), integration (routes+testcontainers)
```

Принципы: route = парсинг/валидация (zod) + вызов сервиса + ответ; сервис = бизнес-логика без `req/res`; репозиторий = SQL c обязательным `userId`; ни одного `pool.query` вне `repositories/`; ни одного `axios` вне `lib/http.js`/`services/strava/client.js`; ни одного `process.env` вне `config/`.

### Безопасный порядок извлечения (каждый шаг — отдельный PR, поведение API не меняется)

1. **Стоп-кран без рефакторинга (день 1):** удалить/закрыть S-01, S-03, S-05, S-06, S-08, S-17, debug-маршруты; ротировать Strava-секрет и перенести в env (S-02); `helmet`, `cors(origin)`, `express-rate-limit`; `asyncHandler` + `errorHandler` + `process.on('unhandledRejection')`; `/healthz`, SIGTERM, `PORT` из env. Это ~150 строк изменений и снимает все Critical.
2. **config + db:** `config/index.js` (fail-fast), `db/pool.js`, `db/tx.js`; `server.js` начинает импортировать их. Починить S-04 (транзакция удаления).
3. **middleware/auth.js + lib/jwt.js:** заменить 3 копии auth и 5 копий `jwt.sign`. Роутеры `oura.js`/`skillsHistory.js` переходят на общий middleware.
4. **services/strava/tokens.js + client.js:** `withStravaToken(userId, fn)`; заменить 11 копий refresh. Затем `activities.js` с единой пагинацией/фильтром/кэшем — заменить 4+3 копии, устранить S-23. Ввести `lib/cache.js` интерфейс (пока in-memory).
5. **Миграции:** снять `pg_dump --schema-only` прод-базы как `001_baseline.sql`; перенести IIFE `server.js:136-499` в `002_…`; `npm run migrate` в деплой перед стартом.
6. **Вынос доменов по одному**, начиная с самых изолированных и уже покрытых try/catch: `calendar` → `events` → `checklist` → `rides` (добавить try/catch) → `achievements/skills/snapshots` → `media` → `profile/training` → `goals/metaGoals` (объединить с `goalCalculator`) → `analytics` (разбить `/summary`, убрать self-call S-26) → `bikes` → `coach` (вытащить HTTP/SSE из `server.js:5108-5551` в `services/coach/chat.js`) → `auth/strava-oauth` (добавить `state`).
7. **Redis** для `activitiesCache`/`bikesCache`/Strava rate-limit/AI-cache; инкрементальный Strava-синк по `after=`; после этого — горизонтальное масштабирование.
8. **Тесты:** unit на `domain/` сразу после шага 2 (уже возможно), integration на маршруты по мере выноса.

---

## Quick wins (< 1 часа каждый)

1. Ротировать Strava `CLIENT_SECRET`, вынести `CLIENT_ID/SECRET` в env (`server.js:36-37`).
2. Закомментировать/удалить `/api/admin/*`, `/api/database/*`, `/api/strava/tokens` (GET/POST), `/api/proxy/strava-image`, `DELETE /api/hero/images/:name`, `GET /api/garage/images`, `GET /api/hero/positions`, `/strava-auth-status`, `/api/activities/debug/types`, `/api/ai-cache-stats`.
3. `npm i helmet cors express-rate-limit` + 10 строк в начале `server.js`; лимиты на `/api/login|register|resend-verification`.
4. `const asyncHandler = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next)`; обернуть маршруты `rides/checklist/goals`; глобальный `app.use((err,req,res,next)=>…)`; `process.on('unhandledRejection', …)`.
5. `PORT = process.env.PORT || 8080`; `/healthz`; `SIGTERM → server.close(); pool.end()`.
6. Убрать `process.exit(1)` из `brevo-config.js:4-7`.
7. Экранировать `oauthError` (`server.js:754`) и `err.message` (`:652`).
8. `crypto.randomBytes(32).toString('hex')` вместо `Math.random` в `brevo-config.js:10-12`.
9. Убрать per-statement `try/catch` в `DELETE /api/account` / admin-delete (`:5918-5924`, `:6949-6957`), проверять `rowCount` удаления `users`.
10. Добавить `timeout: 10000` во все `axios.post('https://www.strava.com/oauth/token', …)` и `new OpenAI({ timeout: 60000, maxRetries: 2 })`.
11. В `calculateVO2maxForPeriod` (`:2536-2544`) убрать `activitiesCache.set` (или фильтровать по типу и пагинировать).
12. `fileFilter` по mimetype + лимит 8 МБ в `multer` (`:1569`).
13. Проверка владения `meta_goal_id` в `POST /api/goals` (`:4150`) и `AND user_id=$2` в `:4390`.
14. `messages.filter(m => ['user','assistant'].includes(m.role))` в `/api/coach/chat` (`:5207`).
15. `NODE_ENV=production` в окружении деплоя (скрывает stack Express, включает SSL-ветку).
16. Перенести `optimize_postgres.js`, `apply_profile.js`, `test_goalCalculator.js`, `sqlstatus.txt`, `server.log` из `server/` в `scripts/` и `test/`; добавить `"test": "node test/test_goalCalculator.js"`.
17. Удалить мёртвый код: `stravaRequest`, `estimateFTP`, `loadGarageMeta/saveGarageMeta`, второй `require('dotenv')`, неиспользуемые импорты.
18. Добавить индексы: `users(verification_token)`, `activity_meta_goals_progress(user_id, activity_id)`, `analytics_snapshots(user_id, last_activity_id)`.
19. Зафиксировать `package-lock.json`, перейти на `npm ci`; запустить `npm audit`.
20. `types.setTypeParser(1700, parseFloat)` рядом с `server.js:100` (после проверки мест, где ожидается строка).

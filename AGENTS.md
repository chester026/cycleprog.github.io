# BikeLab — guide for AI agents and humans

Cycling-training product: iOS app (React Native), web app (React SPA) and one Node/Postgres API,
all in this monorepo. Read this file before changing anything. Deeper docs are linked per section;
the architecture rationale lives in `docs/audit/00-AUDIT-AND-PLAN.md` (7-phase migration, done 09/2026).
**How code should read — comments, naming, cleanup, tests — is in `docs/CODE_STYLE.md`; follow it.**

## Layout

| Path | What | Stack |
|---|---|---|
| `packages/shared` | `@bikelab/shared` — zod types, **API contract**, pure calc, constants | TS, tsup, vitest |
| `server` | API + serves the web build. `server.js` only wires things | Express 4, pg, node-pg-migrate, pino, vitest |
| `react-spa` | Web app | Vite, React 19, react-router 7, TanStack Query, JS/JSX |
| `BikeLabApp` | iOS/Android app (NOT an npm workspace — own `node_modules`/lockfile) | RN 0.83, TS strict, TanStack Query, react-i18next, Skia |
| `docs/audit` | Plan, findings, quality-gate numbers | |

Root is npm workspaces (`packages/*`, `server`, `react-spa`); one `package-lock.json`. `BikeLabApp`
depends on shared via `file:../packages/shared` and needs `packages/shared/dist` built
(`npm run build -w packages/shared`; the app's `prestart/preios` do it).

## Non-negotiable rules

1. **Every HTTP route is in the contract.** `packages/shared/src/api/contract/<domain>.ts` declares
   method, path, zod `params/query/body/response` via `defineEndpoint`. Server routes use
   `contract(c.<domain>.<name>)` (`server/middleware/contract.js`); the only exceptions are marked
   `uncontracted('reason')` (SSE stream, binary proxy). Clients never write API paths as strings:
   app → `api.call(goals.list, {params, query, body})` (`BikeLabApp/src/data/api.ts`), web →
   `call(goals.list, …)` (`react-spa/src/data/api.js`). `server/test/contract.inventory.test.js`
   fails CI on any route without a contract entry or entry without a route. Adding an endpoint =
   contract file + route + client hook, in that order. `npm -w server run routes` lists everything.
2. **Do not rename API paths or response fields** while `LEGACY_MOBILE_COMPAT` exists (the App Store
   build depends on today's shapes). Response fields are snake_case (DB rows), paths kebab-case.
3. **Server data lives in TanStack Query only.** Hooks in `src/data/hooks/<useThing>.ts|js`, keys in
   `src/data/keys.*`. No `useEffect`+`useState`+fetch in screens/pages, no AsyncStorage/localStorage
   for server data (the query persister handles offline).
4. **Auth goes through one place.** App: `src/utils/api.ts` (Keychain token pair, refresh on 401).
   Web: `src/auth/AuthProvider.jsx` (`useAuth()`; access token in memory, refresh in localStorage).
   Never read tokens elsewhere; never build an `Authorization` header by hand.
5. **Server layering:** `routes/<domain>.js` (HTTP only) → `services/<domain>.js` (logic) →
   `repositories/<domain>.js` (SQL). Errors via `ApiError` (`lib/apiError.js`) →
   `{error, code}` envelope. Async handlers are auto-wrapped (`patchAsyncRoutes`). Schema changes =
   a new file in `server/migrations/` (node-pg-migrate, run on boot). Any SQL change needs an
   integration test on real Postgres, not a mocked pool. Strava/OpenAI calls only through
   `services/strava/*` and `aiCoach.js`/`aiAnalysis.js` (quota- and budget-aware); never raw axios.
   Logging via `lib/logger` (pino) — no `console.*`.
6. **Calc lives in shared.** Anything numeric (skills, FTP, VO2max, zones, goal progress, units) is
   in `packages/shared/src/calc` with 100 % coverage enforced. Don't reimplement in a client.
7. **App UI:** every user-visible string via `t('ns.key')`, keys in BOTH `src/i18n/en.json` and
   `ru.json` (eslint `i18next/no-literal-string` is an error). Colors/spacing/typography from
   `src/theme` (`useTheme()`, `makeStyles`) — hex literals outside the theme are a warning being
   driven to zero. `useWindowDimensions`, not `Dimensions.get`. Typed navigation
   (`src/navigation`, `RootStackParamList`). Screens < 600 lines: extract into
   `src/screens/<Screen>/*` + `lib.ts` for pure logic. Skia `BlobOrb` stays as is (owner decision).
8. **Web UI:** English only. Dialogs/toasts from `src/ui` (`Modal`, `ConfirmDialog`, `useConfirm`,
   `useToast`) — no `alert/confirm`. Charts via `src/components/charts/TrendChart`. jsx-a11y
   recommended is an error: clickable things are `<button>` or `role="button"` + keyboard handler;
   inputs have labels. Fonts self-hosted (`src/fonts.js`). Pages < 600 lines, pieces in
   `src/pages/<page>/`. `errorElement` on routes.
9. **Config:** server env is validated in `server/config/index.js` (zod, fail-fast) — add new vars
   there and in `server/.env.example`. Never commit secrets.
10. **Tests along the way:** new pure function → unit test in the same change; new route →
    integration test; new component → RTL/RNTL test. Keep comments that explain *why*
    (audit refs like `T-7.1`, `W-18`); delete code you replace — no dual paths.

## Verify before you finish (what CI runs)

```
npm -w packages/shared run build && npm -w packages/shared run test:coverage && npm -w packages/shared run typecheck
npm -w server run lint && npm -w server test
CONTRACT_VALIDATE_RESPONSES=1 npm -w server run test:integration      # needs Postgres (PG* env)
npm -w react-spa exec -- eslint . --max-warnings 0 && npm -w react-spa test && npm -w react-spa run build
npm -w react-spa run test:e2e                                          # Playwright smoke, needs Postgres
cd BikeLabApp && npm run typecheck && npx eslint src --max-warnings=1000 && npm test
npm run lint:dup                                                       # jscpd, threshold 6 %
```
`docs/audit/quality-gates.md` has current numbers and the report-only gates (knip, npm audit).

## Environments

- Production: Render, autodeploy from `main`, `npm run build` / `npm run start` at repo root, Node 22
  (`.node-version`). Web and API share the host `bikelab.app`. Env: `PG*`, `JWT_SECRET` (≥32 chars),
  `STRAVA_*`, `OPENAI_API_KEY`, `LEGACY_MOBILE_COMPAT=true` (until the new app build is in the
  store — then remove it, delete the `legacyMobile*` branches and set `ACCESS_TOKEN_TTL=1h`).
  Optional: `REDIS_URL`, `SENTRY_DSN`.
- Local dev: `server` with `.env` (the owner's local server points at the production DB — be
  careful with destructive scripts), `react-spa` on Vite 5173, app via Metro. Strava OAuth only
  works against the production callback URL.
- App: `SENTRY_DSN` in `src/config.ts` enables Sentry (`docs/sentry.md`); Maestro flows in
  `.maestro/` (`docs/maestro.md`).

## Working conventions

- Small, focused changes; one concern per commit. Commit messages say *why*.
- Don't add npm dependencies casually; when you do, root `npm install` (or `BikeLabApp npm install` +
  `pod install` for native modules) and mention it in the PR/report.
- Never add binary files through an agent; never touch `react-spa/src/assets/img/**` programmatically.
- Owner decisions already made (don't relitigate): Strava login stays; Sign in with Apple deferred;
  web legacy pages Rides/Events/Weather kept; Nutrition page removed; Checklist is a Garage block
  (web + app) linking to its own page/screen; admin is a lazy chunk behind `is_admin`; no feature
  transfers between web and app unless asked.

## Where to start for common tasks

- New/changed endpoint: `packages/shared/src/api/contract/<domain>.ts` → `server/routes/<domain>.js`
  (+ service/repo) → integration test → `src/data/hooks/useX` in the client(s).
- New app screen: `src/screens/<Name>Screen.tsx` (+ `src/screens/<Name>/` pieces), route in
  `src/navigation/types.ts` + `App.tsx`, i18n keys, data via `src/data/hooks`.
- New web page: `src/pages/<Name>Page.jsx` (lazy in `src/App.jsx`), CSS next to it, hooks from
  `src/data/hooks`, primitives from `src/ui`.
- Restyling (e.g. the Checklist section): the data hooks and contract stay; change only the
  screen/page and its pieces; keep testIDs used by `.maestro/*.yaml`.

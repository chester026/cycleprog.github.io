# BikeLab web (`react-spa`)

Vite + React 19 SPA, served by `server/` in production. Architecture rules live in the repo-root
`CLAUDE.md` (§8 for web), code style in `CODE_STYLE.md`.

```
npm -w react-spa run dev        # Vite on :5173, proxies /api to :8080
npm -w react-spa test           # vitest (jsdom)
npm -w react-spa run build      # production build into dist/
npm -w react-spa run lint:colors  # report-only: hex literals outside the token files
```

## Environment (`.env` / `.env.example`)

| Var | Purpose |
|---|---|
| `VITE_API_URL`, `VITE_BACKEND_BASE` | API base for non-proxied setups |
| `VITE_STRAVA_CLIENT_ID` | Strava OAuth client id |
| `VITE_SENTRY_DSN` | Optional. When set, `src/lib/sentry.js` initialises `@sentry/react` (release = build git sha, `environment` = Vite mode, 10 % traces, no default PII). Unset locally and in CI, so nothing is reported from dev builds. |

## Error reporting

Never call `console.*` in `src/` — production builds strip it. Report through `logError(err, label,
extra)` from `src/lib/log.js`: it goes to Sentry when the DSN is set and to the console in dev.
`build.sourcemap` is `'hidden'`: `dist/assets/*.map` exist for uploading to Sentry but are not referenced
from the served JS. A stale lazy chunk after a deploy (`vite:preloadError`) triggers one page reload
(`src/main.jsx`).

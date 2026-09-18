# @bikelab/shared

Shared types, pure calculations, constants and API-contract pieces used by
`server/`, `react-spa/` and `BikeLabApp/`. See `docs/audit/00-AUDIT-AND-PLAN.md`
(T-2.1/T-2.2/T-2.4/T-3.x) and `docs/audit/layers/04-cross-layer.md` §6 for the
full extraction plan — this package currently only has the wiring proven with
one real export per subfolder.

## Importing

```js
// whole package
import { msToKmh, ACTIVITY_RIDE_TYPES } from '@bikelab/shared';

// sub-path (smaller bundle, matches the `exports` map's "./*" entry)
import { msToKmh } from '@bikelab/shared/calc';
import { ACTIVITY_RIDE_TYPES } from '@bikelab/shared/constants';
import { API_ERROR_CODES } from '@bikelab/shared/api';
import type { ApiErrorBody } from '@bikelab/shared/types';
```

CommonJS consumers (server) get the same paths via the `require` condition:

```js
const { ACTIVITY_RIDE_TYPES } = require('@bikelab/shared/constants');
```

## Building

```
npm install
npm run build   # tsup -> dist/{index,calc,constants,api,types}.{mjs,cjs,d.ts}
npm test        # vitest
```

`npm run dev` runs `tsup --watch` for local iteration.

### Why the package is built, not run from source, for server/CI

`server` is CommonJS (`require`), so `@bikelab/shared` ships both an ESM and a
CJS build via `tsup` and an `exports` map. The `prepare` script runs `build`
automatically when this package is installed as a `file:` dependency — but
`prepare` execution for `file:` deps isn't 100% reliable across npm versions,
so every install path that matters (root `build`/`start` scripts, CI jobs)
also runs `npm run build` in `packages/shared` explicitly before touching a
consumer. Don't rely on `prepare` alone.

## Metro (BikeLabApp) notes

Metro is pointed at `../packages/shared/src` (via `watchFolders` +
`tsconfig.json` `paths`), not `dist` — Metro transpiles the TS source itself,
so there is no separate watch-build step and edits show up on refresh without
running `npm run build`.

## Vite (react-spa) notes

Vite resolves `@bikelab/shared` through the package's `exports` map (built
`dist`) in production. In dev mode only, `vite.config.js` aliases
`@bikelab/shared` to `../packages/shared/src` so edits hot-reload without a
rebuild; `optimizeDeps.exclude` keeps Vite from pre-bundling it as an opaque
dependency, and `server.fs.allow: ['..']` lets Vite's dev server read outside
`react-spa/`.

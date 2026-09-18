# src/auth — contract (phase 6, T-6.1)

`AuthProvider.jsx` is the ONLY place that knows where tokens live.

```js
import { useAuth } from '../auth/AuthProvider';
const { user, isAdmin, isAuthenticated, isLoading, login, logout, getAccessToken } = useAuth();
// user: { id, email, name, is_admin, ... } | null   (from GET /api/user-profile, cached via TanStack)
// login({ token, refreshToken })  — called by LoginPage / ExchangeTokenPage after the server answers
// logout()                        — POST /api/auth/logout (best effort), clears tokens + queryClient
```
Storage decision (owner, 18.09): access token in memory only; refresh token in localStorage
(`bikelab.refreshToken`); on page load AuthProvider silently calls `POST /api/auth/refresh`.
The shared client (`@bikelab/shared/api` `createApiClient({ refresh })`) does the 401 → refresh → retry.
No `localStorage.getItem('token')` and no `jwtDecode` anywhere outside this folder.

## Additive exports (T-6.1)

Besides the `useAuth()` shape above, `AuthProvider.jsx` exports:
- `registerLogoutCleanup(fn)` — `queryClient.js` doesn't exist on this branch yet, so
  AuthProvider can't import and call `queryClient.clear()` itself. The data-layer agent
  (T-6.2) registers its own cleanup once its provider mounts:
  `registerLogoutCleanup(() => { queryClient.clear(); persister.removeClient(); })`.
  `logout()` runs every registered cleanup (best-effort, one failing doesn't block the rest)
  before/alongside clearing tokens.
- `setNavigator(navigate)` — called once by a component inside the router (see
  `App.jsx`'s `NavigatorBridge`) so a hard 401 or a failed silent refresh can redirect to
  `/login?session_expired=true` via react-router instead of `window.location.href`.
- `refreshProfile()` (also on the `useAuth()` value) — re-fetches `GET /api/user-profile`
  without touching tokens, for callers that used to re-decode a JWT after a server-side
  profile change that doesn't mint a new token (e.g. linking Strava).
- `getInMemoryAccessToken()` — the module-level access token, used internally by
  `utils/api.js`'s handlers; exported mainly so tests can assert on it directly.

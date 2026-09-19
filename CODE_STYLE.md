# BikeLab — code style

`AGENTS.md` says *what* the architecture is. This file says *how* code should read. It applies to
every layer (server JS, shared TS, web JSX, app TSX). Formatting itself is enforced by ESLint/Prettier
configs in each package — don't argue with them, run them.

## 1. Leave the place cleaner than you found it

- **Delete what you replace.** No dual code paths, no `_old` suffixes, no commented-out blocks, no
  `// TODO: remove after migration` without a linked task. If the old path must stay for a
  transition (like `LEGACY_MOBILE_COMPAT`), gate it behind one explicit flag, mark every branch with
  the same tag so `grep` finds them all, and write down when it goes away.
- **No dead code.** Unused imports, variables, exports, files, CSS classes, i18n keys — remove them
  in the same change. `knip` report (`npm run lint:deadcode`) must not grow because of you.
- **No debug leftovers.** No `console.log` (server: `logger.debug`; clients: `src/utils/logger`
  where it exists, otherwise remove). No `debugger`, no `.only` in tests, no hardcoded ids/tokens.
- **Touch only what the task needs.** Reformatting an unrelated file, "fixing" nearby code,
  reordering imports across the codebase — no. If you notice something worth fixing, note it in
  the report/PR description; don't fold it into an unrelated change.
- **Fix, don't document, a bug you introduced.** Never add a test that asserts broken behaviour
  "for later". A pre-existing bug you don't fix: flag it in the report, leave behaviour as is.

## 2. Comments: why, not what

The codebase's comments are its memory. They explain decisions, constraints and traps — not syntax.

Write a comment when:
- the code does something non-obvious for a reason outside the file (a Strava quirk, a pg
  behaviour, an owner decision, an audit finding — cite it: `T-7.1`, `S-07`, `W-18`);
- a simpler-looking alternative was rejected and the next reader would try it;
- there is a trap (`// pg returns Date for timestamptz — validated before res.json serialises`).

Don't write:
- what the code obviously does (`// increment counter`);
- narrative history (`// previously this used apiFetch, now migrated to…`) — git has it. State the
  current truth, not the journey;
- comments about the task/agent that produced the code, file ownership, "another agent will…",
  "in this worktree…". Those are conversation artifacts, not code;
- apologies or hedges (`// not sure if this is right`). Either make it right or ask.

Keep comments true: when you change the code, re-read the comment above it. A stale comment is
worse than none. File headers are 2–8 lines: purpose, key invariant, where it's used. Not an essay.

JSDoc/TSDoc on exported functions of shared modules (`packages/shared`, `src/data/hooks`, `src/ui`):
one line of purpose, params only when their meaning isn't obvious from the name/type.

## 3. Naming and shape

- Names say what a thing is, in the domain's words: `metaGoal`, `subGoals`, `ftpEstimate`,
  `hrZones`, `stravaActivity`. No `data2`, `tmp`, `helper`, `utils2`, `handleStuff`.
- Booleans read as predicates: `isLoading`, `hasStrava`, `canComplete`. Handlers: `handleX` /
  `onX` (prop). Hooks: `useX`. Async functions return promises — no `Async` suffix.
- Files: one main thing per file, named after it. Components `PascalCase.tsx|jsx`, hooks
  `useThing.ts|js`, pure logic `lib.ts|js` next to the screen/page, tests `X.test.*` next to `X`.
- Size limits are real: screens/pages/components < 600 lines, functions that don't fit on a
  screen get split. Extract pure logic to `lib.*` and test it.
- Order inside a component: hooks → derived values → handlers → early returns → JSX. Styles at
  the bottom (`makeStyles`/`StyleSheet`) or in the CSS file next to the component.
- Prefer early returns over nested `if`. Prefer `const`; `let` only when reassigned.
- Magic numbers get a named constant with a unit in the name (`STREAM_BUDGET_PER_REQUEST`,
  `CACHE_TTL_MS`). Thresholds that are product decisions live in `packages/shared/src/constants`.

## 4. Types and validation

- TS: `strict`. No `any`; use `unknown` + narrowing. No `as` casts to silence the compiler — if a
  type is wrong, fix the type (usually in the shared contract). One documented cast is acceptable
  when the runtime truly can't produce the case (say why in the comment).
- Types come from the contract: `EndpointResponse<typeof goals.list>`, zod-inferred types from
  `@bikelab/shared/types`. Don't hand-write a duplicate interface for a server response.
- JS (web, server): JSDoc types where they help readers; validate at boundaries (server: contract
  middleware; never trust `req.body` shape inside a handler).
- No `eslint-disable`. If a rule is genuinely wrong for one line, disable that one rule on that one
  line with a justification in the same comment. Never disable a rule file-wide.

## 5. Errors and edge cases

- Server: throw/`next()` an `ApiError` with a stable `code`. Never `res.status(500).json({...})`
  by hand — let `errorHandler` render it. Log with context objects (`logger.warn({userId, err},
  'msg')`), not string concatenation. Don't log request bodies or tokens.
- Clients: errors surface through the query/mutation state; show `ErrorMessage`/toast, never
  swallow with an empty `catch {}`. A `catch` that intentionally ignores must say why.
- Handle the empty state explicitly (no rides, no goals, no Strava) — it's a UI state, not an error.
- Nullable DB columns are nullable in the schema (`.nullable()`), not papered over with `|| 0`.

## 6. Tests

- Every pure function has a unit test with real expected values (compute them), not a snapshot
  of whatever the function returned.
- Every new route has an integration test on real Postgres (`server/test/integration`), covering
  the happy path and one validation failure. Any SQL change too.
- Components: render with a small fixture, assert the key texts/roles the user sees. Mock at the
  boundary (`src/data/api` / hooks), not deep internals.
- Tests are code: same naming rules, no copy-paste of 200-line fixtures — extract a builder.
  Test names describe behaviour (`'expired legacy token is probed and cleared before bootstrap'`),
  not the function (`'test 1'`).
- A red test blocks the change. Don't `skip` to get green; fix or remove with a reason.

## 7. UI specifics

- App: `t()` for every string, keys in `en.json` AND `ru.json` in the screen's namespace; theme
  tokens, no hex; `testID` on interactive elements used by Maestro; `accessibilityLabel` on icon-
  only buttons. Same pixels when refactoring — a refactor is not a redesign.
- Web: semantic elements first (`<button>`, `<label htmlFor>`, `<nav>`, `<main>`); `role`/`tabIndex`
  only when a native element truly can't be used. English copy, short and product-like
  ("Add goal", "No rides yet"). CSS lives next to the component; no new `!important`.
- Loading/empty/error states for every data-driven view. No layout shift on load where a skeleton
  or reserved height is cheap.

## 8. Commits and PRs

- One concern per commit. Message: imperative summary (≤ 72 chars) + a body that says *why* and
  anything a reviewer must know (behaviour change, migration, env var, manual step).
- A PR description lists: what changed, what to click through, new env/deps, follow-ups you chose
  not to do. Screenshots for UI changes.
- CI green is the bar, not a suggestion. Don't merge over a red gate by weakening the gate.

## 9. Review checklist (for yourself before handing off)

1. Does everything I replaced no longer exist? (`grep` the old name.)
2. Are all comments true for the code as it is now? Any "previously/now migrated" narration left?
3. Any `any`, `eslint-disable`, `console.log`, `.only`, `TODO` without a task?
4. New strings → i18n (app) / English (web)? New numbers → named constants?
5. New route → contract + integration test? New pure function → unit test?
6. Ran the verify block from `AGENTS.md` for the packages I touched?
7. Would a stranger understand *why* from the code and comments alone, without this conversation?

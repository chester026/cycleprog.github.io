# Maestro smoke flows (A-40)

`.maestro/` holds 5 smoke flows: `login.yaml`, `garage.yaml`, `analysis.yaml`, `goals.yaml`,
`coach.yaml`. They assert on `testID`s added to the relevant screens (`garage-screen`,
`analysis-tab`, `goal-list`, `coach-screen`, `coach-tab`, `goals-tab`, `login-screen`,
`login-email-input`, `login-password-input`, `login-submit-button`) rather than on visible text,
so they don't break when copy or translations change.

## Install (local machine, once)

```
curl -Ls "https://get.maestro.mobile.dev" | bash
export PATH="$PATH":"$HOME/.maestro/bin"
maestro --version
```

## Run against the iOS Simulator

1. Build and install a debug build on a booted simulator (`npm run ios`, or `xcrun simctl install
   booted <path-to-.app>`).
2. Fix `appId` in each flow (see the comment in `login.yaml`) to the real bundle id — it's a
   placeholder here because the `ios/`/`android/` native projects aren't checked into this
   worktree.
3. Run a single flow:
   ```
   maestro test .maestro/login.yaml -e MAESTRO_EMAIL=you@example.com -e MAESTRO_PASSWORD=secret
   ```
4. Run everything in the folder:
   ```
   maestro test .maestro -e MAESTRO_EMAIL=you@example.com -e MAESTRO_PASSWORD=secret
   ```
   (`garage.yaml`/`analysis.yaml`/`goals.yaml`/`coach.yaml` all `runFlow: login.yaml` first, so
   the same env vars cover the whole suite.)

Use a real (test/staging) BikeLab account's credentials — never commit them; pass them as `-e`
flags or via your shell's env, same as `SENTRY_AUTH_TOKEN` (see `docs/sentry.md`).

## CI

**No CI job for these yet** — there's no iOS runner in this repo's CI today, and Maestro needs a
booted simulator (or a real/emulated Android device) to drive. Once a macOS runner (or Maestro
Cloud) is available, wire `maestro test .maestro` into it; until then these are a local
pre-release checklist, run by hand before shipping a build.

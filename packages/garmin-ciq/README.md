# @bikelab/garmin-ciq — BikeLab on the bike computer

Garmin Connect IQ **device app** for Edge 1040 / 1050 (Monkey C). Shows the
garage, then the week's planned sessions with their block profiles — and
starts one as a native Garmin workout — then what the last ride did to the
goals, and the goals themselves — from the same server-computed numbers the phone and web
show. Plans and owner decisions: `docs/plans/garmin-connect-iq.md`,
`docs/plans/garmin-edge-workouts.md`. Backend: `server/routes/garmin.js`,
contract: `packages/shared/src/api/contract/garmin.ts`.

Not an npm workspace — nothing here is built by `npm`. The root
`workspaces: ["packages/*"]` glob ignores a folder without a `package.json`,
keep it that way.

## Layout

```
manifest.xml          app id, products (edge1040, edge1050), permissions: Communications, PersistedContent
monkey.jungle         production build (API = https://bikelab.app)
monkey.dev.jungle     dev build (API = http://localhost:8080 via the simulator)
resources/            strings (en) + launcher icon; resources-rus/ strings (ru)
source/
  BikeLabApp.mc       entry: PairView when no token, HomeView otherwise
  Config.mc           base URL per build (:prod / :dev annotations), intervals
  Store.mc            Application.Storage: token, cached home + week payloads, fetchedAt, downloaded workouts
  Api.mc              makeWebRequest wrapper: JSON, Bearer header, error codes; the FIT download
  Ui.mc               drawing helpers (text, bars, page dots, number formatting)
  PairView.mc         6-digit code + polling (+ PairDelegate)
  HomeView.mc         paged screen: garage (bike wear), week (sessions + profiles), last ride + impact,
                      one page per goal (+ delegates, menu)
  SessionView.mc      one session: profile, block list, Start (+ delegates, menu)
  Workouts.mc         block profile drawing, dates and durations, hand-over to the Edge's workout player
  Starter.mc          start a session: reuse or download its workout file, open it in the Edge's player
```

## Prerequisites (once)

1. Java 17+ (`brew install --cask temurin`) — the compiler and the VS Code
   language server are Java.
2. Connect IQ SDK Manager → install the latest SDK and the device files for
   **Edge 1040** and **Edge 1050**.
3. VS Code + the *Monkey C* extension. `Cmd+Shift+P` →
   `Monkey C: Generate a Developer Key` (keep the `.der` outside the repo).

## Run in the simulator

Open **this folder** (`packages/garmin-ciq`) in VS Code — the extension
looks for `monkey.jungle` at the workspace root. Then `F5` with the
"Run BikeLab on Edge 1040" configuration (`.vscode/launch.json`); the
extension starts the simulator, builds and launches the app.

In the simulator: *Settings → Connection* must show the phone as
connected, or every request fails with a negative code and the app shows
"Connect your phone". *File → View Memory* shows the app's heap — keep an eye
on it while the `home` payload grows.

Dev build against a local `server` (`npm -w server start`, port 8080):
`.vscode/settings.json` → `"monkeyC.jungleFiles": "monkey.dev.jungle"` (a string; several files are `;`-separated),
or from the terminal:

```bash
CIQ=~/Library/Application\ Support/Garmin/ConnectIQ/Sdks/connectiq-sdk-mac-*/bin
"$CIQ/monkeyc" -d edge1040 -f monkey.dev.jungle -o bin/BikeLab.prg -y ~/connectiq-dev-key.der -w
"$CIQ/connectiq" &            # simulator
"$CIQ/monkeydo" bin/BikeLab.prg edge1040
```

## Pair the simulator / device with your account

The app shows a 6-digit code and polls until the code is confirmed. Until the
BikeLab app has its *Settings → Garmin* screen, confirm from a terminal with a
session token (the same `Authorization` header the phone sends):

```bash
curl -X POST https://bikelab.app/api/garmin/pair/confirm \
  -H "Authorization: Bearer $SESSION_TOKEN" -H 'Content-Type: application/json' \
  -d '{"code":"482913"}'
```

Within three seconds the app switches to the home screen. Unpair from the
device via hold → menu → *Unpair*, or from the phone/web via
`DELETE /api/garmin/devices/:id` (`GET /api/garmin/devices` lists them).

## Sideload onto a real Edge

Build a **release** `.prg` with `monkey.jungle` (`-r` flag, or
`Monkey C: Build for Device` in VS Code), connect the Edge over USB and copy
the file into `GARMIN/APPS/` on the device. Eject, and the app appears in the
Connect IQ apps menu. Requests go through the Garmin Connect app on the paired
phone, so the phone must be connected for *Refresh*; the last payload is
cached and shown offline.

## Controls

| Action | Edge |
|---|---|
| Next / previous page | swipe, or Up/Down |
| Open a session (week page) | tap its card; Select opens the next one to ride |
| Refresh | tap / Select on any other page, tap an empty part of the week page |
| Menu (Refresh, Unpair) | hold the screen / Menu |
| Exit | Back |

The week takes as many pages as it has sessions to show. In a session: swipe
up / down pages the block list (a bar on the right and an "N more" arrow show
there is more), the **Let's go!** button or Select starts it, swipe right or Back
returns to the week.

## Starting a session

Let's go! in the session downloads the session as a FIT workout file
(`GET /api/garmin/sessions/:id/fit`), the Edge saves it under Training →
Workouts as "DD.MM headline", and the app hands it to the Edge's own workout
player — targets, step timer and alerts are Garmin's from there. A session
already downloaded in its current version starts without the phone. After each
refresh of the week the app removes its own downloads of sessions that are
gone or have changed; it never touches workouts it did not download.

Checked on an Edge 1040 through Garmin Connect on iOS (2026-11-10): the
session appears under Training → Workouts and the Edge's Ride button starts
it. In the simulator the file is saved somewhere in the simulator's own temp
folder and the hand-over has no workout player to open.

If it ends in "Could not start": a session without blocks has no file
(409) and shows no button; otherwise look at the response of
`GET /api/garmin/sessions/:id/fit` — the file goes out as
`Content-Type: application/octet-stream` (`server/routes/garmin.js`).

## Wire format

`GET /api/garmin/home` (device token) — see `GarminHomeResponseSchema` in
the contract. Keys are one letter on purpose (device RAM); `Store.mc` drops
`null`s before caching, so a missing key and a `null` read the same.

`GET /api/garmin/week?from=YYYY-MM-DD` and `GET /api/garmin/sessions/:id`
(device token) — `GarminWeekResponseSchema`, `GarminSessionResponseSchema`.
Blocks are positional arrays with no nulls in them (`Workouts.mc` lists the
positions).

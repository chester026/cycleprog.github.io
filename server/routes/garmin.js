// Garmin Connect IQ bridge routes (docs/plans/garmin-connect-iq.md):
// `/api/garmin/pair/*`, `/api/garmin/home`, `/api/garmin/devices*`, and the
// week's sessions for the bike computer — `/api/garmin/week`,
// `/api/garmin/sessions/:id` and its workout file
// (docs/plans/garmin-edge-workouts.md). Flow and payload shaping in
// services/garmin.js and services/garminWorkouts.js; the device-token gate
// in middleware/garmin.js. HTTP only here.
//
// Plus `/api/garmin/connect/*` — Garmin Connect as a ride source
// (docs/plans/garmin-connect-api.md, services/garminConnect/). Same URL
// prefix, unrelated feature: that one brings the rider's rides IN.
const express = require('express');
const router = express.Router();
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const { authMiddleware } = require('../middleware/auth');
const { allowDeviceToken, garminDeviceGuard } = require('../middleware/garmin');
const { garminPairLimiter } = require('../middleware/rateLimits');
const { contract: c } = require('@bikelab/shared/api');
const { contract, uncontracted } = require('../middleware/contract');
const garminService = require('../services/garmin');
const garminWorkouts = require('../services/garminWorkouts');
const garminConnection = require('../services/garminConnect/connection');
const garminRefresh = require('../services/garminConnect/refresh');
patchAsyncRoutes(router);

// --- Device side, before it has a token ------------------------------------
// garminPairLimiter (20 / 15 min per IP) on start: a code is a 1-in-a-million
// guess, but there is no reason to let anyone mint thousands of them.
router.post('/pair/start', garminPairLimiter, contract(c.garmin.pairStart), async (req, res) => {
  res.json(await garminService.startPairing(req.body));
});

router.post('/pair/poll', contract(c.garmin.pairPoll), async (req, res) => {
  res.json(await garminService.pollPairing(req.body.poll_key));
});

// --- Phone / web side, session token ---------------------------------------
router.post('/pair/confirm', authMiddleware, contract(c.garmin.pairConfirm), async (req, res) => {
  res.json(await garminService.confirmPairing(req.user.userId, req.body.code));
});

router.get('/devices', authMiddleware, contract(c.garmin.devices), async (req, res) => {
  res.json(await garminService.listDevices(req.user.userId));
});

router.delete('/devices/:id', authMiddleware, contract(c.garmin.removeDevice), async (req, res) => {
  res.json(await garminService.removeDevice(req.user.userId, req.params.id));
});

// --- Garmin Connect as a ride source, session token -------------------------
router.get('/connect/status', authMiddleware, contract(c.garmin.connectStatus), async (req, res) => {
  res.json(await garminConnection.getStatus(req.user.userId));
});

// The rider's own "fetch my latest Garmin health data now" — see
// services/garminConnect/refresh.js for who it works for and why.
router.post('/connect/sync', authMiddleware, contract(c.garmin.connectSync), async (req, res) => {
  res.json(await garminRefresh.refreshHealth(req.user.userId));
});

// --- Device side, device token ---------------------------------------------
router.get('/home', allowDeviceToken, authMiddleware, garminDeviceGuard, contract(c.garmin.home), async (req, res) => {
  res.json(await garminService.buildHome(req.user.userId));
});

router.get('/week', allowDeviceToken, authMiddleware, garminDeviceGuard, contract(c.garmin.week), async (req, res) => {
  res.json(await garminWorkouts.buildWeek(req.user.userId, req.query.from));
});

router.get('/sessions/:id', allowDeviceToken, authMiddleware, garminDeviceGuard, contract(c.garmin.session), async (req, res) => {
  res.json(await garminWorkouts.buildSession(req.user.userId, req.params.id));
});

// The session as a FIT workout file, downloaded by the Edge app
// (Communications.makeWebRequest with a FIT response type) and handed to
// the device's workout player.
router.get(
  '/sessions/:id/fit',
  allowDeviceToken,
  authMiddleware,
  garminDeviceGuard,
  uncontracted('binary FIT workout file, not a JSON response'),
  async (req, res) => {
    const { buffer, filename } = await garminWorkouts.buildSessionFit(req.user.userId, req.params.id);
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.set('Cache-Control', 'no-store');
    res.send(buffer);
  }
);

router.delete('/pair', allowDeviceToken, authMiddleware, garminDeviceGuard, contract(c.garmin.unpair), async (req, res) => {
  res.json(await garminService.unpairDevice(req.user.jti));
});

module.exports = router;

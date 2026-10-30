// Garmin Connect IQ bridge routes (docs/plans/garmin-connect-iq.md):
// `/api/garmin/pair/*`, `/api/garmin/home`, `/api/garmin/devices*`.
// Flow and payload shaping in services/garmin.js; the device-token gate in
// middleware/garmin.js. HTTP only here.
const express = require('express');
const router = express.Router();
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const { authMiddleware } = require('../middleware/auth');
const { allowDeviceToken, garminDeviceGuard } = require('../middleware/garmin');
const { garminPairLimiter } = require('../middleware/rateLimits');
const { contract: c } = require('@bikelab/shared/api');
const { contract } = require('../middleware/contract');
const garminService = require('../services/garmin');
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

// --- Device side, device token ---------------------------------------------
router.get('/home', allowDeviceToken, authMiddleware, garminDeviceGuard, contract(c.garmin.home), async (req, res) => {
  res.json(await garminService.buildHome(req.user.userId));
});

router.delete('/pair', allowDeviceToken, authMiddleware, garminDeviceGuard, contract(c.garmin.unpair), async (req, res) => {
  res.json(await garminService.unpairDevice(req.user.jti));
});

module.exports = router;

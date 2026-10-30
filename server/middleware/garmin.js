// Device-token gate for /api/garmin/home and DELETE /api/garmin/pair
// (docs/plans/garmin-connect-iq.md §2.1). Mounted BEFORE authMiddleware:
//
//   router.get('/home', requireGarminDevice, authMiddleware, handler)
//
// 1. `allowDeviceToken` tells authMiddleware not to reject `aud: 'garmin'`
//    on this route (it rejects it everywhere else).
// 2. `garminDeviceGuard` runs after authMiddleware has verified signature,
//    expiry and users.token_version, and adds the per-device check: the
//    token's `jti` must still be a live (consumed, not revoked) row in
//    garmin_devices. A session token on these routes is a 401 too — the
//    phone talks to /api/garmin/devices, not /home.
const { DEVICE_AUDIENCE } = require('../lib/jwt');
const garminRepo = require('../repositories/garmin');

function allowDeviceToken(req, res, next) {
  req.allowDeviceToken = true;
  next();
}

async function garminDeviceGuard(req, res, next) {
  const payload = req.user;
  if (!payload || payload.aud !== DEVICE_AUDIENCE || !payload.jti) {
    return res.status(401).json({ error: 'Device token required', code: 'UNAUTHORIZED' });
  }
  const device = await garminRepo.touchDeviceByTokenId(payload.jti);
  if (!device || Number(device.user_id) !== Number(payload.userId)) {
    return res.status(401).json({ error: 'Invalid token', code: 'UNAUTHORIZED' });
  }
  req.garminDevice = device;
  next();
}

module.exports = { allowDeviceToken, garminDeviceGuard };

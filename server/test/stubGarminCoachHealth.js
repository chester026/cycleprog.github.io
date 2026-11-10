// Required at the top of every unit test that builds the coach's system
// prompt or runs its readiness / feasibility tools. Those paths ask
// services/garminConnect/coachHealth.js whether the rider has Garmin data —
// a real database read, and in a unit run the database in server/.env is the
// production one. This replaces the two readers with stubs that say "no
// Garmin" unless a test sets them otherwise (require-cache convention, see
// test/hrZones.service.test.js).
const garminCoachHealth = require('../services/garminConnect/coachHealth');

const getCoachHealthMock = vi.fn(async () => null);
const getCoachAccessMock = vi.fn(async () => ({ connected: false, canRefresh: false }));
garminCoachHealth.getCoachHealth = getCoachHealthMock;
garminCoachHealth.getCoachAccess = getCoachAccessMock;

/** Back to "no Garmin" — call in beforeEach when a test file changes the stubs. */
function resetGarminCoachHealth() {
  getCoachHealthMock.mockReset();
  getCoachHealthMock.mockImplementation(async () => null);
  getCoachAccessMock.mockReset();
  getCoachAccessMock.mockImplementation(async () => ({ connected: false, canRefresh: false }));
}

module.exports = { getCoachHealthMock, getCoachAccessMock, resetGarminCoachHealth };

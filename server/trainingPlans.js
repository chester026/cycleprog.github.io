// Server-facing wrapper over the shared training-plan generator (T-3.6,
// docs/audit/00-AUDIT-AND-PLAN.md T-3.6, docs/audit/layers/04-cross-
// layer.md §4.7). The actual pure logic now lives in
// `packages/shared/src/calc/trainingPlans.ts` (single implementation,
// resolving the `weeklyRidesModifier` discrepancy with react-spa's now-
// deleted copy in favor of this module's original formula — see that
// file's header). Re-exported under the same name/shape so `server.js`'s
// `require('./trainingPlans')` call site (used by `/api/analytics/summary`)
// keeps working unchanged.
const {
  getTrainingPlan,
  getPlanFromProfile,
  TRAINING_PLANS,
  TIME_MODIFIERS,
} = require('@bikelab/shared/calc');

module.exports = {
  getTrainingPlan,
  getPlanFromProfile,
  TRAINING_PLANS,
  TIME_MODIFIERS,
};

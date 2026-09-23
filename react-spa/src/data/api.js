// T-7.1: single entry point for hooks/pages/components to reach the API
// contract — re-exports `call` (src/utils/api.js's typed wrapper around
// `callEndpoint`) plus every per-domain endpoint map from
// `@bikelab/shared/api`, so a call site only needs one import:
//   import { call, goals } from '../api'; // or '../data/api' from a page
//   call(goals.list)
//   call(goals.update, { params: { id }, body })
// `isApiError` stays in `src/utils/api.js`.
export { call } from '../utils/api';
export {
  auth,
  account,
  userProfile,
  admin,
  oura,
  media,
  activities,
  analytics,
  skills,
  achievements,
  rides,
  calendar,
  events,
  weather,
  goals,
  metaGoals,
  training,
  bikes,
  checklist,
  coach,
} from '@bikelab/shared/api';

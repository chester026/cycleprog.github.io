// Typed API contract entry point (T-7.1, client half). Every hook/screen
// that needs the network goes through `api.call(def, input)` instead of
// building a string path by hand — `def` comes from one of the re-exported
// domain maps below, which keep the request/response zod types
// (`@bikelab/shared/api`'s `callEndpoint`). The two call sites the contract
// deliberately excludes — the coach SSE stream (`utils/coachSSE.ts`) and any
// future Strava image proxy fetch — talk to `apiClient`/`fetch` directly
// instead; `utils/api.ts`'s old untyped `apiFetch` wrapper has been removed
// now that nothing calls it.
import {
  callEndpoint,
  type CallOptions,
  type EndpointDef,
  type EndpointInput,
  type EndpointResponse,
} from '@bikelab/shared/api';
import {apiClient} from '../utils/api';

export const api = {
  call: <D extends EndpointDef<any, any, any, any>>(
    def: D,
    input?: EndpointInput<D>,
    opts?: CallOptions<EndpointResponse<D>>,
  ) => callEndpoint(apiClient, def, input, opts),
};

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
export type {EndpointResponse, EndpointInput} from '@bikelab/shared/api';

/**
 * The API contract registry (T-7.1). Each domain file exports a `{ name:
 * defineEndpoint(...) }` map. Clients import the DOMAIN objects (`import {
 * goals } from '@bikelab/shared/api'` → `callEndpoint(client, goals.list)`)
 * because those keep the literal zod types; `contract` below is the loosely
 * typed union the server's inventory test and `npm run routes` read (an
 * inferred type for the whole union blows past tsc's declaration-emit
 * limit, TS7056). Add a domain: create `contract/<domain>.ts`, add its
 * `export *`, import and one line in `contract`.
 */
export * from './define.js';
export * from './auth.js';
export * from './account.js';
export * from './userProfile.js';
export * from './admin.js';
export * from './oura.js';
export * from './media.js';
export * from './activities.js';
export * from './analytics.js';
export * from './skills.js';
export * from './achievements.js';
export * from './rides.js';
export * from './calendar.js';
export * from './events.js';
export * from './weather.js';
export * from './goals.js';
export * from './metaGoals.js';
export * from './training.js';
export * from './bikes.js';
export * from './checklist.js';
export * from './coach.js';

import type { EndpointDef } from './define.js';
import { auth } from './auth.js';
import { account } from './account.js';
import { userProfile } from './userProfile.js';
import { admin } from './admin.js';
import { oura } from './oura.js';
import { media } from './media.js';
import { activities } from './activities.js';
import { analytics } from './analytics.js';
import { skills } from './skills.js';
import { achievements } from './achievements.js';
import { rides } from './rides.js';
import { calendar } from './calendar.js';
import { events } from './events.js';
import { weather } from './weather.js';
import { goals } from './goals.js';
import { metaGoals } from './metaGoals.js';
import { training } from './training.js';
import { bikes } from './bikes.js';
import { checklist } from './checklist.js';
import { coach } from './coach.js';

export const contract: Record<string, Record<string, EndpointDef<any, any, any, any>>> = {
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
};

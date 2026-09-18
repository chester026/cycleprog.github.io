/**
 * Starter set of typed endpoint helpers built on `createApiClient` (T-2.3).
 * Intentionally small — the point is to prove the `client.get/post(...,
 * {schema})` pattern for future endpoints, not to enumerate every route.
 * Extend this file as routes are migrated off the raw `apiFetch` calls.
 */
import {
  UserProfileSchema,
  type UserProfile,
  StravaActivitySchema,
  type StravaActivity,
  BikeSchema,
  type Bike,
  GoalSchema,
  type Goal,
  MetaGoalSchema,
  type MetaGoal,
  LoginBodySchema,
  LoginResponseSchema,
  type LoginBody,
  type LoginResponse,
  ExchangeResponseSchema,
  type ExchangeResponse,
} from '../types/index.js';
import { z } from 'zod';
import type { ApiClient } from './client.js';

export function getUserProfile(client: ApiClient): Promise<UserProfile> {
  return client.get('/api/user-profile', { schema: UserProfileSchema });
}

export function getActivities(client: ApiClient): Promise<StravaActivity[]> {
  return client.get('/api/activities', { schema: z.array(StravaActivitySchema) });
}

export function getBikes(client: ApiClient): Promise<Bike[]> {
  return client.get('/api/bikes', { schema: z.array(BikeSchema) });
}

export function getGoals(client: ApiClient): Promise<Goal[]> {
  return client.get('/api/goals', { schema: z.array(GoalSchema) });
}

export function getMetaGoals(client: ApiClient): Promise<MetaGoal[]> {
  return client.get('/api/meta-goals', { schema: z.array(MetaGoalSchema) });
}

export function login(client: ApiClient, body: LoginBody): Promise<LoginResponse> {
  LoginBodySchema.parse(body);
  return client.post('/api/login', body, { schema: LoginResponseSchema });
}

export function exchangeCode(client: ApiClient, code: string): Promise<ExchangeResponse> {
  return client.post('/api/auth/exchange', { code }, { schema: ExchangeResponseSchema });
}

const StravaStartResponseSchema = z.object({ url: z.string() });
export type StravaStartResponse = z.infer<typeof StravaStartResponseSchema>;

export function stravaStart(
  client: ApiClient,
  clientKind: 'web' | 'mobile',
): Promise<StravaStartResponse> {
  return client.get(`/api/auth/strava/start?client=${clientKind}`, {
    schema: StravaStartResponseSchema,
  });
}

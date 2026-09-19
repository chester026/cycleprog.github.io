/**
 * Weather domain contract (T-7.1) — `server/routes/weather.js`
 * (`/api/weather/*`), an Open-Meteo proxy (`services/weather.js`). Both
 * routes return Open-Meteo's own JSON verbatim (cached) — an external,
 * third-party response shape, kept as a loose record rather than modeling
 * every field Open-Meteo might add.
 */
import { z } from 'zod';
import { defineEndpoint } from './define.js';

const OpenMeteoResponseSchema = z.record(z.string(), z.unknown());

const WindQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
});

const ForecastQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

export const weather = {
  wind: defineEndpoint({
    method: 'GET',
    path: '/api/weather/wind',
    query: WindQuerySchema,
    response: OpenMeteoResponseSchema,
    auth: true,
    summary: 'Open-Meteo hourly wind data for a lat/lng + date range (cached 30min).',
  }),
  forecast: defineEndpoint({
    method: 'GET',
    path: '/api/weather/forecast',
    query: ForecastQuerySchema,
    response: OpenMeteoResponseSchema,
    auth: true,
    summary: 'Open-Meteo daily forecast for a lat/lng (cached).',
  }),
};

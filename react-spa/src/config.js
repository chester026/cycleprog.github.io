export const API_URL = import.meta.env.VITE_API_URL || '';
export const STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID || '165560';
export const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE || (import.meta.env.PROD ? 'https://bikelab.app' : 'http://localhost:8080');

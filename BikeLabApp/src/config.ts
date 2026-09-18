import Config from 'react-native-config';

export const API_BASE_URL: string =
  Config.API_BASE_URL || (__DEV__ ? 'http://localhost:8080' : 'https://bikelab.app');
export const STRAVA_CLIENT_ID: string = Config.STRAVA_CLIENT_ID || '165560';
export const WEB_BASE_URL: string = Config.WEB_BASE_URL || 'https://bikelab.app';

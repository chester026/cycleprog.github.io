import AsyncStorage from '@react-native-async-storage/async-storage';

// Production build - always use production server
//export const API_BASE_URL = 'https://bikelab.app';

// Dev build (comment out for production)
export const API_BASE_URL = __DEV__ ? 'http://192.168.10.147:8080' : 'https://bikelab.app';

let _onSessionExpired: (() => void) | null = null;
let _sessionExpiredFiring = false;

export function setSessionExpiredHandler(handler: () => void) {
  _onSessionExpired = handler;
}

export async function apiFetch(
  url: string,
  options: RequestInit = {},
): Promise<any> {
  let token = await AsyncStorage.getItem('token');
  if (!token) {
    token = await AsyncStorage.getItem('sessionToken');
  }

  const headers: Record<string, string> = options.headers
    ? {...(options.headers as Record<string, string>)}
    : {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

  let response;
  try {
    response = await fetch(fullUrl, {...options, headers});
  } catch (fetchError) {
    console.error('❌ Network error:', fetchError);
    throw fetchError;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    if (response.status === 401) {
      console.warn('🔒 Token expired or invalid. Logging out...');

      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('sessionToken');

      // Prevent multiple simultaneous session-expired triggers
      if (!_sessionExpiredFiring && _onSessionExpired) {
        _sessionExpiredFiring = true;
        try {
          _onSessionExpired();
        } finally {
          setTimeout(() => { _sessionExpiredFiring = false; }, 3000);
        }
      }

      throw new Error('Session expired. Please log in again.');
    }

    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data;
}

// Вспомогательные функции для работы с токенами
export const TokenStorage = {
  async setToken(token: string, remember: boolean = true): Promise<void> {
    const key = remember ? 'token' : 'sessionToken';
    await AsyncStorage.setItem(key, token);
  },

  async getToken(): Promise<string | null> {
    let token = await AsyncStorage.getItem('token');
    if (!token) {
      token = await AsyncStorage.getItem('sessionToken');
    }
    return token;
  },

  async removeToken(): Promise<void> {
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('sessionToken');
  },
};


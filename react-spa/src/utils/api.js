// True for an Error thrown by apiFetch below (either a real ApiError-shaped
// server response, or the synthetic 401 "session expired" one) — i.e.
// something with a numeric `status` and, usually, a `code`. Lets callers
// branch on `err.status` / `err.code` instead of guessing from `err.message`
// text (see T-1.5, docs/audit/layers/04-cross-layer.md §5.6).
export function isApiError(e) {
  return e instanceof Error && typeof e.status === 'number';
}

export async function apiFetch(url, options = {}) {
  let token = localStorage.getItem('token');
  if (!token) {
    token = sessionStorage.getItem('token');
  }
  const headers = options.headers ? { ...options.headers } : {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(url, { ...options, headers });

  // Если ответ не успешный, выбрасываем ошибку
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    
    // 401 Unauthorized: токен истек или невалиден → logout
    if (response.status === 401) {
      console.warn('🔒 Token expired or invalid. Logging out...');

      // Очищаем токены
      localStorage.removeItem('token');
      sessionStorage.removeItem('token');

      // Редирект на страницу логина
      window.location.href = '/login?session_expired=true';

      // Выбрасываем ошибку для прерывания запроса
      throw Object.assign(new Error('Session expired. Please log in again.'), {
        status: 401,
        code: errorData.code || null,
      });
    }

    // Если указан флаг silent404, не логируем 404 ошибки
    const isSilent404 = options.silent404 && response.status === 404;
    if (!isSilent404) {
    console.error('❌ API Error:', errorData);
    }

    // Both old (`{ error: 'text' }`) and new (`{ error: 'text', code, details? }`)
    // server response shapes are handled here: `error` is always read as the
    // human message, `code` is simply absent on an old-shaped body.
    const message = typeof errorData.error === 'string'
      ? errorData.error
      : (errorData.message || `HTTP ${response.status}`);
    throw Object.assign(new Error(message), {
      status: response.status,
      code: errorData.code || null,
      details: errorData.details,
    });
  }

  // Парсим JSON ответ
  const data = await response.json();
  return data;
} 
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
      throw new Error('Session expired. Please log in again.');
    }
    
    // Если указан флаг silent404, не логируем 404 ошибки
    const isSilent404 = options.silent404 && response.status === 404;
    if (!isSilent404) {
    console.error('❌ API Error:', errorData);
    }
    
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  // Парсим JSON ответ
  const data = await response.json();
  return data;
} 
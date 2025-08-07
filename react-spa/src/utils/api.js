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
    console.error('❌ API Error:', errorData);
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  // Парсим JSON ответ
  const data = await response.json();
  return data;
} 
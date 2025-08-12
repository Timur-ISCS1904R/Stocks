import { supabase } from '../supabaseClient';

/**
 * Вызов защищённого backend API.
 * Добавляет Authorization: Bearer <access_token> текущего пользователя Supabase.
 */
export async function adminFetch(path, options = {}) {
  // достаём access_token текущей сессии
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Не авторизован. Войдите в систему.');
  }

  const API = process.env.REACT_APP_ADMIN_API || 'http://localhost:4000';

  const res = await fetch(`${API}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      Authorization: `Bearer ${session.access_token}`,
    },
    body: options.body,
  });

  // удобная обработка ошибок
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try { msg = JSON.parse(text).error || text; } catch (_) {}
    throw new Error(`API ${res.status}: ${msg}`);
  }

  // авто-разбор JSON
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

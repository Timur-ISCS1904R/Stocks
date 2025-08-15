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

// «Умное удаление»: hard, если у пользователя нет данных; soft, если есть зависимости
export async function deleteUserSmart(userId) {
  const res = await adminFetch('/api/admin/users/delete', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
  // ожидаем { ok:true, mode:'hard_delete' | 'soft_delete', counts: {...} }
  return res;
}

// Явное отключение (soft-delete) без попытки hard-delete
export async function softDeleteUser(userId) {
  const res = await adminFetch('/api/admin/users/soft-delete', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
  
  // ожидаем { ok:true, mode:'soft_delete' }
  return res;
}

// Установить активность пользователя
export async function setUserActive(userId, isActive) {
  return adminFetch('/api/admin/users/set-active', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, is_active: isActive }),
  });
}

// Создать пользователя с full_name (если хочешь вызывать из кода)
export async function createUserAdmin({ email, password, is_admin, full_name }) {
  return adminFetch('/api/admin/users/create', {
    method: 'POST',
    body: JSON.stringify({ email, password, is_admin, full_name }),
  });
}

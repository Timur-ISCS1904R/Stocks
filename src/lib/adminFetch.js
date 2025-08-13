// src/lib/adminFetch.js
import { supabase } from '../supabaseClient';
import { ErrorHandler } from './errorHandler';

/**
 * Улучшенный вызов защищённого backend API с retry логикой и детальным логированием
 */
export async function adminFetch(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    retries = 3,
    retryDelay = 1000,
    timeout = 10000,
    context = {}
  } = options;

  let lastError;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Логирование начала запроса
      console.log(`📡 API Request [${attempt}/${retries}]:`, {
        path,
        method,
        timestamp: new Date().toISOString(),
        context
      });

      // Получение токена
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Не авторизован. Войдите в систему.');
      }

      const API = process.env.REACT_APP_ADMIN_API || 'http://localhost:4000';
      const url = `${API}${path}`;

      // Создание контроллера для timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const requestOptions = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
        signal: controller.signal
      };

      const startTime = performance.now();
      const response = await fetch(url, requestOptions);
      const duration = performance.now() - startTime;
      
      clearTimeout(timeoutId);

      // Логирование ответа
      console.log(`📡 API Response:`, {
        path,
        status: response.status,
        duration: Math.round(duration),
        attempt,
        timestamp: new Date().toISOString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage;
        
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorText;
        } catch {
          errorMessage = errorText || `HTTP ${response.status}`;
        }

        const error = new Error(`API ${response.status}: ${errorMessage}`);
        error.status = response.status;
        error.path = path;
        error.method = method;
        
        // Не повторяем для клиентских ошибок (400-499)
        if (response.status >= 400 && response.status < 500) {
          throw ErrorHandler.handleApiError(error, { 
            path, 
            method, 
            attempt,
            ...context 
          });
        }
        
        throw error;
      }

      // Успешный ответ
      const contentType = response.headers.get('content-type') || '';
      const result = contentType.includes('application/json') 
        ? await response.json() 
        : await response.text();

      // Логирование успешного результата (только размер данных)
      console.log(`✅ API Success:`, {
        path,
        dataSize: typeof result === 'string' ? result.length : Object.keys(result).length,
        duration: Math.round(duration)
      });

      return result;

    } catch (error) {
      lastError = error;
      
      // Логирование ошибки
      console.error(`❌ API Error [${attempt}/${retries}]:`, {
        path,
        method,
        error: error.message,
        attempt,
        willRetry: attempt < retries && isRetryableError(error)
      });

      // Не повторяем для определенных типов ошибок
      if (!isRetryableError(error) || attempt === retries) {
        throw ErrorHandler.handleApiError(error, {
          path,
          method,
          attempt,
          totalAttempts: retries,
          ...context
        });
      }

      // Экспоненциальная задержка перед повтором
      const delay = retryDelay * Math.pow(2, attempt - 1);
      console.log(`⏳ Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Определяет, стоит ли повторять запрос при данной ошибке
 */
function isRetryableError(error) {
  // Не повторяем клиентские ошибки
  if (error.status >= 400 && error.status < 500) {
    return false;
  }

  // Повторяем сетевые ошибки и серверные ошибки
  return (
    error.name === 'AbortError' || // timeout
    error.message?.includes('Network') ||
    error.message?.includes('fetch') ||
    error.status >= 500 ||
    !error.status // нет статуса = сетевая ошибка
  );
}

/**
 * Специальные методы для часто используемых операций
 */
export const adminAPI = {
  // Пользователи
  async getUsers() {
    return adminFetch('/api/users', {
      context: { operation: 'getUsers' }
    });
  },

  async createUser(userData) {
    return adminFetch('/api/admin/users/create', {
      method: 'POST',
      body: userData,
      context: { operation: 'createUser', email: userData.email }
    });
  },

  async deleteUser(userId) {
    return adminFetch('/api/admin/users/delete', {
      method: 'POST',
      body: { user_id: userId },
      context: { operation: 'deleteUser', userId }
    });
  },

  // Права доступа
  async getPermissions() {
    return adminFetch('/api/permissions', {
      context: { operation: 'getPermissions' }
    });
  },

  async updatePermissions(permissions) {
    return adminFetch('/api/permissions', {
      method: 'POST',
      body: permissions,
      context: { operation: 'updatePermissions', userId: permissions.user_id }
    });
  },

  // Аудит
  async getAudit(params = {}) {
    const query = new URLSearchParams(params).toString();
    const path = query ? `/api/audit?${query}` : '/api/audit';
    
    return adminFetch(path, {
      context: { operation: 'getAudit', params }
    });
  }
};
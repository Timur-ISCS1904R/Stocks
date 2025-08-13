// src/lib/errorHandler.js
class AppError extends Error {
  constructor(message, type = 'GENERIC_ERROR', statusCode = 500, details = {}) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

class ErrorHandler {
  static logError(error, context = {}) {
    const errorInfo = {
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      type: error.type || 'UNKNOWN',
      context: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        userId: context.userId,
        component: context.component,
        action: context.action,
        ...context
      }
    };

    // Логирование в консоль с цветовой маркировкой
    console.group(`🚨 Error: ${error.type || 'UNKNOWN'}`);
    console.error('Message:', error.message);
    console.error('Context:', errorInfo.context);
    if (error.stack) console.error('Stack:', error.stack);
    console.groupEnd();

    // В production можно отправлять на внешний сервис логирования
    if (process.env.NODE_ENV === 'production') {
      this.sendToLoggingService(errorInfo);
    }

    return errorInfo;
  }

  static async sendToLoggingService(errorInfo) {
    try {
      // Пример отправки в внешний сервис (Sentry, LogRocket, etc.)
      // await fetch('/api/log-error', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(errorInfo)
      // });
    } catch (loggingError) {
      console.error('Failed to send error to logging service:', loggingError);
    }
  }

  static handleApiError(error, context = {}) {
    let userMessage = 'Произошла ошибка. Попробуйте еще раз.';
    let errorType = 'API_ERROR';

    if (error.message?.includes('401')) {
      userMessage = 'Сессия истекла. Войдите в систему заново.';
      errorType = 'UNAUTHORIZED';
    } else if (error.message?.includes('403')) {
      userMessage = 'Недостаточно прав для выполнения операции.';
      errorType = 'FORBIDDEN';
    } else if (error.message?.includes('404')) {
      userMessage = 'Запрашиваемые данные не найдены.';
      errorType = 'NOT_FOUND';
    } else if (error.message?.includes('Network')) {
      userMessage = 'Проблемы с сетью. Проверьте подключение к интернету.';
      errorType = 'NETWORK_ERROR';
    }

    const appError = new AppError(userMessage, errorType, 0, {
      originalError: error.message,
      ...context
    });

    this.logError(appError, context);
    return appError;
  }

  static handleValidationError(field, message, value) {
    const error = new AppError(
      `Ошибка валидации поля "${field}": ${message}`,
      'VALIDATION_ERROR',
      400,
      { field, value }
    );
    
    this.logError(error, { component: 'validation', field });
    return error;
  }

  static handleDatabaseError(error, operation, table) {
    let userMessage = 'Ошибка базы данных. Попробуйте позже.';
    let errorType = 'DATABASE_ERROR';

    if (error.message?.includes('duplicate key')) {
      userMessage = 'Такая запись уже существует.';
      errorType = 'DUPLICATE_ERROR';
    } else if (error.message?.includes('foreign key')) {
      userMessage = 'Нарушение связности данных.';
      errorType = 'FOREIGN_KEY_ERROR';
    } else if (error.message?.includes('check constraint')) {
      userMessage = 'Введенные данные не соответствуют требованиям.';
      errorType = 'CONSTRAINT_ERROR';
    }

    const appError = new AppError(userMessage, errorType, 0, {
      originalError: error.message,
      operation,
      table
    });

    this.logError(appError, { operation, table });
    return appError;
  }
}

// React Hook для обработки ошибок
export function useErrorHandler() {
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  const handleError = React.useCallback((error, context = {}) => {
    const processedError = ErrorHandler.handleApiError(error, context);
    setError(processedError);
    return processedError;
  }, []);

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  const withErrorHandling = React.useCallback(async (asyncFunction, context = {}) => {
    try {
      setLoading(true);
      setError(null);
      const result = await asyncFunction();
      return result;
    } catch (error) {
      handleError(error, context);
      throw error; // Re-throw для компонентов, которые хотят дополнительную обработку
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  return {
    error,
    loading,
    handleError,
    clearError,
    withErrorHandling
  };
}

export { AppError, ErrorHandler };
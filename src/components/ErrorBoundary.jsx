// src/components/ErrorBoundary.jsx
import React from 'react';
import { Box, Button, Typography, Paper, Alert } from '@mui/material';
import { ErrorHandler } from '../lib/errorHandler';
import RefreshIcon from '@mui/icons-material/Refresh';
import BugReportIcon from '@mui/icons-material/BugReport';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorId: null
    };
  }

  static getDerivedStateFromError(error) {
    // Обновляем состояние, чтобы при следующем рендере показать запасной UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Логируем ошибку через наш централизованный обработчик
    const errorId = Math.random().toString(36).substr(2, 9);
    
    const context = {
      component: this.props.name || 'Unknown',
      userId: this.props.userId,
      errorBoundary: true,
      errorId,
      componentStack: errorInfo.componentStack,
      props: this.props.logProps ? JSON.stringify(this.props.children?.props || {}) : undefined
    };

    ErrorHandler.logError(error, context);

    this.setState({
      error,
      errorInfo,
      errorId
    });

    // В production можно отправить ошибку в внешний сервис
    if (process.env.NODE_ENV === 'production' && this.props.onError) {
      this.props.onError(error, errorInfo, context);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorId: null 
    });
  };

  render() {
    if (this.state.hasError) {
      // Запасной UI для ошибок
      return (
        <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
          <Paper sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <BugReportIcon sx={{ fontSize: 40, color: 'error.main', mr: 2 }} />
              <Box>
                <Typography variant="h5" color="error" gutterBottom>
                  Что-то пошло не так
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ID ошибки: {this.state.errorId}
                </Typography>
              </Box>
            </Box>

            <Alert severity="error" sx={{ mb: 3 }}>
              <Typography variant="body2">
                Произошла неожиданная ошибка в компоненте "{this.props.name || 'Unknown'}". 
                Мы автоматически сохранили информацию об ошибке для исправления.
              </Typography>
            </Alert>

            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
              <Button 
                variant="contained" 
                onClick={this.handleReset}
                startIcon={<RefreshIcon />}
              >
                Попробовать снова
              </Button>
              
              <Button 
                variant="outlined" 
                onClick={this.handleReload}
              >
                Перезагрузить страницу
              </Button>

              {this.props.fallbackComponent && (
                <Button 
                  variant="text" 
                  onClick={() => this.setState({ showFallback: true })}
                >
                  Показать упрощенную версию
                </Button>
              )}
            </Box>

            {/* Детали ошибки в development режиме */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Детали ошибки (только в development):
                </Typography>
                
                <Paper sx={{ p: 2, bgcolor: 'grey.100', mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Сообщение:
                  </Typography>
                  <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace' }}>
                    {this.state.error.message}
                  </Typography>
                </Paper>

                <Paper sx={{ p: 2, bgcolor: 'grey.100', mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Stack trace:
                  </Typography>
                  <Typography 
                    variant="body2" 
                    component="pre" 
                    sx={{ 
                      fontFamily: 'monospace', 
                      fontSize: '0.75rem',
                      maxHeight: 200,
                      overflow: 'auto'
                    }}
                  >
                    {this.state.error.stack}
                  </Typography>
                </Paper>

                {this.state.errorInfo?.componentStack && (
                  <Paper sx={{ p: 2, bgcolor: 'grey.100' }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Component stack:
                    </Typography>
                    <Typography 
                      variant="body2" 
                      component="pre" 
                      sx={{ 
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        maxHeight: 200,
                        overflow: 'auto'
                      }}
                    >
                      {this.state.errorInfo.componentStack}
                    </Typography>
                  </Paper>
                )}
              </Box>
            )}

            {/* Fallback компонент если задан */}
            {this.state.showFallback && this.props.fallbackComponent && (
              <Box sx={{ mt: 3, p: 2, border: '1px dashed', borderColor: 'warning.main' }}>
                <Typography variant="h6" color="warning.main" gutterBottom>
                  Упрощенная версия:
                </Typography>
                {this.props.fallbackComponent}
              </Box>
            )}
          </Paper>
        </Box>
      );
    }

    return this.props.children;
  }
}

// HOC для оборачивания компонентов в Error Boundary
export function withErrorBoundary(Component, options = {}) {
  const WrappedComponent = React.forwardRef((props, ref) => (
    <ErrorBoundary 
      name={options.name || Component.displayName || Component.name}
      userId={options.userId}
      onError={options.onError}
      fallbackComponent={options.fallbackComponent}
      logProps={options.logProps}
    >
      <Component {...props} ref={ref} />
    </ErrorBoundary>
  ));

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
}

// Хук для уведомления Error Boundary о критических ошибках
export function useErrorBoundary() {
  const [, setState] = React.useState();
  
  return React.useCallback((error) => {
    setState(() => {
      throw error;
    });
  }, []);
}

export default ErrorBoundary;
// src/App.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorHandler, useErrorHandler } from './lib/errorHandler';
import ErrorBoundary, { withErrorBoundary } from './components/ErrorBoundary';

import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import AdminPanel from './admin/AdminPanel';
import Logout from './pages/Logout';
import AccountPasswordPage from './pages/AccountPasswordPage';

import { Box, Paper, TextField, Button, Typography, Alert, CircularProgress } from '@mui/material';

const policy = {
  minLen: 12,
  upper: /[A-Z]/,
  lower: /[a-z]/,
  digit: /\d/,
  special: /[^A-Za-z0-9]/,
};

function validatePassword(pw) {
  const errors = [];
  if (pw.length < policy.minLen) errors.push(`Минимум ${policy.minLen} символов`);
  if (!policy.upper.test(pw)) errors.push('Хотя бы одна ПРОПИСНАЯ буква (A-Z)');
  if (!policy.lower.test(pw)) errors.push('Хотя бы одна строчная буква (a-z)');
  if (!policy.digit.test(pw)) errors.push('Хотя бы одна цифра (0-9)');
  if (!policy.special.test(pw)) errors.push('Хотя бы один спецсимвол');
  return errors;
}

const ChangePasswordPage = withErrorBoundary(function ChangePasswordPage({ onDone }) {
  const { error, loading, handleError, clearError, withErrorHandling } = useErrorHandler();
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [success, setSuccess] = useState('');

  const submit = async () => {
    clearError();
    setSuccess('');

    // Валидация
    if (!oldPw || !newPw || !newPw2) {
      handleError(new Error('Заполните все поля'), { component: '    const validationErrors = validatePassword(newPw);
    if (validationErrors.length) {
      handleError(new Error('Политика паролей: ' + validationErrors.join('; ')), { 
        component: 'ChangePassword', 
        action: 'validation',
        passwordLength: newPw.length 
      });
      return;
    }

    await withErrorHandling(async () => {
      // Получение текущей сессии
      const { data: sdata } = await supabase.auth.getSession();
      const email = sdata?.session?.user?.email;
      const token = sdata?.session?.access_token;
      const uid = sdata?.session?.user?.id;
      
      if (!email || !token || !uid) {
        throw new Error('Нет активной сессии. Войдите в систему заново.');
      }

      console.log('🔐 Changing password for user:', { uid, email });

      // Проверка старого пароля через re-authentication
      const { error: reAuthError } = await supabase.auth.signInWithPassword({ 
        email, 
        password: oldPw 
      });
      
      if (reAuthError) {
        throw new Error('Старый пароль неверный');
      }

      // Смена пароля
      const { error: updateError } = await supabase.auth.updateUser({ password: newPw });
      if (updateError) {
        throw new Error(`Не удалось обновить пароль: ${updateError.message}`);
      }

      // Отметка завершения первого входа через backend API
      try {
        const base = process.env.REACT_APP_ADMIN_API || 'http://localhost:4000';
        const response = await fetch(`${base}/api/self/complete-first-login`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            Authorization: `Bearer ${token}` 
          },
        });

        if (!response.ok) {
          console.warn('Failed to update first_login via API, trying direct DB update');
          // Fallback: прямое обновление БД
          await supabase
            .from('users')
            .update({ 
              must_change_password: false, 
              first_login_at: new Date().toISOString() 
            })
            .eq('user_id', uid);
        }
      } catch (apiError) {
        console.warn('API call failed, using fallback:', apiError.message);
        // Fallback: прямое обновление БД
        await supabase
          .from('users')
          .update({ 
            must_change_password: false, 
            first_login_at: new Date().toISOString() 
          })
          .eq('user_id', uid);
      }

      setSuccess('Пароль успешно изменён');
      console.log('✅ Password changed successfully');
      
      // Очистка формы
      setOldPw('');
      setNewPw('');
      setNewPw2('');
      
      // Уведомление родительского компонента
      if (onDone) {
        setTimeout(() => {
          onDone();
        }, 1500); // Показываем успешное сообщение перед редиректом
      }

    }, { 
      component: 'ChangePassword', 
      action: 'submit',
      hasEmail: !!email,
      hasToken: !!token 
    });
  };

  return (
    <Box sx={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'80vh', p:2 }}>
      <Paper sx={{ p:3, width: 420 }}>
        <Typography variant="h6" mb={2}>Смена пароля</Typography>
        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={clearError}>
            {error.message}
          </Alert>
        )}
        
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}
        
        <TextField 
          label="Старый пароль" 
          type="password" 
          fullWidth 
          sx={{ mb:2 }} 
          value={oldPw} 
          onChange={e => setOldPw(e.target.value)}
          disabled={loading}
        />
        
        <TextField 
          label="Новый пароль" 
          type="password" 
          fullWidth 
          sx={{ mb:2 }} 
          value={newPw} 
          onChange={e => setNewPw(e.target.value)} 
          helperText="≥12 символов, A-Z, a-z, цифра, спецсимвол"
          disabled={loading}
        />
        
        <TextField 
          label="Повтори новый пароль" 
          type="password" 
          fullWidth 
          sx={{ mb:2 }} 
          value={newPw2} 
          onChange={e => setNewPw2(e.target.value)}
          disabled={loading}
        />
        
        <Button 
          variant="contained" 
          onClick={submit} 
          fullWidth
          disabled={loading || !oldPw || !newPw || !newPw2}
          startIcon={loading && <CircularProgress size={20} />}
        >
          {loading ? 'Обновляется...' : 'Обновить пароль'}
        </Button>
      </Paper>
    </Box>
  );
}, { name: 'ChangePasswordPage' });

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [appError, setAppError] = useState(null);

  // Инициализация сессии
  useEffect(() => {
    let unsubscribe = () => {};
    
    const initializeAuth = async () => {
      try {
        console.log('🔐 Initializing authentication...');
        
        // Получение текущей сессии
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('❌ Error getting session:', error);
          ErrorHandler.logError(error, { component: 'App', action: 'getSession' });
          setAppError('Ошибка при получении сессии. Попробуйте перезагрузить страницу.');
        } else {
          setSession(data?.session ?? null);
          console.log('✅ Session initialized:', data?.session ? 'authenticated' : 'not authenticated');
        }

        // Подписка на изменения состояния аутентификации
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
          console.log('🔐 Auth state changed:', event, newSession ? 'authenticated' : 'not authenticated');
          
          setSession(newSession);
          
          // Логирование важных событий аутентификации
          if (event === 'SIGNED_IN') {
            ErrorHandler.logError(new Error('User signed in'), { 
              component: 'App', 
              action: 'auth_change',
              event,
              userId: newSession?.user?.id,
              type: 'INFO'
            });
          } else if (event === 'SIGNED_OUT') {
            setProfile(null); // Сброс профиля при выходе
            ErrorHandler.logError(new Error('User signed out'), { 
              component: 'App', 
              action: 'auth_change',
              event,
              type: 'INFO'
            });
          }
        });

        unsubscribe = () => subscription?.unsubscribe?.();
        
      } catch (error) {
        console.error('❌ Fatal error during auth initialization:', error);
        ErrorHandler.logError(error, { component: 'App', action: 'initializeAuth' });
        setAppError('Критическая ошибка инициализации. Перезагрузите страницу.');
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
    return () => unsubscribe();
  }, []);

  // Загрузка профиля пользователя
  useEffect(() => {
    if (!session?.user?.id) {
      setProfile(null);
      return;
    }

    const loadProfile = async () => {
      try {
        console.log('👤 Loading user profile for:', session.user.id);
        
        const { data, error } = await supabase
          .from('users')
          .select('must_change_password, first_login_at, is_admin')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (error) {
          console.error('❌ Error loading profile:', error);
          ErrorHandler.logError(error, { 
            component: 'App', 
            action: 'loadProfile',
            userId: session.user.id 
          });
          // Не показываем ошибку пользователю, так как профиль не критичен
        } else {
          setProfile(data || {});
          console.log('✅ Profile loaded:', { 
            mustChangePassword: data?.must_change_password,
            isAdmin: data?.is_admin,
            hasFirstLogin: !!data?.first_login_at
          });
        }
      } catch (error) {
        console.error('❌ Unexpected error loading profile:', error);
        ErrorHandler.logError(error, { 
          component: 'App', 
          action: 'loadProfile', 
          userId: session.user.id 
        });
      }
    };

    loadProfile();
  }, [session]);

  const handlePasswordChangeComplete = useCallback(() => {
    console.log('🔐 Password change completed, reloading...');
    window.location.href = '/';
  }, []);

  const clearAppError = useCallback(() => {
    setAppError(null);
  }, []);

  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  // Состояние загрузки
  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh',
        flexDirection: 'column',
        gap: 2
      }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
          Инициализация приложения...
        </Typography>
      </Box>
    );
  }

  // Критическая ошибка приложения
  if (appError) {
    return (
      <Box sx={{ p: 3, maxWidth: 600, mx: 'auto', mt: 8 }}>
        <Alert 
          severity="error" 
          action={
            <Button color="inherit" size="small" onClick={handleReload}>
              Перезагрузить
            </Button>
          }
        >
          <Typography variant="h6" gutterBottom>
            Ошибка инициализации
          </Typography>
          <Typography variant="body2">
            {appError}
          </Typography>
        </Alert>
      </Box>
    );
  }

  // Не авторизован - показываем страницу входа
  if (!session) {
    return (
      <ErrorBoundary name="LoginPage">
        <LoginPage onLogin={setSession} />
      </ErrorBoundary>
    );
  }

  // Принудительная смена пароля
  if (profile?.must_change_password) {
    return (
      <BrowserRouter>
        <Routes>
          <Route
            path="/account/password"
            element={
              <ChangePasswordPage onDone={handlePasswordChangeComplete} />
            }
          />
          <Route path="*" element={<Navigate to="/account/password" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // Основное приложение
  return (
    <ErrorBoundary 
      name="MainApp" 
      userId={session.user.id}
      onError={(error, errorInfo, context) => {
        // В production отправляем критические ошибки в внешний сервис
        if (process.env.NODE_ENV === 'production') {
          console.error('Critical app error:', { error, errorInfo, context });
        }
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route 
            path="/" 
            element={
              <ErrorBoundary name="Dashboard">
                <Dashboard session={session} profile={profile} />
              </ErrorBoundary>
            } 
          />
          <Route 
            path="/admin" 
            element={
              <ErrorBoundary name="AdminPanel">
                <AdminPanel />
              </ErrorBoundary>
            } 
          />
          <Route 
            path="/account/password" 
            element={
              <ErrorBoundary name="AccountPasswordPage">
                <AccountPasswordPage />
              </ErrorBoundary>
            } 
          />
          <Route path="/logout" element={<Logout />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
    
    if (newPw !== newPw2) {
      handleError(new Error('Новый пароль и подтверждение не совпадают'), { component: 'ChangePassword', action: 'validation' });
      return;
    }
    
    const validationErrors = validatePassword(newPw);
    if (validationErrors.length) {
      handleError(new Error('Политика паролей: ' + validationErrors.join('; ')), { component: '
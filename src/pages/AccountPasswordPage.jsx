// src/pages/AccountPasswordPage.jsx
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import {
  Box, Paper, Typography, TextField, Button, Alert, Stack
} from '@mui/material';
// Базовый адрес backend’а (как в других местах проекта)
const ADMIN_API = process.env.REACT_APP_ADMIN_API
export default function AccountPasswordPage() {
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwd2, setNewPwd2] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  function validate(pwd) {
    if (pwd.length < 12) return 'Пароль должен быть не короче 12 символов';
    if (!/[A-ZА-Я]/.test(pwd)) return 'Добавьте заглавную букву';
    if (!/[a-zа-я]/.test(pwd)) return 'Добавьте строчную букву';
    if (!/[0-9]/.test(pwd)) return 'Добавьте цифру';
    if (!/[^\w\sа-яА-Я]/.test(pwd)) return 'Добавьте спецсимвол';
    return '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(''); setMsg('');

    if (!oldPwd || !newPwd || !newPwd2) return setErr('Заполните все поля');
    if (newPwd !== newPwd2) return setErr('Новые пароли не совпадают');
    const v = validate(newPwd);
    if (v) return setErr(v);

    setLoading(true);
    try {
      // 1) Проверяем старый пароль (re-auth)
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: (await supabase.auth.getUser()).data.user?.email || '',
        password: oldPwd
      });
      if (signErr) {
        setLoading(false);
        return setErr('Старый пароль неверный');
      }

      // 2) Меняем пароль
      const { error: updErr } = await supabase.auth.updateUser({ password: newPwd });
      if (updErr){
        setErr(updErr.message);
        setLoading(false);
        return;
      }
      // 3) Получаем access_token текущей сессии
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) {
        setErr('Не удалось получить токен сессии');
        setLoading(false);
        return;
      }
      // 4) Сообщаем backend’у «первый вход завершён» (сброс must_change_password=false)
      const resp = await fetch(`${ADMIN_API}/api/self/complete-first-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        setErr(j?.error || 'Не удалось завершить первый вход');
        setLoading(false);
        return;
      }
 
      // 5) Готово
      setMsg('Пароль успешно изменён');
    } catch (e) {
      setErr('Ошибка смены пароля');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: { xs: 2, sm: 3 } }}>
      <Paper sx={{ p: { xs: 2, sm: 3 }, width: '100%', maxWidth: 420 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Смена пароля</Typography>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        {msg && <Alert severity="success" sx={{ mb: 2 }}>{msg}</Alert>}

        <form onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <TextField
              label="Старый пароль"
              type="password"
              value={oldPwd}
              onChange={e => setOldPwd(e.target.value)}
              fullWidth
            />
            <TextField
              label="Новый пароль"
              type="password"
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              helperText="Минимум 12 символов, буквы верх/низ, цифра и спецсимвол"
              fullWidth
            />
            <TextField
              label="Повторите новый пароль"
              type="password"
              value={newPwd2}
              onChange={e => setNewPwd2(e.target.value)}
              fullWidth
            />
            <Button type="submit" variant="contained" disabled={loading}>
              {loading ? 'Сохраняю…' : 'Сменить пароль'}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}

// src/App.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';

import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import AdminPanel from './admin/AdminPanel';

// --- Встроенная страница смены пароля (без отдельного файла) ---
import { Box, Paper, TextField, Button, Typography, Alert } from '@mui/material';

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

function ChangePasswordPage({ onDone }) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  async function submit() {
    setErr(''); setOk('');
    if (!oldPw || !newPw || !newPw2) return setErr('Заполни все поля');
    if (newPw !== newPw2) return setErr('Новый пароль и подтверждение не совпадают');
    const v = validatePassword(newPw);
    if (v.length) return setErr('Политика паролей: ' + v.join('; '));

    const { data: sdata } = await supabase.auth.getSession();
    const email = sdata?.session?.user?.email;
    const token = sdata?.session?.access_token;
    if (!email || !token) return setErr('Нет активной сессии');

    // проверка старого пароля
    const reauth = await supabase.auth.signInWithPassword({ email, password: oldPw });
    if (reauth.error) return setErr('Старый пароль неверный');

    // смена пароля
    const upd = await supabase.auth.updateUser({ password: newPw });
    if (upd.error) return setErr('Не удалось обновить пароль: ' + upd.error.message);

    // отметка первого входа
    try {
      const base = process.env.REACT_APP_ADMIN_API || 'http://localhost:4000';
      await fetch(`${base}/api/self/complete-first-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
    } catch {}

    setOk('Пароль успешно изменён');
    if (onDone) onDone();
  }

  return (
    <Box sx={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'80vh', p:2 }}>
      <Paper sx={{ p:3, width: 420 }}>
        <Typography variant="h6" mb={2}>Смена пароля</Typography>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        {ok && <Alert severity="success" sx={{ mb: 2 }}>{ok}</Alert>}
        <TextField label="Старый пароль" type="password" fullWidth sx={{ mb:2 }} value={oldPw} onChange={e => setOldPw(e.target.value)} />
        <TextField label="Новый пароль" type="password" fullWidth sx={{ mb:2 }} value={newPw} onChange={e => setNewPw(e.target.value)} helperText="≥12, A-Z, a-z, цифра, спецсимвол" />
        <TextField label="Повтори новый пароль" type="password" fullWidth sx={{ mb:2 }} value={newPw2} onChange={e => setNewPw2(e.target.value)} />
        <Button variant="contained" onClick={submit} fullWidth>Обновить пароль</Button>
      </Paper>
    </Box>
  );
}
// --- конец встроенной страницы смены пароля ---

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null); // must_change_password / first_login_at

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data?.session ?? null);
      setLoading(false);

      const sub = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
      unsub = () => sub?.data?.subscription?.unsubscribe?.();
    })();
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!session) return setProfile(null);
    (async () => {
      const { data, error } = await supabase
        .from('users')
        .select('must_change_password, first_login_at')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!error) setProfile(data || {});
    })();
  }, [session]);

  if (loading) return <div>Загрузка…</div>;
  if (!session) return <LoginPage onLogin={setSession} />;

  // Принудительная смена пароля при первом входе
  if (profile?.must_change_password) {
    return (
      <BrowserRouter>
        <Routes>
          <Route
            path="/account/password"
            element={<ChangePasswordPage onDone={() => (window.location.href = '/')} />}
          />
          <Route path="*" element={<Navigate to="/account/password" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard session={session} />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route
          path="/account/password"
          element={<ChangePasswordPage onDone={() => (window.location.href = '/')} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

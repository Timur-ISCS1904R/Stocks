// src/pages/ChangePassword.jsx
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
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

export default function ChangePassword({ afterChange }) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  async function submit() {
    setErr(''); setOk('');
    if (!oldPw || !newPw || !newPw2) {
      setErr('Заполни все поля'); return;
    }
    if (newPw !== newPw2) {
      setErr('Новый пароль и подтверждение не совпадают'); return;
    }
    const v = validatePassword(newPw);
    if (v.length) { setErr('Политика паролей: ' + v.join('; ')); return; }

    // проверяем старый пароль повторной аутентификацией
    const { data: sessionData } = await supabase.auth.getSession();
    const email = sessionData?.session?.user?.email;
    if (!email) { setErr('Нет email в сессии'); return; }

    const reauth = await supabase.auth.signInWithPassword({ email, password: oldPw });
    if (reauth.error) { setErr('Старый пароль неверный'); return; }

    // меняем пароль
    const upd = await supabase.auth.updateUser({ password: newPw });
    if (upd.error) { setErr('Не удалось обновить пароль: ' + upd.error.message); return; }

    setOk('Пароль успешно изменён');

    // сообщим бэку, что первый вход/обязательная смена завершена (если актуально)
    try {
      await fetch((process.env.REACT_APP_ADMIN_API || 'http://localhost:4000') + '/api/self/complete-first-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session.access_token}` },
      });
    } catch { /* необязательно */ }

    if (afterChange) afterChange();
  }

  return (
    <Box sx={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'80vh', p:2 }}>
      <Paper sx={{ p:3, width: 420 }}>
        <Typography variant="h6" mb={2}>Смена пароля</Typography>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        {ok && <Alert severity="success" sx={{ mb: 2 }}>{ok}</Alert>}

        <TextField
          label="Старый пароль" type="password" fullWidth sx={{ mb:2 }}
          value={oldPw} onChange={e => setOldPw(e.target.value)}
        />
        <TextField
          label="Новый пароль" type="password" fullWidth sx={{ mb:2 }}
          value={newPw} onChange={e => setNewPw(e.target.value)}
          helperText="≥12 символов, A-Z, a-z, цифра, спецсимвол"
        />
        <TextField
          label="Повтори новый пароль" type="password" fullWidth sx={{ mb:2 }}
          value={newPw2} onChange={e => setNewPw2(e.target.value)}
        />

        <Button variant="contained" onClick={submit} fullWidth>Обновить пароль</Button>
      </Paper>
    </Box>
  );
}

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.json());

// CORS: ограничь доменом фронта
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN?.split(',') ?? '*',
    credentials: false
  })
);

// Supabase admin client (только на бэке!)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// --- middleware: проверка, что запрос пришёл от АДМИНА ---
async function requireAdmin(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No bearer token' });

    // валидируем access_token пользователя
    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) return res.status(401).json({ error: 'Invalid token' });

    const userId = userRes.user.id;

    // проверяем, что он админ (public.users.is_admin = true)
    const { data: prof, error: profErr } = await supabase
      .from('users')
      .select('user_id, is_admin, email')
      .eq('user_id', userId)
      .maybeSingle();

    if (profErr) return res.status(500).json({ error: profErr.message });
    if (!prof?.is_admin) return res.status(403).json({ error: 'Forbidden: admin only' });

    req.admin = { id: userId, email: prof.email };
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Auth middleware error' });
  }
}

// ------------- USERS (Auth Admin API) -------------

// Список пользователей (email, id)
app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    // paginate при желании: { page: 1, perPage: 100 }
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) return res.status(500).json({ error: error.message });

    // подмешаем is_admin из public.users
    const ids = data.users.map(u => u.id);
    let profiles = [];
    if (ids.length) {
      const { data: rows, error: pErr } = await supabase
        .from('users')
        .select('user_id, is_admin, email')
        .in('user_id', ids);
      if (pErr) return res.status(500).json({ error: pErr.message });
      profiles = rows || [];
    }
    const idx = new Map(profiles.map(p => [p.user_id, p]));
    const result = data.users.map(u => ({
      id: u.id,
      email: u.email,
      is_admin: idx.get(u.id)?.is_admin ?? false
    }));
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'users list error' });
  }
});

// Создать пользователя
app.post('/api/admin/users/create', requireAdmin, async (req, res) => {
  try {
    const { email, password, is_admin = false } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email & password required' });

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (error) return res.status(500).json({ error: error.message });

    const uid = data.user?.id;
    if (uid) {
      // sync в public.users
      const { error: upErr } = await supabase.from('users').upsert({
        user_id: uid,
        email,
        is_admin
      });
      if (upErr) return res.status(500).json({ error: upErr.message });
    }
    res.json({ ok: true, user_id: uid });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'create user error' });
  }
});

// Удалить пользователя
app.post('/api/admin/users/delete', requireAdmin, async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    const { error } = await supabase.auth.admin.deleteUser(user_id);
    if (error) return res.status(500).json({ error: error.message });

    // опционально чистим public.users
    await supabase.from('users').delete().eq('user_id', user_id);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'delete user error' });
  }
});

// Смена пароля
app.post('/api/admin/users/reset-password', requireAdmin, async (req, res) => {
  try {
    const { user_id, new_password } = req.body;
    if (!user_id || !new_password) return res.status(400).json({ error: 'user_id & new_password required' });

    const { data, error } = await supabase.auth.admin.updateUserById(user_id, { password: new_password });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'reset password error' });
  }
});

// ------------- GLOBAL PERMISSIONS -------------

// Получить сводку прав (user_permissions, user_grants, users.is_admin)
app.get('/api/permissions', requireAdmin, async (req, res) => {
  try {
    const [perms, grants, admins] = await Promise.all([
      supabase.from('user_permissions').select('*'),
      supabase.from('user_grants').select('*'),
      supabase.from('users').select('user_id, is_admin, email')
    ]);
    if (perms.error) return res.status(500).json({ error: perms.error.message });
    if (grants.error) return res.status(500).json({ error: grants.error.message });
    if (admins.error) return res.status(500).json({ error: admins.error.message });

    res.json({
      user_permissions: perms.data ?? [],
      user_grants: grants.data ?? [],
      users: admins.data ?? []
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'permissions fetch error' });
  }
});

// Upsert глобальных прав + is_admin
app.post('/api/permissions', requireAdmin, async (req, res) => {
  try {
    const { user_id, can_view_all = false, can_edit_all = false, can_edit_dictionaries = false, is_admin = false } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    const { error: e1 } = await supabase
      .from('user_permissions')
      .upsert({ user_id, can_view_all, can_edit_all, can_edit_dictionaries });

    if (e1) return res.status(500).json({ error: e1.message });

    const { error: e2 } = await supabase
      .from('users')
      .upsert({ user_id, is_admin });

    if (e2) return res.status(500).json({ error: e2.message });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'permissions upsert error' });
  }
});

// ------------- USER GRANTS (точечные доступы) -------------

// Выдать/обновить грант
app.post('/api/grant', requireAdmin, async (req, res) => {
  try {
    const { resource, owner_id = null, grantee_id, mode } = req.body;
    if (!resource || !grantee_id || !mode) {
      return res.status(400).json({ error: 'resource, grantee_id, mode required' });
    }
    // resource: 'trades' | 'dividends' | 'dictionaries'
    // mode: 'read' | 'write'

    const { error } = await supabase
      .from('user_grants')
      .upsert({ resource, owner_id, grantee_id, mode }, { onConflict: 'resource,owner_id,grantee_id,mode' });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'grant upsert error' });
  }
});

// Удалить грант
app.delete('/api/grant', requireAdmin, async (req, res) => {
  try {
    const { resource, owner_id = null, grantee_id, mode } = req.body;
    if (!resource || !grantee_id || !mode) {
      return res.status(400).json({ error: 'resource, grantee_id, mode required' });
    }
    const q = supabase.from('user_grants').delete()
      .eq('resource', resource)
      .eq('grantee_id', grantee_id)
      .eq('mode', mode);

    // owner_id может быть null (для dictionaries)
    if (owner_id === null || owner_id === undefined) q.is('owner_id', null);
    else q.eq('owner_id', owner_id);

    const { error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'grant delete error' });
  }
});

// ------------- AUDIT -------------

// Получить аудит (только админ)
app.get('/api/audit', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 1000);
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data ?? []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'audit fetch error' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(process.env.PORT || 4000, () =>
  console.log(`Admin API listening on :${process.env.PORT || 4000}`)
);

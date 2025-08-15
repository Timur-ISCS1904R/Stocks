import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.json());

// Нормализуем список доменов и явно разрешаем preflight/headers
const ALLOWED_ORIGINS = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    // allow non-browser / server-to-server
    if (!origin) return cb(null, true);
    // если список пуст — разрешаем всё (для локальной отладки)
    if (ALLOWED_ORIGINS.length === 0) return cb(null, true);
    // точное совпадение источника
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false); // нет заголовков CORS
  },
  credentials: false, // ты работаешь по Bearer, куки не нужны
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  maxAge: 86400,
};

app.use(cors(corsOptions));
// Обязательно отвечаем на preflight
app.options('*', cors(corsOptions));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function requireAdmin(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No bearer token' });

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) return res.status(401).json({ error: 'Invalid token' });

    const userId = userRes.user.id;

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

async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No bearer token' });

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) return res.status(401).json({ error: 'Invalid token' });

    req.user = { id: userRes.user.id, email: userRes.user.email };
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Auth middleware error' });
  }
}

// helpers
async function getAuthEmailById(user_id) {
  const { data, error } = await supabase.auth.admin.getUserById(user_id);
  if (error) return null;
  return data?.user?.email || null;
}

async function getUserDepsCounts(client, userId) {
  const [
    { count: tradesCnt, error: e1 },
    { count: divCnt,    error: e2 },
    { count: grantsCnt, error: e3 },
  ] = await Promise.all([
    client.from('trades').select('trade_id', { count: 'exact', head: true }).eq('user_id', userId),
    client.from('dividends').select('dividend_id', { count: 'exact', head: true }).eq('user_id', userId),
    client.from('user_grants').select('owner_id', { count: 'exact', head: true }).or(`owner_id.eq.${userId},grantee_id.eq.${userId}`),
  ]);
  if (e1 || e2 || e3) throw (e1 || e2 || e3);
  return {
    trades: tradesCnt ?? 0,
    dividends: divCnt ?? 0,
    grants: grantsCnt ?? 0,
  };
}

// ---------- USERS ----------
app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) return res.status(500).json({ error: error.message });

    const ids = data.users.map(u => u.id);
    let profiles = [];
    if (ids.length) {
      const { data: rows, error: pErr } = await supabase
        .from('users')
        .select('user_id, is_admin, email, is_active, full_name')
        .in('user_id', ids);
      if (pErr) return res.status(500).json({ error: pErr.message });
      profiles = rows || [];
    }
    const idx = new Map(profiles.map(p => [p.user_id, p]));
    const result = data.users.map(u => ({
      id: u.id,
      email: u.email,
      is_admin: idx.get(u.id)?.is_admin ?? false,
      is_active: idx.get(u.id)?.is_active ?? true,
      full_name: idx.get(u.id)?.full_name ?? null,
    }));
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'users list error' });
  }
});

app.post('/api/admin/users/create', requireAdmin, async (req, res) => {
  try {
    const { email, password, is_admin = false, full_name = null } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email & password required' });

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (error) return res.status(500).json({ error: error.message });

    const uid = data.user?.id;
    if (uid) {
      const { error: upErr } = await supabase.from('users').upsert({
        user_id: uid,
        email,
        is_admin,
        must_change_password: true,
        full_name
      });
      if (upErr) return res.status(500).json({ error: upErr.message });
    }
    res.json({ ok: true, user_id: uid });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'create user error' });
  }
});

app.post('/api/admin/users/delete', requireAdmin, async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    // Порядок: сначала чистим все зависимости, потом удаляем пользователя в БД и Auth
    // trades / dividends
    const [{ error: et }, { error: ed }] = await Promise.all([
      supabase.from('trades').delete().eq('user_id', user_id),
      supabase.from('dividends').delete().eq('user_id', user_id),
    ]);
    if (et || ed) return res.status(500).json({ error: (et || ed).message });
 
    // grants / permissions
    const [{ error: eg }, { error: ep }] = await Promise.all([
      supabase.from('user_grants').delete().or(`owner_id.eq.${user_id},grantee_id.eq.${user_id}`),
      supabase.from('user_permissions').delete().eq('user_id', user_id),
    ]);
    if (eg || ep) return res.status(500).json({ error: (eg || ep).message });
 
    // audit (если ведёшь по actor/target)
    await supabase.from('audit_log').delete().or(`actor_id.eq.${user_id},target_user_id.eq.${user_id}`);
    // игнорируем ошибку audit_log, если таблицы/полей нет — по желанию можно обернуть в try
 
    // удаляем запись в public.users
    const { error: du } = await supabase.from('users').delete().eq('user_id', user_id);
    if (du) return res.status(500).json({ error: du.message });
 
    // и учётку в Auth (последним шагом)
    const { error: authErr } = await supabase.auth.admin.deleteUser(user_id);
    if (authErr) return res.status(500).json({ error: authErr.message });
 
    return res.json({ ok: true, mode: 'hard_delete' });   
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'delete user error' });
  }
});

app.post('/api/admin/users/soft-delete', requireAdmin, async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    const { error: updErr } = await supabase
      .from('users')
      .update({ is_active: false, deleted_at: new Date().toISOString(), email_masked: 'deleted' })
      .eq('user_id', user_id);
    if (updErr) return res.status(500).json({ error: updErr.message });

    const { error: grantsErr } = await supabase
      .from('user_grants')
      .delete()
      .or(`owner_id.eq.${user_id},grantee_id.eq.${user_id}`);
    if (grantsErr) return res.status(500).json({ error: grantsErr.message });

    return res.json({ ok: true, mode: 'soft_delete' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'soft delete error' });
  }
});

app.post('/api/admin/users/set-active', requireAdmin, async (req, res) => {
  try {
    const { user_id, is_active } = req.body;
    if (!user_id || typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'user_id & is_active required' });
    }
    const { error } = await supabase
      .from('users')
      .update({
        is_active,
        ...(is_active ? { deleted_at: null } : { deleted_at: new Date().toISOString(), email_masked: 'deleted' }),
      })
      .eq('user_id', user_id);
    if (error) return res.status(500).json({ error: error.message });
    // если отключаем — чистим гранты, чтобы не фигурировал в выдачах
    if (!is_active) {
      const { error: eg } = await supabase
        .from('user_grants')
        .delete()
        .or(`owner_id.eq.${user_id},grantee_id.eq.${user_id}`);
      if (eg) return res.status(500).json({ error: eg.message });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'set-active error' });
  }
});

app.post('/api/admin/users/reset-password', requireAdmin, async (req, res) => {
  try {
    const { user_id, new_password } = req.body;
    if (!user_id || !new_password) return res.status(400).json({ error: 'user_id & new_password required' });

    const { error } = await supabase.auth.admin.updateUserById(user_id, { password: new_password });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'reset password error' });
  }
});

// ---------- GLOBAL PERMISSIONS ----------
app.get('/api/permissions', requireAdmin, async (req, res) => {
  try {
    const [perms, grants, admins] = await Promise.all([
      supabase.from('user_permissions').select('*'),
      supabase.from('user_grants').select('*'),
      supabase.from('users').select('user_id, is_admin, email, is_active, full_name')
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

app.post('/api/permissions', requireAdmin, async (req, res) => {
  try {
    const { user_id, can_view_all = false, can_edit_all = false, can_edit_dictionaries = false, is_admin = false } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    // блокируем выдачу прав неактивным пользователям
    const { data: urow, error: uerr } = await supabase
      .from('users')
      .select('is_active')
      .eq('user_id', user_id)
      .maybeSingle();
    if (uerr) return res.status(500).json({ error: uerr.message });
    if (urow && urow.is_active === false) {
      return res.status(403).json({ error: 'cannot grant permissions to inactive user' });
    }
    // upsert user_permissions
    const { error: e1 } = await supabase
      .from('user_permissions')
      .upsert({ user_id, can_view_all, can_edit_all, can_edit_dictionaries });
    if (e1) return res.status(500).json({ error: e1.message });

    // users: сначала проверим, есть ли строка
    const { data: existing, error: selErr } = await supabase
      .from('users')
      .select('user_id, email')
      .eq('user_id', user_id)
      .maybeSingle();
    if (selErr) return res.status(500).json({ error: selErr.message });

    if (existing) {
      const { error: updErr } = await supabase
        .from('users')
        .update({ is_admin })
        .eq('user_id', user_id);
      if (updErr) return res.status(500).json({ error: updErr.message });
    } else {
      // нужен email (NOT NULL). Берём из Auth.
      const email = await getAuthEmailById(user_id);
      if (!email) return res.status(500).json({ error: 'email not found for user' });
      const { error: insErr } = await supabase
        .from('users')
        .insert({ user_id, email, is_admin });
      if (insErr) return res.status(500).json({ error: insErr.message });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'permissions upsert error' });
  }
});

// ---------- USER GRANTS ----------
app.post('/api/grant', requireAdmin, async (req, res) => {
  try {
    const { resource, owner_id = null, grantee_id, mode } = req.body;
    if (!resource || !grantee_id || !mode) {
      return res.status(400).json({ error: 'resource, grantee_id, mode required' });
    }
    // нельзя выдавать грант неактивным
    const idsToCheck = [grantee_id, ...(owner_id ? [owner_id] : [])];
    const { data: usersState, error: usErr } = await supabase
      .from('users')
      .select('user_id, is_active')
      .in('user_id', idsToCheck);
    if (usErr) return res.status(500).json({ error: usErr.message });
    if ((usersState || []).some(r => r.is_active === false)) {
      return res.status(403).json({ error: 'cannot grant to inactive user' });
    }
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

// ---------- AUDIT ----------
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

// ---------- SELF /* ↓ ДОБАВЬ ЭТО В server.js */

app.get('/api/self/status', requireAuth, async (req, res) => {
  try {
    const uid = req.user.id;
    const { data, error } = await supabase
      .from('users')
      .select('is_active')
      .eq('user_id', uid)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });

    // нет строки или флаг выключен — запрещаем доступ
    if (!data || data.is_active === false) {
      return res.status(403).json({ error: 'inactive' });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'status check error' });
  }
});


app.post('/api/self/complete-first-login', requireAuth, async (req, res) => {
  try {
    const uid = req.user.id;
    const { error } = await supabase
      .from('users')
      .update({ must_change_password: false, first_login_at: new Date().toISOString() })
      .eq('user_id', uid);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'complete-first-login error' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(process.env.PORT || 4000, () =>
  console.log(`Admin API listening on :${process.env.PORT || 4000}`)
);





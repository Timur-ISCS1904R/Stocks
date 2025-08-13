// src/admin/AdminPanel.jsx
// (тот же функционал, только адаптивные отступы/скролл)
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar, Toolbar, Typography, Box, Tabs, Tab, Paper,
  Table, TableHead, TableBody, TableRow, TableCell,
  IconButton, Switch, TextField, Button, Select, MenuItem,
  FormControl, InputLabel, Divider, Alert, Stack, Tooltip
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import KeyIcon from '@mui/icons-material/VpnKey';
import ShieldIcon from '@mui/icons-material/AdminPanelSettings';
import ListIcon from '@mui/icons-material/ListAlt';
import LinkIcon from '@mui/icons-material/Link';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

import { adminFetch } from '../lib/adminFetch';

export default function AdminPanel() {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [users, setUsers] = useState([]);
  const [userPerms, setUserPerms] = useState([]);
  const [grants, setGrants] = useState([]);

  const [newUser, setNewUser] = useState({ email: '', password: '', is_admin: false });
  const [resetPwd, setResetPwd] = useState({ user_id: '', new_password: '' });

  const [grantForm, setGrantForm] = useState({
    resource: 'trades', owner_id: '', grantee_id: '', mode: 'read'
  });

  const [audit, setAudit] = useState([]);
  const [auditLimit, setAuditLimit] = useState(200);
  const [auditFilter, setAuditFilter] = useState({ table: '', user: '' });

  const usersById = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  const navigate = useNavigate();

  function getPerm(userId) {
    return userPerms.find(p => p.user_id === userId) || {
      user_id: userId, can_view_all: false, can_edit_all: false, can_edit_dictionaries: false
    };
  }

  async function loadAll() {
    try {
      setErr(''); setLoading(true);
      const [u, permBundle] = await Promise.all([
        adminFetch('/api/users'),
        adminFetch('/api/permissions'),
      ]);
      setUsers(u);
      setUserPerms(permBundle.user_permissions || []);
      setGrants(permBundle.user_grants || []);
    } catch (e) {
      setErr(e.message || 'Ошибка загрузки');
    } finally { setLoading(false); }
  }

  async function loadAudit() {
    try {
      setErr('');
      const params = new URLSearchParams({ limit: String(auditLimit) });
      const data = await adminFetch(`/api/audit?${params.toString()}`);
      setAudit(data || []);
    } catch (e) {
      setErr(e.message || 'Ошибка аудита');
    }
  }

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (tab === 3) loadAudit(); }, [tab]);

  async function savePerm(userId, patch) {
    const current = getPerm(userId);
    const currentIsAdmin = users.find(u => u.id === userId)?.is_admin || false;

    await adminFetch('/api/permissions', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        can_view_all: patch.can_view_all ?? current.can_view_all,
        can_edit_all: patch.can_edit_all ?? current.can_edit_all,
        can_edit_dictionaries: patch.can_edit_dictionaries ?? current.can_edit_dictionaries,
        is_admin: patch.is_admin ?? currentIsAdmin
      })
    });
    await loadAll();
  }

  async function upsertGrant(payload) {
    await adminFetch('/api/grant', { method: 'POST', body: JSON.stringify(payload) });
    await loadAll();
  }

  async function deleteGrant(g) {
    await adminFetch('/api/grant', {
      method: 'DELETE',
      body: JSON.stringify({
        resource: g.resource,
        owner_id: g.owner_id ?? null,
        grantee_id: g.grantee_id,
        mode: g.mode
      }),
    });
    await loadAll();
  }

  async function createUser() {
    if (!newUser.email || !newUser.password) return setErr('Email и пароль обязательны');
    await adminFetch('/api/admin/users/create', {
      method: 'POST',
      body: JSON.stringify(newUser),
    });
    setNewUser({ email: '', password: '', is_admin: false });
    await loadAll();
  }

  async function removeUser(user_id) {
    if (!window.confirm('Удалить пользователя безвозвратно?')) return;
    await adminFetch('/api/admin/users/delete', {
      method: 'POST',
      body: JSON.stringify({ user_id }),
    });
    await loadAll();
  }

  async function resetPassword() {
    if (!resetPwd.user_id || !resetPwd.new_password) return setErr('Выбери пользователя и новый пароль');
    await adminFetch('/api/admin/users/reset-password', {
      method: 'POST',
      body: JSON.stringify(resetPwd),
    });
    setResetPwd({ user_id: '', new_password: '' });
  }

  const filteredAudit = useMemo(() => {
    return (audit || []).filter(row => {
      let ok = true;
      if (auditFilter.table) ok = ok && row.table_name === auditFilter.table;
      if (auditFilter.user) ok = ok && (row.actor_id === auditFilter.user || row.target_user_id === auditFilter.user);
      return ok;
    });
  }, [audit, auditFilter]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" color="default" elevation={1}>
        <Toolbar sx={{ gap: 1, flexWrap: 'wrap' }}>
          <ShieldIcon style={{ marginRight: 8 }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Админ-панель</Typography>
          <Tooltip title="Обновить"><IconButton onClick={loadAll}><RefreshIcon /></IconButton></Tooltip>
          <Button onClick={() => navigate('/')} sx={{ mr: 1 }} variant="outlined" size="small">
            На главную
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 2 }}
        >
          <Tab label="Права/пользователи" />
          <Tab label="Доступы (grants)" />
          <Tab label="Управление пользователями" />
          <Tab label="Аудит" icon={<ListIcon />} iconPosition="start" />
        </Tabs>

        {/* TAB 0 */}
        {tab === 0 && (
          <Paper sx={{ p: { xs: 1, sm: 2 }, overflowX: 'auto' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
              <Typography variant="h6">Права пользователей</Typography>
              <Tooltip title="Обновить">
                <IconButton onClick={loadAll} size="small"><RefreshIcon fontSize="small" /></IconButton>
              </Tooltip>
            </Stack>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell align="center">is_admin</TableCell>
                  <TableCell align="center">can_view_all</TableCell>
                  <TableCell align="center">can_edit_all</TableCell>
                  <TableCell align="center">can_edit_dictionaries</TableCell>
                  <TableCell align="center">Удалить</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6}>Загрузка…</TableCell></TableRow>
                ) : (
                  users.map(u => {
                    const p = getPerm(u.id);
                    return (
                      <TableRow key={u.id}>
                        <TableCell sx={{ minWidth: 220 }}>{u.email || u.id}</TableCell>
                        <TableCell align="center">
                          <Switch checked={!!u.is_admin}
                                  onChange={e => savePerm(u.id, { is_admin: e.target.checked })}/>
                        </TableCell>
                        <TableCell align="center">
                          <Switch checked={!!p.can_view_all}
                                  onChange={e => savePerm(u.id, { can_view_all: e.target.checked })}/>
                        </TableCell>
                        <TableCell align="center">
                          <Switch checked={!!p.can_edit_all}
                                  onChange={e => savePerm(u.id, { can_edit_all: e.target.checked })}/>
                        </TableCell>
                        <TableCell align="center">
                          <Switch checked={!!p.can_edit_dictionaries}
                                  onChange={e => savePerm(u.id, { can_edit_dictionaries: e.target.checked })}/>
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title="Удалить пользователя">
                            <span>
                              <IconButton color="error" size="small" onClick={() => removeUser(u.id)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Paper>
        )}

        {/* TAB 1 */}
        {tab === 1 && (
          <Paper sx={{ p: { xs: 1, sm: 2 }, overflowX: 'auto' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Точечные доступы</Typography>

            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" sx={{ mb: 2 }}>
              <FormControl sx={{ minWidth: 160 }}>
                <InputLabel>Resource</InputLabel>
                <Select
                  label="Resource"
                  value={grantForm.resource}
                  onChange={e => setGrantForm(g => ({ ...g, resource: e.target.value }))}
                >
                  <MenuItem value="trades">trades</MenuItem>
                  <MenuItem value="dividends">dividends</MenuItem>
                </Select>
              </FormControl>

              <FormControl sx={{ minWidth: 260 }}>
                <InputLabel>Owner (для trades/dividends)</InputLabel>
                <Select
                  label="Owner"
                  value={grantForm.owner_id}
                  onChange={e => setGrantForm(g => ({ ...g, owner_id: e.target.value }))}
                >
                  <MenuItem value=""><em>— не задан —</em></MenuItem>
                  {users.map(u => (
                    <MenuItem key={u.id} value={u.id}>{u.email || u.id}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl sx={{ minWidth: 260 }}>
                <InputLabel>Grantee (кому даём)</InputLabel>
                <Select
                  label="Grantee"
                  value={grantForm.grantee_id}
                  onChange={e => setGrantForm(g => ({ ...g, grantee_id: e.target.value }))}
                >
                  <MenuItem value=""><em>— выбери пользователя —</em></MenuItem>
                  {users.map(u => (
                    <MenuItem key={u.id} value={u.id}>{u.email || u.id}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl sx={{ minWidth: 160 }}>
                <InputLabel>Mode</InputLabel>
                <Select
                  label="Mode"
                  value={grantForm.mode}
                  onChange={e => setGrantForm(g => ({ ...g, mode: e.target.value }))}
                >
                  <MenuItem value="read">read</MenuItem>
                  <MenuItem value="write">write</MenuItem>
                </Select>
              </FormControl>

              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={async () => {
                  if (!grantForm.grantee_id) return setErr('Укажи grantee');
                  if (['trades','dividends'].includes(grantForm.resource) && !grantForm.owner_id) {
                    return setErr('Для trades/dividends укажи owner');
                  }
                  await upsertGrant({
                    resource: grantForm.resource,
                    owner_id: grantForm.owner_id || null,
                    grantee_id: grantForm.grantee_id,
                    mode: grantForm.mode
                  });
                }}
              >
                Выдать доступ
              </Button>
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>resource</TableCell>
                  <TableCell>owner_id</TableCell>
                  <TableCell>grantee</TableCell>
                  <TableCell>mode</TableCell>
                  <TableCell align="center">Удалить</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {grants.map(g => (
                  <TableRow key={`${g.resource}_${g.owner_id || 'null'}_${g.grantee_id}_${g.mode}`}>
                    <TableCell><code>{g.resource}</code></TableCell>
                    <TableCell sx={{ minWidth: 220 }}>
                      {g.owner_id || <em>null</em>}
                      {g.owner_id && usersById.get(g.owner_id)?.email ? (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {usersById.get(g.owner_id)?.email}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell sx={{ minWidth: 220 }}>
                      <code>{g.grantee_id}</code>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {usersById.get(g.grantee_id)?.email || ''}
                      </Typography>
                    </TableCell>
                    <TableCell><code>{g.mode}</code></TableCell>
                    <TableCell align="center">
                      <IconButton color="error" size="small" onClick={() => deleteGrant(g)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {grants.length === 0 && (
                  <TableRow><TableCell colSpan={5}>Грантов нет</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        )}

        {/* TAB 2 — Управление пользователями */}
        {tab === 2 && (
          <Paper sx={{ p: { xs: 1, sm: 2 }, overflowX: 'auto' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Пользователи</Typography>

            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" sx={{ mb: 2 }}>
              <TextField label="Email" value={newUser.email} onChange={e => setNewUser(s => ({ ...s, email: e.target.value }))}/>
              <TextField label="Пароль" type="password" value={newUser.password} onChange={e => setNewUser(s => ({ ...s, password: e.target.value }))}/>
              <FormControl sx={{ minWidth: 160 }}>
                <InputLabel>is_admin</InputLabel>
                <Select
                  label="is_admin"
                  value={newUser.is_admin ? 'true' : 'false'}
                  onChange={e => setNewUser(s => ({ ...s, is_admin: e.target.value === 'true' }))}
                >
                  <MenuItem value="false">false</MenuItem>
                  <MenuItem value="true">true</MenuItem>
                </Select>
              </FormControl>
              <Button variant="contained" startIcon={<PersonAddIcon />} onClick={createUser}>Создать</Button>
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
              <FormControl sx={{ minWidth: 260 }}>
                <InputLabel>Пользователь</InputLabel>
                <Select
                  label="Пользователь"
                  value={resetPwd.user_id}
                  onChange={e => setResetPwd(s => ({ ...s, user_id: e.target.value }))}
                >
                  <MenuItem value=""><em>— выбери —</em></MenuItem>
                  {users.map(u => (
                    <MenuItem key={u.id} value={u.id}>{u.email || u.id}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Новый пароль"
                type="password"
                value={resetPwd.new_password}
                onChange={e => setResetPwd(s => ({ ...s, new_password: e.target.value }))}
              />
              <Button variant="outlined" startIcon={<KeyIcon />} onClick={resetPassword}>
                Сменить пароль
              </Button>
            </Stack>

            <Alert severity="warning" sx={{ mt: 2 }}>
              Внимание: удаление пользователя делает недоступными его записи (из-за RLS),
              если для них нет глобальных/точечных прав у других пользователей.
            </Alert>
          </Paper>
        )}

        {/* TAB 3 — Аудит */}
        {tab === 3 && (
          <Paper sx={{ p: { xs: 1, sm: 2 }, overflowX: 'auto' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
              <Typography variant="h6">Аудит действий</Typography>
              <Tooltip title="Обновить"><IconButton onClick={loadAudit} size="small"><RefreshIcon fontSize="small" /></IconButton></Tooltip>
            </Stack>

            <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mb: 2 }}>
              <FormControl sx={{ minWidth: 180 }}>
                <InputLabel>Таблица</InputLabel>
                <Select
                  label="Таблица"
                  value={auditFilter.table}
                  onChange={e => setAuditFilter(f => ({ ...f, table: e.target.value }))}
                >
                  <MenuItem value=""><em>Все</em></MenuItem>
                  <MenuItem value="trades">trades</MenuItem>
                  <MenuItem value="dividends">dividends</MenuItem>
                  <MenuItem value="stocks">stocks</MenuItem>
                  <MenuItem value="exchanges">exchanges</MenuItem>
                  <MenuItem value="currencies">currencies</MenuItem>
                </Select>
              </FormControl>

              <FormControl sx={{ minWidth: 240 }}>
                <InputLabel>User (actor/target)</InputLabel>
                <Select
                  label="User"
                  value={auditFilter.user}
                  onChange={e => setAuditFilter(f => ({ ...f, user: e.target.value }))}
                >
                  <MenuItem value=""><em>Все</em></MenuItem>
                  {users.map(u => (
                    <MenuItem key={u.id} value={u.id}>{u.email || u.id}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Лимит"
                type="number"
                value={auditLimit}
                onChange={e => setAuditLimit(Number(e.target.value) || 100)}
                sx={{ width: 120 }}
              />
              <Button variant="outlined" startIcon={<ListIcon />} onClick={loadAudit}>Показать</Button>
            </Stack>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Когда</TableCell>
                  <TableCell>Таблица</TableCell>
                  <TableCell>Действие</TableCell>
                  <TableCell>Актор</TableCell>
                  <TableCell>Целевой юзер</TableCell>
                  <TableCell>Тикер</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredAudit.map(row => (
                  <TableRow key={row.id}>
                    <TableCell>{new Date(row.occurred_at).toLocaleString()}</TableCell>
                    <TableCell>{row.table_name}</TableCell>
                    <TableCell>{row.action}</TableCell>
                    <TableCell>
                      <code>{row.actor_id || '—'}</code>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {usersById.get(row.actor_id)?.email || ''}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <code>{row.target_user_id || '—'}</code>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {usersById.get(row.target_user_id)?.email || ''}
                      </Typography>
                    </TableCell>
                    <TableCell>{row.ticker || '—'}</TableCell>
                  </TableRow>
                ))}
                {filteredAudit.length === 0 && (
                  <TableRow><TableCell colSpan={6}>Записей не найдено</TableCell></TableRow>
                )}
              </TableBody>
            </Table>

            <Box sx={{ mt: 3, textAlign: 'right', color: 'text.secondary' }}>
              <Typography variant="caption">
                Backend API:&nbsp;
                <LinkIcon fontSize="inherit" />
                &nbsp;{process.env.REACT_APP_ADMIN_API || '(local) http://localhost:4000'}
              </Typography>
            </Box>
          </Paper>
        )}
      </Box>
    </Box>
  );
}



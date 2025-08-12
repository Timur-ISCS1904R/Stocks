import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Box, Tabs, Tab, Button, Typography, AppBar, Toolbar, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';

import BuyPage from './BuyPage';
import SellPage from './SellPage';
import DividendsPage from './DividendsPage';
import StocksPage from './StocksPage';
import ExchangesPage from './ExchangesPage';
import PortfolioReport from './PortfolioReport';

export default function Dashboard({ session }) {
  const [tab, setTab] = useState(0);
  const [userTab, setUserTab] = useState(0);
  const [users, setUsers] = useState([]);
  const [currentProfile, setCurrentProfile] = useState(null);
  const navigate = useNavigate();

  const meId = session?.user?.id;

  useEffect(() => {
    async function loadUsers() {
      // профиль текущего
      const { data: me } = await supabase.from('users').select('user_id, full_name, email, is_admin').eq('user_id', meId).maybeSingle();
      setCurrentProfile(me || null);

      // список всех (для админа)
      const { data: all } = await supabase.from('users').select('user_id, full_name, email').order('full_name', { ascending: true });
      setUsers(all || []);
    }
    if (meId) loadUsers();
  }, [meId]);

  const isAdmin = !!currentProfile?.is_admin;

  const userTabs = useMemo(() => {
    if (!isAdmin) {
      // обычный пользователь — только сам
      const me = users.find(u => u.user_id === meId);
      return me ? [me] : [];
    }
    // админ — все пользователи
    return users;
  }, [isAdmin, users, meId]);

  const activeUser = userTabs[userTab] || null;
  const activeUserId = activeUser?.user_id || null;
  const activeUserName = (activeUser?.full_name && activeUser.full_name.trim()) || activeUser?.email || '—';

  async function signOut() {
    try {
      await supabase.auth.signOut({ scope: 'global' });
    } catch {
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      try {
        const keyPrefix = 'sb-' + btoa(process.env.REACT_APP_SUPABASE_URL || '').replace(/=+$/, '') + '-auth-token';
        localStorage.removeItem(keyPrefix);
      } catch {}
      window.location.href = '/';
    }
  }

  return (
    <>
      <AppBar position="static">
        <Toolbar sx={{ gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Акции и сделки
          </Typography>

          <Stack direction="row" spacing={1}>
            <Button color="inherit" onClick={() => navigate('/account/password')}>Сменить пароль</Button>
            <Button color="inherit" onClick={() => navigate('/admin')}>Админ</Button>
            <Button color="inherit" onClick={signOut}>Выйти</Button>
          </Stack>
        </Toolbar>
      </AppBar>

      {/* Вкладки пользователей (только для админа) */}
      {isAdmin && userTabs.length > 0 && (
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2, pt: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
            Портфель пользователя:
          </Typography>
          <Tabs
            value={userTab}
            onChange={(_, v) => setUserTab(v)}
            variant="scrollable"
            scrollButtons="auto"
          >
            {userTabs.map((u, idx) => (
              <Tab key={u.user_id} label={(u.full_name && u.full_name.trim()) || u.email || u.user_id} value={idx} />
            ))}
          </Tabs>
        </Box>
      )}

      <Box sx={{ width: '100%' }}>
        <Box sx={{ px: 2, pt: 1, color: 'text.secondary' }}>
          {!isAdmin ? (
            <Typography variant="body2">
              Портфель: {(currentProfile?.full_name && currentProfile.full_name.trim()) || currentProfile?.email || '—'}
            </Typography>
          ) : (
            <Typography variant="body2">
              Портфель: {activeUserName}
            </Typography>
          )}
        </Box>

        <Tabs
          value={tab}
          onChange={(_, newValue) => setTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 2 }}
        >
          <Tab label="Покупка" />
          <Tab label="Продажа" />
          <Tab label="Дивиденды" />
          <Tab label="Справочник акций" />
          <Tab label="Справочник бирж" />
          <Tab label="Отчёт по портфелю" />
        </Tabs>

        <Box sx={{ p: 2 }}>
          {/* В справочниках фильтра нет — они глобальные */}
          {tab === 0 && <BuyPage filterUserId={isAdmin ? activeUserId : meId} />}
          {tab === 1 && <SellPage filterUserId={isAdmin ? activeUserId : meId} />}
          {tab === 2 && <DividendsPage filterUserId={isAdmin ? activeUserId : meId} />}
          {tab === 3 && <StocksPage />}
          {tab === 4 && <ExchangesPage />}
          {tab === 5 && <PortfolioReport filterUserId={isAdmin ? activeUserId : meId} />}
        </Box>
      </Box>
    </>
  );
}

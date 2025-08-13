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

  // гранты, где текущий пользователь является grantee
  const [myGrants, setMyGrants] = useState([]);

  const navigate = useNavigate();
  const meId = session?.user?.id;

  // ---- загрузка профиля, пользователей и грантов ----
  useEffect(() => {
    async function loadUsersAndMe() {
      if (!meId) return;

      // профиль текущего пользователя (ожидается поле is_admin, full_name, email)
      const { data: me } = await supabase
        .from('users')
        .select('user_id, full_name, email, is_admin')
        .eq('user_id', meId)
        .maybeSingle();
      setCurrentProfile(me || null);

      // список всех пользователей (для подписей вкладок и для админа)
      const { data: all } = await supabase
        .from('users')
        .select('user_id, full_name, email')
        .order('full_name', { ascending: true });
      setUsers(all || []);

      // мои гранты (все ресурсы, где я grantee)
      const { data: grants } = await supabase
        .from('user_grants')
        .select('resource, owner_id, grantee_id, mode')
        .eq('grantee_id', meId);
      setMyGrants(grants || []);
    }
    loadUsersAndMe();
  }, [meId]);

  const isAdmin = !!currentProfile?.is_admin;

  // ---- список вкладок-пользователей (сверху) ----
  // админ: все пользователи; не админ: сам + владельцы, давшие гранты
  const userTabs = useMemo(() => {
    if (!meId) return [];
    if (isAdmin) return users;

    // собрать список owner_id из моих грантов
    const ownerIds = Array.from(new Set((myGrants || []).map(g => g.owner_id).filter(Boolean)));

    // включаем "самого себя" первым (если есть в списке users)
    const me = users.find(u => u.user_id === meId);
    const owners = users.filter(u => ownerIds.includes(u.user_id));

    const list = [];
    if (me) list.push(me);
    owners.forEach(o => {
      if (!list.find(x => x.user_id === o.user_id)) list.push(o);
    });
    return list;
  }, [isAdmin, users, myGrants, meId]);

  // активный пользователь по верхним вкладкам
  const activeUser = userTabs[userTab] || null;
  const activeUserId = activeUser?.user_id || null;
  const activeUserName = (activeUser?.full_name && activeUser.full_name.trim()) || activeUser?.email || '—';

  // ---- утилиты по грантам для выбранного владельца ----
  function modesFor(ownerId, resource) {
    // вернуть множество режимов ('read'/'write') для указанного ресурса и владельца
    const set = new Set();
    (myGrants || []).forEach(g => {
      if (g.owner_id === ownerId && g.resource === resource) set.add(g.mode);
    });
    return set;
  }

  function hasRead(ownerId, resource) {
    return modesFor(ownerId, resource).has('read') || modesFor(ownerId, resource).has('write');
  }
  function hasWrite(ownerId, resource) {
    return modesFor(ownerId, resource).has('write');
  }

  // ---- конфигурация вкладок (нижние вкладки контента) ----
  // Порядок и подписи не меняем, только решаем показывать/скрывать.
  const TAB_CONFIG = [
    { key: 'buy',        label: 'Покупка',           render: (uid) => <BuyPage filterUserId={uid} /> },
    { key: 'sell',       label: 'Продажа',           render: (uid) => <SellPage filterUserId={uid} /> },
    { key: 'dividends',  label: 'Дивиденды',         render: (uid) => <DividendsPage filterUserId={uid} /> },
    { key: 'stocks',     label: 'Справочник акций',  render: ()   => <StocksPage /> },
    { key: 'exchanges',  label: 'Справочник бирж',   render: ()   => <ExchangesPage /> },
    { key: 'report',     label: 'Отчёт по портфелю', render: (uid) => <PortfolioReport filterUserId={uid} /> },
  ];

  // для выбранного пользователя определить, какие вкладки показывать
  const visibleTabs = useMemo(() => {
    // админ видит всё
    if (isAdmin) return TAB_CONFIG;


    // если выбран "я сам" — все вкладки
    if (activeUserId && activeUserId === meId) return TAB_CONFIG;

    // чужой портфель — строим список по грантам
    const canTradesWrite = hasWrite(activeUserId, 'trades');
    const canTradesRead  = hasRead(activeUserId, 'trades');
    const canDivWrite    = hasWrite(activeUserId, 'dividends');
    const canDivRead     = hasRead(activeUserId, 'dividends');
    // иначе — портфель другого пользователя: фильтруем по грантам
    const allow = new Set();

    // trades:read → показываем Покупка, Продажа, Отчёт (но readOnly)
    if (canTradesRead || canTradesWrite) {
      allow.add('buy'); allow.add('sell'); allow.add('report');
    }
    // dividends:read → показываем Дивиденды (readOnly, если нет write)
    if (canDivRead || canDivWrite) {
      allow.add('dividends');
    }

    // Справочники при чужом портфеле НЕ показываем вовсе

    return TAB_CONFIG.filter(t => allow.has(t.key));
  }, [isAdmin, activeUserId, meId, myGrants]);

  // следим, чтобы индекс нижней вкладки не вываливался при смене набора
  useEffect(() => {
    if (visibleTabs.length === 0) {
      setTab(0);
    } else if (tab > visibleTabs.length - 1) {
      setTab(0);
    }
  }, [visibleTabs, tab]);

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
            {isAdmin && (
              <Button color="inherit" onClick={() => navigate('/admin')}>Админ</Button>
            )}
            <Button color="inherit" onClick={signOut}>Выйти</Button>
          </Stack>
        </Toolbar>
      </AppBar>

      {/* Вкладки пользователей */}
      {userTabs.length > 0 && (
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
              <Tab
                key={u.user_id}
                value={idx}
                label={(u.full_name && u.full_name.trim()) || u.email || u.user_id}
              />
            ))}
          </Tabs>
        </Box>
      )}

      {/* Подпись активного портфеля */}
      <Box sx={{ width: '100%' }}>
        <Box sx={{ px: 2, pt: 1, color: 'text.secondary' }}>
          <Typography variant="body2">
            Портфель: {activeUserName}
          </Typography>
        </Box>

        {/* Нижние вкладки контента — показываем только разрешённые */}
        <Tabs
          value={tab}
          onChange={(_, newValue) => setTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 2 }}
        >
          {visibleTabs.map((t) => (
            <Tab key={t.key} label={t.label} />
          ))}
        </Tabs>

        <Box sx={{ p: 2 }}>
          {visibleTabs.length > 0 && (
            visibleTabs.map((t, idx) =>
              idx === tab ? (
                <Box key={`${activeUserId || meId}-${t.key}`}>
                  {/* для вкладок, которые зависят от владельца — прокидываем filterUserId */}
                  {['buy','sell','dividends','report'].includes(t.key)
                    ? t.render(activeUserId || meId)
                    : t.render()}
                </Box>
              ) : null
            )
          )}
          {visibleTabs.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Нет доступных разделов для выбранного пользователя.
            </Typography>
          )}
        </Box>
      </Box>
    </>
  );
}

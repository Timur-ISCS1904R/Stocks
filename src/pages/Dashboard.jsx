import React, { useState } from 'react';
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
  const navigate = useNavigate();

  async function signOut() {
    try {
      // Глобальный выход (отзывает refresh-токены везде)
      const { error } = await supabase.auth.signOut({ scope: 'global' });

      // Если сессии уже нет — это ок, идём дальше.
      if (error && error.message !== 'session_not_found') {
        // Любая другая ошибка — делаем локальный выход.
        await supabase.auth.signOut({ scope: 'local' });
      }
    } catch {
      // На случай сетевых/прочих ошибок — локальный выход.
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      // Подчистим все возможные supabase-ключи из localStorage.
      try {
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
            localStorage.removeItem(k);
          }
        });
      } catch {}

      // И уводим на логин.
      window.location.href = '/';
    }
  }

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Акции и сделки
          </Typography>

          <Stack direction="row" spacing={1}>
            <Button color="inherit" onClick={() => navigate('/account/password')}>
              Сменить пароль
            </Button>
            <Button color="inherit" onClick={() => navigate('/logout')}>Выйти</Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box sx={{ width: '100%' }}>
        <Tabs
          value={tab}
          onChange={(_, newValue) => setTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Покупка" />
          <Tab label="Продажа" />
          <Tab label="Дивиденды" />
          <Tab label="Справочник акций" />
          <Tab label="Справочник бирж" />
          <Tab label="Отчёт по портфелю" />
        </Tabs>

        <Box sx={{ p: 2 }}>
          {tab === 0 && <BuyPage />}
          {tab === 1 && <SellPage />}
          {tab === 2 && <DividendsPage />}
          {tab === 3 && <StocksPage />}
          {tab === 4 && <ExchangesPage />}
          {tab === 5 && <PortfolioReport />}
        </Box>
      </Box>
    </>
  );
}

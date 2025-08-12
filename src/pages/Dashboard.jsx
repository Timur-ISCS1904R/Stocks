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
      const { error } = await supabase.auth.signOut({ scope: 'global' });

    // Если сессии уже нет — это не ошибка, просто продолжаем
       if (error && error.message !== 'session_not_found') {
      // Если другая ошибка — пробуем локальный логаут
       await supabase.auth.signOut({ scope: 'local' });
      }
    } catch {
    // Если что-то пошло не так, пробуем локальный логаут
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
    // На всякий случай чистим локальный токен из localStorage
      try {
        const keyPrefix = 'sb-' + btoa(process.env.REACT_APP_SUPABASE_URL || '').replace(/=+$/, '') + '-auth-token';
        localStorage.removeItem(keyPrefix);
      } catch {}
    // Перенаправляем на страницу логина
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
            <Button color="inherit" onClick={signOut}>Выйти</Button>
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

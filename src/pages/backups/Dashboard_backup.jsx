import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Box, Tabs, Tab, Button, Typography, AppBar, Toolbar } from '@mui/material';

import BuyPage from './BuyPage';
import SellPage from './SellPage';
import DividendsPage from './DividendsPage';
import StocksPage from './StocksPage';
import ExchangesPage from './ExchangesPage';

export default function Dashboard({ session }) {
  const [tab, setTab] = useState(0);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Акции и сделки
          </Typography>
          <Button color="inherit" onClick={signOut}>Выйти</Button>
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
        </Tabs>

        <Box sx={{ p: 2 }}>
          {tab === 0 && <BuyPage />}
          {tab === 1 && <SellPage />}
          {tab === 2 && <DividendsPage />}
          {tab === 3 && <StocksPage />}
          {tab === 4 && <ExchangesPage />}
        </Box>
      </Box>
    </>
  );
}

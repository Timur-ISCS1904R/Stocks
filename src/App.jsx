// src/App.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import BuyPage from './pages/BuyPage';
import SellPage from './pages/SellPage';
import DividendsPage from './pages/DividendsPage';
import StocksPage from './pages/StocksPage';
import ExchangesPage from './pages/ExchangesPage';
import PortfolioReport from './pages/PortfolioReport';

import AdminPanel from './admin/AdminPanel';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div>Загрузка…</div>;

  // Не залогинен — всегда показываем страницу логина
  if (!session) return <LoginPage onLogin={setSession} />;

  // Залогинен — доступны все маршруты
  return (
    <BrowserRouter>
      <Routes>
        {/* главная (у тебя внутри Dashboard уже есть вкладки) */}
        <Route path="/" element={<Dashboard session={session} />} />
        {/* админка — важна позиция до catch-all */}
        <Route path="/admin" element={<AdminPanel />} />

        {/* все остальное — на главную */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

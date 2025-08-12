import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminPanel from './admin/AdminPanel';

import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getSession() {
      const { data, error } = await supabase.auth.getSession();
      console.log('getSession data:', data);
      console.log('getSession error:', error);
      setSession(data?.session ?? null);
      setLoading(false);
    }
    getSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('Auth state changed:', session);
      setSession(session);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  if (loading) return <div>Загрузка...</div>;

  if (!session) {
    return <LoginPage onLogin={setSession} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={<Dashboard session={session} />} />
        <Route path="*" element={<Navigate to="/" />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

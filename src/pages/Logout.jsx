// src/pages/Logout.jsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

export default function Logout() {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        // пробуем глобальный логаут, но не зависим от результата
        await supabase.auth.signOut({ scope: 'global' });
      } catch {}
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {}

      // подчистим возможные записи Supabase в localStorage
      try {
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
            localStorage.removeItem(k);
          }
        });
      } catch {}

      // очистим sessionStorage и (на всякий случай) куки текущего домена
      try {
        sessionStorage.clear();
        document.cookie.split(';').forEach(c => {
          const [name] = c.split('=');
          if (!name) return;
          document.cookie = `${name.trim()}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        });
      } catch {}

      // жёсткий редирект на главную: App.jsx увидит, что сессии нет, и покажет LoginPage
      window.location.replace('/');
    })();
  }, [navigate]);

  return null;
}

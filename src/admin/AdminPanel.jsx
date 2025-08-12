import React, { useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminFetch';

export default function AdminPanel() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers]   = useState([]);
  const [error, setError]   = useState('');

  useEffect(() => {
    (async () => {
      try {
        setError('');
        setLoading(true);
        const list = await adminFetch('/api/users'); // дергаем бэк
        setUsers(list);
      } catch (e) {
        setError(e.message || 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div style={{padding:20}}>Загрузка…</div>;
  if (error)   return <div style={{padding:20, color:'crimson'}}>Ошибка: {error}</div>;

  return (
    <div style={{ padding: 20 }}>
      <h2>Админ-панель</h2>
      <p>Ниже список пользователей с бэкенда (значит связь установлена):</p>
      <table border="1" cellPadding="6">
        <thead>
          <tr>
            <th>Email</th>
            <th>id</th>
            <th>is_admin</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>{u.email || '—'}</td>
              <td>{u.id}</td>
              <td>{String(u.is_admin)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

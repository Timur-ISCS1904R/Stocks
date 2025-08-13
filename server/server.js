// server/server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.json({ limit: '10mb' }));

// Structured Logging
class Logger {
  static log(level, message, meta = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
      pid: process.pid,
      hostname: process.env.HOSTNAME || 'unknown'
    };

    // В production используйте Winston или подобную библиотеку
    if (level === 'error') {
      console.error(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }
  }

  static info(message, meta = {}) {
    this.log('info', message, meta);
  }

  static error(message, meta = {}) {
    this.log('error', message, meta);
  }

  static warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  static debug(message, meta = {}) {
    if (process.env.NODE_ENV !== 'production') {
      this.log('debug', message, meta);
    }
  }
}

// Middleware для логирования запросов
app.use((req, res, next) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substr(2, 9);
  
  req.requestId = requestId;
  req.startTime = startTime;

  Logger.info('Incoming request', {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentLength: req.get('Content-Length')
  });

  const originalSend = res.send;
  res.send = function(body) {
    const duration = Date.now() - startTime;
    
    Logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      responseSize: Buffer.isBuffer(body) ? body.length : JSON.stringify(body).length
    });

    originalSend.call(this, body);
  };

  next();
});

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN?.split(',') ?? '*',
    credentials: false
  })
);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { 
    auth: { 
      autoRefreshToken: false, 
      persistSession: false 
    }
  }
);

// Улучшенный middleware для проверки админских прав
async function requireAdmin(req, res, next) {
  const requestId = req.requestId;
  
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    
    if (!token) {
      Logger.warn('Missing bearer token', { requestId, path: req.path });
      return res.status(401).json({ error: 'No bearer token' });
    }

    Logger.debug('Verifying token', { requestId, tokenPreview: token.substr(0, 20) + '...' });

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    
    if (userErr || !userRes?.user) {
      Logger.warn('Invalid token', { 
        requestId, 
        error: userErr?.message,
        hasUser: !!userRes?.user 
      });
      return res.status(401).json({ error: 'Invalid token' });
    }

    const userId = userRes.user.id;

    const { data: prof, error: profErr } = await supabase
      .from('users')
      .select('user_id, is_admin, email')
      .eq('user_id', userId)
      .maybeSingle();

    if (profErr) {
      Logger.error('Database error checking admin status', {
        requestId,
        userId,
        error: profErr.message,
        code: profErr.code
      });
      return res.status(500).json({ error: profErr.message });
    }

    if (!prof?.is_admin) {
      Logger.warn('Access denied - not admin', {
        requestId,
        userId,
        email: userRes.user.email,
        isAdmin: prof?.is_admin
      });
      return res.status(403).json({ error: 'Forbidden: admin only' });
    }

    req.admin = { 
      id: userId, 
      email: prof.email,
      requestId 
    };
    
    Logger.debug('Admin access granted', {
      requestId,
      adminId: userId,
      adminEmail: prof.email
    });

    next();
  } catch (e) {
    Logger.error('Auth middleware error', {
      requestId,
      path: req.path,
      error: e.message,
      stack: e.stack
    });
    res.status(500).json({ error: 'Auth middleware error' });
  }
}

// Middleware для обычной авторизации
async function requireAuth(req, res, next) {
  const requestId = req.requestId;
  
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    
    if (!token) {
      Logger.warn('Missing bearer token', { requestId, path: req.path });
      return res.status(401).json({ error: 'No bearer token' });
    }

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    
    if (userErr || !userRes?.user) {
      Logger.warn('Invalid token in requireAuth', { 
        requestId, 
        error: userErr?.message 
      });
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = { 
      id: userRes.user.id, 
      email: userRes.user.email,
      requestId 
    };
    
    Logger.debug('User authenticated', {
      requestId,
      userId: userRes.user.id,
      email: userRes.user.email
    });

    next();
  } catch (e) {
    Logger.error('Auth middleware error', {
      requestId,
      path: req.path,
      error: e.message,
      stack: e.stack
    });
    res.status(500).json({ error: 'Auth middleware error' });
  }
}

// Обработчик ошибок для всего приложения
app.use((error, req, res, next) => {
  const requestId = req.requestId;
  
  Logger.error('Unhandled error', {
    requestId,
    path: req.path,
    method: req.method,
    error: error.message,
    stack: error.stack,
    userId: req.user?.id || req.admin?.id
  });

  // Не отправляем внутренние детали в production
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ error: 'Internal server error' });
  } else {
    res.status(500).json({ 
      error: error.message,
      stack: error.stack,
      requestId 
    });
  }
});

// Helper функция с улучшенным логированием
async function getAuthEmailById(user_id, requestId) {
  try {
    Logger.debug('Fetching user email by ID', { requestId, user_id });
    
    const { data, error } = await supabase.auth.admin.getUserById(user_id);
    
    if (error) {
      Logger.warn('Failed to fetch user email', { 
        requestId, 
        user_id, 
        error: error.message 
      });
      return null;
    }

    const email = data?.user?.email || null;
    Logger.debug('User email fetched', { requestId, user_id, hasEmail: !!email });
    
    return email;
  } catch (e) {
    Logger.error('Error in getAuthEmailById', {
      requestId,
      user_id,
      error: e.message
    });
    return null;
  }
}

// ---------- USERS ----------
app.get('/api/users', requireAdmin, async (req, res) => {
  const { requestId } = req;
  
  try {
    Logger.info('Fetching users list', { requestId, adminId: req.admin.id });

    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) {
      Logger.error('Failed to fetch users from auth', { 
        requestId, 
        error: error.message 
      });
      return res.status(500).json({ error: error.message });
    }

    const ids = data.users.map(u => u.id);
    Logger.debug('Found users in auth', { requestId, count: ids.length });

    let profiles = [];
    if (ids.length) {
      const { data: rows, error: pErr } = await supabase
        .from('users')
        .select('user_id, is_admin, email')
        .in('user_id', ids);
      
      if (pErr) {
        Logger.error('Failed to fetch user profiles', {
          requestId,
          error: pErr.message,
          code: pErr.code
        });
        return res.status(500).json({ error: pErr.message });
      }
      profiles = rows || [];
    }

    const idx = new Map(profiles.map(p => [p.user_id, p]));
    const result = data.users.map(u => ({
      id: u.id,
      email: u.email,
      is_admin: idx.get(u.id)?.is_admin ?? false
    }));

    Logger.info('Users list fetched successfully', { 
      requestId, 
      totalUsers: result.length,
      adminUsers: result.filter(u => u.is_admin).length
    });

    res.json(result);
  } catch (e) {
    Logger.error('Unexpected error in /api/users', {
      requestId,
      error: e.message,
      stack: e.stack
    });
    res.status(500).json({ error: 'Users list error' });
  }
});

// Health check с диагностикой
app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  };

  Logger.debug('Health check', { requestId: req.requestId, health });
  res.json(health);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  Logger.info('Admin API started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version
  });
});

export { Logger };
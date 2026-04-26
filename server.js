require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const session = require('express-session');

const aemRoutes = require('./routes/aem');
const schemaRoutes = require('./routes/schema');
const authRoutes = require('./routes/auth');
const { requireAuth } = require('./middleware/requireAuth');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'aem-schema-dash-secret-change-me';

// ─── Core Middleware ────────────────────────────────────────────────────────
app.use(cors({ credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// ─── Session ────────────────────────────────────────────────────────────────
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,        // set true in production behind HTTPS
    maxAge: 8 * 60 * 60 * 1000  // 8 hours
  }
}));

// ─── Auth API (public — no session required) ────────────────────────────────
app.use('/api/auth', authRoutes);

// ─── Health check (public) ──────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Protected API routes ────────────────────────────────────────────────────
app.use('/api/aem', requireAuth, aemRoutes);
app.use('/api/schema', requireAuth, schemaRoutes);

// ─── Static files (login.html + index.html live here) ───────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all: serve dashboard shell (client-side JS handles auth redirect)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 AEM Schema Dashboard  →  http://localhost:${PORT}`);
  console.log(`🔐 Login page            →  http://localhost:${PORT}/login.html`);
  console.log(`\nAPI Endpoints:`);
  console.log(`  POST /api/auth/login        - Authenticate with AEM`);
  console.log(`  POST /api/auth/logout       - End session`);
  console.log(`  GET  /api/auth/me           - Current session info`);
  console.log(`  POST /api/schema/apply      - Apply JSON-LD schema to AEM page`);
  console.log(`  GET  /api/schema/get        - Get schema from AEM page`);
  console.log(`  GET  /api/aem/verify        - Verify AEM connection\n`);
});
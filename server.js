require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const session = require('express-session');

// Import routes
const aemRoutes = require('./routes/aem');
const schemaRoutes = require('./routes/schema');
const authRoutes = require('./routes/auth');
const llmConfigRoutes = require('./routes/llmConfig');
const geoAnalysisRoutes = require('./routes/geoAnalysis');

// Import middleware
const { requireAuth } = require('./middleware/requireAuth');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'aem-schema-dash-secret-change-me';

// ============================================
// CORS Configuration
// ============================================
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  optionsSuccessStatus: 200
};

// ============================================
// Core Middleware
// ============================================
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// ============================================
// Session Configuration
// ============================================
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Use HTTPS in production
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000  // 8 hours
  }
}));

// ============================================
// Request Logging Middleware (for debugging)
// ============================================
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

// Authentication routes
app.use('/api/auth', authRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Public test endpoint (remove in production)
app.get('/api/public/test', (req, res) => {
  res.json({ message: 'API is working', timestamp: Date.now() });
});

// ============================================
// PROTECTED API ROUTES (Authentication required)
// ============================================

// AEM routes
app.use('/api/aem', requireAuth, aemRoutes);

// Schema management routes
app.use('/api/schema', requireAuth, schemaRoutes);

// LLM Configuration routes
app.use('/api/llm', requireAuth, llmConfigRoutes);

// GEO Analysis routes
app.use('/api/geo', requireAuth, geoAnalysisRoutes);

// ============================================
// STATIC FILE SERVING
// ============================================

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve component HTML files
app.use('/components', express.static(path.join(__dirname, 'public/components')));

// Serve JavaScript files
app.use('/js', express.static(path.join(__dirname, 'public/js')));

// Serve CSS files (if you have any)
app.use('/css', express.static(path.join(__dirname, 'public/css')));

// ============================================
// DEBUG ROUTES (Only in development)
// ============================================

if (process.env.NODE_ENV !== 'production') {
  // Debug: List all registered routes
  app.get('/api/debug/routes', (req, res) => {
    const routes = [];
    
    const extractRoutes = (stack, basePath = '') => {
      stack.forEach(layer => {
        if (layer.route) {
          const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
          routes.push({
            path: basePath + layer.route.path,
            methods: methods,
            middleware: layer.route.stack.length
          });
        } else if (layer.name === 'router' && layer.handle.stack) {
          let routerPath = '';
          if (layer.regexp) {
            const pathStr = layer.regexp.toString();
            const match = pathStr.match(/\^\\\/(.*?)(\\\/|\?)/);
            if (match) {
              routerPath = '/' + match[1].replace(/\\\//g, '/');
            }
          }
          extractRoutes(layer.handle.stack, basePath + routerPath);
        }
      });
    };
    
    extractRoutes(app._router.stack);
    res.json({ 
      routes: routes.sort((a, b) => a.path.localeCompare(b.path)),
      total: routes.length,
      timestamp: Date.now()
    });
  });

  // Debug: Check authentication status
  app.get('/api/debug/auth', requireAuth, (req, res) => {
    res.json({
      authenticated: true,
      authMethod: req.authMethod,
      sessionId: req.sessionID,
      aemConfig: {
        hasBaseUrl: !!req.aemConfig?.baseUrl,
        hasUsername: !!req.aemConfig?.username,
        hasPassword: !!req.aemConfig?.password
      }
    });
  });

  // Debug: Test LLM config accessibility
  app.get('/api/debug/llm-check', requireAuth, async (req, res) => {
    try {
      const llmConfig = require('./routes/llmConfig');
      res.json({
        success: true,
        message: 'LLM routes are accessible',
        configLoaded: !!llmConfig
      });
    } catch (err) {
      res.json({
        success: false,
        error: err.message
      });
    }
  });
}

// ============================================
// CATCH-ALL ROUTE (SPA support - MUST BE LAST)
// ============================================
app.get('*', (req, res) => {
  // Don't interfere with API routes that might have 404'd
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ 
      success: false, 
      error: `API endpoint not found: ${req.path}` 
    });
  }
  
  // Check if requesting a file that exists
  const staticPath = path.join(__dirname, 'public', req.path);
  const fs = require('fs');
  if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
    return res.sendFile(staticPath);
  }
  
  // For all other routes, serve the dashboard
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// GLOBAL ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
  console.error('[ERROR]', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });
  
  // Determine if it's an API request
  const isApiRequest = req.path.startsWith('/api/') || req.headers.accept?.includes('application/json');
  
  if (isApiRequest) {
    res.status(err.status || 500).json({
      success: false,
      error: err.message || 'Internal server error',
      code: err.code || 'INTERNAL_ERROR'
    });
  } else {
    res.status(err.status || 500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Server Error</title>
          <style>
            body { font-family: monospace; padding: 50px; background: #0a0c10; color: #e8eaf0; }
            h1 { color: #ff6b6b; }
            pre { background: #111318; padding: 20px; border-radius: 8px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <h1>⚠️ Server Error</h1>
          <p>Something went wrong. Please try again later.</p>
          <pre>${err.message}</pre>
          <a href="/" style="color: #5b6af7;">← Back to Dashboard</a>
        </body>
      </html>
    `);
  }
});

// ============================================
// START SERVER
// ============================================
const server = app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 AEM GEO Intelligence Platform');
  console.log('='.repeat(60));
  console.log(`\n📡 Server running on: http://localhost:${PORT}`);
  console.log(`🔐 Login page:        http://localhost:${PORT}/login.html`);
  console.log(`📊 Dashboard:         http://localhost:${PORT}`);
  console.log(`\n🌍 Features:`);
  console.log(`   • AEM Schema Management`);
  console.log(`   • GEO Content Analysis`);
  console.log(`   • LLM Integration (Claude, Gemini, OpenAI)`);
  console.log(`   • Multi-country compliance checking`);
  console.log(`\n📋 API Endpoints:`);
  console.log(`   POST   /api/auth/login        - Authenticate with AEM`);
  console.log(`   POST   /api/auth/logout       - End session`);
  console.log(`   GET    /api/auth/me           - Current session info`);
  console.log(`   POST   /api/schema/apply      - Apply JSON-LD schema`);
  console.log(`   GET    /api/schema/get        - Get schema from AEM`);
  console.log(`   GET    /api/aem/verify        - Verify AEM connection`);
  console.log(`   POST   /api/llm/config        - Configure LLM provider`);
  console.log(`   GET    /api/llm/config        - Get LLM configuration`);
  console.log(`   POST   /api/geo/analyze       - Analyze GEO compliance`);
  console.log(`   POST   /api/geo/fix           - Auto-fix GEO issues`);
  console.log(`   GET    /api/geo/report/:fmt   - Export GEO report`);
  console.log(`\n🛠️  Debug endpoints (dev mode only):`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`   GET    /api/debug/routes      - List all routes`);
    console.log(`   GET    /api/debug/auth       - Check auth status`);
  }
  console.log('\n' + '='.repeat(60));
  console.log(`✅ Server ready in ${process.env.NODE_ENV || 'development'} mode`);
  console.log('='.repeat(60) + '\n');
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

module.exports = app;
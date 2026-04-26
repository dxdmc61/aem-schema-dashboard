require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const aemRoutes = require('./routes/aem');
const schemaRoutes = require('./routes/schema');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/aem', aemRoutes);
app.use('/api/schema', schemaRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    aemBaseUrl: process.env.AEM_BASE_URL || 'not configured'
  });
});

// Serve dashboard for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 AEM Schema Dashboard running on http://localhost:${PORT}`);
  console.log(`📡 AEM Target: ${process.env.AEM_BASE_URL || 'Not configured - set AEM_BASE_URL in .env'}`);
  console.log(`\nAPI Endpoints:`);
  console.log(`  POST /api/schema/apply     - Apply JSON-LD schema to AEM page`);
  console.log(`  GET  /api/schema/get       - Get schema from AEM page`);
  console.log(`  GET  /api/aem/verify       - Verify AEM connection`);
  console.log(`  POST /api/aem/config       - Update AEM configuration\n`);
});

const express = require('express');
const router = express.Router();
const { verifyConnection, getPageProperties } = require('../middleware/aemClient');

// In-memory config override (persists during server session)
let runtimeConfig = {};

/**
 * GET /api/aem/verify
 * Test AEM connection with current or provided credentials
 */
router.get('/verify', async (req, res, next) => {
  try {
    const result = await verifyConnection(runtimeConfig);
    res.json({
      success: result.connected,
      status: result.status,
      message: result.connected
        ? 'Successfully connected to AEM'
        : `Connection failed: ${result.statusText}`,
      aemUrl: process.env.AEM_BASE_URL || runtimeConfig.baseUrl || 'Not set'
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/aem/config
 * Update AEM connection config at runtime (without restarting)
 */
router.post('/config', (req, res) => {
  const { baseUrl, username, password } = req.body;
  if (baseUrl) runtimeConfig.baseUrl = baseUrl;
  if (username) runtimeConfig.username = username;
  if (password) runtimeConfig.password = password;

  res.json({
    success: true,
    message: 'Configuration updated',
    config: {
      baseUrl: runtimeConfig.baseUrl || process.env.AEM_BASE_URL,
      username: runtimeConfig.username || process.env.AEM_USERNAME,
      hasPassword: !!(runtimeConfig.password || process.env.AEM_PASSWORD)
    }
  });
});

/**
 * GET /api/aem/config
 * Get current AEM config (passwords masked)
 */
router.get('/config', (req, res) => {
  res.json({
    baseUrl: runtimeConfig.baseUrl || process.env.AEM_BASE_URL || '',
    username: runtimeConfig.username || process.env.AEM_USERNAME || '',
    hasPassword: !!(runtimeConfig.password || process.env.AEM_PASSWORD)
  });
});

/**
 * GET /api/aem/page-properties?path=/content/...
 * Fetch page properties from AEM
 */
router.get('/page-properties', async (req, res, next) => {
  const { path } = req.query;
  if (!path) return res.status(400).json({ success: false, error: 'path query param required' });

  try {
    const props = await getPageProperties(path, runtimeConfig);
    res.json({ success: true, path, properties: props });
  } catch (err) {
    next(err);
  }
});

// Export config getter for use in other routes
router.getRuntimeConfig = () => runtimeConfig;

module.exports = router;

const express = require('express');
const router = express.Router();
const { verifyConnection } = require('../middleware/aemClient');

/**
 * POST /api/auth/login
 * Validates AEM credentials by attempting a real connection.
 * On success, stores credentials in the session.
 */
router.post('/login', async (req, res) => {
  const { baseUrl, username, password } = req.body;

  if (!baseUrl || !username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Author URL, username and password are all required.'
    });
  }

  // Strip trailing slash
  const cleanUrl = baseUrl.replace(/\/$/, '');

  // Validate URL format
  try { new URL(cleanUrl); } catch {
    return res.status(400).json({ success: false, error: 'Invalid Author URL format.' });
  }

  try {
    const result = await verifyConnection({ baseUrl: cleanUrl, username, password });

    if (!result.connected) {
      return res.status(401).json({
        success: false,
        error: `AEM returned HTTP ${result.status}. Check your credentials and Author URL.`
      });
    }

    // Persist in session
    req.session.aem = { baseUrl: cleanUrl, username, password };
    req.session.loggedIn = true;

    return res.json({
      success: true,
      message: 'Authenticated successfully',
      aemUrl: cleanUrl,
      username
    });

  } catch (err) {
    return res.status(502).json({
      success: false,
      error: `Could not reach AEM: ${err.message}`
    });
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/**
 * GET /api/auth/me
 * Returns current session info (password excluded)
 */
router.get('/me', (req, res) => {
  if (!req.session.loggedIn) {
    return res.status(401).json({ loggedIn: false });
  }
  res.json({
    loggedIn: true,
    aemUrl: req.session.aem?.baseUrl,
    username: req.session.aem?.username
  });
});

module.exports = router;
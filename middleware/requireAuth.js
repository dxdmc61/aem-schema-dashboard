/**
 * requireAuth middleware
 *
 * Accepts requests authenticated via either:
 *   1. Browser session (cookie from /api/auth/login)
 *   2. API Key header  (x-api-key: <API_KEY from .env>)
 *
 * In both cases, injects req.aemConfig so downstream routes
 * can talk to AEM without touching process.env directly.
 */
function requireAuth(req, res, next) {

    // ── Path 1: Browser session (dashboard UI) ───────────────────────────────
    if (req.session && req.session.loggedIn) {
      req.aemConfig = {
        baseUrl:  req.session.aem?.baseUrl,
        username: req.session.aem?.username,
        password: req.session.aem?.password
      };
      req.authMethod = 'session';
      return next();
    }
  
    // ── Path 2: API Key (external applications) ──────────────────────────────
    const apiKey = req.headers['x-api-key'];
  
    if (apiKey) {
      const validKey = process.env.API_KEY;
  
      if (!validKey) {
        return res.status(503).json({
          success: false,
          error: 'API key auth is not configured on this server. Set API_KEY in .env'
        });
      }
  
      if (apiKey !== validKey) {
        return res.status(401).json({
          success: false,
          error: 'Invalid API key.'
        });
      }
  
      // API key is valid — load AEM credentials from .env
      // (external callers don't have a session, so we fall back to env vars)
      if (!process.env.AEM_BASE_URL || !process.env.AEM_USERNAME || !process.env.AEM_PASSWORD) {
        return res.status(503).json({
          success: false,
          error: 'AEM credentials not configured in .env (AEM_BASE_URL, AEM_USERNAME, AEM_PASSWORD required for API key auth)'
        });
      }
  
      req.aemConfig = {
        baseUrl:  process.env.AEM_BASE_URL,
        username: process.env.AEM_USERNAME,
        password: process.env.AEM_PASSWORD
      };
      req.authMethod = 'apikey';
      return next();
    }
  
    // ── Neither session nor API key ──────────────────────────────────────────
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Provide a session cookie (browser login) or x-api-key header.'
    });
  }
  
  module.exports = { requireAuth };
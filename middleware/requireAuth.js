/**
 * requireAuth middleware
 * Blocks unauthenticated requests to protected API routes.
 * Injects session AEM credentials into req so routes don't need
 * to pull from process.env directly.
 */
function requireAuth(req, res, next) {
    if (!req.session || !req.session.loggedIn) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated. Please log in first.'
      });
    }
  
    // Inject session credentials as req.aemConfig so all downstream
    // routes / middleware can use them without touching process.env
    req.aemConfig = {
      baseUrl: req.session.aem?.baseUrl,
      username: req.session.aem?.username,
      password: req.session.aem?.password
    };
  
    next();
  }
  
  module.exports = { requireAuth };
const express = require('express');
const router = express.Router();
const { applySchemaToPage, getPageProperties } = require('../middleware/aemClient');
const aemRouter = require('./aem');

// History log (in-memory, last 100 operations)
const operationLog = [];

function logOperation(entry) {
  operationLog.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (operationLog.length > 100) operationLog.pop();
}

/**
 * POST /api/schema/apply
 * Main endpoint: receives { pagePath, schema } and applies to AEM
 *
 * Body:
 * {
 *   "pagePath": "/content/mysite/en/home",
 *   "schema": {
 *     "@context": "https://schema.org",
 *     "@type": "WebPage",
 *     "name": "Home",
 *     ...
 *   }
 * }
 */
router.post('/apply', async (req, res, next) => {
  const { pagePath, schema } = req.body;

  // Validation
  if (!pagePath) {
    return res.status(400).json({ success: false, error: 'pagePath is required' });
  }
  if (!schema || typeof schema !== 'object') {
    return res.status(400).json({ success: false, error: 'schema must be a valid JSON object' });
  }
  if (!schema['@context'] || !schema['@type']) {
    return res.status(400).json({
      success: false,
      error: 'schema must include @context and @type (JSON-LD required fields)'
    });
  }

  const config = aemRouter.getRuntimeConfig ? aemRouter.getRuntimeConfig() : {};

  try {
    const result = await applySchemaToPage(pagePath, schema, config);

    const logEntry = {
      id: Date.now(),
      pagePath,
      schemaType: Array.isArray(schema['@type']) ? schema['@type'].join(', ') : schema['@type'],
      status: 'success',
      aemStatus: result.status,
      location: result.location
    };
    logOperation(logEntry);

    res.json({
      success: true,
      message: `Schema successfully applied to ${pagePath}`,
      result,
      logEntry
    });
  } catch (err) {
    logOperation({
      id: Date.now(),
      pagePath,
      schemaType: schema['@type'] || 'unknown',
      status: 'error',
      error: err.message
    });
    next(err);
  }
});

/**
 * POST /api/schema/apply-batch
 * Apply schemas to multiple pages at once
 *
 * Body: { pages: [{ pagePath, schema }, ...] }
 */
router.post('/apply-batch', async (req, res, next) => {
  const { pages } = req.body;
  if (!Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({ success: false, error: 'pages array is required' });
  }

  const config = aemRouter.getRuntimeConfig ? aemRouter.getRuntimeConfig() : {};
  const results = [];

  for (const item of pages) {
    try {
      const result = await applySchemaToPage(item.pagePath, item.schema, config);
      results.push({ pagePath: item.pagePath, success: true, result });
      logOperation({
        id: Date.now(),
        pagePath: item.pagePath,
        schemaType: item.schema['@type'] || 'unknown',
        status: 'success',
        aemStatus: result.status
      });
    } catch (err) {
      results.push({ pagePath: item.pagePath, success: false, error: err.message });
      logOperation({
        id: Date.now(),
        pagePath: item.pagePath,
        schemaType: item.schema['@type'] || 'unknown',
        status: 'error',
        error: err.message
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  res.json({
    success: true,
    message: `Processed ${pages.length} pages: ${successCount} succeeded, ${pages.length - successCount} failed`,
    results
  });
});

/**
 * GET /api/schema/get?path=/content/...
 * Retrieve schema stored on an AEM page
 */
router.get('/get', async (req, res, next) => {
  const { path } = req.query;
  if (!path) return res.status(400).json({ success: false, error: 'path query param required' });

  const config = aemRouter.getRuntimeConfig ? aemRouter.getRuntimeConfig() : {};

  try {
    const props = await getPageProperties(path, config);
    const schema = props.jsonLdSchema ? JSON.parse(props.jsonLdSchema) : null;
    res.json({
      success: true,
      path,
      schema,
      lastModified: props.jsonLdLastModified || null,
      schemaType: props.jsonLdSchemaType || null
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/schema/log
 * Get operation history
 */
router.get('/log', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json({
    success: true,
    total: operationLog.length,
    log: operationLog.slice(0, limit)
  });
});

/**
 * DELETE /api/schema/log
 * Clear operation history
 */
router.delete('/log', (req, res) => {
  operationLog.length = 0;
  res.json({ success: true, message: 'Log cleared' });
});

module.exports = router;

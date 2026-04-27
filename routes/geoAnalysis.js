// routes/geoAnalysis.js
const express = require('express');
const router = express.Router();
const { analyzeGeoContent, generateFixedContent, batchGeoAnalysis, llmConfigs } = require('../middleware/llmClients');
const { getPageProperties, applySchemaToPage } = require('../middleware/aemClient');
const aemRouter = require('./aem');

// Store GEO fix history
const fixHistory = [];

// Pre-defined GEO rules by country
const geoRules = {
  'US': {
    language: 'en-US',
    dateFormat: 'MM/DD/YYYY',
    currency: 'USD',
    addressFormat: 'street city state zip',
    regulations: ['ADA compliance', 'CCPA']
  },
  'GB': {
    language: 'en-GB',
    dateFormat: 'DD/MM/YYYY',
    currency: 'GBP',
    addressFormat: 'street city postcode',
    regulations: ['GDPR', 'PECR']
  },
  'DE': {
    language: 'de-DE',
    dateFormat: 'DD.MM.YYYY',
    currency: 'EUR',
    addressFormat: 'street zip city',
    regulations: ['GDPR', 'TTDSG']
  },
  'JP': {
    language: 'ja-JP',
    dateFormat: 'YYYY/MM/DD',
    currency: 'JPY',
    addressFormat: 'postal prefecture city street',
    regulations: ['APPI']
  },
  'IN': {
    language: 'en-IN',
    dateFormat: 'DD/MM/YYYY',
    currency: 'INR',
    addressFormat: 'street city state PIN',
    regulations: ['DPDPA']
  }
};

// Get GEO rules for a country
router.get('/rules/:country', (req, res) => {
  const { country } = req.params;
  const rules = geoRules[country.toUpperCase()] || geoRules['US'];
  res.json({ success: true, country: country.toUpperCase(), rules });
});

// Analyze single page for GEO compliance
router.post('/analyze', async (req, res) => {
  const { pagePath, targetCountry, customRules } = req.body;
  
  if (!pagePath || !targetCountry) {
    return res.status(400).json({ error: 'pagePath and targetCountry required' });
  }

  const config = aemRouter.getRuntimeConfig();
  const countryCode = targetCountry.toUpperCase();
  const geoConfig = customRules || geoRules[countryCode] || geoRules['US'];

  try {
    // Fetch current page properties from AEM
    const pageProps = await getPageProperties(pagePath, config);
    const currentSchema = pageProps.jsonLdSchema ? JSON.parse(pageProps.jsonLdSchema) : null;
    
    if (!currentSchema) {
      return res.status(404).json({ 
        error: 'No JSON-LD schema found on this page. Please apply a schema first.' 
      });
    }

    // Analyze with LLM
    const analysis = await analyzeGeoContent(currentSchema, {
      country: countryCode,
      language: geoConfig.language,
      regulations: geoConfig.regulations
    }, { pagePath, schemaType: currentSchema['@type'] });

    // Add GEO config to response
    analysis.geoConfig = geoConfig;
    analysis.pagePath = pagePath;
    analysis.currentSchema = currentSchema;

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Auto-fix GEO issues and apply to AEM
router.post('/fix', async (req, res) => {
  const { pagePath, analysis, targetCountry, autoApply = true } = req.body;

  if (!pagePath || !analysis || !targetCountry) {
    return res.status(400).json({ error: 'pagePath, analysis, and targetCountry required' });
  }

  const config = aemRouter.getRuntimeConfig();
  const countryCode = targetCountry.toUpperCase();
  const geoConfig = geoRules[countryCode] || geoRules['US'];

  try {
    // Get current schema
    const pageProps = await getPageProperties(pagePath, config);
    const currentSchema = pageProps.jsonLdSchema ? JSON.parse(pageProps.jsonLdSchema) : null;

    if (!currentSchema) {
      return res.status(404).json({ error: 'No schema found on page' });
    }

    // Generate fixed content
    const fixedSchema = await generateFixedContent(currentSchema, analysis.geoIssues, {
      country: countryCode,
      language: geoConfig.language
    });

    // Apply to AEM if requested
    let aemResult = null;
    if (autoApply) {
      aemResult = await applySchemaToPage(pagePath, fixedSchema, config);
      
      // Record fix in history
      const fixRecord = {
        id: Date.now(),
        pagePath,
        timestamp: new Date().toISOString(),
        targetCountry: countryCode,
        originalScore: analysis.score,
        fixedIssues: analysis.geoIssues.filter(i => i.severity === 'critical' || i.severity === 'warning'),
        changes: Object.keys(fixedSchema).filter(k => 
          JSON.stringify(currentSchema[k]) !== JSON.stringify(fixedSchema[k])
        ),
        aemStatus: aemResult.status
      };
      fixHistory.unshift(fixRecord);
      if (fixHistory.length > 500) fixHistory.pop();
    }

    res.json({
      success: true,
      fixedSchema,
      changes: Object.keys(fixedSchema).filter(k => 
        JSON.stringify(currentSchema[k]) !== JSON.stringify(fixedSchema[k])
      ),
      appliedToAEM: autoApply,
      aemResult
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Batch analyze multiple pages
router.post('/batch-analyze', async (req, res) => {
  const { pages, targetCountry } = req.body;
  
  if (!pages || !Array.isArray(pages) || !targetCountry) {
    return res.status(400).json({ error: 'pages array and targetCountry required' });
  }

  const config = aemRouter.getRuntimeConfig();
  const countryCode = targetCountry.toUpperCase();
  const geoConfig = geoRules[countryCode] || geoRules['US'];

  // Fetch all page contents
  const pagesWithContent = [];
  for (const pagePath of pages) {
    try {
      const pageProps = await getPageProperties(pagePath, config);
      const schema = pageProps.jsonLdSchema ? JSON.parse(pageProps.jsonLdSchema) : null;
      if (schema) {
        pagesWithContent.push({
          path: pagePath,
          content: schema,
          context: { pagePath, schemaType: schema['@type'] }
        });
      }
    } catch (err) {
      console.error(`Failed to fetch ${pagePath}:`, err.message);
    }
  }

  // Batch analyze
  const results = await batchGeoAnalysis(pagesWithContent, {
    country: countryCode,
    language: geoConfig.language,
    regulations: geoConfig.regulations
  });

  res.json({
    success: true,
    totalAnalyzed: results.length,
    averageScore: results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length,
    results
  });
});

// Get fix history report
router.get('/fix-history', (req, res) => {
  const { limit = 100, country, pagePath } = req.query;
  
  let filtered = [...fixHistory];
  if (country) filtered = filtered.filter(f => f.targetCountry === country.toUpperCase());
  if (pagePath) filtered = filtered.filter(f => f.pagePath.includes(pagePath));
  
  const summary = {
    totalFixes: filtered.length,
    byCountry: {},
    averageIssuesPerFix: 0,
    recentFixes: filtered.slice(0, parseInt(limit))
  };
  
  // Calculate summary statistics
  filtered.forEach(fix => {
    summary.byCountry[fix.targetCountry] = (summary.byCountry[fix.targetCountry] || 0) + 1;
  });
  
  const totalIssues = filtered.reduce((sum, f) => sum + (f.fixedIssues?.length || 0), 0);
  summary.averageIssuesPerFix = filtered.length ? (totalIssues / filtered.length).toFixed(1) : 0;
  
  res.json({ success: true, summary });
});

// Export GEO report (CSV/JSON)
router.get('/report/:format', (req, res) => {
  const { format } = req.params; // 'json' or 'csv'
  const { from, to } = req.query;
  
  let filtered = [...fixHistory];
  if (from) filtered = filtered.filter(f => f.timestamp >= from);
  if (to) filtered = filtered.filter(f => f.timestamp <= to);
  
  if (format === 'csv') {
    const headers = ['ID', 'Page Path', 'Timestamp', 'Target Country', 'Original Score', 'Issues Fixed', 'Changes'];
    const rows = filtered.map(f => [
      f.id,
      f.pagePath,
      f.timestamp,
      f.targetCountry,
      f.originalScore,
      f.fixedIssues?.length || 0,
      f.changes?.join(';') || ''
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=geo-report-${Date.now()}.csv`);
    return res.send(csv);
  }
  
  res.json({ success: true, total: filtered.length, fixes: filtered });
});

module.exports = router;
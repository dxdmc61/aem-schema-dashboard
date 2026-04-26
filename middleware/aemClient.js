const fetch = require('node-fetch');

/**
 * Build AEM Basic Auth header from env or provided credentials
 */
function getAuthHeader(username, password) {
  const user = username || process.env.AEM_USERNAME;
  const pass = password || process.env.AEM_PASSWORD;
  if (!user || !pass) throw new Error('AEM credentials not configured');
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

/**
 * Get AEM base URL from env or config
 */
function getBaseUrl(baseUrl) {
  const url = baseUrl || process.env.AEM_BASE_URL;
  if (!url) throw new Error('AEM_BASE_URL not configured');
  return url.replace(/\/$/, '');
}

/**
 * Verify AEM connection by hitting the login endpoint
 */
async function verifyConnection(config = {}) {
  const baseUrl = getBaseUrl(config.baseUrl);
  const authHeader = getAuthHeader(config.username, config.password);

  const response = await fetch(`${baseUrl}/libs/granite/core/content/login.html`, {
    method: 'GET',
    headers: { Authorization: authHeader }
  });

  return {
    connected: response.status < 400,
    status: response.status,
    statusText: response.statusText
  };
}

/**
 * Read existing page properties from AEM via Sling GET servlet
 */
async function getPageProperties(pagePath, config = {}) {
  const baseUrl = getBaseUrl(config.baseUrl);
  const authHeader = getAuthHeader(config.username, config.password);

  // Normalise path: ensure it ends with /jcr:content
  const contentPath = pagePath.endsWith('/jcr:content')
    ? pagePath
    : `${pagePath}/jcr:content`;

  const url = `${baseUrl}${contentPath}.infinity.json`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`AEM GET failed: ${response.status} ${response.statusText} — ${url}`);
  }

  return response.json();
}

/**
 * Apply JSON-LD schema to an AEM page by POSTing to Sling POST servlet on jcr:content
 */
async function applySchemaToPage(pagePath, schemaLD, config = {}) {
  const baseUrl = getBaseUrl(config.baseUrl);
  const authHeader = getAuthHeader(config.username, config.password);

  // Target the jcr:content node
  const contentPath = pagePath.endsWith('/jcr:content')
    ? pagePath
    : `${pagePath}/jcr:content`;

  const postUrl = `${baseUrl}${contentPath}`;

  // Sling POST servlet uses multipart/form-data or application/x-www-form-urlencoded
  const body = new URLSearchParams();

  // Store the raw JSON-LD string as a String property
  body.append('jsonLdSchema', JSON.stringify(schemaLD));
  body.append('jsonLdSchema@TypeHint', 'String');

  // Also store individual schema type for easy query
  if (schemaLD['@type']) {
    body.append('jsonLdSchemaType', Array.isArray(schemaLD['@type'])
      ? schemaLD['@type'].join(',')
      : schemaLD['@type']);
  }

  // Timestamp
  body.append('jsonLdLastModified', new Date().toISOString());

  const response = await fetch(postUrl, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AEM POST failed: ${response.status} ${response.statusText}\n${text}`);
  }

  // Sling POST typically returns 200/201 with HTML; parse response headers
  return {
    success: true,
    status: response.status,
    location: response.headers.get('Location') || postUrl,
    path: contentPath
  };
}

module.exports = { verifyConnection, getPageProperties, applySchemaToPage, getBaseUrl, getAuthHeader };

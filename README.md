# AEM Schema.org JSON-LD Dashboard

A Node.js application with a polished dashboard for applying JSON-LD structured data (Schema.org) to AEM as a Cloud Service page properties using Basic Authentication.

## Features

- **Dashboard** — Connection status, stats, recent activity
- **Apply Schema** — Visual JSON-LD editor with 6 built-in templates (WebPage, Article, Product, Organization, FAQPage, Event)
- **Read Schema** — Fetch existing schema from any AEM page
- **Batch Apply** — Push schema to multiple pages in one request
- **Processing Modal** — Animated step-by-step popup during AEM operations
- **Operation Log** — Full audit trail of all schema operations
- **API Reference** — Built-in docs for the REST API

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure AEM credentials
cp .env.example .env
# Edit .env with your AEM instance URL and credentials

# 3. Start the server
npm start

# 4. Open the dashboard
open http://localhost:3000
```

## Configuration

### `.env` file
```env
AEM_BASE_URL=https://author-p00000-e000000.adobeaemcloud.com
AEM_USERNAME=admin
AEM_PASSWORD=your-password-here
PORT=3000
```

### Runtime Config (via Dashboard or API)
You can also configure credentials at runtime without restarting:
```bash
curl -X POST http://localhost:3000/api/aem/config \
  -H "Content-Type: application/json" \
  -d '{"baseUrl":"https://author-....adobeaemcloud.com","username":"admin","password":"pass"}'
```

## REST API

### Apply Schema to a Page
```bash
POST /api/schema/apply

curl -X POST http://localhost:3000/api/schema/apply \
  -H "Content-Type: application/json" \
  -d '{
    "pagePath": "/content/mysite/en/home",
    "schema": {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "Home Page",
      "description": "Welcome to our website",
      "url": "https://www.example.com"
    }
  }'
```

### Apply to Multiple Pages (Batch)
```bash
POST /api/schema/apply-batch

curl -X POST http://localhost:3000/api/schema/apply-batch \
  -H "Content-Type: application/json" \
  -d '{
    "pages": [
      {
        "pagePath": "/content/mysite/en/home",
        "schema": { "@context": "https://schema.org", "@type": "WebPage", "name": "Home" }
      },
      {
        "pagePath": "/content/mysite/en/about",
        "schema": { "@context": "https://schema.org", "@type": "AboutPage", "name": "About Us" }
      }
    ]
  }'
```

### Read Schema from Page
```bash
GET /api/schema/get?path=/content/mysite/en/home
```

### Verify AEM Connection
```bash
GET /api/aem/verify
```

## How It Works

1. **Payload received** — `POST /api/schema/apply` accepts `{ pagePath, schema }`
2. **Validation** — Server validates JSON-LD has `@context` and `@type`
3. **AEM Auth** — Basic Auth header built from credentials
4. **Sling POST** — POSTs to `{AEM_URL}{pagePath}/jcr:content` using the Sling POST Servlet
5. **Properties stored** — Schema stored as `jsonLdSchema` (String), `jsonLdSchemaType`, `jsonLdLastModified` on `jcr:content`
6. **Retrieval** — Use Sling GET servlet (`.infinity.json`) to read back properties

## AEM Integration Details

The app uses AEM's built-in **Sling POST Servlet** endpoint pattern:
```
POST https://{aem-author}{pagePath}/jcr:content
Content-Type: application/x-www-form-urlencoded
Authorization: Basic {base64(user:pass)}

jsonLdSchema={"@context":"...","@type":"..."}&jsonLdSchema@TypeHint=String
```

To render the schema on the page frontend (in your AEM component HTL):
```html
<sly data-sly-use.page="com.adobe.cq.wcm.core.components.models.Page">
  <script type="application/ld+json">${properties.jsonLdSchema @ context='unsafe'}</script>
</sly>
```

## Project Structure

```
aem-schema-dashboard/
├── server.js                 # Express app entry point
├── package.json
├── .env.example
├── routes/
│   ├── aem.js               # AEM config & connection routes
│   └── schema.js            # Schema apply/read/batch/log routes
├── middleware/
│   └── aemClient.js         # AEM HTTP client (auth, Sling POST/GET)
└── public/
    └── index.html           # Full single-page dashboard
```

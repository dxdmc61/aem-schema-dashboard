// middleware/llmClients.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

// Configuration store (in-memory + optional persistence)
let llmConfigs = {
  activeProvider: 'claude', // claude, gemini, openai
  providers: {
    claude: {
      apiKey: process.env.CLAUDE_API_KEY || '',
      model: 'claude-3-sonnet-20240229',
      enabled: false
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      model: 'gemini-1.5-pro',
      enabled: false
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: 'gpt-4-turbo-preview',
      enabled: false
    }
  }
};

// Initialize clients
function getLLMClient(provider = null) {
  const useProvider = provider || llmConfigs.activeProvider;
  const config = llmConfigs.providers[useProvider];
  
  if (!config || !config.apiKey) {
    throw new Error(`${useProvider} not configured. Add API key in settings.`);
  }

  switch(useProvider) {
    case 'claude':
      return {
        client: new Anthropic({ apiKey: config.apiKey }),
        model: config.model,
        provider: 'claude'
      };
    case 'gemini':
      return {
        client: new GoogleGenerativeAI(config.apiKey),
        model: config.model,
        provider: 'gemini'
      };
    case 'openai':
      return {
        client: new OpenAI({ apiKey: config.apiKey }),
        model: config.model,
        provider: 'openai'
      };
    default:
      throw new Error(`Unknown provider: ${useProvider}`);
  }
}

// GEO Analysis Prompt
async function analyzeGeoContent(content, targetGeo, context = {}) {
  const { client, model, provider } = getLLMClient();
  
  const prompt = `
    You are a GEO (Geographic/International) content optimization expert for AEM.
    
    Analyze this content for ${targetGeo} market:
    
    CONTENT:
    ${JSON.stringify(content, null, 2)}
    
    CONTEXT:
    - Page Path: ${context.pagePath || 'unknown'}
    - Current Schema Type: ${context.schemaType || 'unknown'}
    - Target Country: ${targetGeo.country}
    - Target Language: ${targetGeo.language}
    - Local Regulations: ${targetGeo.regulations?.join(', ') || 'None specified'}
    
    PROVIDE ANALYSIS IN JSON FORMAT:
    {
      "geoIssues": [
        {
          "severity": "critical|warning|info",
          "type": "language|currency|date|address|regulation|schema",
          "field": "field.name",
          "currentValue": "as is",
          "issue": "description of problem",
          "suggestedFix": "recommended value",
          "confidence": 0.95
        }
      ],
      "score": 65,
      "summary": "Overall GEO readiness assessment"
    }
  `;

  try {
    let response;
    if (provider === 'claude') {
      const msg = await client.messages.create({
        model: model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      });
      response = msg.content[0].text;
    } 
    else if (provider === 'gemini') {
      const geminiModel = client.getGenerativeModel({ model: model });
      const result = await geminiModel.generateContent(prompt);
      response = result.response.text();
    }
    else if (provider === 'openai') {
      const completion = await client.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: prompt }]
      });
      response = completion.choices[0].message.content;
    }

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response;
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('LLM analysis failed:', error);
    throw new Error(`GEO analysis error: ${error.message}`);
  }
}

// Auto-fix content based on analysis
async function generateFixedContent(originalContent, geoIssues, targetGeo) {
  const { client, model, provider } = getLLMClient();
  
  const fixPrompt = `
    Generate corrected JSON-LD schema content based on these GEO issues:
    
    ORIGINAL CONTENT:
    ${JSON.stringify(originalContent, null, 2)}
    
    ISSUES TO FIX:
    ${JSON.stringify(geoIssues, null, 2)}
    
    TARGET MARKET: ${targetGeo.country} (${targetGeo.language})
    
    Return ONLY the corrected JSON-LD schema object, no additional text.
    Ensure all @context and @type fields remain intact.
  `;

  try {
    let response;
    if (provider === 'claude') {
      const msg = await client.messages.create({
        model: model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: fixPrompt }]
      });
      response = msg.content[0].text;
    }
    else if (provider === 'gemini') {
      const geminiModel = client.getGenerativeModel({ model: model });
      const result = await geminiModel.generateContent(fixPrompt);
      response = result.response.text();
    }
    else if (provider === 'openai') {
      const completion = await client.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: fixPrompt }]
      });
      response = completion.choices[0].message.content;
    }

    // Extract JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    throw new Error(`Content generation failed: ${error.message}`);
  }
}

// Batch analyze multiple pages
async function batchGeoAnalysis(pages, targetGeo, progressCallback) {
  const results = [];
  for (let i = 0; i < pages.length; i++) {
    try {
      const analysis = await analyzeGeoContent(pages[i].content, targetGeo, pages[i].context);
      results.push({
        pagePath: pages[i].path,
        ...analysis,
        fixed: false
      });
      if (progressCallback) progressCallback(i + 1, pages.length);
    } catch (error) {
      results.push({
        pagePath: pages[i].path,
        error: error.message,
        score: 0
      });
    }
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return results;
}

module.exports = {
  llmConfigs,
  getLLMClient,
  analyzeGeoContent,
  generateFixedContent,
  batchGeoAnalysis
};
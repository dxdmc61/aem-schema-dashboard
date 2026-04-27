// routes/llmConfig.js
const express = require('express');
const router = express.Router();
const { llmConfigs } = require('../middleware/llmClients');

// Get current LLM configuration
router.get('/config', (req, res) => {
  // Mask API keys
  const safeConfig = {
    activeProvider: llmConfigs.activeProvider,
    providers: {}
  };
  
  for (const [name, config] of Object.entries(llmConfigs.providers)) {
    safeConfig.providers[name] = {
      model: config.model,
      enabled: config.enabled,
      hasApiKey: !!config.apiKey,
      apiKeyPrefix: config.apiKey ? `${config.apiKey.substring(0, 8)}...` : null
    };
  }
  
  res.json({ success: true, config: safeConfig });
});

// Update LLM provider configuration
router.post('/config', (req, res) => {
  const { provider, apiKey, model, setActive } = req.body;
  
  if (!provider || !llmConfigs.providers[provider]) {
    return res.status(400).json({ error: 'Invalid provider' });
  }
  
  if (apiKey) {
    llmConfigs.providers[provider].apiKey = apiKey;
    llmConfigs.providers[provider].enabled = true;
  }
  
  if (model) {
    llmConfigs.providers[provider].model = model;
  }
  
  if (setActive) {
    llmConfigs.activeProvider = provider;
  }
  
  res.json({
    success: true,
    message: `${provider} configuration updated`,
    activeProvider: llmConfigs.activeProvider
  });
});

// Test LLM connection
router.post('/test', async (req, res) => {
  const { provider } = req.body;
  const { getLLMClient } = require('../middleware/llmClients');
  
  try {
    const { provider: activeProvider } = getLLMClient(provider);
    
    // Simple test prompt
    const testPrompt = "Respond with 'OK' if you receive this message.";
    
    let response;
    if (activeProvider === 'claude') {
      const { client, model } = getLLMClient(provider);
      const msg = await client.messages.create({
        model: model,
        max_tokens: 10,
        messages: [{ role: 'user', content: testPrompt }]
      });
      response = msg.content[0].text;
    }
    
    res.json({
      success: true,
      message: `Successfully connected to ${activeProvider}`,
      response: response?.substring(0, 100)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to connect: ${error.message}`
    });
  }
});

module.exports = router;
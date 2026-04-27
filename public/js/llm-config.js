// llm-config.js - All LLM Configuration functionality
let isAuthenticated = false;

// llm-config.js - Self-contained loading functions

let loadingOverlay = null;

function showLoading(message = 'Processing...') {
  // Remove existing overlay if any
  if (loadingOverlay) {
    loadingOverlay.remove();
  }
  
  loadingOverlay = document.createElement('div');
  loadingOverlay.id = 'llm-loading-overlay';
  loadingOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(8px);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 24px;
    font-family: 'Space Mono', monospace;
  `;
  
  loadingOverlay.innerHTML = `
    <div class="llm-spinner">
      <div class="llm-spinner-ring"></div>
      <div class="llm-spinner-ring-inner"></div>
    </div>
    <div class="llm-loading-message">${message}</div>
    <style>
      .llm-spinner {
        position: relative;
        width: 64px;
        height: 64px;
      }
      .llm-spinner-ring {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        border: 3px solid #2a2f3d;
        border-top-color: #5b6af7;
        animation: llm-spin 0.9s linear infinite;
      }
      .llm-spinner-ring-inner {
        position: absolute;
        inset: 8px;
        border-radius: 50%;
        border: 3px solid transparent;
        border-top-color: #38d9a9;
        animation: llm-spin 0.6s linear infinite reverse;
      }
      @keyframes llm-spin {
        to { transform: rotate(360deg); }
      }
      .llm-loading-message {
        color: #e8eaf0;
        font-size: 12px;
        letter-spacing: 2px;
        text-transform: uppercase;
      }
    </style>
  `;
  
  document.body.appendChild(loadingOverlay);
}

function hideLoading() {
  if (loadingOverlay) {
    loadingOverlay.remove();
    loadingOverlay = null;
  }
}

// Toast function for llm-config.js
function showToast(type, title, message) {
  // Check if toast zone exists, create if not
  let toastZone = document.getElementById('llm-toast-zone');
  if (!toastZone) {
    toastZone = document.createElement('div');
    toastZone.id = 'llm-toast-zone';
    toastZone.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 10001;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    document.body.appendChild(toastZone);
  }
  
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const colors = {
    success: '#38d9a9',
    error: '#ff6b6b',
    info: '#5b6af7',
    warning: '#ffd43b'
  };
  
  const toast = document.createElement('div');
  toast.style.cssText = `
    background: #111318;
    border: 1px solid #2a2f3d;
    border-left: 3px solid ${colors[type]};
    border-radius: 8px;
    padding: 12px 16px;
    min-width: 260px;
    max-width: 360px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    animation: llm-toast-slide 0.25s ease;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  `;
  
  toast.innerHTML = `
    <div style="font-size: 18px; color: ${colors[type]}">${icons[type]}</div>
    <div style="flex: 1;">
      <div style="font-size: 13px; font-weight: 600; color: #e8eaf0; margin-bottom: 4px;">${title}</div>
      ${message ? `<div style="font-size: 12px; color: #9099b2;">${message}</div>` : ''}
    </div>
  `;
  
  toastZone.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Add animation keyframes
const style = document.createElement('style');
style.textContent = `
  @keyframes llm-toast-slide {
    from {
      opacity: 0;
      transform: translateX(40px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
`;
document.head.appendChild(style);



// Check authentication status first
async function checkAuth() {
    try {
      const response = await fetch('/api/auth/me');
      const data = await response.json();
      isAuthenticated = data.loggedIn;
      
      if (!isAuthenticated) {
        console.warn('Not authenticated - redirecting to login');
        window.location.href = '/login.html';
        return false;
      }
      return true;
    } catch (err) {
      console.error('Auth check failed:', err);
      return false;
    }
  }

// Initialize LLM Config
function initLlmConfig() {
    console.log('LLM Config component initializing...');
    
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      loadLLMConfig();
    }, 100);
  }
  
  // Load current LLM configuration from server
async function loadLLMConfig() {
    console.log('Loading LLM configuration...');
    
    // First check if we're authenticated
    const authenticated = await checkAuth();
    if (!authenticated) {
      showErrorInUI('Please login first');
      return;
    }
    
    try {
      const response = await fetch('/api/llm/config');
      
      // Check if response is JSON or HTML
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        // We got HTML instead of JSON - likely not authenticated or wrong route
        console.error('Received HTML instead of JSON. Check if user is logged in.');
        showErrorInUI('Authentication required. Please refresh and login again.');
        
        // Try to refresh auth
        const authCheck = await fetch('/api/auth/me');
        const authData = await authCheck.json();
        if (!authData.loggedIn) {
          window.location.href = '/login.html';
        }
        return;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('LLM config loaded:', data);
      
      if (data.success && data.config) {
        updateUIWithConfig(data.config);
      } else {
        console.error('Invalid config response:', data);
        showErrorInUI(data.error || 'Failed to load configuration');
      }
    } catch (err) {
      console.error('Failed to load LLM config:', err);
      showErrorInUI(`Error loading config: ${err.message}`);
    }
  }
  function updateUIWithConfig(config) {
    // Set active provider dropdown
    const activeProviderSelect = document.getElementById('llm-active-provider');
    if (activeProviderSelect) {
      activeProviderSelect.value = config.activeProvider;
    }
    
    // Show/hide provider cards
    showProviderCard(config.activeProvider);
    
    // Update status dots for each provider
    for (const [provider, providerConfig] of Object.entries(config.providers)) {
      updateProviderStatus(provider, providerConfig.hasApiKey);
      
      // Pre-fill model selection if saved
      const modelSelect = document.getElementById(`${provider}-model`);
      if (modelSelect && providerConfig.model) {
        const optionExists = Array.from(modelSelect.options).some(opt => opt.value === providerConfig.model);
        if (optionExists) {
          modelSelect.value = providerConfig.model;
        }
      }
    }
    
    // Update status display
    updateStatusDisplay(config);
    
    // Update active LLM display in GEO Analyzer if it exists
    const activeLlmDisplay = document.getElementById('active-llm-display');
    if (activeLlmDisplay) {
      activeLlmDisplay.innerHTML = `
        <strong>Active:</strong> ${config.activeProvider.toUpperCase()} 
        ${config.providers[config.activeProvider]?.model || ''}
        <span style="color:${config.providers[config.activeProvider]?.hasApiKey ? 'var(--accent2)' : 'var(--error)'}">
          ${config.providers[config.activeProvider]?.hasApiKey ? '✓ Configured' : '⚠️ Not Configured'}
        </span>
      `;
    }
  }
  
  // Update provider status dot
  function updateProviderStatus(provider, hasApiKey) {
    const statusDot = document.getElementById(`${provider}-status`);
    if (statusDot) {
      statusDot.className = hasApiKey ? 'status-dot online' : 'status-dot offline';
      statusDot.title = hasApiKey ? 'Configured' : 'Not configured';
    }
  }
  
  // Update status display in UI
  function updateStatusDisplay(config) {
    const statusDiv = document.getElementById('llm-status-display');
    if (!statusDiv) return;
    
    const activeProvider = config.activeProvider;
    const activeConfig = config.providers[activeProvider];
    
    statusDiv.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:4px">
        <div>🔹 <strong>Active Provider:</strong> ${activeProvider.toUpperCase()}</div>
        <div>🔹 <strong>Model:</strong> ${activeConfig?.model || 'Not set'}</div>
        <div>🔹 <strong>Status:</strong> 
          <span style="color:${activeConfig?.hasApiKey ? 'var(--accent2)' : 'var(--error)'}">
            ${activeConfig?.hasApiKey ? '✓ Ready for GEO analysis' : '⚠️ API key required'}
          </span>
        </div>
      </div>
    `;
  }
  
  // Show error in UI
  function showErrorInUI(message) {
    const statusDiv = document.getElementById('llm-status-display');
    if (statusDiv) {
      statusDiv.innerHTML = `<div style="color:var(--error)">⚠️ ${message}</div>`;
    }
    toast('error', 'Configuration Error', message);
  }
  
  // Show/hide provider cards
  function showProviderCard(provider) {
    const cards = document.querySelectorAll('.llm-provider-card');
    cards.forEach(card => {
      card.style.display = 'none';
    });
    
    const activeCard = document.getElementById(`${provider}-config`);
    if (activeCard) {
      activeCard.style.display = 'block';
    }
  }
  
  // Change active provider
  async function changeActiveProvider() {
    const provider = document.getElementById('llm-active-provider')?.value;
    if (!provider) return;
    
    console.log(`Changing active provider to: ${provider}`);
    showProviderCard(provider);
    
    // Optionally save the active provider preference
    try {
      const response = await fetch('/api/llm/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          provider, 
          setActive: true,
          // Don't send API key here, just set as active
          apiKey: undefined 
        })
      });
      
      const data = await response.json();
      if (data.success) {
        toast('success', 'Provider Changed', `${provider} is now active`);
        loadLLMConfig(); // Reload to update status
      }
    } catch (err) {
      console.error('Failed to change active provider:', err);
      toast('error', 'Error', 'Failed to change active provider');
    }
  }
  
  // Save LLM configuration
  async function saveLLMConfig(provider) {
    const apiKeyInput = document.getElementById(`${provider}-api-key`);
    const apiKey = apiKeyInput?.value.trim();
    const modelSelect = document.getElementById(`${provider}-model`);
    const model = modelSelect?.value;
    const setActive = document.getElementById('llm-active-provider')?.value === provider;
    
    if (!apiKey && !model) {
      toast('error', 'No Changes', 'Enter API key or select model to save');
      return;
    }
    
    // Validate API key format
    if (apiKey) {
      if (provider === 'claude' && !apiKey.startsWith('sk-ant-')) {
        toast('error', 'Invalid API Key', 'Claude API key should start with "sk-ant-"');
        return;
      }
      if (provider === 'gemini' && !apiKey.startsWith('AIza')) {
        toast('error', 'Invalid API Key', 'Gemini API key should start with "AIza"');
        return;
      }
      if (provider === 'openai' && !apiKey.startsWith('sk-')) {
        toast('error', 'Invalid API Key', 'OpenAI API key should start with "sk-"');
        return;
      }
    }
    
    showLoading(`Saving ${provider} configuration...`);
    
    try {
      const response = await fetch('/api/llm/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, model, setActive })
      });
      
      const data = await response.json();
      hideLoading();
      
      if (data.success) {
        toast('success', 'Configuration Saved', `${provider} configuration updated`);
        
        // Clear API key field for security
        if (apiKeyInput) apiKeyInput.value = '';
        
        // Reload config to update status
        await loadLLMConfig();
      } else {
        toast('error', 'Save Failed', data.error || 'Unknown error');
      }
    } catch (err) {
      hideLoading();
      console.error('Save error:', err);
      toast('error', 'Error', err.message);
    }
  }
  
  // Test LLM connection
  async function testLLMConnection(provider) {
    const apiKeyInput = document.getElementById(`${provider}-api-key`);
    const apiKey = apiKeyInput?.value.trim();
    
    if (!apiKey) {
      toast('error', 'API Key Required', `Please enter your ${provider} API key first`);
      return;
    }
    
    showLoading(`Testing connection to ${provider}...`);
    
    try {
      // First save the config temporarily
      const modelSelect = document.getElementById(`${provider}-model`);
      const model = modelSelect?.value;
      
      const saveResponse = await fetch('/api/llm/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, model, setActive: true })
      });
      
      const saveData = await saveResponse.json();
      if (!saveData.success) {
        hideLoading();
        toast('error', 'Save Failed', saveData.error);
        return;
      }
      
      // Now test the connection
      const testResponse = await fetch('/api/llm/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
      });
      
      const testData = await testResponse.json();
      hideLoading();
      
      // Show results
      const resultsCard = document.getElementById('test-results-card');
      const resultsContent = document.getElementById('test-results-content');
      
      if (resultsCard && resultsContent) {
        if (testData.success) {
          resultsContent.innerHTML = `
            <div style="color:var(--accent2)">
              <strong>✓ Connection successful!</strong><br><br>
              Provider: ${provider}<br>
              Response: ${testData.response || 'OK'}<br><br>
              <span style="font-size:12px; color:var(--text3)">You can now use GEO analysis features.</span>
            </div>
          `;
          resultsCard.style.display = 'block';
          toast('success', 'Connection Test', `${provider} is working correctly`);
        } else {
          resultsContent.innerHTML = `
            <div style="color:var(--error)">
              <strong>✗ Connection failed</strong><br><br>
              ${testData.error || 'Unknown error'}<br><br>
              <span style="font-size:12px">Please check your API key and try again.</span>
            </div>
          `;
          resultsCard.style.display = 'block';
          toast('error', 'Connection Failed', testData.error);
        }
      }
      
      // Reload config to update status
      await loadLLMConfig();
      
    } catch (err) {
      hideLoading();
      console.error('Test error:', err);
      toast('error', 'Test Error', err.message);
    }
  }
  
  // Close test results card
  function closeTestResults() {
    const card = document.getElementById('test-results-card');
    if (card) card.style.display = 'none';
  }
  
  // Auto-initialize when script loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLlmConfig);
  } else {
    initLlmConfig();
  }
  
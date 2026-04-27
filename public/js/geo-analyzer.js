// geo-analyzer.js - All GEO Analyzer functionality
let currentGeoAnalysis = null;
let currentFixedSchema = null;

// Initialize GEO Analyzer
function initGeoAnalyzer() {
  console.log('GEO Analyzer initialized');
  
  // Load GEO rules for default country
  const countrySelect = document.getElementById('geo-target-country');
  if (countrySelect) {
    countrySelect.addEventListener('change', loadGeoRules);
    loadGeoRules(); // Load initial rules
  }
  
  // Load active LLM provider info
  loadActiveLLMProvider();
}

// Load GEO rules for selected country
async function loadGeoRules() {
  const country = document.getElementById('geo-target-country')?.value;
  if (!country) return;
  
  try {
    const response = await fetch(`/api/geo/rules/${country}`);
    const data = await response.json();
    if (data.success) {
      const rulesHtml = `
        <div style="font-family:var(--mono); font-size:12px">
          <div style="margin-bottom:12px"><strong style="color:var(--accent)">Country:</strong> ${data.country}</div>
          <div style="margin-bottom:8px"><strong>Language:</strong> ${data.rules.language}</div>
          <div style="margin-bottom:8px"><strong>Currency:</strong> ${data.rules.currency}</div>
          <div style="margin-bottom:8px"><strong>Date Format:</strong> ${data.rules.dateFormat}</div>
          <div style="margin-bottom:8px"><strong>Address Format:</strong> ${data.rules.addressFormat}</div>
          <div><strong>Regulations:</strong> ${data.rules.regulations.join(', ')}</div>
        </div>
      `;
      const rulesDisplay = document.getElementById('geo-rules-display');
      if (rulesDisplay) rulesDisplay.innerHTML = rulesHtml;
    }
  } catch (err) {
    console.error('Failed to load GEO rules:', err);
  }
}

// Load active LLM provider info
async function loadActiveLLMProvider() {
  try {
    const response = await fetch('/api/llm/config');
    const data = await response.json();
    if (data.success) {
      const config = data.config;
      const display = document.getElementById('active-llm-display');
      if (display) {
        display.innerHTML = `
          <strong>Active:</strong> ${config.activeProvider.toUpperCase()} 
          ${config.providers[config.activeProvider]?.model || ''}
          <span style="color:${config.providers[config.activeProvider]?.hasApiKey ? 'var(--accent2)' : 'var(--error)'}">
            ${config.providers[config.activeProvider]?.hasApiKey ? '✓ Configured' : '⚠️ Not Configured'}
          </span>
        `;
      }
    }
  } catch (err) {
    console.error('Failed to load LLM config:', err);
  }
}

// Fetch current page path from AEM (if you have a mechanism to get current page)
async function fetchCurrentPagePath() {
  // This could integrate with AEM context path or session storage
  const lastPath = sessionStorage.getItem('lastAnalyzedPath');
  if (lastPath) {
    document.getElementById('geo-page-path').value = lastPath;
    toast('info', 'Path Loaded', lastPath);
  } else {
    toast('info', 'No Recent Page', 'Enter path manually or browse to a page first');
  }
}

// Run single page GEO analysis
async function runGeoAnalysis() {
  const pagePath = document.getElementById('geo-page-path')?.value.trim();
  const targetCountry = document.getElementById('geo-target-country')?.value;
  
  if (!pagePath) {
    toast('error', 'Missing Path', 'Please enter an AEM page path');
    return;
  }
  
  // Store for later use
  sessionStorage.setItem('lastAnalyzedPath', pagePath);
  
  showLoading('Analyzing content with LLM...');
  
  try {
    const response = await fetch('/api/geo/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagePath, targetCountry })
    });
    
    const data = await response.json();
    hideLoading();
    
    if (!data.success) {
      toast('error', 'Analysis Failed', data.error);
      return;
    }
    
    currentGeoAnalysis = data.analysis;
    displayGeoResults(data.analysis);
    
    // Update score badge
    const scoreBadge = document.getElementById('geo-score-badge');
    if (scoreBadge) {
      scoreBadge.style.display = 'block';
      const score = data.analysis.score || 0;
      const badgeClass = score >= 70 ? 'badge-success' : (score >= 50 ? 'badge-warning' : 'badge-error');
      scoreBadge.innerHTML = `<span class="${badgeClass}" style="padding:5px 12px">GEO Score: ${score}</span>`;
    }
    
    toast('success', 'Analysis Complete', `GEO Score: ${data.analysis.score || 0}/100`);
    
  } catch (err) {
    hideLoading();
    toast('error', 'Analysis Error', err.message);
  }
}

// Display GEO results
function displayGeoResults(analysis) {
  const container = document.getElementById('geo-analysis-results');
  if (!container) return;
  
  const issues = analysis.geoIssues || [];
  
  if (issues.length === 0) {
    container.innerHTML = `
      <div class="alert alert-success">
        <span>✓</span>
        <div>No GEO issues found! Content is optimized for this market.</div>
      </div>
      <div style="margin-top:16px; text-align:center; color:var(--accent2)">
        <strong>GEO Score: ${analysis.score}/100</strong>
        <div style="margin-top:8px; font-size:12px; color:var(--text3)">${analysis.summary || 'Perfectly optimized!'}</div>
      </div>
    `;
    const fixActions = document.getElementById('geo-fix-actions');
    if (fixActions) fixActions.style.display = 'none';
    return;
  }
  
  // Group issues by severity
  const critical = issues.filter(i => i.severity === 'critical');
  const warnings = issues.filter(i => i.severity === 'warning');
  const info = issues.filter(i => i.severity === 'info');
  
  let html = `
    <div style="margin-bottom:16px">
      <div class="stat-card" style="padding:12px; margin-bottom:12px">
        <div style="font-size:12px; color:var(--text3)">Overall Assessment</div>
        <div style="font-size:14px; margin-top:8px">${analysis.summary || 'Review issues below'}</div>
        <div style="margin-top:12px">
          <div style="display:flex; gap:16px; justify-content:space-around">
            <div><span style="color:var(--error)">●</span> Critical: ${critical.length}</div>
            <div><span style="color:var(--warning)">●</span> Warnings: ${warnings.length}</div>
            <div><span style="color:var(--text3)">●</span> Info: ${info.length}</div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  if (critical.length > 0) {
    html += `<div style="margin-bottom:20px"><strong style="color:var(--error)">🔴 Critical Issues (${critical.length})</strong>`;
    critical.forEach(issue => {
      html += `
        <div class="alert alert-error" style="margin-top:8px">
          <div><strong>${issue.type}</strong> — ${issue.field}</div>
          <div style="font-size:12px; margin-top:4px">Current: ${escapeHtml(issue.currentValue)}</div>
          <div style="font-size:12px; color:var(--accent2)">Suggested: ${escapeHtml(issue.suggestedFix)}</div>
          <div style="font-size:11px; margin-top:4px; color:var(--text3)">${issue.issue}</div>
          <div style="font-size:10px; margin-top:4px">Confidence: ${Math.round(issue.confidence * 100)}%</div>
        </div>
      `;
    });
    html += `</div>`;
  }
  
  if (warnings.length > 0) {
    html += `<div style="margin-bottom:20px"><strong style="color:var(--warning)">⚠️ Warnings (${warnings.length})</strong>`;
    warnings.forEach(issue => {
      html += `
        <div class="alert alert-info" style="margin-top:8px; border-left-color:var(--warning)">
          <div><strong>${issue.type}</strong> — ${issue.field}</div>
          <div style="font-size:12px; margin-top:4px">Current: ${escapeHtml(issue.currentValue)}</div>
          <div style="font-size:12px; color:var(--accent2)">Suggested: ${escapeHtml(issue.suggestedFix)}</div>
        </div>
      `;
    });
    html += `</div>`;
  }
  
  if (info.length > 0) {
    html += `<div><strong style="color:var(--text2)">ℹ️ Suggestions (${info.length})</strong>`;
    info.forEach(issue => {
      html += `
        <div style="background:var(--surface2); padding:10px; margin-top:6px; border-radius:6px">
          <strong>${issue.type}</strong>: ${escapeHtml(issue.suggestedFix)}
        </div>
      `;
    });
    html += `</div>`;
  }
  
  container.innerHTML = html;
  const fixActions = document.getElementById('geo-fix-actions');
  if (fixActions) fixActions.style.display = 'block';
}

// Run batch GEO analysis
async function runBatchGeoAnalysis() {
  const pagesText = document.getElementById('batch-pages-list')?.value;
  const targetCountry = document.getElementById('geo-target-country')?.value;
  
  if (!pagesText) {
    toast('error', 'Missing Pages', 'Enter page paths (one per line)');
    return;
  }
  
  const pages = pagesText.split('\n').filter(p => p.trim().length > 0);
  
  if (pages.length === 0) {
    toast('error', 'Invalid Input', 'No valid page paths found');
    return;
  }
  
  const progressDiv = document.getElementById('batch-progress');
  const progressFill = document.getElementById('batch-progress-fill');
  const statusDiv = document.getElementById('batch-status');
  
  if (progressDiv) progressDiv.style.display = 'block';
  
  const results = [];
  
  for (let i = 0; i < pages.length; i++) {
    const pagePath = pages[i].trim();
    if (progressFill) progressFill.style.width = `${((i + 1) / pages.length) * 100}%`;
    if (statusDiv) statusDiv.textContent = `Analyzing ${i + 1}/${pages.length}: ${pagePath}`;
    
    try {
      const response = await fetch('/api/geo/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagePath, targetCountry })
      });
      
      const data = await response.json();
      results.push({
        pagePath,
        success: data.success,
        score: data.success ? data.analysis.score : 0,
        issuesCount: data.success ? (data.analysis.geoIssues?.length || 0) : 0,
        error: data.success ? null : data.error
      });
    } catch (err) {
      results.push({
        pagePath,
        success: false,
        score: 0,
        issuesCount: 0,
        error: err.message
      });
    }
  }
  
  if (progressDiv) progressDiv.style.display = 'none';
  
  // Display batch results
  displayBatchResults(results);
}

// Display batch analysis results
function displayBatchResults(results) {
  const container = document.getElementById('batch-results-content');
  const card = document.getElementById('batch-results-card');
  
  if (!container || !card) return;
  
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const successCount = results.filter(r => r.success).length;
  
  card.style.display = 'block';
  container.innerHTML = `
    <div style="margin-bottom:16px">
      <div class="grid-3" style="margin-bottom:16px">
        <div><strong>Total Pages:</strong> ${results.length}</div>
        <div><strong>Avg Score:</strong> ${avgScore.toFixed(1)}/100</div>
        <div><strong>Success Rate:</strong> ${successCount}/${results.length}</div>
      </div>
    </div>
    <table class="log-table">
      <thead><tr><th>Page Path</th><th>Score</th><th>Issues</th><th>Status</th></tr></thead>
      <tbody>
        ${results.map(r => `
          <tr>
            <td class="path">${r.pagePath}</td>
            <td>${r.score}</td>
            <td>${r.issuesCount}</td>
            <td>${r.success ? '<span class="badge-success">✓</span>' : '<span class="badge-error">✕</span>'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// Apply auto-fix
async function applyGeoFix() {
  if (!currentGeoAnalysis) {
    toast('error', 'No Analysis', 'Please run analysis first');
    return;
  }
  
  const pagePath = document.getElementById('geo-page-path')?.value.trim();
  const targetCountry = document.getElementById('geo-target-country')?.value;
  
  showLoading('Generating fixed content with LLM...');
  
  try {
    const response = await fetch('/api/geo/fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pagePath,
        analysis: currentGeoAnalysis,
        targetCountry,
        autoApply: true
      })
    });
    
    const data = await response.json();
    hideLoading();
    
    if (data.success) {
      toast('success', 'Fix Applied!', `Updated ${data.changes.length} fields in AEM`);
      // Refresh analysis to show new score
      setTimeout(() => runGeoAnalysis(), 1500);
    } else {
      toast('error', 'Fix Failed', data.error);
    }
  } catch (err) {
    hideLoading();
    toast('error', 'Fix Error', err.message);
  }
}

// Preview fixed content
async function previewFixedContent() {
  if (!currentGeoAnalysis) {
    toast('error', 'No Analysis', 'Please run analysis first');
    return;
  }
  
  const pagePath = document.getElementById('geo-page-path')?.value.trim();
  const targetCountry = document.getElementById('geo-target-country')?.value;
  
  showLoading('Generating preview...');
  
  try {
    const response = await fetch('/api/geo/fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pagePath,
        analysis: currentGeoAnalysis,
        targetCountry,
        autoApply: false
      })
    });
    
    const data = await response.json();
    hideLoading();
    
    if (data.success) {
      currentFixedSchema = data.fixedSchema;
      const previewContent = document.getElementById('preview-content');
      if (previewContent) {
        previewContent.value = JSON.stringify(data.fixedSchema, null, 2);
      }
      const modal = document.getElementById('preview-modal');
      if (modal) modal.style.display = 'flex';
    } else {
      toast('error', 'Preview Failed', data.error);
    }
  } catch (err) {
    hideLoading();
    toast('error', 'Preview Error', err.message);
  }
}

// Copy preview content
function copyPreviewContent() {
  const content = document.getElementById('preview-content')?.value;
  if (content) {
    navigator.clipboard.writeText(content);
    toast('success', 'Copied!', 'JSON-LD schema copied to clipboard');
  }
}

// Apply preview fix to AEM
async function applyPreviewFix() {
  if (!currentFixedSchema) return;
  
  const pagePath = document.getElementById('geo-page-path')?.value.trim();
  
  try {
    const response = await fetch('/api/schema/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagePath, schema: currentFixedSchema })
    });
    
    const data = await response.json();
    if (data.success) {
      toast('success', 'Applied to AEM', 'Schema updated successfully');
      closePreviewModal();
      setTimeout(() => runGeoAnalysis(), 1000);
    } else {
      toast('error', 'Apply Failed', data.error);
    }
  } catch (err) {
    toast('error', 'Error', err.message);
  }
}

function closePreviewModal() {
  const modal = document.getElementById('preview-modal');
  if (modal) modal.style.display = 'none';
}

function clearGeoAnalysis() {
  const container = document.getElementById('geo-analysis-results');
  if (container) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🌍</div><div class="empty-msg">Run analysis to see GEO compliance issues</div></div>';
  }
  const fixActions = document.getElementById('geo-fix-actions');
  if (fixActions) fixActions.style.display = 'none';
  const scoreBadge = document.getElementById('geo-score-badge');
  if (scoreBadge) scoreBadge.style.display = 'none';
  currentGeoAnalysis = null;
}

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Auto-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGeoAnalyzer);
} else {
  initGeoAnalyzer();
}
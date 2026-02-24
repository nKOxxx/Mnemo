#!/usr/bin/env node

/**
 * OpenClaw Mnemo Integration
 * Auto-installs and configures Mnemo for OpenClaw
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OPENCLAW_DIR = process.env.OPENCLAW_WORKSPACE || path.join(require('os').homedir(), '.openclaw/workspace');
const MEMORY_DIR = path.join(OPENCLAW_DIR, '.mnemo');

function main() {
  console.log('🧠 Mnemo - OpenClaw Integration\n');
  
  // Check if already installed
  if (fs.existsSync(MEMORY_DIR)) {
    console.log('✅ Mnemo already installed');
    console.log(`   Location: ${MEMORY_DIR}`);
    return;
  }
  
  // Create directory
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  
  // Create default config
  const config = {
    storage: 'sqlite',
    path: path.join(MEMORY_DIR, 'memory.db'),
    agentId: 'OpenClaw',
    version: '1.0.0'
  };
  
  fs.writeFileSync(
    path.join(MEMORY_DIR, 'config.json'),
    JSON.stringify(config, null, 2)
  );
  
  // Create wrapper module
  const wrapperCode = `// Mnemo OpenClaw Integration
const Mnemo = require('mnemo');
const path = require('path');

const configPath = path.join(__dirname, 'config.json');
const config = require(configPath);

// Initialize memory
const memory = new Mnemo(config);

// Enhanced store with OpenClaw defaults
async function store(content, options = {}) {
  const sanitized = content.slice(0, 5000).trim();
  return memory.store(sanitized, {
    agentId: 'OpenClaw',
    source: 'openclaw-chat',
    ...options
  });
}

// Enhanced query with OpenClaw defaults
async function query(queryString, options = {}) {
  return memory.query(queryString, {
    agentId: 'OpenClaw',
    limit: 5,
    days: 30,
    ...options
  });
}

// Get session context
async function getSessionContext() {
  const [recent, preferences, goals] = await Promise.all([
    query('recent work', { limit: 3, days: 7 }),
    query('preference', { limit: 5 }),
    query('goal', { minImportance: 8, limit: 3 })
  ]);
  
  return {
    recentMemories: recent,
    preferences: preferences,
    goals: goals,
    hasContext: recent.length > 0 || preferences.length > 0
  };
}

// Auto-store important messages
async function autoStore(userMessage, agentResponse) {
  const importance = calculateImportance(userMessage, agentResponse);
  
  if (importance >= 6) {
    await store(userMessage, {
      type: importance >= 8 ? 'insight' : 'conversation',
      importance
    });
    
    // Extract and store decisions
    if (userMessage.includes('decide') || userMessage.includes('build') || userMessage.includes('create')) {
      await store(\`Decision: \${userMessage}\`, {
        type: 'decision',
        importance: 9
      });
    }
  }
}

function calculateImportance(userMsg, agentResp) {
  let score = 5;
  
  // Length indicators
  if (userMsg.length > 100) score += 1;
  if (userMsg.length > 300) score += 1;
  
  // Keyword indicators
  const highValueWords = ['decide', 'build', 'create', 'launch', 'important', 'critical', 'goal', 'prefer'];
  const matches = highValueWords.filter(w => 
    userMsg.toLowerCase().includes(w)
  ).length;
  score += Math.min(3, matches);
  
  // Security/critical
  if (userMsg.toLowerCase().includes('security') || 
      userMsg.toLowerCase().includes('password') ||
      userMsg.toLowerCase().includes('api key')) {
    score += 3;
  }
  
  return Math.min(10, score);
}

module.exports = {
  memory,
  store,
  query,
  getSessionContext,
  autoStore
};
`;
  
  fs.writeFileSync(path.join(MEMORY_DIR, 'openclaw-wrapper.js'), wrapperCode);
  
  // Create usage example
  const exampleCode = `// Example: Using Mnemo in OpenClaw
const { store, query, getSessionContext, autoStore } = require('./.mnemo/openclaw-wrapper');

// Store a memory
await store('User wants to build 3 products this quarter', {
  type: 'goal',
  importance: 9
});

// Query memories
const results = await query('what user wants to build');
console.log(results[0].content);

// Get full session context
const context = await getSessionContext();
if (context.hasContext) {
  console.log('Recent:', context.recentMemories.map(m => m.content));
  console.log('Preferences:', context.preferences.map(m => m.content));
  console.log('Goals:', context.goals.map(m => m.content));
}

// Auto-store from conversation
await autoStore(userMessage, agentResponse);
`;
  
  fs.writeFileSync(path.join(MEMORY_DIR, 'example.js'), exampleCode);
  
  console.log('✅ Mnemo installed for OpenClaw');
  console.log(`   Config: ${MEMORY_DIR}/config.json`);
  console.log(`   Database: ${config.path}`);
  console.log(`   Wrapper: ${MEMORY_DIR}/openclaw-wrapper.js`);
  console.log('\nNext steps:');
  console.log('  1. Install mnemo: npm install mnemo');
  console.log('  2. Require in your code: require("./.mnemo/openclaw-wrapper")');
  console.log('  3. See example: cat .mnemo/example.js');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
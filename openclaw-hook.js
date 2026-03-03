#!/usr/bin/env node
/**
 * OpenClaw Mnemo Hook
 * Auto-routes memories by project, loads context at session start
 * 
 * Place in: ~/.openclaw/hooks/mnemo-hook.js
 * Or load via OpenClaw config
 */

const http = require('http');

const MNEMO_URL = 'http://localhost:10000';

class MnemoHook {
  constructor() {
    this.currentProject = 'general';
    this.agentId = 'ares';
    this.enabled = true;
  }

  // Check if Mnemo is running
  async healthCheck() {
    return new Promise((resolve) => {
      http.get(`${MNEMO_URL}/api/health`, (res) => {
        resolve(res.statusCode === 200);
      }).on('error', () => {
        resolve(false);
      });
    });
  }

  // Detect project from message
  detectProject(text) {
    const textLower = text.toLowerCase();
    
    // Project patterns
    const patterns = [
      { regex: /(?:project|proj)\s*:?\s*(\w+)/i, group: 1 },
      { regex: /(?:work on|working on)\s+(\w+)/i, group: 1 },
      { regex: /\b(2ndcto|agentvault|memorybridge|agentdiplomacy|agentmolt|gulf.watch|gulfwatch)\b/i, group: 1 },
      { regex: /(?:for|about)\s+(?:the\s+)?(\w+)\s+(?:project|app|product)/i, group: 1 },
    ];

    for (const { regex, group } of patterns) {
      const match = textLower.match(regex);
      if (match) {
        let project = match[group].toLowerCase();
        // Normalize
        if (['gulfwatch', 'gulf-watch', 'gulf_watch', 'gulf'].includes(project)) {
          project = 'gulfwatch';
        }
        if (['2ndcto', '2nd_cto'].includes(project)) {
          project = '2ndcto';
        }
        return project;
      }
    }
    
    return null;
  }

  // Store memory
  async store(content, type = 'insight', importance = 5, project = null) {
    const targetProject = project || this.currentProject;
    
    return new Promise((resolve) => {
      const data = JSON.stringify({
        content,
        type,
        importance,
        project: targetProject,
        agentId: this.agentId,
        metadata: { auto_stored: true }
      });

      const options = {
        hostname: 'localhost',
        port: 10000,
        path: '/api/memory/store',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };

      const req = http.request(options, (res) => {
        resolve(res.statusCode === 200);
      });

      req.on('error', () => resolve(false));
      req.write(data);
      req.end();
    });
  }

  // Query memories
  async query(queryText, project = null, limit = 5, days = 30) {
    const targetProject = project || this.currentProject;
    
    return new Promise((resolve) => {
      const url = `${MNEMO_URL}/api/memory/query?q=${encodeURIComponent(queryText)}&project=${targetProject}&limit=${limit}&days=${days}`;
      
      http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.memories || []);
          } catch {
            resolve([]);
          }
        });
      }).on('error', () => resolve([]));
    });
  }

  // Load session context
  async loadContext(project = null) {
    const targetProject = project || this.currentProject;
    
    const [recent, important, prefs] = await Promise.all([
      this.query('recent work progress', targetProject, 5, 7),
      this.query('goals priorities decisions', targetProject, 3, 30),
      this.query('preferences likes dislikes style', 'general', 5, 365)
    ]);

    return { project: targetProject, recent, important, prefs };
  }

  // Check if message is memory-worthy
  isMemoryWorthy(text) {
    const textLower = text.toLowerCase();
    
    const indicators = [
      /\b(decided|decision|choose|chose)\b/,
      /\b(prefer|preference|like|dislike|want|need)\b/,
      /\b(goal|target|objective|aim)\b/,
      /\b(important|critical|priority|crucial)\b/,
      /\b(completed|done|finished|shipped|released)\b/,
      /\b(remember|don't forget|note that)\b/,
      /\b(issue|bug|problem|error|fix)\b/,
      /\b(success|achievement|milestone|launch)\b/,
    ];

    return indicators.some(pattern => pattern.test(textLower));
  }

  // Detect memory type
  detectType(text) {
    const textLower = text.toLowerCase();
    
    if (/\b(security|secure|encrypt|password|key|credential)\b/.test(textLower)) return 'security';
    if (/\b(prefer|like|dislike|style|format)\b/.test(textLower)) return 'preference';
    if (/\b(goal|target|objective)\b/.test(textLower)) return 'goal';
    if (/\b(completed|shipped|released|launched|milestone)\b/.test(textLower)) return 'milestone';
    if (/\b(decided|decision|choose)\b/.test(textLower)) return 'decision';
    if (/\b(error|bug|issue|problem|fail)\b/.test(textLower)) return 'error';
    
    return 'insight';
  }

  // Calculate importance
  calculateImportance(text) {
    let score = 5;
    const textLower = text.toLowerCase();
    
    const critical = ['critical', 'urgent', 'important', 'security', 'password', 'api key'];
    critical.forEach(kw => { if (textLower.includes(kw)) score += 2; });
    
    if (/\b(decided|decision|choose)\b/.test(textLower)) score += 1;
    if (/\b(completed|shipped|released)\b/.test(textLower)) score += 1;
    if (/\b(very important|critical|crucial)\b/.test(textLower)) score += 2;
    
    return Math.min(score, 10);
  }

  // Auto-store memory
  async autoStore(text) {
    if (!this.isMemoryWorthy(text)) return false;
    
    const type = this.detectType(text);
    const importance = this.calculateImportance(text);
    
    return await this.store(text, type, importance);
  }

  // Process incoming message
  async onMessage(text) {
    if (!this.enabled) return null;
    
    // Check if Mnemo is running
    const isHealthy = await this.healthCheck();
    if (!isHealthy) return null;

    // Detect project switch
    const detectedProject = this.detectProject(text);
    if (detectedProject && detectedProject !== this.currentProject) {
      this.currentProject = detectedProject;
      
      // Load context for new project
      const context = await this.loadContext();
      
      // Format context message
      let contextMsg = `[Switched to project: ${detectedProject}]\n`;
      
      if (context.recent.length > 0) {
        contextMsg += '\n📋 Recent:\n';
        context.recent.slice(0, 3).forEach(m => {
          contextMsg += `- ${m.content.substring(0, 80)}...\n`;
        });
      }
      
      if (context.important.length > 0) {
        contextMsg += '\n🎯 Key items:\n';
        context.important.forEach(m => {
          contextMsg += `- ${m.content.substring(0, 80)}...\n`;
        });
      }
      
      return contextMsg;
    }

    // Auto-store if memory-worthy
    await this.autoStore(text);
    
    return null;
  }

  // Get relevant memories for response
  async getContext(query) {
    if (!this.enabled) return '';
    
    const relevant = await this.query(query, this.currentProject, 3);
    const prefs = this.currentProject !== 'general' 
      ? await this.query(query, 'general', 2)
      : [];
    
    const all = [...relevant, ...prefs];
    if (all.length === 0) return '';
    
    return all.map(m => m.content.substring(0, 100)).join('\n');
  }
}

// Export for OpenClaw
module.exports = MnemoHook;

// If running directly, test
if (require.main === module) {
  const hook = new MnemoHook();
  
  // Test detection
  console.log('Testing project detection...');
  console.log('"Work on Gulf Watch":', hook.detectProject('Work on Gulf Watch'));
  console.log('"Project AgentVault bug":', hook.detectProject('Project AgentVault bug'));
  console.log('"2ndCTO milestone":', hook.detectProject('2ndCTO milestone'));
  
  // Test memory-worthiness
  console.log('\nTesting memory detection...');
  console.log('"I decided to use React":', hook.isMemoryWorthy('I decided to use React'));
  console.log('"Hello":', hook.isMemoryWorthy('Hello'));
  console.log('"Important: API key changed":', hook.isMemoryWorthy('Important: API key changed'));
}

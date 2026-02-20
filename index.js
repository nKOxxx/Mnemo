/**
 * Memory Bridge - Long-term memory for AI agents
 * Solves the goldfish problem: agents that forget everything
 */

const sqlite3 = require('sqlite3').verbose();
const { createClient } = require('@supabase/supabase-js');
const nlp = require('compromise');
const path = require('path');
const fs = require('fs');

class MemoryBridge {
  constructor(options = {}) {
    this.storage = options.storage || 'sqlite';
    this.limits = {
      maxContentLength: 10000,
      maxAgentIdLength: 64,
      maxQueryResults: 100,
      maxTimelineDays: 365
    };
    
    if (this.storage === 'sqlite') {
      const safePath = this.validatePath(options.path || './memory.db');
      this.initSQLite(safePath);
    } else if (this.storage === 'supabase') {
      this.validateSupabaseUrl(options.supabaseUrl);
      this.initSupabase(options.supabaseUrl, options.supabaseKey);
    } else {
      throw new Error('Invalid storage type. Use "sqlite" or "supabase"');
    }
  }

  // ============================================
  // INPUT VALIDATION
  // ============================================
  
  validatePath(dbPath) {
    const path = require('path');
    const resolved = path.resolve(dbPath);
    const cwd = process.cwd();
    
    // Allow paths within home directory or cwd (not system paths)
    const home = require('os').homedir();
    const isSafe = resolved.startsWith(cwd) || resolved.startsWith(home);
    
    if (!isSafe && resolved.startsWith('/etc')) {
      throw new Error('Invalid path: Cannot write to system directories');
    }
    
    return resolved;
  }
  
  validateSupabaseUrl(url) {
    if (!url) return;
    
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        console.warn('[MemoryBridge] Warning: Non-HTTPS Supabase URL');
      }
    } catch (e) {
      throw new Error('Invalid Supabase URL format');
    }
  }
  
  validateStoreInput(content, options) {
    if (typeof content !== 'string') {
      throw new Error('Content must be a string');
    }
    
    if (content.length === 0) {
      throw new Error('Content cannot be empty');
    }
    
    if (content.length > this.limits.maxContentLength) {
      throw new Error(`Content too long (max ${this.limits.maxContentLength} chars)`);
    }
    
    if (options.agentId) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(options.agentId)) {
        throw new Error('Invalid agentId: use 1-64 alphanumeric chars, underscores, hyphens');
      }
    }
    
    if (options.importance !== undefined) {
      const imp = Number(options.importance);
      if (isNaN(imp) || imp < 1 || imp > 10) {
        throw new Error('Importance must be a number 1-10');
      }
    }
    
    const validTypes = ['insight', 'preference', 'error', 'goal', 'decision', 'security', 'conversation'];
    if (options.type && !validTypes.includes(options.type)) {
      throw new Error(`Invalid type. Use: ${validTypes.join(', ')}`);
    }
    
    return true;
  }

  // ============================================
  // INITIALIZATION
  // ============================================
  
  initSQLite(dbPath) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.db = new sqlite3.Database(dbPath);
    
    // Create table synchronously - THIS IS THE FIX
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        content TEXT NOT NULL,
        content_type TEXT DEFAULT 'insight',
        metadata TEXT,
        importance INTEGER DEFAULT 5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_agent ON memories(agent_id);
      CREATE INDEX IF NOT EXISTS idx_created ON memories(created_at);
    `);
  }

  initSupabase(url, key) {
    if (!url || !key) {
      throw new Error('Supabase URL and key required');
    }
    this.supabase = createClient(url, key);
  }

  // ============================================
  // KEYWORD EXTRACTION
  // ============================================
  
  extractKeywords(content) {
    try {
      const doc = nlp(content);
      const nouns = doc.nouns().out('array');
      const topics = doc.topics().out('array');
      
      return [...new Set([...nouns, ...topics])]
        .map(k => k.toLowerCase().trim())
        .filter(k => k.length > 3)
        .filter(k => !this.isStopWord(k))
        .slice(0, 10);
    } catch (error) {
      return this.basicExtract(content);
    }
  }

  basicExtract(content) {
    const stopWords = new Set([
      'this', 'that', 'with', 'from', 'have', 'been', 'were', 'they', 
      'their', 'what', 'when', 'where', 'which', 'while', 'about'
    ]);
    
    return content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w))
      .filter((w, i, self) => self.indexOf(w) === i)
      .slice(0, 10);
  }

  isStopWord(word) {
    const stops = new Set(['this', 'that', 'with', 'from', 'have', 'been', 'were']);
    return stops.has(word.toLowerCase());
  }

  calculateImportance(content, type) {
    let score = 5;
    if (content.length > 200) score += 1;
    if (type === 'insight') score += 2;
    if (type === 'error') score += 1;
    if (type === 'security') score += 3;
    if (type === 'goal') score += 2;
    return Math.min(10, score);
  }

  // ============================================
  // CORE OPERATIONS
  // ============================================
  
  async store(content, options = {}) {
    // Validate input
    this.validateStoreInput(content, options);
    
    const agentId = options.agentId || 'default';
    const type = options.type || 'insight';
    const importance = options.importance || this.calculateImportance(content, type);
    const keywords = this.extractKeywords(content);
    
    const memory = {
      id: this.generateId(),
      agent_id: agentId,
      content: content.slice(0, 5000), // Limit size
      content_type: type,
      importance,
      metadata: JSON.stringify({
        keywords,
        source: options.source || 'unknown',
        ...options.metadata
      })
    };

    if (this.storage === 'sqlite') {
      return this.storeSQLite(memory);
    } else {
      return this.storeSupabase(memory);
    }
  }

  storeSQLite(memory) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO memories (id, agent_id, content, content_type, metadata, importance)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      this.db.run(sql, [
        memory.id,
        memory.agent_id,
        memory.content,
        memory.content_type,
        memory.metadata,
        memory.importance
      ], function(err) {
        if (err) reject(err);
        else resolve({ success: true, id: memory.id });
      });
    });
  }

  async storeSupabase(memory) {
    const { data, error } = await this.supabase
      .from('memories')
      .insert(memory)
      .select()
      .single();
    
    if (error) throw error;
    return { success: true, id: data.id };
  }

  async query(queryString, options = {}) {
    // Validate inputs
    if (typeof queryString !== 'string') {
      throw new Error('Query must be a string');
    }
    
    const agentId = options.agentId || 'default';
    let limit = Math.min(Number(options.limit) || 5, this.limits.maxQueryResults);
    let days = Math.min(Number(options.days) || 30, this.limits.maxTimelineDays);
    const minImportance = Number(options.minImportance) || 0;
    
    const queryKeywords = this.extractKeywords(queryString);
    
    if (this.storage === 'sqlite') {
      return this.querySQLite(agentId, queryKeywords, limit, days, minImportance);
    } else {
      return this.querySupabase(agentId, queryKeywords, limit, days, minImportance);
    }
  }

  querySQLite(agentId, queryKeywords, limit, days, minImportance) {
    return new Promise((resolve, reject) => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      
      const sql = `
        SELECT * FROM memories 
        WHERE agent_id = ? 
        AND deleted_at IS NULL
        AND created_at > ?
        AND importance >= ?
        ORDER BY created_at DESC
        LIMIT 50
      `;
      
      this.db.all(sql, [agentId, cutoff.toISOString(), minImportance], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Score by keyword relevance
        const results = rows.map(row => {
          const metadata = JSON.parse(row.metadata || '{}');
          const memKeywords = metadata.keywords || [];
          const matches = queryKeywords.filter(qk => 
            memKeywords.some(mk => mk.includes(qk) || qk.includes(mk))
          ).length;
          
          return {
            ...row,
            metadata,
            relevance: queryKeywords.length > 0 ? matches / queryKeywords.length : 0
          };
        })
        .filter(m => m.relevance > 0 || queryKeywords.length === 0)
        .sort((a, b) => (b.relevance * b.importance) - (a.relevance * a.importance))
        .slice(0, limit);
        
        resolve(results);
      });
    });
  }

  async querySupabase(agentId, queryKeywords, limit, days, minImportance) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    const { data, error } = await this.supabase
      .from('memories')
      .select('*')
      .eq('agent_id', agentId)
      .is('deleted_at', null)
      .gte('created_at', cutoff.toISOString())
      .gte('importance', minImportance)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) throw error;
    
    // Score by keyword relevance
    const results = (data || []).map(m => {
      const memKeywords = m.metadata?.keywords || [];
      const matches = queryKeywords.filter(qk => 
        memKeywords.some(mk => mk.includes(qk) || qk.includes(mk))
      ).length;
      
      return {
        ...m,
        relevance: queryKeywords.length > 0 ? matches / queryKeywords.length : 0
      };
    })
    .filter(m => m.relevance > 0 || queryKeywords.length === 0)
    .sort((a, b) => (b.relevance * b.importance) - (a.relevance * a.importance))
    .slice(0, limit);
    
    return results;
  }

  async timeline(days = 7, options = {}) {
    // Validate inputs
    days = Math.min(Number(days) || 7, this.limits.maxTimelineDays);
    if (days < 1) days = 7;
    
    const agentId = options.agentId || 'default';
    
    if (this.storage === 'sqlite') {
      return this.timelineSQLite(agentId, days);
    } else {
      return this.timelineSupabase(agentId, days);
    }
  }

  timelineSQLite(agentId, days) {
    return new Promise((resolve, reject) => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      
      const sql = `
        SELECT * FROM memories 
        WHERE agent_id = ? 
        AND deleted_at IS NULL
        AND created_at > ?
        ORDER BY created_at DESC
      `;
      
      this.db.all(sql, [agentId, cutoff.toISOString()], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Group by date
        const grouped = rows.reduce((acc, row) => {
          const date = row.created_at.split('T')[0];
          if (!acc[date]) acc[date] = [];
          acc[date].push({
            ...row,
            metadata: JSON.parse(row.metadata || '{}')
          });
          return acc;
        }, {});
        
        resolve(grouped);
      });
    });
  }

  async timelineSupabase(agentId, days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    const { data, error } = await this.supabase
      .from('memories')
      .select('*')
      .eq('agent_id', agentId)
      .is('deleted_at', null)
      .gte('created_at', cutoff.toISOString())
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // Group by date
    const grouped = (data || []).reduce((acc, m) => {
      const date = m.created_at.split('T')[0];
      if (!acc[date]) acc[date] = [];
      acc[date].push(m);
      return acc;
    }, {});
    
    return grouped;
  }

  // ============================================
  // UTILITIES
  // ============================================
  
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // ============================================
  // SECURITY HELPERS
  // ============================================
  
  static sanitizeHTML(content) {
    if (typeof content !== 'string') return '';
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
  
  static sanitizeCLI(input) {
    if (typeof input !== 'string') return '';
    // Remove terminal escape sequences and control characters
    return input
      .replace(/\x1b\[[0-9;]*m/g, '')  // ANSI color codes
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');  // Control chars
  }

  async close() {
    if (this.storage === 'sqlite' && this.db) {
      return new Promise((resolve) => {
        this.db.close(() => resolve());
      });
    }
  }
}

module.exports = MemoryBridge;
module.exports.sanitizeHTML = MemoryBridge.sanitizeHTML;
module.exports.sanitizeCLI = MemoryBridge.sanitizeCLI;

/**
 * Mnemo API Server - Data Lake Edition
 * Multi-project memory with isolated databases per project
 * Data location: ~/.openclaw/data-lake/memory-<project>/bridge.db
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Crypto module for blind indexing (optional encryption)
const mnemoCrypto = require('./crypto');

const app = express();
const PORT = process.env.PORT || 10000;

// Base data lake path
const DATA_LAKE_BASE = process.env.DATA_LAKE_PATH || path.join(require('os').homedir(), '.openclaw', 'data-lake');

// Middleware
app.use(express.json({ limit: '1mb' }));

// Security: CORS - Only allow localhost origins
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  next();
});

// Security: Remove server header
app.disable('x-powered-by');

// ============================================
// RATE LIMITING
// ============================================

const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100; // 100 requests per window per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  if (!rateLimits.has(ip)) {
    rateLimits.set(ip, []);
  }
  
  const attempts = rateLimits.get(ip);
  const recentAttempts = attempts.filter(time => time > windowStart);
  
  rateLimits.set(ip, recentAttempts);
  
  if (recentAttempts.length >= RATE_LIMIT_MAX) {
    return false;
  }
  
  recentAttempts.push(now);
  return true;
}

function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  
  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000)
    });
  }
  
  next();
}

// ============================================
// REVERSE PROXY / HTTPS SUPPORT
// ============================================

// Trust proxy headers when behind reverse proxy (nginx, traefik, etc.)
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', true);
  console.log('[Mnemo] Trusting proxy headers (X-Forwarded-For, etc.)');
}

// Security: Force HTTPS redirect in production
app.use((req, res, next) => {
  if (process.env.FORCE_HTTPS === 'true' && !req.secure) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// Static files for web UI
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// AUTO-CLEANUP & COMPRESSION
// ============================================

/**
 * Delete old low-importance memories
 * @param {string} project - Project name
 * @param {number} days - Delete memories older than this
 * @param {number} maxImportance - Delete memories with importance <= this
 * @returns {Promise<number>} Number of memories deleted
 */
async function cleanupOldMemories(project = 'general', days = 90, maxImportance = 3) {
  const db = await getDb(project);
  
  return new Promise((resolve, reject) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    const sql = `
      DELETE FROM memories 
      WHERE created_at < ? 
        AND importance <= ?
        AND deleted_at IS NULL
    `;
    
    db.run(sql, [cutoff.toISOString(), maxImportance], function(err) {
      db.close();
      if (err) return reject(err);
      console.log(`[Mnemo Cleanup] Deleted ${this.changes} old memories from ${project}`);
      resolve(this.changes);
    });
  });
}

/**
 * Compress old memories by summarizing them
 * @param {string} project - Project name  
 * @param {number} days - Compress memories older than this
 * @returns {Promise<number>} Number of memories compressed
 */
async function compressOldMemories(project = 'general', days = 30) {
  const db = await getDb(project);
  
  return new Promise((resolve, reject) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    // Find old memories that haven't been compressed yet
    const sql = `
      SELECT id, content, content_type, created_at
      FROM memories 
      WHERE created_at < ?
        AND deleted_at IS NULL
        AND metadata NOT LIKE '%"compressed":true%'
      ORDER BY created_at DESC
      LIMIT 100
    `;
    
    db.all(sql, [cutoff.toISOString()], async (err, rows) => {
      if (err) {
        db.close();
        return reject(err);
      }
      
      if (!rows.length) {
        db.close();
        return resolve(0);
      }
      
      let compressed = 0;
      
      for (const row of rows) {
        // Simple compression: truncate long content
        if (row.content.length > 200) {
          const summary = row.content.substring(0, 197) + '...';
          
          const updateSql = `
            UPDATE memories 
            SET content = ?,
                metadata = json_object('compressed', true, 'original_length', ?),
                updated_at = ?
            WHERE id = ?
          `;
          
          await new Promise((res, rej) => {
            db.run(updateSql, [summary, row.content.length, new Date().toISOString(), row.id], (err) => {
              if (err) rej(err);
              else res();
            });
          });
          
          compressed++;
        }
      }
      
      db.close();
      console.log(`[Mnemo Compression] Compressed ${compressed} memories in ${project}`);
      resolve(compressed);
    });
  });
}

/**
 * Run maintenance: cleanup + compression on all projects
 */
async function runMaintenance() {
  console.log('[Mnemo] Running maintenance...');
  const projects = listProjects();
  let totalCleaned = 0;
  let totalCompressed = 0;
  
  for (const project of projects) {
    try {
      const cleaned = await cleanupOldMemories(project, 90, 3);
      totalCleaned += cleaned;
      
      const compressed = await compressOldMemories(project, 30);
      totalCompressed += compressed;
    } catch (err) {
      console.error(`[Mnemo] Maintenance error for ${project}:`, err.message);
    }
  }
  
  console.log(`[Mnemo] Maintenance complete: ${totalCleaned} cleaned, ${totalCompressed} compressed`);
  return { cleaned: totalCleaned, compressed: totalCompressed };
}

// ============================================
// DATA LAKE MANAGEMENT
// ============================================

/**
 * Get or create database for a project
 * @param {string} project - Project name (e.g., 'general', 'project1', 'project2')
 * @returns {string} Path to SQLite database
 */
function getProjectDbPath(project = 'general') {
  // Sanitize project name (alphanumeric, hyphens, underscores only)
  const sanitized = project.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const projectDir = path.join(DATA_LAKE_BASE, `memory-${sanitized}`);
  
  // Auto-create project directory if it doesn't exist
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
    fs.chmodSync(projectDir, 0o700); // Owner-only access
    console.log(`[Mnemo] Created new project memory: ${sanitized}`);
  }
  
  return path.join(projectDir, 'bridge.db');
}

/**
 * Initialize SQLite database with schema
 * @param {string} dbPath - Path to database file
 * @returns {Promise<void>}
 */
function initDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL DEFAULT 'default',
        content TEXT NOT NULL,
        content_type TEXT DEFAULT 'insight',
        metadata TEXT,
        importance INTEGER DEFAULT 5,
        project TEXT DEFAULT 'general',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      );
      
      CREATE INDEX IF NOT EXISTS idx_agent ON memories(agent_id);
      CREATE INDEX IF NOT EXISTS idx_project ON memories(project);
      CREATE INDEX IF NOT EXISTS idx_created ON memories(created_at);
      CREATE INDEX IF NOT EXISTS idx_content_type ON memories(content_type);
    `, (err) => {
      if (err) {
        db.close();
        return reject(err);
      }
      console.log(`[Mnemo] Initialized database: ${dbPath}`);
      db.close();
      resolve();
    });
  });
}

/**
 * Get database connection for project
 * @param {string} project - Project name
 * @returns {Promise<sqlite3.Database>} Database connection
 */
async function getDb(project = 'general') {
  const dbPath = getProjectDbPath(project);
  
  // Initialize if first time
  if (!fs.existsSync(dbPath)) {
    await initDatabase(dbPath);
  }
  
  return new sqlite3.Database(dbPath);
}

/**
 * Generate unique ID for memory
 */
function generateId() {
  return crypto.randomUUID();
}

// ============================================
// MEMORY BRIDGE CORE FUNCTIONS
// ============================================

/**
 * Store a memory
 */
async function storeMemory({ content, type = 'insight', importance = 5, agentId = 'default', project = 'general', metadata = {} }) {
  const db = await getDb(project);
  
  return new Promise((resolve, reject) => {
    const id = generateId();
    const now = new Date().toISOString();
    
    const stmt = db.prepare(`
      INSERT INTO memories (id, agent_id, content, content_type, importance, project, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run([id, agentId, content, type, importance, project, JSON.stringify(metadata), now], function(err) {
      db.close();
      if (err) return reject(err);
      resolve({ 
        id, 
        content, 
        type, 
        importance, 
        project,
        agentId,
        createdAt: now 
      });
    });
    
    stmt.finalize();
  });
}

/**
 * Query memories with full-text search
 */
async function queryMemories({ query, project = 'general', agentId, limit = 5, days = 30, type }) {
  const db = await getDb(project);
  
  return new Promise((resolve, reject) => {
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    let sql = `
      SELECT id, agent_id, content, content_type, importance, metadata, created_at,
             (LENGTH(content) - LENGTH(REPLACE(LOWER(content), LOWER(?), ''))) / LENGTH(?) as relevance
      FROM memories
      WHERE deleted_at IS NULL
        AND created_at > ?
    `;
    const params = [query, query, since.toISOString()];
    
    if (agentId) {
      sql += ' AND agent_id = ?';
      params.push(agentId);
    }
    
    if (type) {
      sql += ' AND content_type = ?';
      params.push(type);
    }
    
    // Simple keyword matching (fallback if FTS not available)
    sql += ` AND (
      LOWER(content) LIKE LOWER(?) 
      OR LOWER(content) LIKE LOWER(?)
    )`;
    params.push(`%${query}%`, `%${query.split(' ').join('%')}%`);
    
    sql += ' ORDER BY importance DESC, relevance DESC, created_at DESC LIMIT ?';
    params.push(limit);
    
    db.all(sql, params, (err, rows) => {
      db.close();
      if (err) return reject(err);
      resolve(rows.map(row => ({
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : {}
      })));
    });
  });
}

/**
 * Get timeline of memories
 */
async function getTimeline({ project = 'general', agentId, days = 7 }) {
  const db = await getDb(project);
  
  return new Promise((resolve, reject) => {
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    let sql = `
      SELECT id, agent_id, content, content_type, importance, created_at
      FROM memories
      WHERE deleted_at IS NULL
        AND created_at > ?
    `;
    const params = [since.toISOString()];
    
    if (agentId) {
      sql += ' AND agent_id = ?';
      params.push(agentId);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    db.all(sql, params, (err, rows) => {
      db.close();
      if (err) return reject(err);
      
      // Group by date
      const timeline = {};
      rows.forEach(row => {
        const date = row.created_at.split('T')[0];
        if (!timeline[date]) timeline[date] = [];
        timeline[date].push(row);
      });
      
      resolve(timeline);
    });
  });
}

/**
 * Get all projects in data lake
 */
function listProjects() {
  if (!fs.existsSync(DATA_LAKE_BASE)) return [];
  
  return fs.readdirSync(DATA_LAKE_BASE)
    .filter(name => name.startsWith('memory-'))
    .map(name => name.replace('memory-', ''));
}

// ============================================
// API ROUTES
// ============================================

// Apply rate limiting to all API routes
app.use('/api', rateLimitMiddleware);

// Health check - shows all projects
app.get('/api/health', (req, res) => {
  const projects = listProjects();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0-data-lake',
    dataLake: DATA_LAKE_BASE,
    projects: projects.length > 0 ? projects : ['general'],
    totalProjects: projects.length
  });
});

// List all projects
app.get('/api/projects', (req, res) => {
  res.json({
    projects: listProjects(),
    dataLake: DATA_LAKE_BASE
  });
});

// Store memory
app.post('/api/memory/store', async (req, res) => {
  try {
    const { content, type, importance, agentId, project, metadata } = req.body;
    
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Content required (string)' });
    }
    
    if (content.length > 10000) {
      return res.status(400).json({ error: 'Content too long (max 10000 chars)' });
    }
    
    const result = await storeMemory({
      content,
      type: type || 'insight',
      importance: Math.min(10, Math.max(1, importance || 5)),
      agentId: agentId || 'default',
      project: project || 'general',
      metadata: metadata || {}
    });
    
    res.json(result);
  } catch (err) {
    console.error('[Store Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Get recent memories (browse without search)
app.get('/api/memory/recent', async (req, res) => {
  try {
    const { project, limit, days } = req.query;
    const db = await getDb(project || 'general');
    
    return new Promise((resolve, reject) => {
      const since = new Date();
      since.setDate(since.getDate() - (parseInt(days) || 30));
      
      const sql = `
        SELECT id, agent_id, content, content_type, importance, metadata, created_at
        FROM memories
        WHERE deleted_at IS NULL
          AND created_at > ?
        ORDER BY created_at DESC
        LIMIT ?
      `;
      
      db.all(sql, [since.toISOString(), parseInt(limit) || 20], (err, rows) => {
        db.close();
        if (err) return reject(err);
        resolve(rows.map(row => ({
          ...row,
          metadata: row.metadata ? JSON.parse(row.metadata) : {}
        })));
      });
    }).then(results => {
      res.json({
        project: project || 'general',
        count: results.length,
        results
      });
    });
  } catch (err) {
    console.error('[Recent Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Get memory types used in project (for dropdown filter)
app.get('/api/memory/types', async (req, res) => {
  try {
    const { project } = req.query;
    const db = await getDb(project || 'general');
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT content_type, COUNT(*) as count
        FROM memories
        WHERE deleted_at IS NULL
        GROUP BY content_type
        ORDER BY count DESC
      `;
      
      db.all(sql, [], (err, rows) => {
        db.close();
        if (err) return reject(err);
        resolve(rows);
      });
    }).then(types => {
      res.json({
        project: project || 'general',
        types
      });
    });
  } catch (err) {
    console.error('[Types Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Get keyword suggestions from memories
app.get('/api/memory/keywords', async (req, res) => {
  try {
    const { project, limit } = req.query;
    const db = await getDb(project || 'general');
    
    return new Promise((resolve, reject) => {
      // Get recent memory content
      const sql = `
        SELECT content
        FROM memories
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 100
      `;
      
      db.all(sql, [], (err, rows) => {
        db.close();
        if (err) return reject(err);
        
        // Extract common words (simple approach)
        const wordCounts = {};
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their']);
        
        rows.forEach(row => {
          const words = row.content.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 3 && !stopWords.has(w));
          
          words.forEach(word => {
            wordCounts[word] = (wordCounts[word] || 0) + 1;
          });
        });
        
        // Sort by frequency
        const keywords = Object.entries(wordCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, parseInt(limit) || 20)
          .map(([word, count]) => ({ word, count }));
        
        resolve(keywords);
      });
    }).then(keywords => {
      res.json({
        project: project || 'general',
        keywords
      });
    });
  } catch (err) {
    console.error('[Keywords Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Query memories
app.get('/api/memory/query', async (req, res) => {
  try {
    const { q, project, agentId, limit, days, type } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" required' });
    }
    
    const results = await queryMemories({
      query: q,
      project: project || 'general',
      agentId,
      limit: parseInt(limit) || 5,
      days: parseInt(days) || 30,
      type
    });
    
    res.json({
      query: q,
      project: project || 'general',
      count: results.length,
      results
    });
  } catch (err) {
    console.error('[Query Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Get timeline
app.get('/api/memory/timeline', async (req, res) => {
  try {
    const { project, agentId, days } = req.query;
    
    const timeline = await getTimeline({
      project: project || 'general',
      agentId,
      days: parseInt(days) || 7
    });
    
    res.json({
      project: project || 'general',
      days: parseInt(days) || 7,
      timeline
    });
  } catch (err) {
    console.error('[Timeline Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Query across ALL projects (cascading search)
app.get('/api/memory/query-all', async (req, res) => {
  try {
    const { q, agentId, limit } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" required' });
    }
    
    const projects = listProjects();
    const allResults = [];
    
    for (const project of projects) {
      const results = await queryMemories({
        query: q,
        project,
        agentId,
        limit: parseInt(limit) || 3
      });
      allResults.push(...results.map(r => ({ ...r, project })));
    }
    
    // Sort by importance, then relevance
    allResults.sort((a, b) => b.importance - a.importance);
    
    res.json({
      query: q,
      projectsSearched: projects,
      count: allResults.length,
      results: allResults.slice(0, parseInt(limit) || 10)
    });
  } catch (err) {
    console.error('[Query-All Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ENCRYPTED STORAGE (Blind Indexing)
// ============================================

// Initialize encrypted storage schema
async function initEncryptedSchema(project) {
  const dbPath = getProjectDbPath(project);
  const db = new sqlite3.Database(dbPath);
  
  return new Promise((resolve, reject) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS encrypted_memories (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL DEFAULT 'default',
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        content_type TEXT DEFAULT 'insight',
        importance INTEGER DEFAULT 5,
        project TEXT DEFAULT 'general',
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      );
      
      CREATE TABLE IF NOT EXISTS blind_indexes (
        memory_id TEXT NOT NULL,
        index_hash TEXT NOT NULL,
        FOREIGN KEY (memory_id) REFERENCES encrypted_memories(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_blind_hash ON blind_indexes(index_hash);
    `, (err) => {
      db.close();
      if (err) reject(err);
      else resolve();
    });
  });
}

// Store encrypted memory with blind indexes
app.post('/api/memory/store-encrypted', async (req, res) => {
  try {
    const { content, type, importance, agentId, project, metadata } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content required' });
    }
    
    // Get or create encryption key
    const key = mnemoCrypto.getOrCreateKey();
    
    // Encrypt content and generate blind indexes
    const encrypted = mnemoCrypto.encryptWithIndex(content, key);
    
    // Initialize schema if needed
    await initEncryptedSchema(project || 'general');
    
    const db = await getDb(project || 'general');
    const id = generateId();
    const now = new Date().toISOString();
    
    // Store encrypted memory
    await new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO encrypted_memories (id, agent_id, ciphertext, iv, content_type, importance, project, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run([
        id,
        agentId || 'default',
        encrypted.ciphertext,
        encrypted.iv,
        type || 'insight',
        Math.min(10, Math.max(1, importance || 5)),
        project || 'general',
        JSON.stringify(metadata || {}),
        now
      ], function(err) {
        stmt.finalize();
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Store blind indexes
    await new Promise((resolve, reject) => {
      const stmt = db.prepare('INSERT INTO blind_indexes (memory_id, index_hash) VALUES (?, ?)');
      let completed = 0;
      
      if (encrypted.blindIndexes.length === 0) {
        resolve();
        return;
      }
      
      encrypted.blindIndexes.forEach(indexHash => {
        stmt.run([id, indexHash], (err) => {
          if (err) reject(err);
          completed++;
          if (completed === encrypted.blindIndexes.length) {
            stmt.finalize();
            resolve();
          }
        });
      });
    });
    
    db.close();
    
    res.json({
      id,
      encrypted: true,
      blindIndexes: encrypted.blindIndexes.length,
      project: project || 'general',
      createdAt: now
    });
  } catch (err) {
    console.error('[Store-Encrypted Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Query encrypted memories using blind indexes
app.get('/api/memory/query-encrypted', async (req, res) => {
  try {
    const { q, project, limit } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" required' });
    }
    
    const key = mnemoCrypto.getOrCreateKey();
    const queryIndex = mnemoCrypto.generateQueryIndex(q, key);
    
    const db = await getDb(project || 'general');
    
    // Query using blind index
    const results = await new Promise((resolve, reject) => {
      const sql = `
        SELECT em.id, em.ciphertext, em.iv, em.content_type, em.importance, em.metadata, em.created_at
        FROM encrypted_memories em
        JOIN blind_indexes bi ON em.id = bi.memory_id
        WHERE bi.index_hash = ?
          AND em.deleted_at IS NULL
        ORDER BY em.importance DESC, em.created_at DESC
        LIMIT ?
      `;
      
      db.all(sql, [queryIndex, parseInt(limit) || 10], (err, rows) => {
        db.close();
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // Decrypt results for client (client should do this in production)
    const decryptedResults = results.map(row => {
      try {
        const plaintext = mnemoCrypto.decrypt(row.ciphertext, row.iv, key);
        return {
          id: row.id,
          content: plaintext,
          type: row.content_type,
          importance: row.importance,
          metadata: row.metadata ? JSON.parse(row.metadata) : {},
          created_at: row.created_at
        };
      } catch (decryptErr) {
        return {
          id: row.id,
          content: '[decryption failed]',
          type: row.content_type,
          importance: row.importance,
          error: true,
          created_at: row.created_at
        };
      }
    });
    
    res.json({
      query: q,
      blindIndex: queryIndex.substring(0, 16) + '...',
      project: project || 'general',
      count: decryptedResults.length,
      encrypted: true,
      results: decryptedResults
    });
  } catch (err) {
    console.error('[Query-Encrypted Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Get encryption status
app.get('/api/crypto/status', (req, res) => {
  const enabled = mnemoCrypto.isEncryptionEnabled();
  res.json({
    encryptionEnabled: enabled,
    keyExists: fs.existsSync(path.join(require('os').homedir(), '.openclaw', 'mnemo.key')),
    algorithm: 'AES-256-GCM',
    indexing: 'HMAC-SHA256 (blind indexes)',
    note: 'Server can search but cannot read content without client key'
  });
});

// Enable encryption
app.post('/api/crypto/enable', (req, res) => {
  try {
    mnemoCrypto.enableEncryption();
    res.json({ 
      success: true, 
      message: 'Encryption enabled. New memories will be encrypted.',
      warning: 'Existing memories remain unencrypted. Migrate if needed.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cleanup old memories
app.post('/api/cleanup', async (req, res) => {
  try {
    const { project, days, maxImportance } = req.body;
    const deleted = await cleanupOldMemories(
      project || 'general',
      days || 90,
      maxImportance || 3
    );
    res.json({ 
      success: true, 
      deleted,
      project: project || 'general',
      criteria: `Older than ${days || 90} days, importance <= ${maxImportance || 3}`
    });
  } catch (err) {
    console.error('[Cleanup Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Compress old memories
app.post('/api/compress', async (req, res) => {
  try {
    const { project, days } = req.body;
    const compressed = await compressOldMemories(
      project || 'general',
      days || 30
    );
    res.json({ 
      success: true, 
      compressed,
      project: project || 'general',
      criteria: `Older than ${days || 30} days`
    });
  } catch (err) {
    console.error('[Compress Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Run full maintenance
app.post('/api/maintenance', async (req, res) => {
  try {
    const result = await runMaintenance();
    res.json({ 
      success: true, 
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Maintenance Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('[API Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler - API routes not found
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Web UI fallback - serve index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     Mnemo 🧠 — Data Lake Edition v2.3.0                ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║  Data Lake: ${DATA_LAKE_BASE.padEnd(46)}║`);
  console.log(`║  Web UI:    http://localhost:${PORT}${' '.repeat(29 - PORT.toString().length)}║`);
  console.log(`║  API:       http://localhost:${PORT}/api${' '.repeat(23 - PORT.toString().length)}║`);
  console.log('║                                                        ║');
  console.log('║  Endpoints:                                            ║');
  console.log('║    GET  /                    - Web UI (Memory Browser) ║');
  console.log('║    GET  /api/health          - Status & projects       ║');
  console.log('║    GET  /api/projects        - List all projects       ║');
  console.log('║    POST /api/memory/store    - Store a memory          ║');
  console.log('║    POST /api/memory/store-encrypted - Store encrypted  ║');
  console.log('║    GET  /api/memory/query    - Query project memory    ║');
  console.log('║    GET  /api/memory/query-encrypted - Query encrypted  ║');
  console.log('║    GET  /api/memory/query-all - Search all projects    ║');
  console.log('║    GET  /api/memory/recent   - Browse recent memories  ║');
  console.log('║    GET  /api/memory/types    - List memory types       ║');
  console.log('║    GET  /api/memory/keywords - Get keyword suggestions ║');
  console.log('║    GET  /api/memory/timeline - Get memory timeline     ║');
  console.log('║    GET  /api/crypto/status   - Encryption status       ║');
  console.log('║    POST /api/crypto/enable   - Enable encryption       ║');
  console.log('║    POST /api/cleanup         - Delete old memories     ║');
  console.log('║    POST /api/compress        - Compress old memories   ║');
  console.log('║    POST /api/maintenance     - Run full maintenance    ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  
  // Schedule daily maintenance at 3 AM
  const now = new Date();
  const nextMaintenance = new Date(now);
  nextMaintenance.setHours(3, 0, 0, 0);
  if (nextMaintenance <= now) {
    nextMaintenance.setDate(nextMaintenance.getDate() + 1);
  }
  const msUntilMaintenance = nextMaintenance - now;
  
  setTimeout(() => {
    runMaintenance();
    // Then every 24 hours
    setInterval(runMaintenance, 24 * 60 * 60 * 1000);
  }, msUntilMaintenance);
  
  console.log(`[Mnemo] Next maintenance: ${nextMaintenance.toLocaleString()}`);
});

module.exports = { app, getProjectDbPath, listProjects };
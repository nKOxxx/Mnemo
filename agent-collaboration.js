/**
 * Agent Collaboration Module for Mnemo
 * 
 * Features:
 * - Share memories between agents
 * - Agent-to-agent memory queries
 * - Memory subscriptions (get updates when relevant memories added)
 * - Agent identity and permissions
 */

const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

// ============================================
// SCHEMA FOR AGENT COLLABORATION
// ============================================

const AGENT_SCHEMA = `
  -- Registered agents
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    permissions TEXT, -- JSON: { read: ['project1'], write: ['project2'] }
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME
  );

  -- Memory shares (which memories are shared with which agents)
  CREATE TABLE IF NOT EXISTS memory_shares (
    id TEXT PRIMARY KEY,
    memory_id TEXT NOT NULL,
    from_agent_id TEXT NOT NULL,
    to_agent_id TEXT NOT NULL,
    share_type TEXT DEFAULT 'read', -- read, write, admin
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    UNIQUE(memory_id, to_agent_id)
  );

  -- Agent subscriptions (agents listening for specific memory patterns)
  CREATE TABLE IF NOT EXISTS agent_subscriptions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    project TEXT NOT NULL,
    keywords TEXT, -- comma-separated
    importance_threshold INTEGER DEFAULT 5,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Agent activity log
  CREATE TABLE IF NOT EXISTS agent_activity (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    action TEXT NOT NULL, -- read, write, share, query
    memory_id TEXT,
    project TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_shares_memory ON memory_shares(memory_id);
  CREATE INDEX IF NOT EXISTS idx_shares_to_agent ON memory_shares(to_agent_id);
  CREATE INDEX IF NOT EXISTS idx_shares_from_agent ON memory_shares(from_agent_id);
  CREATE INDEX IF NOT EXISTS idx_subscriptions_agent ON agent_subscriptions(agent_id);
  CREATE INDEX IF NOT EXISTS idx_activity_agent ON agent_activity(agent_id);
`;

// ============================================
// AGENT MANAGEMENT
// ============================================

/**
 * Initialize agent collaboration schema
 * @param {sqlite3.Database} db 
 */
async function initAgentSchema(db) {
  return new Promise((resolve, reject) => {
    db.exec(AGENT_SCHEMA, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Register a new agent
 * @param {sqlite3.Database} db
 * @param {Object} agent 
 */
async function registerAgent(db, { name, description, permissions = {} }) {
  const id = crypto.randomUUID();
  
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO agents (id, name, description, permissions)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run([id, name, description, JSON.stringify(permissions)], (err) => {
      stmt.finalize();
      if (err) reject(err);
      else resolve({ id, name, description, permissions });
    });
  });
}

/**
 * Get agent by ID
 * @param {sqlite3.Database} db
 * @param {string} agentId 
 */
async function getAgent(db, agentId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM agents WHERE id = ?', [agentId], (err, row) => {
      if (err) reject(err);
      else if (row) {
        resolve({
          ...row,
          permissions: JSON.parse(row.permissions || '{}')
        });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * List all registered agents
 * @param {sqlite3.Database} db
 */
async function listAgents(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM agents ORDER BY created_at DESC', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(r => ({
        ...r,
        permissions: JSON.parse(r.permissions || '{}')
      })));
    });
  });
}

// ============================================
// MEMORY SHARING
// ============================================

/**
 * Share a memory with another agent
 * @param {sqlite3.Database} db
 * @param {Object} share
 */
async function shareMemory(db, { memoryId, fromAgentId, toAgentId, shareType = 'read', expiresAt }) {
  const id = crypto.randomUUID();
  
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO memory_shares 
      (id, memory_id, from_agent_id, to_agent_id, share_type, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run([id, memoryId, fromAgentId, toAgentId, shareType, expiresAt || null], (err) => {
      stmt.finalize();
      if (err) reject(err);
      else resolve({ id, memoryId, fromAgentId, toAgentId, shareType, expiresAt });
    });
  });
}

/**
 * Get memories shared with an agent
 * @param {sqlite3.Database} db
 * @param {string} agentId
 * @param {Object} options
 */
async function getSharedMemories(db, agentId, options = {}) {
  const { limit = 20, offset = 0 } = options;
  
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT m.*, ms.from_agent_id, ms.share_type, ms.created_at as shared_at
      FROM memory_shares ms
      JOIN memories m ON ms.memory_id = m.id
      WHERE ms.to_agent_id = ?
        AND (ms.expires_at IS NULL OR ms.expires_at > datetime('now'))
        AND m.deleted_at IS NULL
      ORDER BY ms.created_at DESC
      LIMIT ? OFFSET ?
    `;
    
    db.all(sql, [agentId, limit, offset], (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(r => ({
        ...r,
        metadata: r.metadata ? JSON.parse(r.metadata) : {},
        sharedBy: r.from_agent_id,
        shareType: r.share_type
      })));
    });
  });
}

/**
 * Query memories accessible to an agent (own + shared)
 * @param {sqlite3.Database} db
 * @param {string} agentId
 * @param {string} query
 * @param {Object} options
 */
async function queryAgentMemories(db, agentId, query, options = {}) {
  const { project = 'general', limit = 10 } = options;
  
  return new Promise((resolve, reject) => {
    // Get agent's own memories + memories shared with them
    const sql = `
      SELECT DISTINCT m.*, 
        CASE WHEN m.agent_id = ? THEN 'own' ELSE 'shared' END as access_type
      FROM memories m
      LEFT JOIN memory_shares ms ON m.id = ms.memory_id AND ms.to_agent_id = ?
      WHERE m.project = ?
        AND m.deleted_at IS NULL
        AND (m.agent_id = ? OR ms.to_agent_id = ?)
        AND (
          LOWER(m.content) LIKE LOWER(?) 
          OR LOWER(m.content) LIKE LOWER(?)
        )
      ORDER BY m.importance DESC, m.created_at DESC
      LIMIT ?
    `;
    
    const params = [
      agentId, agentId, project, agentId, agentId,
      `%${query}%`, `%${query.split(' ').join('%')}%`,
      limit
    ];
    
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(r => ({
        ...r,
        metadata: r.metadata ? JSON.parse(r.metadata) : {},
        accessType: r.access_type
      })));
    });
  });
}

// ============================================
// SUBSCRIPTIONS
// ============================================

/**
 * Subscribe an agent to memory updates
 * @param {sqlite3.Database} db
 * @param {Object} subscription
 */
async function subscribeAgent(db, { agentId, project, keywords, importanceThreshold = 5 }) {
  const id = crypto.randomUUID();
  
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO agent_subscriptions (id, agent_id, project, keywords, importance_threshold)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run([id, agentId, project, keywords, importanceThreshold], (err) => {
      stmt.finalize();
      if (err) reject(err);
      else resolve({ id, agentId, project, keywords, importanceThreshold });
    });
  });
}

/**
 * Get matching subscriptions for a new memory
 * @param {sqlite3.Database} db
 * @param {Object} memory
 */
async function getMatchingSubscriptions(db, memory) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM agent_subscriptions
      WHERE project = ?
        AND importance_threshold <= ?
        AND (
          keywords IS NULL 
          OR LOWER(?) LIKE LOWER('%' || keywords || '%')
        )
    `;
    
    db.all(sql, [memory.project, memory.importance, memory.content], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

/**
 * Log agent activity
 * @param {sqlite3.Database} db
 * @param {Object} activity
 */
async function logAgentActivity(db, { agentId, action, memoryId, project }) {
  const id = crypto.randomUUID();
  
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO agent_activity (id, agent_id, action, memory_id, project)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run([id, agentId, action, memoryId, project], (err) => {
      stmt.finalize();
      if (err) reject(err);
      else resolve({ id, agentId, action, memoryId, project });
    });
  });
}

/**
 * Get agent activity feed
 * @param {sqlite3.Database} db
 * @param {Object} options
 */
async function getAgentActivity(db, options = {}) {
  const { agentId, project, limit = 50 } = options;
  
  return new Promise((resolve, reject) => {
    let sql = 'SELECT * FROM agent_activity WHERE 1=1';
    const params = [];
    
    if (agentId) {
      sql += ' AND agent_id = ?';
      params.push(agentId);
    }
    
    if (project) {
      sql += ' AND project = ?';
      params.push(project);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

module.exports = {
  AGENT_SCHEMA,
  initAgentSchema,
  registerAgent,
  getAgent,
  listAgents,
  shareMemory,
  getSharedMemories,
  queryAgentMemories,
  subscribeAgent,
  getMatchingSubscriptions,
  logAgentActivity,
  getAgentActivity
};

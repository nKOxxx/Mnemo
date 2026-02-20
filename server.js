/**
 * Memory Bridge API Server
 * Simple Express wrapper for MemoryBridge library
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(express.json({ limit: '1mb' }));

// Ensure data directory exists
const dataDir = path.dirname(process.env.DB_PATH || './data/memory.db');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize SQLite with table creation
const dbPath = process.env.DB_PATH || './data/memory.db';
const db = new sqlite3.Database(dbPath);

// Create table if not exists
db.run(`
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    content TEXT NOT NULL,
    content_type TEXT DEFAULT 'insight',
    metadata TEXT,
    importance INTEGER DEFAULT 5,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_agent ON memories(agent_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_created ON memories(created_at)`);

// Load MemoryBridge after table setup
const MemoryBridge = require('./index.js');

const memory = new MemoryBridge({
  storage: process.env.SUPABASE_URL ? 'supabase' : 'sqlite',
  path: dbPath,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.1'
  });
});

// Store memory
app.post('/api/memory/store', async (req, res) => {
  try {
    const { content, type, importance, agentId } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content required' });
    }
    
    const result = await memory.store(content, {
      type: type || 'note',
      importance: importance || 5,
      agentId: agentId || 'default'
    });
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Query memories
app.get('/api/memory/query', async (req, res) => {
  try {
    const { q, limit, days, agentId } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query required' });
    }
    
    const results = await memory.query(q, {
      limit: parseInt(limit) || 5,
      days: parseInt(days) || 30,
      agentId: agentId || 'default'
    });
    
    res.json({ query: q, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get timeline
app.get('/api/memory/timeline', async (req, res) => {
  try {
    const { days, agentId } = req.query;
    
    const timeline = await memory.timeline(parseInt(days) || 7, {
      agentId: agentId || 'default'
    });
    
    res.json({ timeline });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Memory Bridge API running on port ${PORT}`);
});

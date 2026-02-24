# Memory Bridge 🧠 — Data Lake Edition

**Long-term memory for AI agents with project-based isolation. Local-first, zero cloud.**

```
Data Lake: ~/.openclaw/data-lake/
├── memory-general/      ← Cross-project knowledge
├── memory-2ndcto/       ← 2ndCTO memories
├── memory-agentvault/   ← AgentVault memories
└── memory-<project>/    ← Auto-created per project
```

---

## The Problem

| Without Memory Bridge | With Memory Bridge |
|----------------------|-------------------|
| ❌ Forget everything when session ends | ✅ Memories persist forever |
| ❌ Lose context after 20 messages | ✅ Search entire history instantly |
| ❌ Repeat conversations every time | ✅ Agent remembers preferences |
| ❌ No continuity between sessions | ✅ Seamless session resume |
| ❌ All projects mixed together | ✅ Isolated project memories |

---

## Quick Start (2 minutes)

### 1. Start the Server

```bash
cd /Users/ares/.openclaw/workspace/projects/MemoryBridge
./start.sh start

# ✅ Memory Bridge running on http://localhost:10000
```

### 2. Store & Query

```bash
# Store to general memory
curl -X POST http://localhost:10000/api/memory/store \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Nikola prefers bullet points over long messages",
    "type": "preference",
    "importance": 9,
    "project": "general"
  }'

# Store to project memory
curl -X POST http://localhost:10000/api/memory/store \
  -H "Content-Type: application/json" \
  -d '{
    "content": "2ndCTO v1.1.0 Gold Master released Feb 20",
    "type": "milestone",
    "importance": 10,
    "project": "2ndcto"
  }'

# Query project memory
curl "http://localhost:10000/api/memory/query?q=2ndCTO&project=2ndcto"

# Search all projects
curl "http://localhost:10000/api/memory/query-all?q=release"
```

---

## Architecture

### Data Lake Structure

```
~/.openclaw/data-lake/
├── memory-general/bridge.db       (28KB) ← Cross-project knowledge
├── memory-2ndcto/bridge.db        (28KB) ← 2ndCTO only
├── memory-agentvault/bridge.db    (28KB) ← AgentVault only
├── memory-agentdiplomacy/bridge.db (0KB) ← Empty until used
└── memory-<new>/bridge.db         ← Auto-created
```

**Each project gets its own SQLite database.**
- Isolated: Projects can't see each other's memories
- Scalable: Add projects without affecting others
- Efficient: Query only relevant project data

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Status + list projects |
| `GET /api/projects` | All memory projects |
| `POST /api/memory/store` | Store a memory |
| `GET /api/memory/query` | Query single project |
| `GET /api/memory/query-all` | Search all projects |
| `GET /api/memory/timeline` | Memory timeline |

---

## OpenClaw Integration

### Auto-Routing by Project

```javascript
// Mention "2ndCTO" → routes to memory-2ndcto
// Mention "AgentVault" → routes to memory-agentvault
// No project mentioned → routes to memory-general
```

### Before (No Memory)
```javascript
// Session 1
User: "2ndCTO needs x402 integration"
Ares: "I'll work on that"  // But forgets

// Session 2
User: "Continue with 2ndCTO"
Ares: "Which project is that?"  // Lost
```

### After (With Memory Bridge)
```javascript
// Session 1 - Auto-detects "2ndCTO", stores to that project
await memory.store({
  content: "2ndCTO needs x402 integration",
  project: "2ndcto"  // Auto-detected
});

// Session 2 - Query "2ndCTO" → searches 2ndcto project
const context = await memory.query("2ndCTO status", { project: "2ndcto" });
Ares: "Last time we discussed x402 integration for 2ndCTO"
```

---

## API Reference

### Store Memory

```bash
POST /api/memory/store
Content-Type: application/json

{
  "content": "Memory content to store",
  "type": "insight",           // insight, preference, error, goal, milestone, security
  "importance": 5,             // 1-10 scale
  "project": "general",        // Project name (auto-creates if new)
  "agentId": "ares",           // Optional: agent identifier
  "metadata": {}               // Optional: extra data
}
```

### Query Memory

```bash
GET /api/memory/query?q=search&project=general&limit=5&days=30

Parameters:
  q       - Search query (required)
  project - Project to search (default: general)
  agentId - Filter by agent (optional)
  limit   - Max results (default: 5)
  days    - Lookback window (default: 30)
```

### Query All Projects

```bash
GET /api/memory/query-all?q=release&limit=10

Searches across ALL project memories, returns aggregated results.
```

### Timeline View

```bash
GET /api/memory/timeline?project=2ndcto&days=7

Returns memories grouped by date:
{
  "2026-02-24": [memory, memory],
  "2026-02-23": [memory]
}
```

---

## Server Management

### Control Script

```bash
./start.sh start    # Start Memory Bridge
./start.sh stop     # Stop server
./start.sh status   # Check if running
```

### Manual Start

```bash
# Development
node server.js

# Production
DATA_LAKE_PATH=/custom/path node server.js
PORT=8080 node server.js
```

---

## Storage Calculations

**Current:** 56KB (2 projects, 2 memories)

**Projections:**

| Usage | Memories/Day | Size/Year | 5-Year Total |
|-------|--------------|-----------|--------------|
| Light | 1 | 5MB | 25MB |
| Normal | 10 | 50MB | 250MB |
| Heavy | 50 | 250MB | 1.25GB |
| **Our Est.** | **10** | **70MB** | **350MB** |

**Bottom line:** Even heavy usage stays under 1GB for years.

---

## Features

### 🔍 Smart Search
- Keyword matching with relevance scoring
- Searches content, type, and metadata
- Ranked by importance + relevance

### 📊 Importance Ranking
```javascript
// Automatic priority
importance: 10  // Critical security issue
importance: 5   // Normal insight
importance: 2   // Minor note
```

### 🗂️ Project Isolation
- Each project = separate SQLite database
- Query one project or search all
- Auto-create projects on first use

### 🔒 Privacy First
- **100% local**: No cloud, no network calls
- **Your data**: Stays on your machine
- **No tracking**: No analytics, no telemetry

---

## Deployment Options

### Option 1: Local (Recommended)
```bash
# Your Mac Mini
./start.sh start
# → http://localhost:10000
```
- ✅ Zero config
- ✅ 100% private
- ✅ Works offline
- ✅ Free forever

### Option 2: Custom Data Path
```bash
DATA_LAKE_PATH=/Volumes/External/memory ./start.sh start
```

---

## Comparison

| Feature | Memory Bridge | Vector DB | File Storage |
|---------|--------------|-----------|--------------|
| Setup | 2 min | 30+ min | 5 min |
| Cost | Free | $70+/mo | Free |
| Search | Smart keywords | Semantic | None |
| Projects | ✅ Isolated | ❌ Shared | ❌ None |
| Local | ✅ Always | ❌ Cloud | ✅ Yes |
| Privacy | ✅ 100% | ⚠️ Cloud | ✅ Yes |

---

## Installation

```bash
# Clone repo
git clone https://github.com/nKOxxx/MemoryBridge.git
cd MemoryBridge

# Install dependencies
npm install

# Start server
./start.sh start
```

**Requirements:** Node.js 16+, macOS/Linux

---

## Version History

- **v2.0.0** (Feb 24, 2026) — Data Lake Edition
  - Multi-project memory isolation
  - Data Lake architecture (~/.openclaw/data-lake/)
  - Auto-create projects on first use
  - Local-first: all data on your machine
  - New API: /api/memory/query-all for cross-project search

- **v1.0.1** — Initial release
  - Single SQLite database
  - Supabase cloud option
  - Basic store/query API

---

## License

MIT - Use it, fork it, build on it.

---

**Built for the agent economy. Infrastructure that remembers.** 🧠
**Data Lake Edition — Your memories, your machine, your control.**
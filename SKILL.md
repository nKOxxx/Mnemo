---
name: mnemo
description: Long-term memory for AI agents with project-based Data Lake architecture. Store, query, and retrieve memories across sessions with automatic project isolation. Data stored locally in ~/.openclaw/data-lake/memory-<project>/ folders. Use when persisting information between conversations, recalling previous context, building user profiles, or maintaining project-specific memories.
---

# Mnemo — Data Lake Edition

**Project-based long-term memory for AI agents.**

Data Lake Structure:
```
~/.openclaw/data-lake/
├── memory-general/      ← Cross-project knowledge
├── memory-project1/     ← Project 1 memories
├── memory-project2/     ← Project 2 memories
└── memory-<project>/    ← Auto-created per project
```

## Quick Start

```bash
# Start the server
cd /path/to/Mnemo
./start.sh start

# Check status
curl http://localhost:10000/api/health
```

## Store Memory

```bash
POST http://localhost:10000/api/memory/store
Content-Type: application/json

{
  "content": "Memory to store",
  "type": "insight",        // insight, preference, error, goal, milestone, security
  "importance": 5,          // 1-10 scale
  "project": "general",     // Project name (auto-creates)
  "agentId": "agent1"       // Optional
}
```

## Query Memory

```bash
# Single project
GET http://localhost:10000/api/memory/query?q=search&project=project1&limit=5

# All projects
GET http://localhost:10000/api/memory/query-all?q=release&limit=10

# Timeline
GET http://localhost:10000/api/memory/timeline?project=project1&days=7
```

## Project Auto-Routing

```javascript
// Detect project from user message
"Work on Project Alpha" → project: "project1"
"Project Beta bug"      → project: "project2"  
"New project: Gamma"    → project: "gamma" (auto-created)
"Remember this"         → project: "general" (default)
```

## OpenClaw Integration Example

### Session Start — Load Context
```javascript
async function loadSessionContext(project = 'general') {
  // Recent memories
  const recent = await query(`recent work`, { project, days: 7, limit: 5 });
  
  // High importance items
  const important = await query(`goals priorities`, { 
    project, 
    minImportance: 8,
    limit: 3 
  });
  
  // User preferences
  const prefs = await query(`preferences`, { project: 'general', limit: 5 });
  
  return { recent, important, prefs };
}
```

### During Conversation — Auto-Store
```javascript
async function handleUserMessage(message, project = 'general') {
  // Detect if memory-worthy
  if (isImportant(message)) {
    await store({
      content: message,
      type: detectType(message),      // 'insight', 'decision', etc.
      importance: calculateImportance(message),
      project
    });
  }
  
  // Enrich with relevant memories
  const relevant = await query(message, { project, limit: 3 });
  return generateResponse(message, relevant);
}
```

### Project Context — Switching
```javascript
// User mentions different project
"Actually, let's talk about Project Beta"

// → Switch to project2
const context = await loadSessionContext('project2');
// "Last time on Project Beta: payment integration built..."
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Status + project list |
| `/api/projects` | GET | All memory projects |
| `/api/memory/store` | POST | Store memory |
| `/api/memory/query` | GET | Query single project |
| `/api/memory/query-all` | GET | Search all projects |
| `/api/memory/timeline` | GET | Timeline view |

## Memory Types

| Type | Use For | Auto-Importance |
|------|---------|-----------------|
| `insight` | Learnings, discoveries | +1 |
| `preference` | User likes/dislikes | 0 |
| `goal` | Objectives, targets | +2 |
| `milestone` | Releases, completions | +2 |
| `decision` | Choices made | +1 |
| `error` | Bugs, failures | +2 |
| `security` | Security-related | +3 |

## Storage

**Local SQLite** (default):
- Path: `~/.openclaw/data-lake/memory-<project>/bridge.db`
- Each project = isolated database
- Zero config, 100% private

**Size Estimates:**
- Light use: ~5MB/year
- Normal use: ~50MB/year  
- Heavy use: ~250MB/year

## Server Control

```bash
./start.sh start    # Start server
./start.sh stop     # Stop server
./start.sh status   # Check status
```

## Error Handling

```javascript
// Server not running
if (healthCheck.status !== 'ok') {
  // Auto-start or alert user
}

// Project doesn't exist
// → Auto-created on first store

// Query returns empty
// → No memories yet for that project
```

## Best Practices

1. **Store with context:** Include enough detail to be useful later
2. **Use appropriate types:** Helps with filtering and importance
3. **Set importance:** 8+ for critical, 5 for normal, 3 for minor
4. **Project isolation:** Keep project-specific memories separate
5. **Query general for prefs:** User preferences go to `general`

## GitHub

**Repository:** https://github.com/nKOxxx/Mnemo

**Version:** 2.3.0 Data Lake Edition

---

**Infrastructure that remembers. Project by project.** 🧠
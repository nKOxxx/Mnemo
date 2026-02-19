# Memory Bridge 🧠

**Long-term memory for AI agents. Solve the goldfish problem.**

---

## The Problem

| Without Memory Bridge | With Memory Bridge |
|----------------------|-------------------|
| ❌ Forget everything when session ends | ✅ Memories persist forever |
| ❌ Lose context after 20 messages | ✅ Search entire history instantly |
| ❌ Repeat conversations every time | ✅ Agent remembers preferences |
| ❌ No continuity between sessions | ✅ Seamless session resume |

**Result:** Agents become amnesiac collaborators - unreliable for complex work.

---

## The Solution

**One-line memory for your agent:**

```javascript
const memory = require('memory-bridge');

// Store important insights
await memory.store("User prefers TypeScript over Python");

// Later - retrieve instantly
const context = await memory.query("what user prefers");
// Returns: "User prefers TypeScript over Python"
```

---

## Quick Start (3 minutes)

### 1. Install
```bash
npm install memory-bridge
```

### 2. Initialize
```javascript
const MemoryBridge = require('memory-bridge');

const memory = new MemoryBridge({
  // Option A: Local SQLite (default, free, private)
  storage: 'sqlite',
  path: './memory.db'
  
  // Option B: Supabase (cloud, shared, scalable)
  // storage: 'supabase',
  // supabaseUrl: 'https://your-project.supabase.co',
  // supabaseKey: 'your-service-key'
});
```

### 3. Use
```javascript
// Store memories
await memory.store({
  content: "Nikola wants to build 3 products this quarter",
  type: "goal",
  importance: 9
});

// Query memories  
const results = await memory.query("what Nikola wants to build");
console.log(results[0].content);
// → "Nikola wants to build 3 products this quarter"
```

---

## OpenClaw Integration

### Before (No Memory)
```javascript
// Session 1
User: "I prefer dark mode"
Ares: "I'll remember that"  // But doesn't actually remember

// Session 2 (new session)
User: "Why is the UI light?"
Ares: "I'm not sure what you mean"  // Completely forgot
```

### After (With Memory Bridge)
```javascript
// Session 1
User: "I prefer dark mode"
Ares: await memory.store({
  content: "User prefers dark mode",
  type: "preference"
});
// ✅ Stored permanently

// Session 2 (new session)
User: "Update the UI"
Ares: const prefs = await memory.query("user preferences");
// → [{content: "User prefers dark mode"}]
Ares: "I'll make sure to use dark mode for this update"
// ✅ Remembered!
```

---

## Features

### 🔍 Smart Search
```javascript
// Keyword extraction happens automatically
await memory.store("Working on 2ndCTO security audit with Nikola");

// Find it multiple ways
await memory.query("2ndCTO");        // ✓ Found
await memory.query("security audit"); // ✓ Found
await memory.query("Nikola");         // ✓ Found
```

### 📊 Importance Ranking
```javascript
await memory.store({
  content: "Critical: API keys exposed in logs",
  type: "security",
  importance: 10  // High priority
});

await memory.store({
  content: "Nice to have: dark mode",
  type: "preference", 
  importance: 3   // Low priority
});

// Query returns ranked by importance + relevance
```

### 🗓️ Timeline View
```javascript
const week = await memory.timeline(7);  // Last 7 days
// {
//   "2026-02-19": [memory, memory],
//   "2026-02-18": [memory, memory, memory]
// }
```

### 🔒 Privacy First
- **Local mode**: Everything stays on your machine (SQLite)
- **Cloud mode**: Your own Supabase (you control data)
- **Encrypted**: At-rest encryption in both modes

---

## Value Proposition

### For OpenClaw Users
| Metric | Without | With Memory Bridge |
|--------|---------|-------------------|
| Session continuity | 0% | 100% |
| Context retention | ~20 messages | Unlimited |
| User preference recall | None | Perfect |
| Cross-session work | Impossible | Seamless |
| Setup time | - | 2 minutes |

### Real Example
**Scenario:** Multi-day project planning

**Without Memory Bridge:**
- Day 1: Plan architecture → Session ends → All context lost
- Day 2: "What were we building again?" → Repeat entire conversation
- Day 3: "Remind me of the tech stack?" → Frustrating repetition

**With Memory Bridge:**
- Day 1: Plan architecture → Auto-saved to memory
- Day 2: "Continue with the architecture" → Full context retrieved
- Day 3: "Update the database schema" → Knows exactly which schema

---

## API Reference

### `store(content, options)`
```javascript
await memory.store("Content to remember", {
  type: 'insight',      // 'insight', 'preference', 'error', 'decision'
  importance: 5,        // 1-10 scale
  source: 'conversation' // Where it came from
});
```

### `query(query, options)`
```javascript
const results = await memory.query("what to build", {
  limit: 5,        // Max results
  days: 30,        // Search last 30 days only
  minImportance: 3 // Filter by importance
});
// Returns: [{content, type, importance, created_at, relevance}]
```

### `timeline(days)`
```javascript
const history = await memory.timeline(7);
// Returns memories grouped by date
```

---

## Deployment Options

### Option 1: Local (Default)
```javascript
const memory = new MemoryBridge({
  storage: 'sqlite',
  path: './data/memory.db'
});
```
- ✅ Zero config
- ✅ 100% private
- ✅ Works offline
- ✅ Free forever

### Option 2: Supabase (Cloud)
```javascript
const memory = new MemoryBridge({
  storage: 'supabase',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY
});
```
- ✅ Access from multiple devices
- ✅ Share between agents
- ✅ Scalable
- ✅ Still your data

---

## Comparison

| Feature | Memory Bridge | Vector DB (Pinecone) | File Storage |
|---------|--------------|---------------------|--------------|
| Setup | 2 minutes | 30+ minutes | 5 minutes |
| Cost | Free | $70+/mo | Free |
| Search | Smart keywords | Semantic | None |
| Persistence | ✅ | ✅ | ❌ |
| Context window | Extended | Extended | None |
| Complexity | Simple | Complex | Simple |
| Best for | Quick win | Enterprise | Basic logging |

---

## Installation

```bash
# NPM
npm install memory-bridge

# Yarn
yarn add memory-bridge

# For OpenClaw (skill)
npx memory-bridge init
```

---

## License

MIT - Use it, fork it, build on it.

---

**Built for the agent economy. Infrastructure that remembers.** 🧠

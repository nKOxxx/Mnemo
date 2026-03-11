# Mnemo Persistence Test Report

**Date:** 2026-03-11  
**Tester:** Ares  
**Status:** ✅ PASSED

---

## Test Objective

Verify that Mnemo correctly persists data to disk and data survives server restarts (similar to AgentVault persistence test).

---

## Test Procedure

### Phase 1: Initial Storage
1. Start Mnemo server
2. Create new project "persistencetest"
3. Store 2 test memories:
   - Milestone: "Deployed v2.0 to Vercel..."
   - Security: "API key for testing is sk-test-12345"
4. Verify data exists via API query

### Phase 2: Server Restart
1. Stop Mnemo server completely
2. Verify process terminated
3. Wait 2 seconds
4. Restart Mnemo server
5. Verify server starts successfully

### Phase 3: Persistence Verification
1. Query project "persistencetest" via API
2. Verify both memories are retrievable
3. Direct SQLite database verification
4. Check data integrity (IDs, types, content)

---

## Test Results

### ✅ Phase 1: Storage - PASSED

```
POST /api/memory/store
{
  "content": "PERSISTENCE TEST: Deployed v2.0 to Vercel...",
  "type": "milestone",
  "importance": 8,
  "project": "persistencetest"
}

Response: ✅ Success
ID: 8dc1b5b7-e0c8-4d1a-abca-526391c7c454
```

```
POST /api/memory/store
{
  "content": "PERSISTENCE TEST: API key for testing is sk-test-12345",
  "type": "security", 
  "importance": 9,
  "project": "persistencetest"
}

Response: ✅ Success
ID: 0c5ca7c8-1625-42ef-b73a-a5d84e325b11
```

**Database file created:**
- Path: `~/.openclaw/data-lake/memory-persistencetest/bridge.db`
- Size: 28KB

---

### ✅ Phase 2: Restart - PASSED

```
$ ./start.sh stop
Mnemo stopped ✅

$ ./start.sh start
Starting Mnemo Data Lake...
✅ Mnemo running on http://localhost:10000
```

**Server restarted successfully**

---

### ✅ Phase 3: Verification - PASSED

#### API Query Results:
```json
{
  "query": "PERSISTENCE TEST",
  "project": "persistencetest",
  "count": 2,
  "results": [
    {
      "id": "0c5ca7c8-1625-42ef-b73a-a5d84e325b11",
      "content": "PERSISTENCE TEST: API key for testing is sk-test-12345",
      "content_type": "security",
      "importance": 9,
      "created_at": "2026-03-11T04:50:20.532Z"
    },
    {
      "id": "8dc1b5b7-e0c8-4d1a-abca-526391c7c454",
      "content": "PERSISTENCE TEST: Deployed v2.0 to Vercel with new features",
      "content_type": "milestone",
      "importance": 8,
      "created_at": "2026-03-11T04:50:20.517Z"
    }
  ]
}
```

#### Direct SQLite Verification:
```sql
SELECT id, content_type, content FROM memories 
WHERE content LIKE '%PERSISTENCE%';

8dc1b5b7-e0c8-4d1a-abca-526391c7c454|milestone|PERSISTENCE TEST: Deployed v2.0 to Verce
0c5ca7c8-1625-42ef-b73a-a5d84e325b11|security|PERSISTENCE TEST: API key for testing is
```

**Data Integrity Check:**
| Field | Before Restart | After Restart | Status |
|-------|----------------|---------------|--------|
| Memory ID 1 | 8dc1b5b7... | 8dc1b5b7... | ✅ Match |
| Memory ID 2 | 0c5ca7c8... | 0c5ca7c8... | ✅ Match |
| Type 1 | milestone | milestone | ✅ Match |
| Type 2 | security | security | ✅ Match |
| Importance 1 | 8 | 8 | ✅ Match |
| Importance 2 | 9 | 9 | ✅ Match |
| Content 1 | "Deployed..." | "Deployed..." | ✅ Match |
| Content 2 | "API key..." | "API key..." | ✅ Match |

---

## Summary

| Test Phase | Status | Notes |
|------------|--------|-------|
| Initial Storage | ✅ PASSED | 2 memories stored successfully |
| Server Stop | ✅ PASSED | Clean shutdown |
| Server Restart | ✅ PASSED | Server started successfully |
| Data Retrieval | ✅ PASSED | All data accessible via API |
| Data Integrity | ✅ PASSED | 100% match before/after |
| SQLite Direct | ✅ PASSED | Data verified in database file |

---

## Conclusion

**✅ Mnemo persistence is working correctly.**

- Data is written to SQLite database files
- Database files survive server restarts
- Data integrity is maintained across restarts
- No data loss detected

---

## Architecture Notes

**Storage Location:**
```
~/.openclaw/data-lake/
├── memory-general/bridge.db
├── memory-<project>/bridge.db
└── memory-persistencetest/bridge.db ← Test database
```

**Database Type:** SQLite3  
**Persistence:** File-based, survives process restarts  
**Backup:** Copy `~/.openclaw/data-lake/` directory  

---

## Recommendations

1. **Regular Backups:** Copy `~/.openclaw/data-lake/` to external storage
2. **Git Backup:** Consider backing up to private Git repo
3. **No Cloud Required:** All data is local and persistent
4. **Migration:** To migrate, copy database files to new machine

---

**Test Completed:** 2026-03-11 08:52 GMT+4  
**Result:** ✅ ALL TESTS PASSED

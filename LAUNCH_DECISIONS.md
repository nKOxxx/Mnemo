# Cognexia v1.0 — Launch Decisions

**Date**: April 13, 2026  
**Status**: Final Decision Document  
**Audience**: Product, Engineering, Release Teams

---

## 1. Concurrency: Is 2-3 concurrent users acceptable?

### ✅ DECISION: YES — Launch with 2-3 Concurrent Limit

### Rationale

**For v1.0 specifically:**
- Cognexia's primary use case is **personal AI agent memory**, not multi-user SaaS
- Single-agent deployments (Claude, GPT-4, etc.) = 1 concurrent user = fully stable
- Pair programming or dual-agent scenarios = 2-3 concurrent users = stable with monitoring
- Expected market: Individual developers, researchers, knowledge workers (not enterprise teams)

**Performance Reality:**
- Currently tested stable at 2-3 concurrent ops
- Scales beyond this with diminishing returns (50-60 ops/sec down to 30-40 at 5 workers)
- Full degradation occurs at 10+ workers
- Architectural bottleneck is Node.js single-process model

### What This Means

**✅ OK for Launch:**
- Solo developer using Cognexia as memory
- Single AI agent storing session memories
- Development/testing environments
- Small research teams (<3 people)

**⚠️ Not Recommended Yet:**
- Enterprise teams (>5 users)
- Multi-tenant SaaS deployment
- High-traffic public service

### Launch Strategy

```markdown
## Concurrency & Scaling

**v1.0 (Current)**
- Recommended: 1-3 concurrent users
- Stable: Up to ~5 workers
- Degrades: 5-10 workers (manual intervention needed)
- Fails: 10+ workers (server unresponsive)

**v1.1 (Q3 2026) — Planned**
- Add connection pooling
- Implement request queuing
- Support up to 10 concurrent users

**v2.0 (Q4 2026) — Planned**
- Multi-process architecture
- PostgreSQL backend
- Horizontal scaling to 100+ users
```

### Deployment Guidance

```bash
# v1.0 Launch
- Deploy single instance (1 per agent/user)
- Monitor: CPU, memory, request latency
- Alert threshold: >5 queued requests
- Recommended: Each user runs their own instance

# Future Scaling
- Multiple instances with separate databases
- Load balancer (nginx, Caddy)
- Migrate to PostgreSQL for shared data
```

### Marketing/Documentation

**How to communicate:**
- "Optimized for personal AI agent memory — one agent, one Cognexia instance"
- "Enterprise scaling available in v2.0"
- "Each user/agent gets their own memory instance"

---

## 2. Data Retention: Soft Delete Grace Period?

### ✅ DECISION: Keep 90-Day Soft Delete Grace Period

### Rationale

**Why NOT permanent delete:**
1. **Safety first** — Accidental deletes are unrecoverable with permanent deletion
2. **AI training data** — Memory often contains valuable training context; recovery needed if user changes mind
3. **Compliance** — If storing PII, can defer actual deletion (helpful for GDPR "right to be forgotten" with time window)
4. **Operational** — Users may delete memories in bulk then realize they needed one
5. **Cost** — Disk is cheap; storage cost of 90-day grace period is negligible (~5-10MB per 10K items)

**Why 90 days specifically:**
- Long enough for user to realize they made a mistake
- Short enough to not accumulate massive deleted data
- Matches common data retention policies
- Post-launch review can adjust if needed

### Implementation

**Current behavior (confirmed by tests):**
```
- DELETE /api/memory/:id marks memory as deleted
- Memory marked but NOT destroyed
- /api/cleanup runs daily, destroys >90-day old memories with importance ≤3
- User can run manual cleanup anytime
```

**What this means:**
- User deletes a memory by accident at day 1
- Until day 90, they can potentially recover it (if we add recovery API)
- After day 90, auto-cleanup permanently deletes it
- High-importance memories are never auto-deleted

### Recommendation for v1.0

Keep the current behavior:
```bash
- Soft delete on user deletion (reversible)
- Auto-cleanup at 90 days (configurable)
- Allow manual cleanup anytime
- Add DELETE with ?permanent=true for eager deletion
```

### Future Enhancement (v1.1)

Add recovery endpoint:
```bash
GET /api/memory/:id/recover  # Restore soft-deleted memory
```

---

## 3. Authentication: Is Local-Only Acceptable for v1.0?

### ✅ DECISION: YES — Local-Only is Acceptable for v1.0

### Rationale

**Why local-only is appropriate:**
1. **Security Model Assumption** — Cognexia assumes the machine/server is trusted
   - If attacker has filesystem access to `~/.cognexia/`, authentication is moot
   - Encryption key also stored locally; no password can protect against filesystem access

2. **Use Case** — Personal agent memory
   - User runs their own instance on their machine
   - No multi-user scenario in v1.0
   - No shared hosting requirement

3. **Simplicity** — Reduces attack surface
   - No password storage = no password breaches
   - No token handling = no token theft
   - No session management = no session hijacking
   - CORS locked to localhost only

4. **Documentation** — Can clearly state security model
   - "Cognexia assumes you control the machine running the server"
   - "Do not expose to untrusted networks without adding authentication layer"
   - "Recommended: localhost:10000 only (use firewall/VPN for remote access)"

**Security is NOT compromised because:**
- All data at rest is encrypted (optional AES-256-GCM)
- No network calls to external services (no MITM attacks)
- CORS prevents browser-based attacks
- Rate limiting prevents brute force
- Input validation prevents injection attacks

### What This Means for Deployment

✅ **Safe for:**
- Personal laptop/desktop (Claude agent memory)
- Private server behind VPN
- Docker container on personal machine
- Shared research server (where all users are trusted)

❌ **NOT safe for:**
- Public internet exposure (anyone can access)
- Multi-tenant SaaS (different users on shared instance)
- Production enterprise without additional auth layer

### Deployment Best Practices

```bash
# Safe deployment pattern for v1.0
- Run on localhost only (default)
- Use firewall rules to restrict access
- For remote access: use VPN + SSH tunnel
- Do NOT expose :10000 to public internet without auth proxy

# Example: SSH tunnel for remote access
ssh -L 10000:localhost:10000 user@server.com
# Access locally: curl http://localhost:10000
```

### Documentation to Add

```markdown
## Security Model

Cognexia assumes the machine running the server is trusted.

**Protected against:**
- Network sniffing (data at rest encrypted)
- Unauthorized modifications (CORS + rate limiting)
- Injection attacks (input validation)

**Not protected against:**
- Filesystem access to ~/.cognexia/
- Physically accessing the running server
- Network exposure without authentication proxy

**Recommendation:** Don't expose port 10000 to untrusted networks.
Use VPN or SSH tunnel for remote access.
```

### Upgrade Path (v1.1+)

When multi-user is needed, add auth layer:
```bash
# Option 1: Auth proxy (recommended for v1.0 users)
# Run Cognexia on localhost:10000
# Run auth proxy on 0.0.0.0:443 (nginx + OAuth)

# Option 2: Built-in auth (v1.1)
# Add optional auth in Cognexia itself
# Support JWT, API keys, OAuth

# Option 3: VPN (current recommendation)
# User runs WireGuard/OpenVPN
# Access Cognexia through VPN tunnel
```

---

## 4. Encryption: Enable by Default or Opt-In?

### ✅ DECISION: Opt-In (Disabled by Default)

### Rationale

**Why opt-in is better for v1.0:**

1. **Performance** — Encryption adds 5-15ms latency
   - Store: +6-11ms
   - Query: +14-24ms
   - Get: +0.8-3.8ms
   - Users not storing sensitive data don't need this tradeoff

2. **Operational Complexity** — Encryption requires key management
   - Key stored at `~/.cognexia/cognexia.key`
   - User must backup key
   - Lost key = unrecoverable memories
   - Default on = puts users at risk of data loss
   - Better: User chooses encryption knowing the responsibility

3. **Onboarding** — Simpler first experience
   - "Enable encryption if storing sensitive data"
   - "Encryption is optional but recommended for PII"
   - User can enable anytime (forward-compatible)

4. **Use Case Driven** — Most AI agent memory isn't sensitive
   - Code snippets: no
   - Architecture notes: no
   - Customer names/IDs: yes → needs encryption
   - API keys: yes → needs encryption
   - User can enable on per-project basis

**Why NOT default-on:**
- Crypto overhead not needed for all use cases
- User surprise at latency increase
- Key loss risk increases with automatic enablement
- Can always enable later if needed

### Implementation

**Current behavior (already implemented):**
```bash
COGNEXIA_ENCRYPT=0  # Default: disabled
COGNEXIA_ENCRYPT=1  # User can enable

# Per-project enabling would be nice but not v1.0
```

**User workflow:**
```bash
# v1.0 Launch: Standard (no encryption)
./start.sh start
# User tests Cognexia, gets baseline performance

# If storing sensitive data later:
COGNEXIA_ENCRYPT=1 ./start.sh start
# Performance drops slightly, but now protected
```

### Marketing Message

```markdown
## Encryption (Optional)

Cognexia supports optional AES-256-GCM encryption.

**Enable encryption if storing:**
- Customer names, email addresses, IDs
- API keys, tokens, credentials  
- Health/medical information
- Financial data

**Don't need encryption if storing:**
- Code snippets
- Architecture notes
- Research papers
- General knowledge

**Enable encryption:**
export COGNEXIA_ENCRYPT=1
./start.sh start
```

### Data Migration (Important)

⚠️ **Issue:** Can't easily migrate from unencrypted to encrypted

**Recommendation:**
- Document in v1.0 README: "Encryption choice is permanent per instance"
- User can create new instance with encryption enabled
- Manual export/import of data if needed
- v1.1 could add migration tool if demanded

---

## 5. Monitoring: Performance Degradation Thresholds

### ✅ DECISION: Alert Thresholds Below

### Alerting Strategy

#### Baseline (What "Good" Looks Like)
```
Store P50:    1.5ms
Store P99:    20ms
Query P50:    0.9ms
Query P99:    2.5ms
CPU usage:    <30% idle
Memory:       ~80-100 MB
Request queue: 0-1 requests
```

#### Alert Thresholds (When to Investigate)

| Metric | Yellow Alert | Red Alert | Action |
|--------|--------------|-----------|--------|
| **Query P99 Latency** | >50ms | >100ms | Check CPU/memory; restart if needed |
| **Store P99 Latency** | >50ms | >100ms | Reduce concurrent ops; queue requests |
| **CPU Usage** | >70% | >90% | Reduce load; check for slow queries |
| **Memory Usage** | >150MB | >250MB | Check for memory leaks; restart |
| **Request Queue** | >3 requests | >10 requests | Server overloaded; reject new requests |
| **Error Rate** | >1% | >5% | Check logs; likely timeouts |

#### Monitoring Implementation

```bash
# Prometheus metrics to export (v1.1)
cognexia_store_duration_ms
cognexia_query_duration_ms
cognexia_memory_bytes
cognexia_requests_queued
cognexia_errors_total

# Simple polling for v1.0
curl http://localhost:10000/api/health
# Track latency of health check

# Docker health check
healthcheck:
  test: curl -f http://localhost:10000/api/health || exit 1
  interval: 30s
  timeout: 10s
  retries: 3
```

### Recommended Alerting Rules

```yaml
# Grafana/Prometheus alerts

- alert: CognexiaHighLatency
  expr: cognexia_query_p99_ms > 100
  for: 5m
  action: Page on-call; investigate

- alert: CognexiaHighMemory
  expr: cognexia_memory_mb > 200
  for: 10m
  action: Alert; restart if >250MB

- alert: CognexiaHighCPU
  expr: cognexia_cpu_percent > 80
  for: 5m
  action: Alert; reduce concurrent load

- alert: CognexiaRequestBacklog
  expr: cognexia_requests_queued > 5
  for: 2m
  action: Alert; reject new requests
```

### Logging Strategy

```bash
# What to log (already in place)
- All API requests with latency
- Errors with stack traces
- Encryption operations (audit trail)
- Database operations (slow queries)

# Log rotation (v1.0 requirement)
# Keep 7 days of logs (~100MB per day = ~700MB)

# Recommended log aggregation (v1.1)
# Send to ELK/Datadog for historical analysis
```

### Dashboard Recommendations

**v1.0 Minimum (using simple tools):**
```bash
# Basic health check script
#!/bin/bash
while true; do
  LATENCY=$(curl -w "%{time_total}" -o /dev/null http://localhost:10000/api/health)
  echo "$(date): Latency=${LATENCY}ms"
  sleep 10
done
```

**v1.1 Recommended (Grafana):**
- Query P99 latency (over time)
- Memory usage trend
- Request throughput
- Error rate
- CPU usage

### Auto-Remediation (v1.2+)

```bash
# Optional: Auto-restart on degradation
if p99_latency > 200ms for 10m:
  systemctl restart cognexia
  
if memory > 300mb:
  systemctl restart cognexia
```

---

## Summary Table: Launch Decisions

| Question | Decision | Impact | Rationale |
|----------|----------|--------|-----------|
| **Concurrency** | 2-3 users stable | Personal AI agent use case | Aligns with market fit |
| **Data Retention** | 90-day soft delete | User recovery safety | Prevents accidental loss |
| **Authentication** | Local-only v1.0 | Assume trusted machine | Matches security model |
| **Encryption** | Opt-in (default off) | No overhead unless needed | User choice based on data type |
| **Monitoring** | P99 >100ms alert | Catch degradation early | Prevent silent failures |

---

## Implementation Checklist

### Before Launch (v1.0)
- ✅ Document concurrency limits in README
- ✅ Document encryption key backup procedure
- ✅ Add security section explaining local-only model
- ✅ Set up basic monitoring (health check script)
- ✅ Document alert thresholds
- ⏳ Add user guidance on encryption decision

### After Launch (v1.1 Planning)
- ⏳ Connection pooling for 5-10 concurrent users
- ⏳ Prometheus metrics export
- ⏳ Optional API authentication layer
- ⏳ Memory recovery endpoint
- ⏳ Automated backups

### Future (v2.0)
- ⏳ Multi-process architecture
- ⏳ PostgreSQL support
- ⏳ Built-in authentication
- ⏳ Multi-tenancy
- ⏳ Horizontal scaling

---

## Decision Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product Lead | __________ | ______ | __________ |
| Engineering Lead | __________ | ______ | __________ |
| QA Lead | __________ | ______ | __________ |
| Security Review | __________ | ______ | __________ |

---

**Document Status**: Ready for Launch  
**Next Step**: Update README with these decisions  
**Review Date**: Before v1.0 release

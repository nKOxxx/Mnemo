# Mnemo Trigger Words - Complete List

Mnemo activates (stores memories) when these words/phrases are detected in conversations.

## 🎯 Activation Thresholds

| Score | Action | Example |
|-------|--------|---------|
| 8-10 | Auto-store + notify | Security, milestones, new projects |
| 5-7 | Auto-store silently | Decisions, issues, goals, deployment |
| <5 | Suggest or ignore | Preferences, questions, UI details |

---

## 🔴 CRITICAL (Score 9) - Auto-store + Notify

### Security Keywords
- `api key` / `apikey`
- `password` / `passwd`
- `secret` / `secret key`
- `token` / `access token` / `bearer token`
- `credential` / `credentials`
- `private key` / `public key` / `ssh key`
- `env var` / `environment variable` / `.env`
- `auth` / `authentication` / `authorization`
- `encryption` / `encrypted`
- `vulnerability` / `exploit` / `leak` / `breach` / `hack`

**Why:** Security information is always critical to remember

---

## 🟠 HIGH (Score 8) - Auto-store

### Milestone Keywords
- `shipped` / `released` / `launched`
- `deployed` / `in production` / `went live`
- `completed` / `finished` / `done`
- `v1.0` / `v2.0` / `v3.0` (version numbers)
- `merged` / `published`

**Why:** Track project progress and releases

---

## 🟡 MEDIUM-HIGH (Score 7) - Auto-store

### Decision Keywords
- `decided to` / `decision:`
- `i decided` / `we decided`
- `chose to` / `going with` / `settled on`
- `finalized` / `concluded`

### Issue/Bug Keywords
- `bug:` / `error:` / `issue:` / `problem:`
- `broken` / `fails` / `failed`
- `crash` / `exception`
- `not working` / `doesn't work`
- `timeout` / `502` / `500` / `404`
- `fix:` / `hotfix`

### Important Keywords
- `important:` / `critical:` / `urgent:`
- `must` / `essential` / `crucial` / `vital`
- `key point` / `priority`
- `blocking` / `breaking change`

**Why:** Decisions need tracking, bugs need remembering, important stuff can't be lost

---

## 🟢 MEDIUM (Score 6) - Auto-store

### Goal Keywords
- `goal is` / `objective:` / `target:`
- `aiming for` / `plan to` / `need to` / `want to`
- `the plan is` / `roadmap` / `milestone:`
- `deliverable`

### Deployment Keywords
- `deploy` / `deployment`
- `vercel` / `production` / `staging`
- `ci/cd` / `pipeline` / `github actions`
- `build` / `release` / `rollback`
- `docker` / `kubernetes` / `k8s`
- `aws` / `ec2` / `lambda` / `serverless`

### Architecture Keywords
- `architecture` / `design:` / `structure:`
- `pattern:` / `refactor` / `redesign` / `restructure`
- `tech stack` / `framework` / `library`
- `module` / `component` / `service` / `microservice`

### Database Keywords
- `database` / `db:`
- `postgres` / `mysql` / `mongodb` / `sqlite`
- `prisma` / `migration` / `schema`
- `table` / `query` / `sql` / `nosql`
- `redis` / `supabase`

### Performance Keywords
- `performance` / `optimize` / `optimization`
- `speed` / `latency` / `throughput`
- `benchmark` / `profiling`
- `memory leak` / `cpu` / `slow`
- `cache` / `caching` / `cdn`

**Why:** Technical context that's worth remembering

---

## 🔵 LOW-MEDIUM (Score 5) - Auto-store Silently

### GitHub Keywords
- `github` / `git` / `commit`
- `pull request` / `pr #` / `merge`
- `branch` / `repository` / `repo:`
- `clone` / `fork` / `push`
- `issue #` / `github.com`

### API Keywords
- `api:` / `endpoint` / `route`
- `controller` / `middleware`
- `request` / `response`
- `rest` / `graphql` / `websocket`
- `json` / `payload` / `header` / `authentication`

### Description Keywords
- `description:` / `overview:` / `summary:`
- `details:` / `spec:` / `specification`
- `requirements` / `scope`
- `functionality` / `feature:`
- `user story`

### Testing Keywords
- `test:` / `testing`
- `unit test` / `integration test` / `e2e`
- `cypress` / `jest` / `mocha`
- `coverage` / `mock` / `stub`
- `tdd` / `qa` / `quality assurance`

### Learning Keywords
- `learned that` / `realized` / `discovered`
- `found out` / `turns out`
- `note:` / `remember that`
- `insight:` / `takeaway` / `lesson learned`

### Third-Party Keywords
- `stripe` / `twilio` / `sendgrid`
- `aws` / `gcp` / `azure` / `firebase`
- `auth0` / `clerk` / `supabase`
- `openai` / `anthropic` / `gemini` / `deepseek`

**Why:** Good context to have, but not critical

---

## ⚪ LOW (Score 4) - Suggest or Ignore

### Preference Keywords
- `prefer` / `i like` / `i want`
- `don't like` / `hate` / `love` / `favorite`
- `i hate` / `i dislike`

### UI Keywords
- `ui:` / `ux:` / `interface` / `design`
- `frontend` / `css` / `tailwind`
- `component` / `layout` / `responsive`
- `mobile` / `desktop` / `theme` / `dark mode`

### Question Keywords
- `question:` / `how do i` / `how to`
- `what is` / `why does`
- `can you explain` / `help with`
- `stuck on` / `confused about`

**Why:** Personal preferences and questions are lower priority

---

## 🚀 EXPLICIT (Score 9+) - Immediate Action

### New Project Triggers
- `new project` / `create project`
- `start project` / `begin project`
- `init project` / `project:`

**Action:** Creates new project, extracts name, stores as goal

---

## 📊 Trigger Categories Summary

| Category | Score | Count | Examples |
|----------|-------|-------|----------|
| Security | 9 | 15 | api key, password, secret, token |
| Milestones | 8 | 10 | shipped, deployed, v1.0, released |
| Decisions | 7 | 7 | decided to, going with, finalized |
| Issues | 7 | 12 | bug, error, crash, 500, timeout |
| Important | 7 | 8 | critical, urgent, blocking |
| Goals | 6 | 9 | goal is, plan to, roadmap |
| Deployment | 6 | 13 | vercel, docker, aws, ci/cd |
| Architecture | 6 | 10 | refactor, framework, service |
| Database | 6 | 10 | postgres, migration, schema |
| Performance | 6 | 9 | optimize, cache, benchmark |
| GitHub | 5 | 9 | commit, pr, merge, branch |
| API | 5 | 9 | endpoint, rest, graphql |
| Description | 5 | 9 | spec, requirements, feature |
| Testing | 5 | 8 | unit test, coverage, jest |
| Learning | 5 | 8 | learned, realized, insight |
| Third-Party | 5 | 9 | stripe, aws, openai |
| Preferences | 4 | 7 | prefer, like, want |
| UI | 4 | 9 | frontend, css, responsive |
| Questions | 4 | 7 | how to, what is, help |

**Total: 194 trigger words/phrases across 19 categories**

---

## 🎯 How It Works

1. **Message arrives** → Mnemo analyzes
2. **Check triggers** → Score each category found
3. **Sum scores** → Calculate total importance (0-10)
4. **Take action:**
   - Score 8+: Auto-store + notification
   - Score 5-7: Auto-store silently
   - Score <5: Ignore or suggest

### Example Scoring

```
Message: "Deployed v2.0 to Vercel, but found a bug in auth"

Triggers found:
- milestone: deployed (8 pts)
- milestone: v2.0 (8 pts)  
- deployment: vercel (6 pts)
- issue: bug (7 pts)
- security: auth (9 pts)

Total Score: 10/10 → Auto-store + notify
Type: milestone (highest scoring category)
```

---

## 🔧 Customizing Triggers

Add custom triggers to `mnemo-smart-hook.js`:

```javascript
this.SMART_TRIGGERS.blockchain = {
  patterns: ['blockchain', 'smart contract', 'token', 'web3'],
  score: 6,
  type: 'insight'
};
```

---

**Last Updated:** 2026-03-11  
**Total Triggers:** 194 words/phrases  
**Categories:** 19

# Bridge - Technical Debt Management Platform

## Product Overview

Bridge is a sophisticated technical debt analysis and monitoring tool that helps engineering teams understand, quantify, and prioritize technical debt across their repositories. It combines static code analysis with intelligent prioritization to provide actionable insights.

**Core Value Proposition:** Bridge doesn't just surface data - it acts as an assistant for understanding and paying down technical debt, helping teams reason about what to upgrade, in what order, and why.

### Tech Stack
- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (Supabase) - *migrating from SQLite*
- **Analysis Tools:** Madge, Depcheck, npm-check-updates
- **AI:** Disabled (rule-based scoring provides deterministic results)

---

## Current State (December 2024)

### What's Working

1. **Multi-Repository Dashboard**
   - Add/connect GitHub repositories
   - View all repos in grid layout with health scores
   - Color-coded health indicators
   - Scan history per repository
   - Search, filter, and sort repositories

2. **Comprehensive Bridge Score (v2.0)**
   - Dependencies (30%): Outdated packages, deprecated, missing, unused, security
   - Architecture (25%): Circular deps, barrel files, god files, deep nesting
   - Code Quality (20%): TypeScript usage, TODO count, console.logs
   - Testing (15%): Test file presence, test-to-code ratio, test config
   - Documentation (10%): README, CHANGELOG, CONTRIBUTING presence
   - Letter grades (A-F) with executive summary for stakeholders
   - Prioritized actionable tasks with effort/impact ratings

3. **Enhanced Dependency Prioritization**
   - Priority tiers (Critical, High, Medium, Low)
   - Category badges (Core, Build, Test, Types, Util)
   - Version distance display (2M 3m 1p format)
   - Deprecated package detection via npm registry
   - Peer dependency relationship mapping
   - Blocking/unlocking relationship visualization
   - Suggested upgrade order with step-by-step paths
   - Quick wins section for high-impact, low-effort updates
   - One-click copy upgrade commands

4. **UX Polish (Phase 1 Complete)**
   - Real-time scan progress with 7 phases
   - Error boundaries and inline error handling
   - Input validation with helpful feedback
   - Skeleton loaders for repositories
   - NPM package links

5. **Data Export**
   - Export scan results as JSON

### What's Disabled

1. **AI Analysis (Gemini)**
   - Disabled in favor of deterministic rule-based scoring
   - More consistent, explainable, and cost-effective

2. **Repomix Compression**
   - Disabled since AI is off
   - Significantly speeds up scans

### What's In Progress

1. **PostgreSQL Migration**
   - Migrating from SQLite to Supabase PostgreSQL
   - Enables multi-user and cloud deployment

---

## Architecture

### Data Flow
```
User → React UI → Express API → Worker Process
                      ↓              ↓
                  PostgreSQL    Analysis Pipeline
                                     ↓
                             Git Clone → npm install
                                     ↓
                          Static Analysis (Madge, NCU, Depcheck)
                                     ↓
                          Rule-Based Scoring
                                     ↓
                          Store Results in DB
```

### Key Files
- `App.tsx` - Main React application with dashboard
- `server/index.js` - Express REST API
- `server/worker.js` - Scan processing pipeline
- `server/prioritization.js` - NCU enhancement and upgrade path logic
- `server/scoring.js` - Rule-based health scoring
- `server/db.js` - Database connection (SQLite → PostgreSQL)
- `types.ts` - TypeScript interfaces

### Database Schema
```sql
CREATE TABLE repositories (
  id SERIAL PRIMARY KEY,
  "repoUrl" TEXT UNIQUE NOT NULL,
  name TEXT,
  owner TEXT,
  "lastScanId" INTEGER,
  "lastScore" INTEGER,
  "isActive" INTEGER DEFAULT 1,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE scans (
  id SERIAL PRIMARY KEY,
  "repositoryId" INTEGER REFERENCES repositories(id),
  "repoUrl" TEXT,
  status TEXT DEFAULT 'pending',
  progress JSONB,
  data JSONB,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  "githubId" TEXT UNIQUE,
  username TEXT,
  email TEXT,
  "avatarUrl" TEXT,
  "accessToken" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "lastLoginAt" TIMESTAMP DEFAULT NOW()
);
```

---

## Roadmap Progress

### Phase 1: Core Experience Polish ✅ COMPLETE
- [x] Scan progress indicators (7 phases)
- [x] Error boundaries and inline errors
- [x] Input validation with feedback
- [x] Loading states/skeleton loaders
- [x] Repository search/filter/sort
- [x] Copy upgrade commands
- [x] NPM package links

### Phase 2: Deployment 🔄 IN PROGRESS
- [x] Supabase project created
- [ ] PostgreSQL migration (db.js update)
- [ ] Backend deployment (Railway)
- [ ] Frontend deployment (Vercel)
- [ ] Environment configuration

### Phase 3: Authentication (Not Started)
- [ ] GitHub OAuth flow
- [ ] Session management
- [ ] User-scoped data

### Phase 4: Team Features (Not Started)
- [ ] Organization support
- [ ] Shared repositories
- [ ] Historical trends

---

## Technical Notes

### Bridge Score System (v2.0)

The Bridge Score is a comprehensive 1-100 metric designed to be understandable by both technical and non-technical stakeholders.

#### Score Categories & Weights
```javascript
WEIGHTS = {
  dependencies: 0.30,    // Package health, outdated, deprecated, missing
  architecture: 0.25,    // Circular deps, barrel files, god files
  codeQuality: 0.20,     // TypeScript, TODOs, console.logs
  testing: 0.15,         // Test files, coverage, config
  documentation: 0.10    // README, CHANGELOG, CONTRIBUTING
}
```

#### What Gets Measured
- **Dependencies**: Deprecated packages, version lag, unused/missing deps, security
- **Architecture**: Circular dependencies, barrel files, large files (>500 lines)
- **Code Quality**: TypeScript usage, TODO/FIXME count, console.log count
- **Testing**: Test file presence, test-to-code ratio, test config
- **Documentation**: README presence/length, CHANGELOG, CONTRIBUTING

#### Actionable Tasks
The scoring system generates prioritized, actionable tasks for developers:
- Each task has **impact** (critical/high/medium/low)
- Each task has **effort** (trivial/light/medium/heavy/major)
- Tasks include specific commands, consequences, and affected items
- Sorted by priority: high impact + low effort = highest priority

#### Executive Summary
Each scan produces a plain-English summary for PMs and executives explaining:
- Current health status
- Number of critical issues
- Recommended next steps

### Package Priority Scoring
```javascript
Category boost: core-framework (+30), build-tool (+25), testing (+15)
Version distance: 3+ major (+25), 2 major (+20), 1 major (+15)
Deprecated: +20
Blocks others: +5 per blocked package
Production dep: +5

Priority tier: critical (70+), high (50+), medium (30+), low (<30)
```

---

## Quick Reference

### Start Development
```bash
npm install
npm run dev        # Frontend on :5173
npm run server     # Backend on :3001
```

### Environment Variables
```
DATABASE_URL=postgresql://...     # Supabase connection
GITHUB_TOKEN=ghp_xxx              # For GitHub API
GITHUB_CLIENT_ID=xxx              # For OAuth (not implemented)
GITHUB_CLIENT_SECRET=xxx          # For OAuth (not implemented)
```

---

## Files Cleaned Up

Removed obsolete files:
- `context.md` - Senior engineer feedback (implemented)
- `systemprompt.md` - AI prompt (AI disabled)
- `SETUP.md` - Redundant with README
- `components/AIInsights.tsx` - Unused (AI disabled)
- `components/UploadZone.tsx` - Unused

Remaining documentation:
- `README.md` - Project overview
- `claude.md` - Development context (this file)
- `tasks.md` - Roadmap and tasks
- `SETUP-INFRASTRUCTURE.md` - Deployment guide

---

Last Updated: 2024-12-31

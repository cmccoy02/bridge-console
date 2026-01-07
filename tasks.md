# Bridge MVP Roadmap - 30-60 Day Sprint

## The Goal
Get Bridge to a state where **5-10 dev teams can use it daily** to manage their technical debt. Not feature-complete, but genuinely useful.

## Current Reality Check
- ✅ Core analysis works well (NCU prioritization, 5D scoring)
- ✅ UI is polished and distinctive
- ✅ Scans now show real-time progress (7 phases with visual feedback)
- ✅ Error handling with boundaries and inline errors
- ✅ Input validation with helpful feedback
- ✅ Search/filter/sort for repositories
- ❌ Local-only (can't share with team)
- ❌ Demo auth only
- ❌ No persistence across devices

---

## Phase 1: Core Experience Polish (Week 1-2) ✅ COMPLETE

**Goal:** Make the current product feel professional and responsive.

### Must Have (P0) ✅

- [x] **Scan Progress Indicators**
  - Shows current phase: Cloning → Installing → Analyzing → Scoring
  - Displays elapsed time
  - Shows percentage and step count (Step 3/7)
  - Files: `server/worker.js`, `App.tsx`, `components/ScanProgress.tsx`

- [x] **Error Boundaries**
  - React ErrorBoundary catches crashes gracefully
  - InlineError component for non-fatal errors
  - Copy error details button for bug reports
  - File: `components/ErrorBoundary.tsx`

- [x] **Input Validation**
  - Validates GitHub URLs with real-time feedback
  - Normalizes various input formats (owner/repo, github.com/..., etc.)
  - Shows inline validation errors
  - Files: `App.tsx`, `utils/validation.ts`

- [x] **Loading States**
  - Skeleton loaders for repository cards
  - Loading state while fetching repos
  - Proper loading indicators for all async operations

### Nice to Have (P1) - Partially Complete

- [ ] **Partial Results Display**
  - Show analysis results as they complete (not just at the end)
  - e.g., Show circular deps while NCU is still running
  
- [ ] **Scan Caching**
  - Skip npm install if lockfile unchanged
  - Cache analysis results for X hours
  - "Re-scan" vs "Use cached results" option

- [x] **Repository Search/Filter**
  - Filter by name/owner
  - Sort by score, date, name
  - Quick filter: "Needs Attention" (score < 70)

### Bonus Completed ✅

- [x] **Copy Upgrade Commands**
  - One-click copy for individual packages
  - Bulk copy for upgrade path steps
  
- [x] **NPM Package Links**
  - Direct links to npm package pages

---

## Phase 2: Deployment (Week 3-4)

**Goal:** Get Bridge accessible from anywhere. This unblocks real user testing.

### Infrastructure Setup

- [x] **PostgreSQL Migration**
  - ✅ Set up Supabase project (free tier)
  - ✅ Update `server/db.js` for PostgreSQL
  - ✅ Migrate schema (mostly compatible SQL)
  - ✅ Created `.env.example` with DATABASE_URL format
  - ⚠️ Connection needs verification (Supabase project may be paused)

- [ ] **Backend Deployment (Railway)**
  - Create Railway project
  - Configure environment variables
  - Set up GitHub auto-deploy
  - Verify API endpoints work
  - Estimated: 2-3 hours

- [ ] **Frontend Deployment (Vercel)**
  - Connect Vercel to repo
  - Configure build settings
  - Set up environment variables
  - Custom domain (optional)
  - Estimated: 1-2 hours

- [x] **Environment Configuration**
  - ✅ Create `.env.example` with all required vars
  - Document deployment process
  - Set up staging vs production environments

### Post-Deployment Verification

- [ ] End-to-end test: Add repo → Scan → View results
- [ ] Performance baseline (scan time in production)
- [ ] Error monitoring setup (Sentry free tier)

---

## Phase 3: Authentication (Week 5-6)

**Goal:** Real users with real accounts. Required for any multi-user features.

### GitHub OAuth

- [ ] **OAuth Flow**
  - Create GitHub OAuth App
  - Implement authorization redirect
  - Handle callback and token exchange
  - File: `server/index.js` (endpoints exist, need testing)

- [ ] **Session Management**
  - JWT or session cookies
  - Secure token storage
  - Auto-refresh tokens
  - Logout functionality

- [ ] **User-Scoped Data**
  - Repositories belong to users
  - Filter queries by userId
  - "My Repositories" vs "Organization Repositories"

- [ ] **Update UI**
  - Replace "Demo User" with real user data
  - Show GitHub avatar
  - Add profile dropdown
  - Settings page (basic)

---

## Phase 4: Team Features (Week 7-8)

**Goal:** Multiple people can collaborate on the same repos.

### Organization Support

- [ ] **Organization Model**
  - Create organizations table
  - User-organization membership
  - Invite users to org

- [ ] **Shared Repositories**
  - Repos belong to orgs, not users
  - All org members see same repos
  - Scan history visible to all members

- [ ] **Basic Permissions**
  - Admin: Can add/remove repos, invite members
  - Member: Can view and trigger scans

### Historical Trends

- [ ] **Score History Chart**
  - Line chart of score over time
  - Per-dimension trend lines
  - "Score improved 12 points in 30 days"

- [ ] **Changelog**
  - What changed between scans?
  - New issues, resolved issues
  - Dependency changes

---

## Backlog (Post-MVP)

These are valuable but not required for initial launch:

### Automation
- [ ] GitHub App integration (auto-scan on push)
- [ ] PR comments with health score
- [ ] Scheduled scans (weekly, daily)

### Notifications
- [ ] Email alerts for score drops
- [ ] Slack integration
- [ ] Discord webhooks

### Advanced Analysis
- [ ] Vulnerability scanning (npm audit)
- [ ] License compliance checking
- [ ] Custom rule configuration

### Performance
- [ ] Background job queue (BullMQ)
- [ ] Parallel scans
- [ ] File storage for artifacts (R2)

### AI (Re-enable)
- [ ] Gemini integration with better prompts
- [ ] AI-generated upgrade guides
- [ ] Natural language queries

---

## Quick Wins (Can Do Anytime)

Small improvements that punch above their weight:

- [ ] **Copy upgrade commands** - One-click copy `npm install package@latest`
- [ ] **Export as markdown** - Shareable scan report
- [ ] **Keyboard shortcuts** - `r` to rescan, `f` to filter
- [ ] **Dark/light mode toggle** - Some people want light mode
- [ ] **Scan ETA** - "Based on repo size, ~45 seconds remaining"
- [ ] **Package links** - Click package name → npm page
- [ ] **Diff view** - Compare two scans side-by-side
- [ ] **Repo tags** - Organize repos by team/project

---

## Success Criteria

### Week 2 ✅ COMPLETE
- [x] Scans show progress (not just spinner)
- [x] Errors are handled gracefully
- [x] Input validation works
- [x] Repository search/filter/sort
- [x] Copy commands to clipboard
- [x] NPM links for packages

### Week 4
- [ ] Bridge is deployed and accessible at a URL
- [ ] Can use from any device
- [ ] Basic error monitoring in place

### Week 6
- [ ] Real GitHub login works
- [ ] User data persists
- [ ] Repos are user-scoped

### Week 8
- [ ] Teams can share repositories
- [ ] Historical trends visible
- [ ] 5+ external users actively using it

---

## Resource Estimates

### Monthly Costs (MVP)
- Supabase (free tier): $0
- Railway (Hobby): $5
- Vercel (free tier): $0
- Sentry (free tier): $0
- **Total: ~$5/month**

### Time Investment
- Phase 1: 15-20 hours
- Phase 2: 10-15 hours
- Phase 3: 15-20 hours
- Phase 4: 20-25 hours
- **Total: 60-80 hours** (30-40 with AI assistance)

---

## Notes

### What I'm Overlooking
1. **Mobile responsiveness** - Works but not optimized
2. **Accessibility** - No ARIA labels, keyboard nav is rough
3. **Rate limiting** - Anyone could spam the API
4. **Scan abuse** - No limits on scan frequency
5. **Large repos** - What happens with 500k+ LOC repos?
6. **Monorepos** - Multiple package.json files

### Risks
1. **npm install in untrusted repos** - Security concern
2. **GitHub rate limits** - Could hit API limits
3. **Supabase free tier limits** - May need to upgrade
4. **Scan timeouts** - Large repos could exceed limits

### Open Questions
1. Pricing model? Free tier + paid?
2. Target audience? Startups? Enterprise?
3. Integrate with GitHub App or stay standalone?
4. Re-enable AI analysis or keep it rule-based?

---

Last Updated: 2024-12-19


# Bridge MVP Roadmap

## The Goal
Get Bridge to a state where **5-10 dev teams can use it daily** to manage their technical debt. Not feature-complete, but genuinely useful.

---

## Current Status (January 2026)

### What's Working
- Core analysis (NCU prioritization, 5D scoring)
- Polished, distinctive UI
- Real-time scan progress (7 phases)
- Error handling with boundaries
- Input validation with feedback
- Search/filter/sort for repositories
- Copy upgrade commands
- NPM package links
- Electron desktop app with embedded server
- GitHub OAuth + Demo mode authentication
- Auto-login for Electron users
- Repository disconnect feature
- Remove unused dependencies via PR
- Minor/patch updates via PR
- Automations tab with scheduling UI

### What's Pending
- Backend deployment (Railway/Vercel)
- Scheduler service for automations
- Historical trend charts
- Organization/team support

---

## Phase 1: Core Experience Polish - COMPLETE

- [x] Scan progress indicators (7 phases)
- [x] Error boundaries and inline errors
- [x] Input validation with feedback
- [x] Loading states and skeleton loaders
- [x] Repository search/filter/sort
- [x] Copy upgrade commands
- [x] NPM package links

---

## Phase 2: Desktop App (Electron) - COMPLETE

- [x] Electron wrapper with embedded Express server
- [x] Health check before window display
- [x] Auto-login for desktop users
- [x] Native app menu with keyboard shortcuts
- [x] Tailwind CSS bundling (PostCSS)
- [x] Proper Content Security Policy
- [x] SQLite database with configurable path

---

## Phase 3: Repository Management - COMPLETE

- [x] Add repositories via URL or GitHub browser
- [x] Disconnect/remove repositories
- [x] View scan history per repository
- [x] Export scan results as JSON

---

## Phase 4: Automated Actions - COMPLETE

- [x] Run minor/patch updates via PR
- [x] Remove unused dependencies via PR
- [x] Automations tab with scheduling UI
- [x] Frequency options (manual/daily/weekly/monthly)
- [ ] Scheduler service (settings saved, service not active)

---

## Phase 5: Deployment - IN PROGRESS

### Infrastructure
- [x] PostgreSQL schema ready (dual SQLite/Postgres support)
- [x] Supabase project created
- [ ] Backend deployment (Railway)
- [ ] Frontend deployment (Vercel)
- [ ] Environment configuration docs
- [ ] End-to-end production testing

---

## Phase 6: Authentication Enhancements - PARTIAL

- [x] GitHub OAuth flow (basic)
- [x] Demo mode for quick testing
- [x] User session handling
- [ ] Token refresh
- [ ] User-scoped repositories
- [ ] Organization support

---

## Phase 7: Team Features - NOT STARTED

- [ ] Organization model
- [ ] Shared repositories
- [ ] Team permissions (Admin/Member)
- [ ] Historical trend charts
- [ ] Score comparison between scans

---

## Backlog (Post-MVP)

### Automation Enhancements
- [ ] GitHub App integration (auto-scan on push)
- [ ] PR comments with health score
- [ ] Dependabot signal integration

### Notifications
- [ ] Email alerts for score drops
- [ ] Slack reports (daily/weekly)
- [ ] Discord webhooks

### Advanced Analysis
- [ ] Vulnerability scanning (npm audit)
- [ ] License compliance checking
- [ ] Monorepo support
- [ ] Custom rule configuration

### Performance
- [ ] Background job queue (BullMQ)
- [ ] Parallel scans
- [ ] Scan caching
- [ ] Large repo optimization

### Business
- [ ] Organization profiles and goals
- [ ] Improved scoring algorithm
- [ ] Payment processing
- [ ] Enterprise features

---

## Quick Wins

Small improvements that punch above their weight:

- [x] Copy upgrade commands
- [x] NPM package links
- [ ] Export as markdown report
- [ ] Keyboard shortcuts (r=rescan, f=filter)
- [ ] Dark/light mode toggle
- [ ] Scan ETA based on repo size
- [ ] Diff view (compare scans)
- [ ] Repo tags for organization

---

## Technical Debt (In Our Own Codebase)

- [ ] Code-split the 622KB bundle
- [ ] Add proper TypeScript strict mode
- [ ] Unit tests for scoring logic
- [ ] E2E tests for critical flows
- [ ] Mobile responsive polish
- [ ] Accessibility (ARIA labels)
- [ ] Rate limiting on API

---

## Risks & Open Questions

### Security Concerns
- npm install in untrusted repos
- GitHub rate limits
- Scan abuse prevention

### Business Questions
- Pricing model (free tier + paid?)
- Target audience (startups vs enterprise?)
- GitHub App vs standalone?
- Re-enable AI analysis or keep rule-based?

---

## Resource Estimates

### Monthly Costs (MVP)
- Supabase (free tier): $0
- Railway (Hobby): $5
- Vercel (free tier): $0
- Total: ~$5/month

---

Last Updated: 2026-01-16

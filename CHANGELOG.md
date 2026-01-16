# Changelog

All notable changes to Bridge are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

## [0.3.0] - 2026-01-13

### Added
- **Automations Tab**: Full-featured automation settings panel for each repository
  - Scheduled Scans: Configure daily, weekly, or monthly scan schedules
  - Automated Patch Updates: Set schedules for minor/patch dependency updates with auto-merge option
  - Weekly Reports: Configure periodic health summary reports
  - Database table `automation_settings` stores per-repository preferences
  - API endpoints for loading and saving automation settings
- **Automated Minor/Patch Updates**: New button in Packages tab triggers dependency updates
  - Clones repository, runs clean slate update script
  - Creates `bridge/patch-updates` branch
  - Opens pull request via GitHub API
  - 8-phase progress tracking with status polling
  - Compares package-lock.json versions for accurate change detection
- **Update Jobs Table**: Database schema for tracking update job status and history
- **Update Worker**: New `server/update-worker.js` handles the update pipeline
- **API Endpoints**:
  - `POST /api/repositories/:id/update` - Trigger update job
  - `GET /api/update-jobs/:id` - Poll job status
  - `GET /api/repositories/:id/update-history` - View update history

### Changed
- **Agents tab renamed to Automations**: Better reflects the tab's purpose for automated workflows
- **Typography**: Applied OCR-A font to all major title elements for cohesive industrial aesthetic
- **UI Cleanup**: Removed all emojis from interface, replaced with bracket notation `[DEP]`, `[ARCH]`, etc.
- **Lockfile Comparison**: Update worker now parses package-lock.json for actual resolved versions instead of package.json semver ranges

### Fixed
- Update detection now correctly identifies changed packages by comparing lock file versions before and after npm update

---

## [0.2.0] - 2024-12-31

### Added
- **Bridge Score v2.0**: Comprehensive 1-100 health metric with 5 weighted categories
  - Dependencies (30%): Outdated packages, deprecated, missing, unused, security
  - Architecture (25%): Circular deps, barrel files, god files, deep nesting
  - Code Quality (20%): TypeScript usage, TODO count, console.logs
  - Testing (15%): Test file presence, test-to-code ratio, test config
  - Documentation (10%): README, CHANGELOG, CONTRIBUTING presence
- **Letter Grades**: A-F grading with executive summary for stakeholders
- **Actionable Tasks**: Prioritized tasks with effort/impact ratings
- **Package Priority Scoring**: Category badges, version distance display, priority tiers
- **Deprecated Package Detection**: Via npm registry lookup
- **Peer Dependency Mapping**: Blocking/unlocking relationship visualization
- **Upgrade Path Suggestions**: Step-by-step upgrade order with quick wins section
- **Real-time Scan Progress**: 7-phase progress indicator during scans
- **Error Boundaries**: Inline error handling with helpful feedback
- **Skeleton Loaders**: Loading states for repository cards
- **Repository Search/Filter/Sort**: Dashboard organization tools
- **Copy Upgrade Commands**: One-click copy for npm update commands
- **NPM Package Links**: Direct links to package pages
- **JSON Export**: Export scan results as JSON

### Changed
- Disabled AI analysis in favor of deterministic rule-based scoring
- Disabled Repomix compression (speeds up scans significantly)

---

## [0.1.0] - 2024-12-15

### Added
- Initial release
- Multi-repository dashboard with grid layout
- GitHub repository integration
- Static code analysis via Madge, Depcheck, npm-check-updates
- 4-dimensional health scoring (Coupling, Freshness, Cleanliness, Complexity)
- SQLite database for local storage
- Express REST API backend
- React + Vite + TypeScript frontend
- Tailwind CSS styling with custom theme

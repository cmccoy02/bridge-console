# Bridge

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/electron-latest-blue.svg)](https://www.electronjs.org/)

**Technical Debt Management Platform**

Bridge helps engineering teams understand, quantify, and fix technical debt across repositories. Get health scores, prioritized dependency updates, and automated pull requests - all through a simple dashboard.

🚀 **[Install Bridge GitHub App](https://github.com/apps/bridge-console-dev)** | 📖 [View Documentation](tasks.md) | 💬 [Report Issues](https://github.com/cmccoy02/bridge-console/issues)

---

## ✨ What Bridge Does

- 🔍 **Analyzes** your repositories for technical debt (circular dependencies, outdated packages, unused imports)
- 📊 **Scores** repository health across 4 dimensions (Coupling, Freshness, Cleanliness, Hygiene)
- 🎯 **Prioritizes** which dependencies to update based on security, stability, and impact
- 🤖 **Automates** safe dependency updates by creating PRs directly to your GitHub repos
- 📈 **Tracks** progress over time with scan history and health trends

**No more manual npm outdated checks. No more forgotten security patches. Just one-click updates.**

## Features

### 🎯 4-Dimensional Health Scoring

- **Coupling** - Circular dependency detection via Madge
- **Freshness** - Outdated package tracking via npm-check-updates
- **Cleanliness** - Unused/missing dependency detection via Depcheck
- **Hygiene** - Code quality and structure analysis

### 🤖 Automated Dependency Updates

- One-click minor/patch updates
- Intelligent upgrade path suggestions
- Automatic PR creation to your repository
- Detailed changelogs and update logs

### 📊 Multi-Repository Dashboard

- Monitor all your repositories in one place
- Real-time health scores and trend tracking
- Search, filter, and sort repositories
- Detailed dependency analysis and recommendations

## Quick Start

### 1. Install the Bridge GitHub App

Visit **[https://github.com/apps/bridge-console-dev](https://github.com/apps/bridge-console-dev)** and click "Install" to authorize Bridge for your repositories.

The app needs these permissions:
- **Read & Write** to code (for creating PRs with dependency updates)
- **Read** access to metadata and repository contents

### 2. Run Bridge Desktop App

```bash
# Clone the repository
git clone https://github.com/cmccoy02/bridge-console.git
cd bridge-console

# Install dependencies
npm install

# Start Bridge
npm start
```

The app will open in Electron with an integrated Node.js backend.

### 3. Sign In with GitHub

1. Click **"Sign in with GitHub"**
2. Authorize Bridge to access your account
3. You're ready to start scanning repositories!

### 4. Start Monitoring

1. Click **"Add Repository"** and enter a GitHub URL
2. Bridge will clone, analyze, and score the repository
3. View health metrics, outdated dependencies, and recommendations
4. Click **"Run minor/patch updates"** to automatically create a PR with safe updates

## How It Works

1. **Scan & Analyze** - Clone repository → run dependency analysis → calculate health scores
2. **Static Analysis** - Detect circular dependencies, unused packages, outdated versions
3. **Smart Scoring** - Rule-based scoring system with size-normalized penalties
4. **Automated Updates** - Generate upgrade paths → run npm update → create GitHub PR
5. **Actionable Insights** - Clear, prioritized recommendations with risk indicators

## Tech Stack

- **Desktop:** Electron (cross-platform)
- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express (integrated)
- **Database:** SQLite (local) with PostgreSQL support (Supabase)
- **Analysis:** Madge, Depcheck, npm-check-updates
- **GitHub Integration:** OAuth App + GitHub REST API
- **Version Control:** simple-git for automated commits/pushes

## Architecture

```
Electron Desktop App
     ↓
React Frontend ↔ Express API ↔ Worker Processes
     ↓               ↓              ↓
  UI Layer      SQLite DB     Scan & Update Jobs
                                     ↓
                    ┌────────────────┴────────────────┐
                    ↓                                 ↓
            Scan Pipeline                     Update Pipeline
         (Clone → Analyze                  (Clone → npm update
          → Score)                         → Commit → PR)
```

## Project Structure

```
bridge-console/
├── electron/
│   ├── main.js           # Electron main process
│   └── preload.js        # Preload scripts
├── components/
│   ├── TriageList.tsx    # Dependency analysis UI
│   ├── GitHubBrowser.tsx # Repository browser
│   ├── ScanProgress.tsx  # Scan status tracking
│   └── UpdateProgress.tsx # Update job tracking
├── server/
│   ├── index.js          # Express API server
│   ├── worker.js         # Repository scan worker
│   ├── update-worker.js  # Dependency update worker
│   └── db.js             # Database adapter (SQLite/PostgreSQL)
├── App.tsx               # Main React application
├── types.ts              # TypeScript interfaces
└── bridge.sqlite         # Local database (auto-created)
```

## Development

```bash
# Run in development mode (Electron with hot reload)
npm start

# Build for production
npm run build

# Package Electron app
npm run electron:build

# Run web version only (without Electron)
npm run dev        # Frontend (port 3000)
npm run server     # Backend (port 3001)
```

## Configuration

Bridge works out of the box, but you can customize:

**Optional: Connect PostgreSQL (Supabase)**

Create a `.env` file in the project root:

```bash
# Database (optional - uses SQLite if not set)
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# GitHub OAuth (required for multi-user deployment)
GITHUB_CLIENT_ID=your_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_oauth_app_client_secret
GITHUB_REDIRECT_URI=http://localhost:3000/auth/callback
JWT_SECRET=your_random_secret_key
```

For local testing, you can skip this - Bridge defaults to SQLite.

## Documentation

- **[tasks.md](tasks.md)** - Development roadmap and task tracker
- **[claude.md](claude.md)** - Product architecture and technical decisions
- **[SETUP-INFRASTRUCTURE.md](SETUP-INFRASTRUCTURE.md)** - Production deployment guide

## Roadmap

See **[tasks.md](tasks.md)** for the full roadmap. Current priorities:

**✅ Phase 1: Core Experience** (Completed)
- Health scoring and dependency analysis
- Progress indicators and error handling
- Input validation and loading states
- Repository search, filter, and sort

**✅ Phase 2: Automated Updates** (Completed)
- One-click minor/patch updates
- Automated PR creation
- Upgrade path suggestions
- Update job tracking

**🚧 Phase 3: Electron Desktop App** (In Progress)
- Cross-platform desktop application
- Integrated backend
- Native OS integration

**📋 Phase 4: Teams & Collaboration** (Planned)
- Team workspaces
- Role-based permissions
- Shared repository management
- Activity feeds and notifications

## FAQ

### How do I grant Bridge access to my repositories?

Install the Bridge GitHub App at [https://github.com/apps/bridge-console-dev](https://github.com/apps/bridge-console-dev), then sign in to Bridge Desktop. You'll be able to scan any repositories you've granted access to.

### Does Bridge modify my code?

Bridge only creates PRs when you explicitly click "Run minor/patch updates". It never automatically merges changes. All updates go through normal GitHub PR review workflow.

### What dependencies does Bridge update?

Bridge only updates to **minor** and **patch** versions (e.g., `1.2.3` → `1.2.9` or `1.5.0`), avoiding breaking changes. It skips major version bumps to keep updates safe.

### Where are scanned repositories stored?

Bridge clones repositories to a temporary directory (`temp_scans/` or `temp_updates/`) for analysis, then deletes them after the scan completes. Nothing is permanently stored except analysis results in the local database.

### Can I use Bridge with private repositories?

Yes! Once you install the Bridge GitHub App and grant it access to private repositories, you can scan them just like public ones.

### Does Bridge work with monorepos?

Bridge works best with single-package repositories. Monorepo support (lerna, nx, turborepo) is on the roadmap.

### How do I view Bridge's database?

Bridge uses SQLite by default. You can view the `bridge.sqlite` file with any SQLite browser:
```bash
sqlite3 bridge.sqlite "SELECT * FROM repositories;"
```

## Troubleshooting

### "Authentication failed" when creating PRs

Your GitHub OAuth token may have expired. Sign out of Bridge and sign back in to refresh your token.

### Organization repositories not showing up

Your organization may have OAuth App Access Restrictions enabled. Ask an admin to approve the Bridge app at:
`https://github.com/orgs/YOUR_ORG/settings/oauth_application_policy`

### Scan fails with "Command failed: git clone"

Ensure Bridge GitHub App has access to the repository. Check your installations at:
`https://github.com/settings/installations`

## Contributing

Bridge is in active development! To contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

For bugs or feature requests, please [open an issue](https://github.com/cmccoy02/bridge-console/issues).

## Support

- **GitHub Issues:** [github.com/cmccoy02/bridge-console/issues](https://github.com/cmccoy02/bridge-console/issues)
- **GitHub App:** [github.com/apps/bridge-console-dev](https://github.com/apps/bridge-console-dev)

## License

MIT © 2026 Connor McCoy

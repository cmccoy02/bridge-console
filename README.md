# Bridge

**Technical Debt Management Platform**

Bridge helps engineering teams understand, quantify, and prioritize technical debt across repositories. It combines static code analysis with AI-powered recommendations to provide actionable insights - not just data.

## Features

### 4-Dimensional Health Scoring

- **Coupling** - Circular dependency detection via Madge
- **Freshness** - Outdated package tracking via npm-check-updates
- **Cleanliness** - Unused/missing dependency detection via Depcheck
- **Complexity** - Barrel file analysis for build performance

### AI-Powered Insights

- Codebase compression via Repomix
- Gemini 2.5 Flash analysis
- Predictive forecasting (1/3/6-month trends)
- Prioritized action items with effort/impact indicators

### Multi-Repository Dashboard

- Monitor multiple repositories from one interface
- Color-coded health indicators
- Historical scan tracking
- Detailed drill-down analysis per repository

## Quick Start

### Prerequisites

- Node.js 18+
- Git
- GitHub Personal Access Token
- Gemini API Key

### Installation

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and add your GITHUB_TOKEN and GEMINI_API_KEY

# Start the application
npm start
```

The app will start on:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

### Getting API Keys

**GitHub Token:**
1. Go to https://github.com/settings/tokens
2. Generate new token (classic)
3. Select `repo` scope
4. Copy token to `.env`

**Gemini API Key:**
1. Go to https://aistudio.google.com/apikey
2. Create API Key
3. Copy to `.env`

## How It Works

1. **Clone & Analyze** - Git clone → npm install → run analysis suite
2. **Static Analysis** - Madge, Depcheck, NCU, git analysis
3. **AI Analysis** - Repomix compression → Gemini insights
4. **Smart Scoring** - Size-normalized penalties across 4 dimensions
5. **Actionable Output** - Prioritized recommendations, not just problems

## Tech Stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express
- **Database:** SQLite (local MVP) → PostgreSQL (production)
- **Analysis:** Madge, Depcheck, npm-check-updates, Repomix
- **AI:** Google Gemini 2.5 Flash

## Architecture

```
Frontend (Vite) → Express API → Worker Process
                      ↓              ↓
                  SQLite DB    Analysis Pipeline
                                     ↓
                          Git Clone → Static Analysis
                                     ↓
                          Repomix → AI Analysis
                                     ↓
                          Store Results
```

## Project Structure

```
bridge-console/
├── App.tsx              # Main React application
├── types.ts             # TypeScript interfaces
├── components/          # React components
├── server/
│   ├── index.js        # Express API
│   ├── worker.js       # Scan processing
│   └── db.js           # Database setup
├── systemprompt.md     # AI analysis instructions
└── bridge.sqlite       # Local database
```

## Development

```bash
# Run frontend only
npm run dev

# Run backend only
npm run server

# Run both
npm start

# Reset database
npm run reset-db
```

## Documentation

- `claude.md` - Comprehensive product context and development plans
- `SETUP.md` - Detailed setup guide and troubleshooting
- `context.md` - Senior engineer feedback and priorities
- `systemprompt.md` - AI analysis configuration

## Roadmap

**Phase 1: Enhanced Analysis** (Current Priority)
- Intelligent dependency prioritization
- Peer dependency relationship tracking
- Upgrade path visualization
- Rule-based weighting system

**Phase 2: Infrastructure**
- PostgreSQL migration (Supabase)
- Cloud deployment (Vercel + Railway)
- Background job queue (BullMQ + Redis)
- Persistent file storage (Cloudflare R2)

**Phase 3: Collaboration**
- GitHub OAuth authentication
- Multi-user support
- Organization-level separation
- Team permissions

## Contributing

Bridge is currently in active development. For questions or feedback, please open an issue.

## License

MIT

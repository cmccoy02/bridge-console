# Bridge

**Automated dependency updates with confidence.**

Bridge analyzes your repositories for outdated dependencies and creates PRs to update them - but only if the updates pass your build and tests.

## Quick Start

### 1. Install the GitHub App

**[Install Bridge](https://github.com/apps/bridge-console-dev)** on your repositories.

### 2. Run Bridge

```bash
git clone https://github.com/cmccoy02/bridge-console.git
cd bridge-console
npm install
npm start
```

### 3. Sign in and scan

1. Click **Sign in with GitHub**
2. Add a repository URL
3. Click **Run minor/patch updates** to create a PR

## What Bridge Does

- Scans repositories for outdated, unused, and deprecated dependencies
- Calculates a health score across 4 dimensions
- Creates PRs for safe minor/patch updates
- Validates updates pass build/lint/tests before creating PRs

## Testing Checklist

When testing Bridge, please note:

- [ ] GitHub App installation worked
- [ ] Sign-in flow completed
- [ ] Repository scan completed
- [ ] Update job created a PR
- [ ] Any errors encountered (check logs in the UI)

Report issues at [github.com/cmccoy02/bridge-console/issues](https://github.com/cmccoy02/bridge-console/issues)

## Development

```bash
# Development (runs Electron with hot-reload)
npm run dev        # Start server + vite + electron

# Web-only development (without Electron)
npm run dev:web    # Start server + vite only

# Production build
npm run build      # Build and package Electron app (requires 16GB+ RAM)
npm run build:web  # Build web version only

# Other commands
npm start          # Run pre-built Electron app
npm run server     # Backend only (port 3001)
```

**Note:** Building the Electron app requires significant RAM (16GB+). See [BUILD-NOTES.md](BUILD-NOTES.md) for details and workarounds.

## License

MIT

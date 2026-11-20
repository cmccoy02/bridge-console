# Bridge console

The hosted half of Bridge. The [Bridge CLI](https://github.com/cmccoy02/bridge-cli)
does the work (update, check, open a PR); the console is where teams see it and where
the CLI gets permission to push.

- **GitHub App**: Bridge's bot identity. Installed per organization; no secrets in
  customer repositories.
- **Token broker**: `POST /api/v1/github/token` exchanges a GitHub Actions OIDC token
  from Bridge's publish job for a one-hour token scoped to that single repository.
- **Run ledger**: `POST /api/v1/runs` stores each `bridge-report.v1`. Pages show
  repositories, every run, held updates and why, and pull requests through merge.
- **Slack**: posts when Bridge opens, holds back or gets a pull request merged.

## Local development

```bash
npm install
cp .env.example .env.local     # BRIDGE_DEV_LOGIN=1 is already set
npm run dev                    # http://localhost:3000
```

Choose **Continue as local developer**. The first sign-in creates demo data. With no
`DATABASE_URL`, the console uses an embedded Postgres stored in `.data/pglite`.

To record real runs from the CLI, create an API key under **Settings**, then:

```bash
export BRIDGE_API_URL=http://localhost:3000
export BRIDGE_API_TOKEN=brk_...
bridge patch
```

```bash
npm test          # Vitest; in-memory database, fake GitHub API
npm run typecheck
npm run build
```

## Deploying

See [docs/setup.md](docs/setup.md): Supabase, Vercel, the GitHub App (one command)
and Slack.

The previous scoring dashboard (React + Express + Electron) remains in this
repository's history on `main`.

# Bridge console

Private Next.js app: GitHub App + OIDC token broker + run ledger for the Bridge CLI
(`cmccoy02/bridge-cli`, public). Read `AGENTS.md`: this is Next.js 16, check
`node_modules/next/dist/docs/` before using an API you are unsure of.

## Commands

```bash
npm run dev        # embedded Postgres in .data/pglite when DATABASE_URL is unset
npm test           # Vitest: in-memory PGlite, fake GitHub API (tests/helpers.ts)
npm run typecheck
npm run build
npm run db:generate  # after editing src/lib/db/schema.ts; commit drizzle/*
```

## Layout

- `src/lib/db/schema.ts` – Drizzle schema (accounts = app installations, users,
  memberships, repos, runs, package_changes, pull_requests, events, api_keys).
- `src/lib/broker.ts` – OIDC → installation token. `src/lib/oidc.ts` verifies GitHub
  Actions tokens (issuer, audience, RS256, `job_workflow_ref` allowlist).
- `src/lib/ingest.ts` – validates `bridge-report.v1` (zod), derives run status,
  stores run + package changes + PR, notifies Slack.
- `src/lib/webhooks.ts` – installation / installation_repositories / pull_request.
- `src/lib/queries.ts` – page read models, always scoped by the user's memberships.
- `src/app/api/...` – route handlers; `src/app/{repos,ledger,runs,rules,settings}` – pages.
- `src/lib/demo.ts` – demo data for local dev only.
- `scripts/create-github-app.mjs` – GitHub App manifest flow; `scripts/migrate.ts`.

## Security rules

- Never log, store or return a GitHub token except in the broker's response body.
- The broker only serves tokens to `BRIDGE_TRUSTED_WORKFLOWS` (Bridge's reusable
  workflow) for repositories with an active installation, scoped to one repo with
  `contents: write` + `pull_requests: write`. Don't widen either without a design
  review; never request the `workflows` permission.
- Every page query filters by the signed-in user's account memberships.
- Webhooks: verify `x-hub-signature-256` before parsing.
- Slack webhook URLs are encrypted (`src/lib/crypto.ts`); API keys are stored as SHA-256.

## Design

Infrastructure signage: Overpass (Highway Gothic lineage), steel header band with one
safety-yellow rule, white tables on cool paper. Status = color + shape + words.
Sentence case, plain verbs, no stat tiles, no card grids.

## Open work

- Console-managed rules (today rules live in each repo's `bridge.config.json`).
- Weekly digest (Slack + email) from the ledger.
- Rate limiting on the public API routes; replay protection on OIDC `jti`.

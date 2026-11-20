# Setting up Bridge

About 30 minutes. You never need to paste a secret into chat: every credential goes
straight from the provider into Vercel's environment settings or a local file.

## 1. Database (Supabase)

1. In your Supabase project, open **Connect**.
2. Copy the **Transaction pooler** connection string (port `6543`). This is
   `DATABASE_URL`.
3. Copy the **Session pooler** (or direct) connection string. This is
   `DATABASE_MIGRATION_URL`; migrations need a session connection.

## 2. Deploy to Vercel

1. **Add New → Project**, import `cmccoy02/bridge-console`, branch `v2` (or `main`
   after merging).
2. Build command: `npm run db:migrate && npm run build`.
3. Environment variables:

   | Name | Value |
   | --- | --- |
   | `BRIDGE_PUBLIC_URL` | Your deployment URL, e.g. `https://bridge-console.vercel.app` |
   | `DATABASE_URL` | Supabase transaction pooler URL |
   | `DATABASE_MIGRATION_URL` | Supabase session pooler URL |
   | `SESSION_SECRET` | Output of `openssl rand -base64 32` |
   | `ENCRYPTION_KEY` | Output of `openssl rand -base64 32` (a different one) |

4. Deploy. Visit `/api/health`: it should say `"database":"ok"`.

## 3. Create the GitHub App

From a local checkout of this repository:

```bash
npm install
npm run setup:github-app -- --url https://YOUR-DEPLOYMENT.vercel.app
# or, to own the app as an organization:
npm run setup:github-app -- --url https://YOUR-DEPLOYMENT.vercel.app --org YOUR-ORG
```

Open the printed link, check the pre-filled form, and click **Create GitHub App**.
GitHub sends you back and the script writes six values to `.env.github-app`
(gitignored, readable only by you). If the name "Bridge" is taken on GitHub, add
`--name "Bridge for YOUR-ORG"`.

Add the six `GITHUB_*` values to Vercel's environment variables and redeploy.
`/api/health` should now say `"githubApp":"configured"`.

The app asks for **Contents: write** and **Pull requests: write** only. It has no
`workflows` permission, so GitHub rejects any push that touches `.github/workflows`.
It is public so other organizations (for example TravelPass) can install it; the
console only serves repositories where it is installed.

## 4. Install it and sign in

1. Install the app on one test repository first:
   `https://github.com/apps/YOUR-APP-SLUG/installations/new`.
2. Open the console and **Sign in with GitHub**. You see every installation you can
   access on GitHub.

## 5. Add the workflow to the repository

Copy the snippet from **Settings → Add Bridge to a repository** into
`.github/workflows/bridge.yml`, commit it, then run it from the **Actions** tab
(**Run workflow**). The run appears in the console's **Ledger**; if anything was out
of date, a pull request from the Bridge bot appears in the repository.

Private npm packages: add `registry-url`, `registry-scope` and the `npm-token`
secret (see the CLI's `docs/ci.md`).

## 6. Slack

1. Go to https://api.slack.com/apps, **Create New App → From scratch**, pick your
   workspace, turn on **Incoming Webhooks**, then **Add New Webhook to Workspace**
   and choose the channel.
2. Copy the webhook URL and paste it in the console under **Settings → Slack**,
   then **Send a test message**. It is encrypted at rest with `ENCRYPTION_KEY`.

## Rotating credentials

- GitHub App private key: generate a new key on the app's settings page, base64 it
  (`base64 -i key.pem | tr -d '\n'`), update `GITHUB_APP_PRIVATE_KEY`, delete the old key.
- `SESSION_SECRET`: changing it signs everyone out.
- `ENCRYPTION_KEY`: changing it makes stored Slack webhooks unreadable; reconnect Slack.

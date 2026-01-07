# Bridge Infrastructure Setup Guide

This guide walks you through setting up the services Bridge needs for production deployment.

**Estimated time:** 2-3 hours total
**Cost:** ~$5/month (Railway hobby tier, everything else is free)

---

## Overview

| Service | Purpose | Free Tier? | Setup Time |
|---------|---------|------------|------------|
| Supabase | PostgreSQL database | Yes | 30 min |
| Railway | Backend hosting | $5/mo | 20 min |
| Vercel | Frontend hosting | Yes | 15 min |
| GitHub OAuth | Authentication | Yes | 20 min |
| Sentry | Error monitoring | Yes | 15 min |

---

## 1. Supabase (Database)

### Create Project

1. Go to [supabase.com](https://supabase.com) and sign up/log in
2. Click **"New Project"**
3. Fill in:
   - **Name:** `bridge-db`
   - **Database Password:** Generate a strong one, **save this somewhere**
   - **Region:** Choose closest to your users
4. Click **"Create new project"** (takes ~2 minutes)

### Get Connection String

1. Once created, go to **Settings** → **Database**
2. Scroll to **Connection string** section
3. Select **URI** tab
4. Copy the connection string, it looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with your actual database password

### Run Schema Migration

1. Go to **SQL Editor** in the Supabase dashboard
2. Create a new query and paste this:

```sql
-- Repositories table
CREATE TABLE IF NOT EXISTS repositories (
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

-- Scans table
CREATE TABLE IF NOT EXISTS scans (
  id SERIAL PRIMARY KEY,
  "repositoryId" INTEGER REFERENCES repositories(id),
  "repoUrl" TEXT,
  status TEXT DEFAULT 'pending',
  data JSONB,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  "githubId" TEXT UNIQUE,
  username TEXT,
  email TEXT,
  "avatarUrl" TEXT,
  "accessToken" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "lastLoginAt" TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_scans_repository ON scans("repositoryId");
CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);
CREATE INDEX IF NOT EXISTS idx_repos_active ON repositories("isActive");
```

3. Click **Run** to execute

### Save These Values

Add to your `.env` file:
```bash
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres
```

### Verification Checklist
- [ ] Supabase project created
- [ ] Database password saved securely
- [ ] Schema migration run successfully
- [ ] DATABASE_URL added to .env

---

## 2. GitHub OAuth App

### Create OAuth App

1. Go to [github.com/settings/developers](https://github.com/settings/developers)
2. Click **OAuth Apps** → **New OAuth App**
3. Fill in:
   - **Application name:** `Bridge`
   - **Homepage URL:** `https://your-app.vercel.app` (update after Vercel deploy)
   - **Authorization callback URL:** `https://your-app.vercel.app/auth/callback`
4. Click **Register application**

### Get Credentials

1. On the app page, you'll see your **Client ID**
2. Click **Generate a new client secret**
3. Copy the secret immediately (you can't see it again)

### Save These Values

Add to your `.env` file:
```bash
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_REDIRECT_URI=http://localhost:5173/auth/callback
```

> **Note:** Update `GITHUB_REDIRECT_URI` to your production URL after deploying

### Verification Checklist
- [ ] GitHub OAuth App created
- [ ] Client ID copied
- [ ] Client Secret generated and saved
- [ ] Values added to .env

---

## 3. Railway (Backend Hosting)

### Create Project

1. Go to [railway.app](https://railway.app) and sign up with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your Bridge repository
4. Railway will auto-detect it's a Node.js app

### Configure Service

1. Click on the service → **Settings**
2. Set **Root Directory:** `/` (or wherever your server is)
3. Set **Start Command:** `npm run server`

### Add Environment Variables

1. Go to **Variables** tab
2. Click **Raw Editor** and paste:
```
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_REDIRECT_URI=https://your-frontend.vercel.app/auth/callback
NODE_ENV=production
PORT=3001
```

### Get Your Backend URL

1. Go to **Settings** → **Networking**
2. Click **Generate Domain**
3. You'll get something like: `bridge-production.up.railway.app`

### Verification Checklist
- [ ] Railway project created
- [ ] Connected to GitHub repo
- [ ] Environment variables set
- [ ] Domain generated
- [ ] Test: `curl https://your-app.up.railway.app/api/health`

---

## 4. Vercel (Frontend Hosting)

### Import Project

1. Go to [vercel.com](https://vercel.com) and sign up with GitHub
2. Click **Add New** → **Project**
3. Import your Bridge repository

### Configure Build

1. **Framework Preset:** Vite
2. **Build Command:** `npm run build`
3. **Output Directory:** `dist`
4. **Install Command:** `npm install`

### Add Environment Variables

1. Go to **Settings** → **Environment Variables**
2. Add:
```
VITE_API_URL=https://bridge-production.up.railway.app
```

### Update API URL in Code

Before deploying, update `App.tsx`:
```tsx
// Change from:
const API_URL = '/api';

// To:
const API_URL = import.meta.env.VITE_API_URL || '/api';
```

### Configure CORS on Backend

Update `server/index.js` to allow your Vercel domain:
```javascript
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://your-app.vercel.app'
  ],
  credentials: true
}));
```

### Custom Domain (Optional)

1. Go to **Settings** → **Domains**
2. Add your domain (e.g., `bridge.yourdomain.com`)
3. Update DNS records as instructed

### Verification Checklist
- [ ] Vercel project created
- [ ] Build settings configured
- [ ] Environment variables set
- [ ] API URL updated in code
- [ ] CORS configured on backend
- [ ] Test: Visit your Vercel URL

---

## 5. Sentry (Error Monitoring)

### Create Project

1. Go to [sentry.io](https://sentry.io) and sign up
2. Click **Create Project**
3. Select **React** as platform
4. Name it `bridge-frontend`

### Get DSN

1. After creation, you'll see setup instructions
2. Copy the DSN (looks like `https://xxx@xxx.ingest.sentry.io/xxx`)

### Install Sentry

```bash
npm install @sentry/react
```

### Initialize in App

Add to the top of `index.tsx`:
```tsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "YOUR_DSN_HERE",
  environment: import.meta.env.MODE,
  integrations: [
    Sentry.browserTracingIntegration(),
  ],
  tracesSampleRate: 0.1, // 10% of transactions
});
```

### Verification Checklist
- [ ] Sentry project created
- [ ] DSN copied
- [ ] @sentry/react installed
- [ ] Sentry initialized in index.tsx

---

## 6. GitHub Personal Access Token

You need a token for the GitHub API calls (rate limits, repo metadata).

### Create Token

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token** → **Fine-grained token**
3. Set:
   - **Name:** `Bridge App`
   - **Expiration:** 90 days (or custom)
   - **Repository access:** Public repositories (read-only)
4. Click **Generate token**
5. Copy the token

### Save to Environment

```bash
GITHUB_TOKEN=github_pat_xxxxxxxxxxxx
```

### Verification Checklist
- [ ] Token generated
- [ ] Added to .env and Railway

---

## Final .env Template

Create a `.env` file with all your values:

```bash
# Database
DATABASE_URL=postgresql://postgres:PASSWORD@db.xxxxx.supabase.co:5432/postgres

# GitHub API (for repo metadata)
GITHUB_TOKEN=github_pat_xxxxxxxxxxxx

# GitHub OAuth (for user authentication)
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_REDIRECT_URI=https://your-app.vercel.app/auth/callback

# Optional: Sentry
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# Server
NODE_ENV=production
PORT=3001
```

---

## Deployment Checklist

### Before First Deploy
- [ ] Supabase database created and schema migrated
- [ ] GitHub OAuth app created
- [ ] GitHub personal access token created
- [ ] All secrets added to Railway
- [ ] API URL configured in frontend

### First Deploy
- [ ] Push code to GitHub
- [ ] Railway auto-deploys backend
- [ ] Vercel auto-deploys frontend
- [ ] Test health endpoint: `/api/health`
- [ ] Test full flow: Login → Add repo → Scan

### After Deploy
- [ ] Update GitHub OAuth callback URL to production
- [ ] Test OAuth login works
- [ ] Monitor Sentry for errors
- [ ] Check Railway logs for any issues

---

## Troubleshooting

### "CORS error" in browser console
→ Update `server/index.js` CORS config to include your Vercel domain

### "Database connection failed" on Railway
→ Check DATABASE_URL is correct, ensure Supabase allows external connections

### "OAuth redirect_uri mismatch"
→ Update GitHub OAuth app settings with your production URL

### Scans timeout on Railway
→ Railway free tier has 500 hour limit. Upgrade to Hobby ($5) for production use.

### Build fails on Vercel
→ Check `package.json` has correct build command, ensure all dependencies are in `dependencies` not `devDependencies`

---

## Cost Summary

| Service | Free Tier Limits | Paid Tier |
|---------|------------------|-----------|
| Supabase | 500MB DB, 2GB bandwidth | $25/mo |
| Railway | 500 hours/month | $5/mo hobby |
| Vercel | 100GB bandwidth | $20/mo |
| Sentry | 5k errors/month | $26/mo |
| GitHub | Unlimited public repos | - |

**Recommended start:** Railway Hobby ($5/mo), everything else free tier.

---

Last Updated: 2024-12-19


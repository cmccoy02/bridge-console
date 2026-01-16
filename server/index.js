import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { getDb } from './db.js';
import { processScan } from './worker.js';
import { processUpdate } from './update-worker.js';
import { processCleanup } from './cleanup-worker.js';
import { generateJWT, setAuthCookie, clearAuthCookie, authMiddleware } from './auth.js';
import { getUserRepos, getUserOrgs, getOrgRepos } from './github.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [ 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    hasGitHubToken: !!process.env.GITHUB_TOKEN,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString()
  });
});

// ===== AUTH ENDPOINTS =====

// GitHub OAuth - Get auth URL
app.get('/api/auth/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  
  if (!clientId) {
    // Demo mode - return mock user
    return res.json({ 
      demoMode: true,
      message: 'GitHub OAuth not configured. Using demo mode.'
    });
  }
  
  const redirectUri = process.env.GITHUB_REDIRECT_URI || 'http://localhost:3000/auth/callback';
  // Scopes: repo (access repos), read:user (read user data), read:org (read org membership), user:email (read email)
  const scope = 'repo read:user read:org user:email';

  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
  
  res.json({ authUrl });
});

// GitHub OAuth - Handle callback
app.post('/api/auth/github/callback', async (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: 'Authorization code required' });
  }

  try {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'GitHub OAuth not configured' });
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code
      })
    });

    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      return res.status(400).json({ error: tokenData.error_description });
    }

    // Get user info from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const githubUser = await userResponse.json();

    // Save or update user in database
    const db = await getDb();
    
    let user = await db.get('SELECT * FROM users WHERE "githubId" = ?', [String(githubUser.id)]);
    
    if (user) {
      await db.run(
        'UPDATE users SET "accessToken" = ?, "lastLoginAt" = CURRENT_TIMESTAMP WHERE id = ?',
        [tokenData.access_token, user.id]
      );
    } else {
      const result = await db.run(
        'INSERT INTO users ("githubId", username, email, "avatarUrl", "accessToken") VALUES (?, ?, ?, ?, ?)',
        [String(githubUser.id), githubUser.login, githubUser.email, githubUser.avatar_url, tokenData.access_token]
      );
      user = { id: result.lastID, ...githubUser };
    }

    // Generate JWT and set cookie
    const token = generateJWT(user.id);
    setAuthCookie(res, token);

    // Return user info (without access token for security)
    res.json({
      id: user.id,
      githubId: githubUser.id,
      username: githubUser.login,
      email: githubUser.email,
      avatarUrl: githubUser.avatar_url
    });

  } catch (error) {
    console.error('[Auth] GitHub callback error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Demo login (for local development without OAuth)
app.post('/api/auth/demo', async (req, res) => {
  const db = await getDb();

  // Create or get demo user
  let user = await db.get('SELECT * FROM users WHERE "githubId" = ?', ['demo-user']);

  if (!user) {
    const result = await db.run(
      'INSERT INTO users ("githubId", username, email, "avatarUrl") VALUES (?, ?, ?, ?)',
      ['demo-user', 'Demo User', 'demo@bridge.dev', 'https://github.com/ghost.png']
    );
    user = { id: result.lastID };
  }

  // Generate JWT and set cookie
  const token = generateJWT(user.id);
  setAuthCookie(res, token);

  res.json({
    id: user.id,
    username: 'Demo User',
    email: 'demo@bridge.dev',
    avatarUrl: 'https://github.com/ghost.png',
    isDemo: true
  });
});

// Get current user
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    email: req.user.email,
    avatarUrl: req.user.avatarUrl,
    isDemo: req.user.githubId === 'demo-user'
  });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

// ===== GITHUB BROWSER ENDPOINTS =====

// Get user's GitHub repositories
app.get('/api/github/repos', authMiddleware, async (req, res) => {
  try {
    if (!req.user.accessToken) {
      return res.status(400).json({ error: 'No GitHub access token. Please re-authenticate.' });
    }

    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 30;
    const type = req.query.type || 'all';

    const result = await getUserRepos(req.user.accessToken, page, perPage, type);

    // Get user's connected repos to mark which are already connected
    const db = await getDb();
    const connectedRepos = await db.all(
      'SELECT "repoUrl" FROM repositories WHERE "userId" = ? AND "isActive" = 1',
      [req.user.id]
    );
    const connectedUrls = new Set(connectedRepos.map(r => r.repoUrl));

    // Mark repos that are already connected
    result.repos = result.repos.map(repo => ({
      ...repo,
      isConnected: connectedUrls.has(repo.htmlUrl)
    }));

    res.json(result);
  } catch (error) {
    console.error('[GitHub] Error fetching repos:', error);
    res.status(500).json({ error: 'Failed to fetch GitHub repositories' });
  }
});

// Get user's GitHub organizations
app.get('/api/github/orgs', authMiddleware, async (req, res) => {
  try {
    if (!req.user.accessToken) {
      return res.status(400).json({ error: 'No GitHub access token. Please re-authenticate.' });
    }

    console.log('[GitHub] Fetching organizations for user:', req.user.username);
    const orgs = await getUserOrgs(req.user.accessToken);
    console.log('[GitHub] Found', orgs.length, 'organizations');
    res.json(orgs);
  } catch (error) {
    console.error('[GitHub] Error fetching orgs:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to fetch GitHub organizations',
      details: error.response?.data?.message || error.message 
    });
  }
});

// Get organization's repositories
app.get('/api/github/orgs/:org/repos', authMiddleware, async (req, res) => {
  try {
    if (!req.user.accessToken) {
      return res.status(400).json({ error: 'No GitHub access token. Please re-authenticate.' });
    }

    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 30;

    console.log('[GitHub] Fetching repos for org:', req.params.org, 'page:', page);
    const result = await getOrgRepos(req.user.accessToken, req.params.org, page, perPage);
    console.log('[GitHub] Found', result.repos.length, 'repos for org:', req.params.org);

    // Mark connected repos
    const db = await getDb();
    const connectedRepos = await db.all(
      'SELECT "repoUrl" FROM repositories WHERE "userId" = ? AND "isActive" = 1',
      [req.user.id]
    );
    const connectedUrls = new Set(connectedRepos.map(r => r.repoUrl));

    result.repos = result.repos.map(repo => ({
      ...repo,
      isConnected: connectedUrls.has(repo.htmlUrl)
    }));

    res.json(result);
  } catch (error) {
    console.error('[GitHub] Error fetching org repos:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to fetch organization repositories',
      details: error.response?.data?.message || error.message 
    });
  }
});

// ===== REPOSITORY ENDPOINTS =====

// 1. Get All Repositories (for authenticated user)
app.get('/api/repositories', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const repos = await db.all(`
      SELECT
        r.id,
        r."repoUrl",
        r.name,
        r.owner,
        r."lastScanId",
        r."lastScore",
        r."isActive",
        r."createdAt",
        r."updatedAt",
        s.data as "lastScanData",
        s."createdAt" as "lastScanDate"
      FROM repositories r
      LEFT JOIN scans s ON r."lastScanId" = s.id
      WHERE r."isActive" = 1 AND r."userId" = ?
      ORDER BY r."updatedAt" DESC
    `, [req.user.id]);

    // Parse scan data (PostgreSQL returns JSONB as object, SQLite as string)
    const formatted = repos.map(repo => ({
      ...repo,
      lastScanData: repo.lastScanData
        ? (typeof repo.lastScanData === 'string' ? JSON.parse(repo.lastScanData) : repo.lastScanData)
        : null
    }));

    res.json(formatted);
  } catch (error) {
    console.error('[Bridge Server] Error fetching repositories:', error);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// 2. Add/Connect Repository
app.post('/api/repositories', authMiddleware, async (req, res) => {
  try {
    console.log('[Bridge Server] POST /api/repositories body:', req.body);

    const { repoUrl } = req.body;

    if (!repoUrl) {
      console.error('[Bridge Server] Missing repoUrl in request');
      return res.status(400).json({ error: 'Repo URL required' });
    }

    // Validate GitHub URL format
    if (!repoUrl.includes('github.com')) {
      console.error('[Bridge Server] Invalid repo URL format:', repoUrl);
      return res.status(400).json({ error: 'Must be a valid GitHub URL' });
    }

    // Extract owner and name from URL
    const urlParts = repoUrl.replace('https://github.com/', '').replace('http://github.com/', '').replace('.git', '').split('/').filter(p => p);

    if (urlParts.length < 2) {
      console.error('[Bridge Server] Could not parse owner/name from URL:', repoUrl);
      return res.status(400).json({ error: 'Invalid GitHub URL format. Expected: https://github.com/owner/repo' });
    }

    const owner = urlParts[0];
    const name = urlParts[1];

    console.log('[Bridge Server] Parsed repo - Owner:', owner, 'Name:', name);

    const db = await getDb();

    // Check if repo already exists for this user
    const existing = await db.get('SELECT * FROM repositories WHERE "repoUrl" = ? AND "userId" = ?', [repoUrl, req.user.id]);

    if (existing) {
      console.warn('[Bridge Server] Repository already exists:', repoUrl);
      return res.status(400).json({ error: 'Repository already connected' });
    }

    // Create repository entry with userId
    const result = await db.run(
      'INSERT INTO repositories ("repoUrl", name, owner, "userId") VALUES (?, ?, ?, ?)',
      [repoUrl, name, owner, req.user.id]
    );

    console.log('[Bridge Server] Added repository:', name, 'with ID:', result.lastID);
    res.json({ id: result.lastID, name, owner, repoUrl });
  } catch (error) {
    console.error('[Bridge Server] Error adding repository:', error);
    res.status(500).json({ error: 'Failed to add repository: ' + error.message });
  }
});

// 3. Delete/Disconnect Repository
app.delete('/api/repositories/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    // Only allow deleting own repositories
    await db.run('UPDATE repositories SET "isActive" = 0 WHERE id = ? AND "userId" = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[Bridge Server] Error removing repository:', error);
    res.status(500).json({ error: 'Failed to remove repository' });
  }
});

// 4. Get Scan History for Repository
app.get('/api/repositories/:id/history', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();

    // Verify user owns this repository
    const repo = await db.get('SELECT id FROM repositories WHERE id = ? AND "userId" = ?', [req.params.id, req.user.id]);
    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const scans = await db.all(`
      SELECT id, status, "createdAt",
             data->'score'->>'total' as score
      FROM scans
      WHERE "repositoryId" = ? AND status = 'completed'
      ORDER BY "createdAt" DESC
      LIMIT 10
    `, [req.params.id]);

    res.json(scans);
  } catch (error) {
    console.error('[Bridge Server] Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch scan history' });
  }
});

// ===== UPDATE JOB ENDPOINTS =====

// Trigger automated minor/patch updates for a repository
app.post('/api/repositories/:id/update', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();

    // Verify user owns this repository
    const repo = await db.get(
      'SELECT * FROM repositories WHERE id = ? AND "userId" = ?',
      [req.params.id, req.user.id]
    );

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    // Check user has GitHub access token
    if (!req.user.accessToken) {
      return res.status(400).json({
        error: 'GitHub write access required. Please re-authenticate with GitHub.'
      });
    }

    // Create update job entry
    const result = await db.run(
      'INSERT INTO update_jobs ("repositoryId", "userId", status) VALUES (?, ?, ?)',
      [req.params.id, req.user.id, 'pending']
    );

    const jobId = result.lastID;
    console.log(`[Bridge Server] Created update job ${jobId} for repository ${repo.name}`);

    // Trigger worker (fire and forget)
    processUpdate(jobId, repo, req.user.accessToken, db).catch(err => {
      console.error('[Bridge Server] Update worker error:', err);
    });

    res.json({
      jobId,
      repositoryId: parseInt(req.params.id),
      status: 'pending'
    });
  } catch (error) {
    console.error('[Bridge Server] Error triggering update:', error);
    res.status(500).json({ error: 'Failed to trigger update job' });
  }
});

// Get update job status
app.get('/api/update-jobs/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const job = await db.get(
      `SELECT uj.*, r."repoUrl", r.name as "repoName"
       FROM update_jobs uj
       JOIN repositories r ON uj."repositoryId" = r.id
       WHERE uj.id = ? AND uj."userId" = ?`,
      [req.params.id, req.user.id]
    );

    if (!job) {
      return res.status(404).json({ error: 'Update job not found' });
    }

    // Parse JSON fields (PostgreSQL returns objects, SQLite returns strings)
    const progress = job.progress
      ? (typeof job.progress === 'string' ? JSON.parse(job.progress) : job.progress)
      : null;
    const result = job.result
      ? (typeof job.result === 'string' ? JSON.parse(job.result) : job.result)
      : null;

    res.json({
      id: job.id,
      repositoryId: job.repositoryId,
      repoName: job.repoName,
      status: job.status,
      progress,
      result,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt
    });
  } catch (error) {
    console.error('[Bridge Server] Error fetching update job:', error);
    res.status(500).json({ error: 'Failed to fetch update job status' });
  }
});

// Get update history for a repository
app.get('/api/repositories/:id/update-history', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();

    // Verify ownership
    const repo = await db.get(
      'SELECT id FROM repositories WHERE id = ? AND "userId" = ?',
      [req.params.id, req.user.id]
    );

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const jobs = await db.all(
      `SELECT id, status, result, "createdAt", "completedAt"
       FROM update_jobs
       WHERE "repositoryId" = ?
       ORDER BY "createdAt" DESC
       LIMIT 10`,
      [req.params.id]
    );

    res.json(jobs.map(job => ({
      ...job,
      result: job.result
        ? (typeof job.result === 'string' ? JSON.parse(job.result) : job.result)
        : null
    })));
  } catch (error) {
    console.error('[Bridge Server] Error fetching update history:', error);
    res.status(500).json({ error: 'Failed to fetch update history' });
  }
});

// Trigger cleanup job to remove unused dependencies
app.post('/api/repositories/:id/cleanup', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const { packages } = req.body;

    if (!packages || !Array.isArray(packages) || packages.length === 0) {
      return res.status(400).json({ error: 'packages array is required' });
    }

    // Get repository
    const repo = await db.get(
      'SELECT * FROM repositories WHERE id = ? AND "userId" = ?',
      [req.params.id, req.user.id]
    );

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    // Check for user access token (required for creating PR)
    if (!req.user.accessToken) {
      return res.status(400).json({
        error: 'GitHub access token required. Please log in with GitHub (not demo mode) to create PRs.'
      });
    }

    // Create cleanup job
    const result = await db.run(
      `INSERT INTO cleanup_jobs ("repositoryId", "userId", "packagesToRemove", status)
       VALUES (?, ?, ?, 'pending')`,
      [req.params.id, req.user.id, JSON.stringify(packages)]
    );

    const jobId = result.lastID;

    // Start async cleanup process
    processCleanup(jobId, repo, packages, req.user.accessToken, db).catch(err => {
      console.error('[Bridge Server] Cleanup job error:', err);
    });

    res.json({
      jobId,
      message: 'Cleanup job started',
      packages
    });
  } catch (error) {
    console.error('[Bridge Server] Error starting cleanup job:', error);
    res.status(500).json({ error: 'Failed to start cleanup job' });
  }
});

// Get cleanup job status
app.get('/api/cleanup-jobs/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const job = await db.get(
      `SELECT cj.*, r."repoUrl", r.name as "repoName"
       FROM cleanup_jobs cj
       JOIN repositories r ON cj."repositoryId" = r.id
       WHERE cj.id = ? AND cj."userId" = ?`,
      [req.params.id, req.user.id]
    );

    if (!job) {
      return res.status(404).json({ error: 'Cleanup job not found' });
    }

    const progress = job.progress
      ? (typeof job.progress === 'string' ? JSON.parse(job.progress) : job.progress)
      : null;
    const result = job.result
      ? (typeof job.result === 'string' ? JSON.parse(job.result) : job.result)
      : null;
    const packagesToRemove = job.packagesToRemove
      ? (typeof job.packagesToRemove === 'string' ? JSON.parse(job.packagesToRemove) : job.packagesToRemove)
      : [];

    res.json({
      id: job.id,
      repositoryId: job.repositoryId,
      repoName: job.repoName,
      packagesToRemove,
      status: job.status,
      progress,
      result,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt
    });
  } catch (error) {
    console.error('[Bridge Server] Error fetching cleanup job:', error);
    res.status(500).json({ error: 'Failed to fetch cleanup job status' });
  }
});

// 5. Get specific scan by ID (for export)
app.get('/api/scans/:id/export', async (req, res) => {
  try {
    const db = await getDb();
    const scan = await db.get('SELECT * FROM scans WHERE id = ?', [req.params.id]);
    
    if (!scan) {
      return res.status(404).json({ error: 'Scan not found' });
    }
    
    // PostgreSQL returns JSONB as object, SQLite as string
    const data = typeof scan.data === 'string' ? JSON.parse(scan.data) : scan.data;
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="bridge-scan-${scan.id}.json"`);
    res.json(data);
  } catch (error) {
    console.error('[Bridge Server] Error exporting scan:', error);
    res.status(500).json({ error: 'Failed to export scan' });
  }
});

// 4. Start a Scan for a Repository
app.post('/api/scan', authMiddleware, async (req, res) => {
  try {
    const { repoUrl, repositoryId } = req.body;

    console.log('[Bridge Server] Received scan request:', repoUrl);

    if (!repoUrl) {
      console.error('[Bridge Server] Missing repoUrl in request');
      return res.status(400).json({ error: 'Repo URL required' });
    }

    const db = await getDb();

    // Get or create repository
    let repoId = repositoryId;
    if (!repoId) {
      const urlParts = repoUrl.replace('https://github.com/', '').replace('.git', '').split('/');
      const owner = urlParts[0];
      const name = urlParts[1];

      const existing = await db.get('SELECT id FROM repositories WHERE "repoUrl" = ? AND "userId" = ?', [repoUrl, req.user.id]);

      if (existing) {
        repoId = existing.id;
      } else {
        const result = await db.run(
          'INSERT INTO repositories ("repoUrl", name, owner, "userId") VALUES (?, ?, ?, ?)',
          [repoUrl, name, owner, req.user.id]
        );
        repoId = result.lastID;
      }
    } else {
      // Verify user owns the repository
      const repo = await db.get('SELECT id FROM repositories WHERE id = ? AND "userId" = ?', [repositoryId, req.user.id]);
      if (!repo) {
        return res.status(404).json({ error: 'Repository not found' });
      }
    }

    // Create Scan Entry
    const result = await db.run(
      'INSERT INTO scans ("repositoryId", "repoUrl", status) VALUES (?, ?, ?)',
      [repoId, repoUrl, 'processing']
    );

    const scanId = result.lastID;
    console.log('[Bridge Server] Created scan job:', scanId);

    // Trigger Worker (Fire and Forget)
    processScan(scanId, repoUrl, repoId, db).catch(err => {
      console.error('[Bridge Server] Worker error:', err);
    });

    res.json({ scanId, repositoryId: repoId, status: 'processing' });
  } catch (error) {
    console.error('[Bridge Server] Error creating scan:', error);
    res.status(500).json({ error: 'Failed to create scan job' });
  }
});

// 2. Poll Status (with progress info)
app.get('/api/scan/:id', async (req, res) => {
  try {
    const db = await getDb();
    const scan = await db.get('SELECT * FROM scans WHERE id = ?', [req.params.id]);

    console.log('[Bridge Server] Poll for scan:', req.params.id, 'Status:', scan?.status);

    if (!scan) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    if (scan.status === 'completed') {
      // PostgreSQL returns JSONB as object, SQLite as string
      const data = typeof scan.data === 'string' ? JSON.parse(scan.data) : scan.data;
      return res.json({
        status: 'completed',
        data,
        progress: { phase: 'Complete', step: 7, totalSteps: 7, percent: 100 }
      });
    }

    // Return progress info for in-progress scans
    let progress = null;
    if (scan.progress) {
      try {
        progress = typeof scan.progress === 'string' ? JSON.parse(scan.progress) : scan.progress;
      } catch (e) {
        progress = { phase: 'Processing...', step: 1, totalSteps: 7, percent: 14 };
      }
    } else {
      progress = { phase: 'Starting...', step: 1, totalSteps: 7, percent: 14 };
    }

    res.json({ status: scan.status, progress });
  } catch (error) {
    console.error('[Bridge Server] Error polling scan:', error);
    res.status(500).json({ error: 'Failed to retrieve scan status' });
  }
});

// 3. List Recent Scans
app.get('/api/history', async (req, res) => {
    const db = await getDb();
    const scans = await db.all('SELECT id, "repoUrl", status, "createdAt" FROM scans ORDER BY id DESC LIMIT 5');
    res.json(scans);
});

// ===== AGENT ENDPOINTS (Scaffolding for future features) =====

// List user's agents
app.get('/api/agents', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const agents = await db.all(
      'SELECT * FROM agents WHERE "userId" = ? ORDER BY "createdAt" DESC',
      [req.user.id]
    );
    res.json(agents);
  } catch (error) {
    console.error('[Bridge Server] Error fetching agents:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// Create new agent
app.post('/api/agents', authMiddleware, async (req, res) => {
  try {
    const { name, type, config = {}, schedule = null } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const validTypes = ['package-update', 'unused-deps', 'security-audit', 'code-cleanup'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid agent type' });
    }

    const db = await getDb();
    const result = await db.run(
      'INSERT INTO agents ("userId", name, type, config, schedule) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, name, type, JSON.stringify(config), schedule]
    );

    res.json({
      id: result.lastID,
      userId: req.user.id,
      name,
      type,
      config,
      schedule,
      isEnabled: 1
    });
  } catch (error) {
    console.error('[Bridge Server] Error creating agent:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// Get agent by ID
app.get('/api/agents/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const agent = await db.get(
      'SELECT * FROM agents WHERE id = ? AND "userId" = ?',
      [req.params.id, req.user.id]
    );

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Parse config if string
    if (typeof agent.config === 'string') {
      agent.config = JSON.parse(agent.config);
    }

    res.json(agent);
  } catch (error) {
    console.error('[Bridge Server] Error fetching agent:', error);
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
});

// Update agent
app.patch('/api/agents/:id', authMiddleware, async (req, res) => {
  try {
    const { name, config, schedule, isEnabled } = req.body;
    const db = await getDb();

    // Verify ownership
    const agent = await db.get(
      'SELECT * FROM agents WHERE id = ? AND "userId" = ?',
      [req.params.id, req.user.id]
    );

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Build update query
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (config !== undefined) {
      updates.push('config = ?');
      values.push(JSON.stringify(config));
    }
    if (schedule !== undefined) {
      updates.push('schedule = ?');
      values.push(schedule);
    }
    if (isEnabled !== undefined) {
      updates.push('"isEnabled" = ?');
      values.push(isEnabled ? 1 : 0);
    }

    if (updates.length > 0) {
      updates.push('"updatedAt" = CURRENT_TIMESTAMP');
      values.push(req.params.id);
      await db.run(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Bridge Server] Error updating agent:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// Delete agent
app.delete('/api/agents/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    await db.run(
      'DELETE FROM agents WHERE id = ? AND "userId" = ?',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[Bridge Server] Error deleting agent:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// Get agent run history
app.get('/api/agents/:id/runs', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();

    // Verify ownership
    const agent = await db.get(
      'SELECT * FROM agents WHERE id = ? AND "userId" = ?',
      [req.params.id, req.user.id]
    );

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const runs = await db.all(
      'SELECT * FROM agent_runs WHERE "agentId" = ? ORDER BY "createdAt" DESC LIMIT 20',
      [req.params.id]
    );

    res.json(runs);
  } catch (error) {
    console.error('[Bridge Server] Error fetching agent runs:', error);
    res.status(500).json({ error: 'Failed to fetch agent runs' });
  }
});

// Trigger manual agent run (placeholder - actual execution not implemented)
app.post('/api/agents/:id/run', authMiddleware, async (req, res) => {
  try {
    const { repositoryId } = req.body;
    const db = await getDb();

    // Verify agent ownership
    const agent = await db.get(
      'SELECT * FROM agents WHERE id = ? AND "userId" = ?',
      [req.params.id, req.user.id]
    );

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Verify repository ownership
    const repo = await db.get(
      'SELECT * FROM repositories WHERE id = ? AND "userId" = ?',
      [repositoryId, req.user.id]
    );

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    // Create a pending run (actual execution would be implemented separately)
    const result = await db.run(
      'INSERT INTO agent_runs ("agentId", "repositoryId", status) VALUES (?, ?, ?)',
      [req.params.id, repositoryId, 'pending']
    );

    res.json({
      id: result.lastID,
      agentId: parseInt(req.params.id),
      repositoryId,
      status: 'pending',
      message: 'Agent run queued. Execution engine coming soon.'
    });
  } catch (error) {
    console.error('[Bridge Server] Error triggering agent run:', error);
    res.status(500).json({ error: 'Failed to trigger agent run' });
  }
});

// ===== AUTOMATION SETTINGS ENDPOINTS =====

// Get automation settings for a repository
app.get('/api/repositories/:id/automation-settings', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();

    // Verify ownership
    const repo = await db.get(
      'SELECT id FROM repositories WHERE id = ? AND "userId" = ?',
      [req.params.id, req.user.id]
    );

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const settings = await db.get(
      'SELECT * FROM automation_settings WHERE "repositoryId" = ?',
      [req.params.id]
    );

    if (!settings) {
      // Return default settings if none exist
      return res.json({
        repositoryId: parseInt(req.params.id),
        scanEnabled: false,
        scanFrequency: 'manual',
        patchEnabled: false,
        patchFrequency: 'manual',
        patchAutoMerge: false,
        reportEnabled: false,
        reportFrequency: 'manual',
        reportRecipients: []
      });
    }

    // Parse JSON fields
    const reportRecipients = settings.reportRecipients
      ? (typeof settings.reportRecipients === 'string' ? JSON.parse(settings.reportRecipients) : settings.reportRecipients)
      : [];

    res.json({
      id: settings.id,
      repositoryId: settings.repositoryId,
      scanEnabled: !!settings.scanEnabled,
      scanFrequency: settings.scanFrequency || 'manual',
      scanDayOfWeek: settings.scanDayOfWeek,
      scanDayOfMonth: settings.scanDayOfMonth,
      scanTime: settings.scanTime,
      patchEnabled: !!settings.patchEnabled,
      patchFrequency: settings.patchFrequency || 'manual',
      patchDayOfWeek: settings.patchDayOfWeek,
      patchDayOfMonth: settings.patchDayOfMonth,
      patchTime: settings.patchTime,
      patchAutoMerge: !!settings.patchAutoMerge,
      reportEnabled: !!settings.reportEnabled,
      reportFrequency: settings.reportFrequency || 'manual',
      reportDayOfWeek: settings.reportDayOfWeek,
      reportDayOfMonth: settings.reportDayOfMonth,
      reportTime: settings.reportTime,
      reportRecipients
    });
  } catch (error) {
    console.error('[Bridge Server] Error fetching automation settings:', error);
    res.status(500).json({ error: 'Failed to fetch automation settings' });
  }
});

// Save automation settings for a repository
app.put('/api/repositories/:id/automation-settings', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();

    // Verify ownership
    const repo = await db.get(
      'SELECT id FROM repositories WHERE id = ? AND "userId" = ?',
      [req.params.id, req.user.id]
    );

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const {
      scanEnabled = false,
      scanFrequency = 'manual',
      scanDayOfWeek,
      scanDayOfMonth,
      scanTime,
      patchEnabled = false,
      patchFrequency = 'manual',
      patchDayOfWeek,
      patchDayOfMonth,
      patchTime,
      patchAutoMerge = false,
      reportEnabled = false,
      reportFrequency = 'manual',
      reportDayOfWeek,
      reportDayOfMonth,
      reportTime,
      reportRecipients = []
    } = req.body;

    // Check if settings exist
    const existing = await db.get(
      'SELECT id FROM automation_settings WHERE "repositoryId" = ?',
      [req.params.id]
    );

    if (existing) {
      // Update existing
      await db.run(
        `UPDATE automation_settings SET
          "scanEnabled" = ?,
          "scanFrequency" = ?,
          "scanDayOfWeek" = ?,
          "scanDayOfMonth" = ?,
          "scanTime" = ?,
          "patchEnabled" = ?,
          "patchFrequency" = ?,
          "patchDayOfWeek" = ?,
          "patchDayOfMonth" = ?,
          "patchTime" = ?,
          "patchAutoMerge" = ?,
          "reportEnabled" = ?,
          "reportFrequency" = ?,
          "reportDayOfWeek" = ?,
          "reportDayOfMonth" = ?,
          "reportTime" = ?,
          "reportRecipients" = ?,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "repositoryId" = ?`,
        [
          scanEnabled ? 1 : 0,
          scanFrequency,
          scanDayOfWeek,
          scanDayOfMonth,
          scanTime,
          patchEnabled ? 1 : 0,
          patchFrequency,
          patchDayOfWeek,
          patchDayOfMonth,
          patchTime,
          patchAutoMerge ? 1 : 0,
          reportEnabled ? 1 : 0,
          reportFrequency,
          reportDayOfWeek,
          reportDayOfMonth,
          reportTime,
          JSON.stringify(reportRecipients),
          req.params.id
        ]
      );
    } else {
      // Insert new
      await db.run(
        `INSERT INTO automation_settings (
          "repositoryId",
          "scanEnabled", "scanFrequency", "scanDayOfWeek", "scanDayOfMonth", "scanTime",
          "patchEnabled", "patchFrequency", "patchDayOfWeek", "patchDayOfMonth", "patchTime", "patchAutoMerge",
          "reportEnabled", "reportFrequency", "reportDayOfWeek", "reportDayOfMonth", "reportTime", "reportRecipients"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.params.id,
          scanEnabled ? 1 : 0,
          scanFrequency,
          scanDayOfWeek,
          scanDayOfMonth,
          scanTime,
          patchEnabled ? 1 : 0,
          patchFrequency,
          patchDayOfWeek,
          patchDayOfMonth,
          patchTime,
          patchAutoMerge ? 1 : 0,
          reportEnabled ? 1 : 0,
          reportFrequency,
          reportDayOfWeek,
          reportDayOfMonth,
          reportTime,
          JSON.stringify(reportRecipients)
        ]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Bridge Server] Error saving automation settings:', error);
    res.status(500).json({ error: 'Failed to save automation settings' });
  }
});

// Catch-all for 404s - BEFORE error handler
app.use('/api/*', (req, res) => {
  console.error('[Bridge Server] 404 - Route not found:', req.method, req.originalUrl);
  console.error('[Bridge Server] Available routes:');
  console.error('  GET  /api/health');
  console.error('  GET  /api/repositories');
  console.error('  POST /api/repositories');
  console.error('  DELETE /api/repositories/:id');
  console.error('  POST /api/scan');
  console.error('  GET  /api/scan/:id');
  console.error('  GET  /api/history');
  res.status(404).json({ 
    error: 'Route not found', 
    method: req.method, 
    path: req.originalUrl,
    message: 'Check server logs for available routes'
  });
});

// Error handling middleware (must be last)
app.use((err, req, res, next) => {
  console.error('[Bridge Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error: ' + err.message });
});

app.listen(PORT, () => {
  console.log(`\n[Bridge] Server running on http://localhost:${PORT}`);
  console.log(`   GitHub Token: ${process.env.GITHUB_TOKEN ? '[OK] Loaded' : '[X] Missing'}`);
  console.log(`   Gemini API Key: ${process.env.GEMINI_API_KEY ? '[OK] Loaded' : '[X] Missing'}`);
  console.log(`   Ready to accept requests\n`);
});
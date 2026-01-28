import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { getDb } from './db.js';
import { processScan } from './worker.js';
import { processUpdate } from './update-worker.js';
import { processCleanup } from './cleanup-worker.js';
import { processSecurityFix } from './security-fix-worker.js';
import { generateJWT, setAuthCookie, clearAuthCookie, authMiddleware } from './auth.js';
import { getUserRepos, getUserOrgs, getOrgRepos } from './github.js';
import {
  isSecurityAgentAvailable,
  runSecurityScan,
  generateAIFix,
  getSupportedLanguages,
  getSeverityColor,
  getSeverityBadgeClass,
} from './security-scanner.js';

dotenv.config();

// Helper function for OAuth success page (Electron)
function getAuthSuccessPage(username) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Signed in to Bridge</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      text-align: center;
    }
    .container { max-width: 400px; padding: 2rem; }
    .checkmark {
      width: 60px;
      height: 60px;
      background: #22c55e;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.5rem;
      font-size: 2rem;
    }
    h1 { color: #22c55e; font-size: 1.5rem; margin-bottom: 1rem; }
    p { color: #94a3b8; margin-bottom: 1.5rem; line-height: 1.6; }
    .username { color: #f59e0b; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="checkmark">✓</div>
    <h1>Successfully Signed In!</h1>
    <p>Welcome, <span class="username">${username}</span>!</p>
    <p>You can now close this browser tab and return to the Bridge app.</p>
    <p style="font-size: 0.875rem; color: #64748b;">
      Bridge will automatically detect your login.
    </p>
  </div>
</body>
</html>`;
}

// Helper function for OAuth error page
function getAuthErrorPage(errorMessage) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Bridge Sign In Error</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      text-align: center;
    }
    .container { max-width: 400px; padding: 2rem; }
    .error-icon {
      width: 60px;
      height: 60px;
      background: #ef4444;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.5rem;
      font-size: 2rem;
    }
    h1 { color: #ef4444; font-size: 1.5rem; margin-bottom: 1rem; }
    p { color: #94a3b8; margin-bottom: 1.5rem; line-height: 1.6; }
    .error { color: #fca5a5; font-family: monospace; background: #1e1e1e; padding: 0.5rem 1rem; border-radius: 0.25rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">✕</div>
    <h1>Sign In Failed</h1>
    <p class="error">${errorMessage}</p>
    <p>Please close this tab and try again in Bridge.</p>
  </div>
</body>
</html>`;
}

const app = express();
const PORT = process.env.PORT || 3001;

// Pending auth tokens for Electron OAuth flow
// Maps authToken -> { status: 'pending' | 'completed', userId?, userData?, createdAt }
const pendingAuthTokens = new Map();

// Clean up old pending tokens every 5 minutes
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [token, data] of pendingAuthTokens.entries()) {
    if (data.createdAt < fiveMinutesAgo) {
      pendingAuthTokens.delete(token);
    }
  }
}, 5 * 60 * 1000);

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
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
// Query params:
//   platform=electron - indicates auth is from Electron app
//   platform=web - indicates auth is from web browser
app.get('/api/auth/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const platform = req.query.platform || 'electron';

  if (!clientId) {
    return res.json({
      error: 'GitHub OAuth not configured',
      message: 'Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in your .env file'
    });
  }

  // For Electron: generate a pending auth token that Electron will poll
  let authToken = null;
  if (platform === 'electron') {
    authToken = crypto.randomUUID();
    pendingAuthTokens.set(authToken, {
      status: 'pending',
      createdAt: Date.now()
    });
    console.log('[Auth] Created pending auth token:', authToken);
  }

  // IMPORTANT: redirect_uri MUST match what's registered in the GitHub App
  const redirectUri = process.env.GITHUB_REDIRECT_URI || 'http://localhost:3001/api/auth/electron-callback';
  
  // Scopes: repo (access repos), read:user (read user data), read:org (read org membership), user:email (read email)
  const scope = 'repo read:user read:org user:email';

  // Use state parameter to track platform AND auth token
  const state = Buffer.from(JSON.stringify({ platform, authToken, ts: Date.now() })).toString('base64');

  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;

  console.log('[Auth] Generated auth URL for platform:', platform, 'authToken:', authToken);
  res.json({ authUrl, authToken });
});

// Check pending auth status (for Electron polling)
app.get('/api/auth/check-pending/:token', async (req, res) => {
  const { token } = req.params;
  
  const pending = pendingAuthTokens.get(token);
  
  if (!pending) {
    return res.json({ status: 'not_found' });
  }
  
  if (pending.status === 'pending') {
    return res.json({ status: 'pending' });
  }
  
  if (pending.status === 'completed') {
    // Set the auth cookie for Electron
    const jwtToken = generateJWT(pending.userId);
    setAuthCookie(res, jwtToken);
    
    // Clean up the pending token
    pendingAuthTokens.delete(token);
    
    console.log('[Auth] Pending auth claimed by Electron for user:', pending.userData.username);
    
    return res.json({
      status: 'completed',
      user: pending.userData
    });
  }
  
  if (pending.status === 'error') {
    pendingAuthTokens.delete(token);
    return res.json({ status: 'error', error: pending.error });
  }
  
  res.json({ status: 'unknown' });
});

// GitHub OAuth - GET callback (handles both Electron and web based on state)
app.get('/api/auth/electron-callback', async (req, res) => {
  const { code, error, error_description, state } = req.query;

  // Parse state to determine platform and auth token
  let platform = 'electron';
  let authToken = null;
  try {
    if (state) {
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      platform = decoded.platform || 'electron';
      authToken = decoded.authToken;
    }
  } catch (e) {
    console.warn('[Auth] Failed to parse state:', e.message);
  }

  const isElectron = platform === 'electron';
  console.log('[Auth] OAuth callback received, platform:', platform, 'authToken:', authToken, 'code:', !!code);

  if (error) {
    // Mark pending auth as failed
    if (authToken && pendingAuthTokens.has(authToken)) {
      pendingAuthTokens.set(authToken, {
        status: 'error',
        error: error_description || error,
        createdAt: Date.now()
      });
    }
    if (isElectron) {
      return res.send(getAuthErrorPage(error_description || error));
    }
    return res.redirect(`http://localhost:3000?auth_error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(error_description || '')}`);
  }

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  // For Electron: Complete auth and store in pending tokens for polling
  if (isElectron) {
    console.log('[Auth] Completing OAuth for Electron platform');
    
    try {
      const clientId = process.env.GITHUB_CLIENT_ID;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET;

      // Exchange code for token
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
        console.error('[Auth] Token exchange failed:', tokenData.error);
        if (authToken && pendingAuthTokens.has(authToken)) {
          pendingAuthTokens.set(authToken, {
            status: 'error',
            error: tokenData.error_description || tokenData.error,
            createdAt: Date.now()
          });
        }
        return res.send(getAuthErrorPage(tokenData.error_description || tokenData.error));
      }

      // Get user info from GitHub
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      const githubUser = await userResponse.json();
      console.log('[Auth] Got GitHub user:', githubUser.login);

      // Save or update user in database
      const db = await getDb();
      let user = await db.get('SELECT * FROM users WHERE "githubId" = ?', [String(githubUser.id)]);

      if (user) {
        await db.run(
          'UPDATE users SET username = ?, email = ?, "avatarUrl" = ?, "accessToken" = ? WHERE id = ?',
          [githubUser.login, githubUser.email || '', githubUser.avatar_url, tokenData.access_token, user.id]
        );
        user = await db.get('SELECT * FROM users WHERE id = ?', [user.id]);
      } else {
        const result = await db.run(
          'INSERT INTO users (username, email, "avatarUrl", "githubId", "accessToken") VALUES (?, ?, ?, ?, ?)',
          [githubUser.login, githubUser.email || '', githubUser.avatar_url, String(githubUser.id), tokenData.access_token]
        );
        user = await db.get('SELECT * FROM users WHERE id = ?', [result.lastID]);
      }

      // Store completed auth in pending tokens map for Electron to claim
      const userData = {
        id: user.id,
        githubId: String(githubUser.id),
        username: githubUser.login,
        email: githubUser.email || '',
        avatarUrl: githubUser.avatar_url
      };

      if (authToken && pendingAuthTokens.has(authToken)) {
        pendingAuthTokens.set(authToken, {
          status: 'completed',
          userId: user.id,
          userData,
          createdAt: Date.now()
        });
        console.log('[Auth] Stored completed auth in pending token:', authToken);
      } else {
        console.warn('[Auth] No pending auth token found, user will need to retry');
      }

      console.log('[Auth] Electron OAuth complete for user:', githubUser.login);
      
      // Return success page - Electron will pick up auth via polling
      return res.send(getAuthSuccessPage(githubUser.login));
    } catch (err) {
      console.error('[Auth] Electron OAuth error:', err);
      if (authToken && pendingAuthTokens.has(authToken)) {
        pendingAuthTokens.set(authToken, {
          status: 'error',
          error: 'Authentication failed. Please try again.',
          createdAt: Date.now()
        });
      }
      return res.send(getAuthErrorPage('Authentication failed. Please try again.'));
    }
  }

  // For web browsers: exchange the code, set cookie, redirect to frontend
  try {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

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
      return res.redirect(`http://localhost:3000?auth_error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`);
    }

    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const githubUser = await userResponse.json();

    const db = await getDb();
    let user = await db.get('SELECT * FROM users WHERE "githubId" = ?', [String(githubUser.id)]);

    if (user) {
      await db.run(
        'UPDATE users SET username = ?, email = ?, "avatarUrl" = ?, "accessToken" = ? WHERE id = ?',
        [githubUser.login, githubUser.email || '', githubUser.avatar_url, tokenData.access_token, user.id]
      );
      user = await db.get('SELECT * FROM users WHERE id = ?', [user.id]);
    } else {
      const result = await db.run(
        'INSERT INTO users (username, email, "avatarUrl", "githubId", "accessToken") VALUES (?, ?, ?, ?, ?)',
        [githubUser.login, githubUser.email || '', githubUser.avatar_url, String(githubUser.id), tokenData.access_token]
      );
      user = await db.get('SELECT * FROM users WHERE id = ?', [result.lastID]);
    }

    // Set auth cookie
    const token = generateJWT(user.id);
    setAuthCookie(res, token);

    // Redirect to frontend
    console.log('[Auth] Web OAuth complete, redirecting to frontend');
    res.redirect('http://localhost:3000');
  } catch (error) {
    console.error('[Auth] Web OAuth error:', error);
    res.redirect(`http://localhost:3000?auth_error=${encodeURIComponent('Authentication failed')}`);
  }
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
    githubId: req.user.githubId,
    username: req.user.username,
    email: req.user.email,
    avatarUrl: req.user.avatarUrl
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
      // If it's inactive (disconnected), reactivate it
      if (existing.isActive === 0) {
        console.log('[Bridge Server] Reactivating previously disconnected repository:', repoUrl);
        await db.run('UPDATE repositories SET "isActive" = 1 WHERE id = ?', [existing.id]);
        res.json({ id: existing.id, name: existing.name, owner: existing.owner, repoUrl, reconnected: true });
        return;
      }
      // If it's already active, error
      console.warn('[Bridge Server] Repository already connected:', repoUrl);
      return res.status(400).json({ error: 'Repository already connected' });
    }

    // Create new repository entry with userId
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

// Delete stale branches
app.post('/api/repositories/:id/branches/delete', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const { branches } = req.body;

    if (!branches || !Array.isArray(branches) || branches.length === 0) {
      return res.status(400).json({ error: 'branches array is required' });
    }

    // Get repository
    const repo = await db.get(
      'SELECT * FROM repositories WHERE id = ? AND "userId" = ?',
      [req.params.id, req.user.id]
    );

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    // Check for user access token
    if (!req.user.accessToken) {
      return res.status(400).json({
        error: 'GitHub access token required. Please log in with GitHub (not demo mode) to delete branches.'
      });
    }

    // Extract owner/repo from URL
    const urlParts = repo.repoUrl.split('/');
    const repoName = urlParts.pop().replace('.git', '');
    const owner = urlParts.pop();

    // Delete branches via GitHub API
    const deleted = [];
    const failed = [];

    for (const branch of branches) {
      try {
        // Skip protected branches
        if (branch === 'main' || branch === 'master' || branch === 'develop') {
          failed.push({ branch, error: 'Protected branch' });
          continue;
        }

        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repoName}/git/refs/heads/${encodeURIComponent(branch)}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${req.user.accessToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Bridge-Console'
            }
          }
        );

        if (response.ok || response.status === 204) {
          deleted.push(branch);
        } else {
          const errorData = await response.json().catch(() => ({}));
          failed.push({ branch, error: errorData.message || `HTTP ${response.status}` });
        }
      } catch (err) {
        failed.push({ branch, error: err.message });
      }
    }

    console.log(`[Bridge Server] Branch deletion: ${deleted.length} deleted, ${failed.length} failed`);

    res.json({
      deleted,
      failed,
      message: `Deleted ${deleted.length} of ${branches.length} branches`
    });
  } catch (error) {
    console.error('[Bridge Server] Error deleting branches:', error);
    res.status(500).json({ error: 'Failed to delete branches' });
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

// ===== SECURITY SCANNER ENDPOINTS =====

// Check if security scanner is available
app.get('/api/security/status', async (req, res) => {
  try {
    const available = await isSecurityAgentAvailable();
    res.json({
      available,
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      supportedLanguages: getSupportedLanguages()
    });
  } catch (error) {
    console.error('[Security Scanner] Error checking status:', error);
    res.status(500).json({ error: 'Failed to check security scanner status' });
  }
});

// Start a security scan for a repository
app.post('/api/security/scan', authMiddleware, async (req, res) => {
  try {
    const { repositoryId, generateFixes = false } = req.body;

    if (!repositoryId) {
      return res.status(400).json({ error: 'repositoryId is required' });
    }

    const db = await getDb();

    // Verify user owns this repository
    const repo = await db.get(
      'SELECT * FROM repositories WHERE id = ? AND "userId" = ?',
      [repositoryId, req.user.id]
    );

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    // Check if security scanner is available
    const available = await isSecurityAgentAvailable();
    if (!available) {
      return res.status(503).json({
        error: 'Security scanner not available. Ensure Python 3 is installed.'
      });
    }

    // Create security scan entry
    const result = await db.run(
      `INSERT INTO security_scans ("repositoryId", "repoUrl", status, "generateFixes")
       VALUES (?, ?, 'pending', ?)`,
      [repositoryId, repo.repoUrl, generateFixes ? 1 : 0]
    );

    const scanId = result.lastID;
    console.log(`[Security Scanner] Created scan ${scanId} for ${repo.name}`);

    // Start async security scan (fire and forget)
    processSecurityScan(scanId, repo, generateFixes, db).catch(err => {
      console.error('[Security Scanner] Scan error:', err);
    });

    res.json({
      scanId,
      repositoryId,
      status: 'pending',
      message: 'Security scan started'
    });
  } catch (error) {
    console.error('[Security Scanner] Error starting scan:', error);
    res.status(500).json({ error: 'Failed to start security scan' });
  }
});

// Get security scan status
app.get('/api/security/scan/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();

    // Get scan with repository info
    const scan = await db.get(
      `SELECT ss.*, r.name as "repoName", r."repoUrl"
       FROM security_scans ss
       JOIN repositories r ON ss."repositoryId" = r.id
       WHERE ss.id = ? AND r."userId" = ?`,
      [req.params.id, req.user.id]
    );

    if (!scan) {
      return res.status(404).json({ error: 'Security scan not found' });
    }

    // Parse JSON fields
    const progress = scan.progress
      ? (typeof scan.progress === 'string' ? JSON.parse(scan.progress) : scan.progress)
      : null;
    const results = scan.results
      ? (typeof scan.results === 'string' ? JSON.parse(scan.results) : scan.results)
      : null;

    res.json({
      id: scan.id,
      repositoryId: scan.repositoryId,
      repoName: scan.repoName,
      repoUrl: scan.repoUrl,
      status: scan.status,
      progress,
      results,
      generateFixes: !!scan.generateFixes,
      startedAt: scan.startedAt,
      completedAt: scan.completedAt,
      createdAt: scan.createdAt
    });
  } catch (error) {
    console.error('[Security Scanner] Error fetching scan:', error);
    res.status(500).json({ error: 'Failed to fetch security scan' });
  }
});

// Get security scan history for a repository
app.get('/api/repositories/:id/security-history', authMiddleware, async (req, res) => {
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

    const scans = await db.all(
      `SELECT id, status, results, "createdAt", "completedAt"
       FROM security_scans
       WHERE "repositoryId" = ?
       ORDER BY "createdAt" DESC
       LIMIT 10`,
      [req.params.id]
    );

    res.json(scans.map(scan => {
      const results = scan.results
        ? (typeof scan.results === 'string' ? JSON.parse(scan.results) : scan.results)
        : null;

      return {
        id: scan.id,
        status: scan.status,
        createdAt: scan.createdAt,
        completedAt: scan.completedAt,
        summary: results ? {
          totalFindings: results.stats?.total_findings || 0,
          critical: results.stats?.critical || 0,
          high: results.stats?.high || 0,
          medium: results.stats?.medium || 0,
          low: results.stats?.low || 0,
          languages: results.languages || []
        } : null
      };
    }));
  } catch (error) {
    console.error('[Security Scanner] Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch security scan history' });
  }
});

// Generate AI fix for a specific finding
app.post('/api/security/fix', authMiddleware, async (req, res) => {
  try {
    const { finding } = req.body;

    if (!finding) {
      return res.status(400).json({ error: 'finding object is required' });
    }

    // Check for Gemini API key
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'AI fix generation requires GEMINI_API_KEY to be configured'
      });
    }

    console.log(`[Security Scanner] Generating AI fix for ${finding.issue} in ${finding.file}`);

    const fix = await generateAIFix(finding);

    res.json(fix);
  } catch (error) {
    console.error('[Security Scanner] Error generating fix:', error);
    res.status(500).json({ error: 'Failed to generate AI fix' });
  }
});

// Get severity styling helpers
app.get('/api/security/helpers', (req, res) => {
  res.json({
    severityColors: {
      critical: getSeverityColor('critical'),
      high: getSeverityColor('high'),
      medium: getSeverityColor('medium'),
      low: getSeverityColor('low')
    },
    severityBadgeClasses: {
      critical: getSeverityBadgeClass('critical'),
      high: getSeverityBadgeClass('high'),
      medium: getSeverityBadgeClass('medium'),
      low: getSeverityBadgeClass('low')
    },
    supportedLanguages: getSupportedLanguages()
  });
});

// ===== SECURITY FIX ENDPOINTS =====
// Autonomous security fix workflow: Clone → Generate Fix → Apply Patch → Commit → Create PR

// Trigger autonomous security fix and PR creation
app.post('/api/security/fix-and-pr', authMiddleware, async (req, res) => {
  try {
    const { repositoryId, finding, securityScanId } = req.body;

    if (!repositoryId || !finding) {
      return res.status(400).json({ error: 'repositoryId and finding are required' });
    }

    const db = await getDb();

    // Verify user owns this repository
    const repo = await db.get(
      'SELECT * FROM repositories WHERE id = ? AND "userId" = ?',
      [repositoryId, req.user.id]
    );

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    // Check user has GitHub access token (required for creating branches and PRs)
    if (!req.user.accessToken) {
      return res.status(400).json({
        error: 'GitHub access token required. Please log in with GitHub (not demo mode) to create PRs.'
      });
    }

    // Check for Gemini API key
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'AI fix generation requires GEMINI_API_KEY to be configured'
      });
    }

    // Create security fix job entry
    const result = await db.run(
      `INSERT INTO security_fix_jobs ("repositoryId", "userId", "securityScanId", "findingData", status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [repositoryId, req.user.id, securityScanId || null, JSON.stringify(finding)]
    );

    const jobId = result.lastID;
    console.log(`[Security Fix] Created job ${jobId} for ${finding.issue} in ${finding.file}`);

    // Trigger the autonomous fix workflow (fire and forget)
    processSecurityFix(jobId, repo, finding, req.user.accessToken, db).catch(err => {
      console.error('[Security Fix] Worker error:', err);
    });

    res.json({
      jobId,
      repositoryId,
      status: 'pending',
      message: 'Security fix workflow started. Bridge is analyzing and patching the vulnerability.'
    });
  } catch (error) {
    console.error('[Security Fix] Error starting fix job:', error);
    res.status(500).json({ error: 'Failed to start security fix job' });
  }
});

// Get security fix job status
app.get('/api/security-fix-jobs/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();

    // Get job with repository info
    const job = await db.get(
      `SELECT sfj.*, r.name as "repoName", r."repoUrl"
       FROM security_fix_jobs sfj
       JOIN repositories r ON sfj."repositoryId" = r.id
       WHERE sfj.id = ? AND sfj."userId" = ?`,
      [req.params.id, req.user.id]
    );

    if (!job) {
      return res.status(404).json({ error: 'Security fix job not found' });
    }

    // Parse JSON fields
    const findingData = job.findingData
      ? (typeof job.findingData === 'string' ? JSON.parse(job.findingData) : job.findingData)
      : null;
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
      repoUrl: job.repoUrl,
      securityScanId: job.securityScanId,
      findingData,
      status: job.status,
      progress,
      result,
      logs: job.logs,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt
    });
  } catch (error) {
    console.error('[Security Fix] Error fetching job:', error);
    res.status(500).json({ error: 'Failed to fetch security fix job status' });
  }
});

// Get security fix history for a repository
app.get('/api/repositories/:id/security-fix-history', authMiddleware, async (req, res) => {
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
      `SELECT id, "findingData", status, result, "createdAt", "completedAt"
       FROM security_fix_jobs
       WHERE "repositoryId" = ?
       ORDER BY "createdAt" DESC
       LIMIT 20`,
      [req.params.id]
    );

    res.json(jobs.map(job => {
      const findingData = job.findingData
        ? (typeof job.findingData === 'string' ? JSON.parse(job.findingData) : job.findingData)
        : null;
      const result = job.result
        ? (typeof job.result === 'string' ? JSON.parse(job.result) : job.result)
        : null;

      return {
        id: job.id,
        status: job.status,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        finding: findingData ? {
          file: findingData.file,
          line: findingData.line,
          issue: findingData.issue,
          severity: findingData.severity,
          cwe: findingData.cwe
        } : null,
        result: result ? {
          success: result.success,
          prUrl: result.prUrl,
          prNumber: result.prNumber,
          error: result.error
        } : null
      };
    }));
  } catch (error) {
    console.error('[Security Fix] Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch security fix history' });
  }
});

// Security scan worker function
async function processSecurityScan(scanId, repo, generateFixes, db) {
  console.log(`[Security Scanner] Starting scan ${scanId} for ${repo.name}`);

  try {
    // Update status to processing
    await db.run(
      `UPDATE security_scans SET status = 'processing', "startedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
      [scanId]
    );

    // Clone repository to temp directory
    const os = await import('os');
    const path = await import('path');
    const fs = await import('fs');
    const { simpleGit } = await import('simple-git');

    const tempDir = path.join(os.tmpdir(), `bridge-security-${scanId}`);

    // Clean up if exists
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    // Update progress
    await db.run(
      `UPDATE security_scans SET progress = ? WHERE id = ?`,
      [JSON.stringify({ step: 'cloning', percent: 10, message: 'Cloning repository...' }), scanId]
    );

    // Clone the repository
    const git = simpleGit();
    await git.clone(repo.repoUrl, tempDir, ['--depth', '1']);

    // Update progress
    await db.run(
      `UPDATE security_scans SET progress = ? WHERE id = ?`,
      [JSON.stringify({ step: 'scanning', percent: 30, message: 'Running security scan...' }), scanId]
    );

    // Run the security scan
    const progressCallback = async (step, percent, message) => {
      await db.run(
        `UPDATE security_scans SET progress = ? WHERE id = ?`,
        [JSON.stringify({ step, percent: Math.min(90, 30 + (percent * 0.6)), message }), scanId]
      );
    };

    const results = await runSecurityScan(tempDir, { generateFixes }, progressCallback);

    // Update with final results
    await db.run(
      `UPDATE security_scans SET
        status = 'completed',
        progress = ?,
        results = ?,
        "completedAt" = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        JSON.stringify({ step: 'complete', percent: 100, message: 'Scan complete' }),
        JSON.stringify(results),
        scanId
      ]
    );

    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('[Security Scanner] Failed to clean up temp directory:', e);
    }

    console.log(`[Security Scanner] Scan ${scanId} completed - found ${results.stats?.total_findings || 0} findings`);

  } catch (error) {
    console.error(`[Security Scanner] Scan ${scanId} failed:`, error);

    await db.run(
      `UPDATE security_scans SET
        status = 'failed',
        progress = ?,
        "completedAt" = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify({ step: 'error', percent: 0, message: error.message }), scanId]
    );
  }
}

// ===== SOFTWARE CAPITALIZATION (CapEx) ENDPOINTS =====

// Get CapEx entries for a repository or all repos
app.get('/api/capex/entries', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const { repositoryId, startDate, endDate } = req.query;

    let query = `
      SELECT ce.*, r.name as repoName, r."repoUrl"
      FROM capex_entries ce
      JOIN repositories r ON ce."repositoryId" = r.id
      WHERE ce."userId" = ?
    `;
    const params = [req.user.id];

    if (repositoryId) {
      query += ' AND ce."repositoryId" = ?';
      params.push(repositoryId);
    }
    if (startDate) {
      query += ' AND ce.date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND ce.date <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY ce.date DESC, ce."createdAt" DESC';

    const entries = await db.all(query, params);
    res.json(entries);
  } catch (error) {
    console.error('[CapEx] Error fetching entries:', error);
    res.status(500).json({ error: 'Failed to fetch CapEx entries' });
  }
});

// Create CapEx entry
app.post('/api/capex/entries', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const {
      repositoryId,
      date,
      hoursSpent,
      category,
      isCapitalizable = true,
      capitalizablePercent = 100,
      description,
      ticketId,
      prUrl
    } = req.body;

    if (!repositoryId || !date || !hoursSpent || !category) {
      return res.status(400).json({ error: 'repositoryId, date, hoursSpent, and category are required' });
    }

    // Verify repo ownership
    const repo = await db.get(
      'SELECT id FROM repositories WHERE id = ? AND "userId" = ?',
      [repositoryId, req.user.id]
    );
    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const result = await db.run(
      `INSERT INTO capex_entries ("repositoryId", "userId", date, "hoursSpent", category, "isCapitalizable", "capitalizablePercent", description, "ticketId", "prUrl")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [repositoryId, req.user.id, date, hoursSpent, category, isCapitalizable ? 1 : 0, capitalizablePercent, description, ticketId, prUrl]
    );

    res.json({ id: result.lastID, message: 'CapEx entry created' });
  } catch (error) {
    console.error('[CapEx] Error creating entry:', error);
    res.status(500).json({ error: 'Failed to create CapEx entry' });
  }
});

// Update CapEx entry
app.put('/api/capex/entries/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();

    // Verify ownership
    const entry = await db.get(
      'SELECT id FROM capex_entries WHERE id = ? AND "userId" = ?',
      [req.params.id, req.user.id]
    );
    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const { date, hoursSpent, category, isCapitalizable, capitalizablePercent, description, ticketId, prUrl } = req.body;

    await db.run(
      `UPDATE capex_entries SET
        date = COALESCE(?, date),
        "hoursSpent" = COALESCE(?, "hoursSpent"),
        category = COALESCE(?, category),
        "isCapitalizable" = COALESCE(?, "isCapitalizable"),
        "capitalizablePercent" = COALESCE(?, "capitalizablePercent"),
        description = COALESCE(?, description),
        "ticketId" = COALESCE(?, "ticketId"),
        "prUrl" = COALESCE(?, "prUrl"),
        "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [date, hoursSpent, category, isCapitalizable !== undefined ? (isCapitalizable ? 1 : 0) : null, capitalizablePercent, description, ticketId, prUrl, req.params.id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[CapEx] Error updating entry:', error);
    res.status(500).json({ error: 'Failed to update CapEx entry' });
  }
});

// Delete CapEx entry
app.delete('/api/capex/entries/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    await db.run(
      'DELETE FROM capex_entries WHERE id = ? AND "userId" = ?',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[CapEx] Error deleting entry:', error);
    res.status(500).json({ error: 'Failed to delete CapEx entry' });
  }
});

// Get CapEx summary/report
app.get('/api/capex/summary', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const { repositoryId, startDate, endDate } = req.query;

    let whereClause = 'WHERE ce."userId" = ?';
    const params = [req.user.id];

    if (repositoryId) {
      whereClause += ' AND ce."repositoryId" = ?';
      params.push(repositoryId);
    }
    if (startDate) {
      whereClause += ' AND ce.date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      whereClause += ' AND ce.date <= ?';
      params.push(endDate);
    }

    // Get totals by category
    const byCategory = await db.all(`
      SELECT
        category,
        SUM("hoursSpent") as hours,
        SUM("hoursSpent" * "capitalizablePercent" / 100.0) as capitalizableHours,
        COUNT(*) as entries
      FROM capex_entries ce
      ${whereClause}
      GROUP BY category
    `, params);

    // Get totals by repository
    const byRepository = await db.all(`
      SELECT
        ce."repositoryId",
        r.name,
        SUM(ce."hoursSpent") as hours,
        SUM(ce."hoursSpent" * ce."capitalizablePercent" / 100.0) as capitalizableHours
      FROM capex_entries ce
      JOIN repositories r ON ce."repositoryId" = r.id
      ${whereClause}
      GROUP BY ce."repositoryId", r.name
    `, params);

    // Get weekly trend
    const weeklyTrend = await db.all(`
      SELECT
        strftime('%Y-%W', date) as week,
        SUM("hoursSpent") as totalHours,
        SUM("hoursSpent" * "capitalizablePercent" / 100.0) as capitalizableHours
      FROM capex_entries ce
      ${whereClause}
      GROUP BY strftime('%Y-%W', date)
      ORDER BY week DESC
      LIMIT 12
    `, params);

    // Calculate totals
    const totalHours = byCategory.reduce((sum, c) => sum + (c.hours || 0), 0);
    const capitalizableHours = byCategory.reduce((sum, c) => sum + (c.capitalizableHours || 0), 0);

    res.json({
      period: { start: startDate || 'all', end: endDate || 'now' },
      totalHours,
      capitalizableHours,
      expensedHours: totalHours - capitalizableHours,
      capitalizationRate: totalHours > 0 ? (capitalizableHours / totalHours) * 100 : 0,
      byCategory: Object.fromEntries(byCategory.map(c => [c.category, c])),
      byRepository: Object.fromEntries(byRepository.map(r => [r.repositoryId, r])),
      weeklyTrend: weeklyTrend.reverse()
    });
  } catch (error) {
    console.error('[CapEx] Error generating summary:', error);
    res.status(500).json({ error: 'Failed to generate CapEx summary' });
  }
});

// Get/Update CapEx settings
app.get('/api/capex/settings', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const settings = await db.get(
      'SELECT * FROM capex_settings WHERE "userId" = ?',
      [req.user.id]
    );

    if (!settings) {
      return res.json({
        userId: req.user.id,
        defaultRates: {
          'new-feature': 100,
          'enhancement': 100,
          'maintenance': 0,
          'bug-fix': 0,
          'infrastructure': 50,
          'technical-debt': 0,
          'documentation': 0,
          'testing': 50,
          'security': 50
        },
        fiscalYearStart: '01-01',
        exportFormat: 'csv'
      });
    }

    res.json({
      ...settings,
      defaultRates: typeof settings.defaultRates === 'string' ? JSON.parse(settings.defaultRates) : settings.defaultRates
    });
  } catch (error) {
    console.error('[CapEx] Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch CapEx settings' });
  }
});

app.put('/api/capex/settings', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const { defaultRates, fiscalYearStart, exportFormat } = req.body;

    const existing = await db.get(
      'SELECT id FROM capex_settings WHERE "userId" = ?',
      [req.user.id]
    );

    if (existing) {
      await db.run(
        `UPDATE capex_settings SET
          "defaultRates" = COALESCE(?, "defaultRates"),
          "fiscalYearStart" = COALESCE(?, "fiscalYearStart"),
          "exportFormat" = COALESCE(?, "exportFormat"),
          "updatedAt" = CURRENT_TIMESTAMP
         WHERE "userId" = ?`,
        [defaultRates ? JSON.stringify(defaultRates) : null, fiscalYearStart, exportFormat, req.user.id]
      );
    } else {
      await db.run(
        `INSERT INTO capex_settings ("userId", "defaultRates", "fiscalYearStart", "exportFormat")
         VALUES (?, ?, ?, ?)`,
        [req.user.id, JSON.stringify(defaultRates || {}), fiscalYearStart || '01-01', exportFormat || 'csv']
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[CapEx] Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update CapEx settings' });
  }
});

// ===== ROADMAP ENDPOINTS =====

// Get all roadmap items
app.get('/api/roadmap/items', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const { repositoryId, status, priority } = req.query;

    let query = `
      SELECT ri.*, r.name as repoName
      FROM roadmap_items ri
      LEFT JOIN repositories r ON ri."repositoryId" = r.id
      WHERE ri."userId" = ?
    `;
    const params = [req.user.id];

    if (repositoryId) {
      query += ' AND ri."repositoryId" = ?';
      params.push(repositoryId);
    }
    if (status) {
      query += ' AND ri.status = ?';
      params.push(status);
    }
    if (priority) {
      query += ' AND ri.priority = ?';
      params.push(priority);
    }

    query += ' ORDER BY ri.priority = \'critical\' DESC, ri.priority = \'high\' DESC, ri."targetDate" ASC NULLS LAST, ri."createdAt" DESC';

    const items = await db.all(query, params);

    // Parse JSON fields
    res.json(items.map(item => ({
      ...item,
      blockedBy: typeof item.blockedBy === 'string' ? JSON.parse(item.blockedBy) : item.blockedBy || [],
      blocks: typeof item.blocks === 'string' ? JSON.parse(item.blocks) : item.blocks || [],
      tags: typeof item.tags === 'string' ? JSON.parse(item.tags) : item.tags || []
    })));
  } catch (error) {
    console.error('[Roadmap] Error fetching items:', error);
    res.status(500).json({ error: 'Failed to fetch roadmap items' });
  }
});

// Create roadmap item
app.post('/api/roadmap/items', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const {
      repositoryId,
      title,
      description,
      status = 'planned',
      priority = 'medium',
      source = 'manual',
      sourceId,
      sourceUrl,
      targetDate,
      estimatedHours,
      category,
      tags = [],
      assignee
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    // Verify repo ownership if provided
    if (repositoryId) {
      const repo = await db.get(
        'SELECT id FROM repositories WHERE id = ? AND "userId" = ?',
        [repositoryId, req.user.id]
      );
      if (!repo) {
        return res.status(404).json({ error: 'Repository not found' });
      }
    }

    const result = await db.run(
      `INSERT INTO roadmap_items ("userId", "repositoryId", title, description, status, priority, source, "sourceId", "sourceUrl", "targetDate", "estimatedHours", category, tags, assignee)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, repositoryId || null, title, description, status, priority, source, sourceId, sourceUrl, targetDate, estimatedHours, category, JSON.stringify(tags), assignee]
    );

    res.json({ id: result.lastID, message: 'Roadmap item created' });
  } catch (error) {
    console.error('[Roadmap] Error creating item:', error);
    res.status(500).json({ error: 'Failed to create roadmap item' });
  }
});

// Update roadmap item
app.put('/api/roadmap/items/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();

    // Verify ownership
    const item = await db.get(
      'SELECT id FROM roadmap_items WHERE id = ? AND "userId" = ?',
      [req.params.id, req.user.id]
    );
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const {
      title, description, status, priority, targetDate, startDate, completedDate,
      estimatedHours, actualHours, blockedBy, blocks, category, tags, assignee
    } = req.body;

    // Handle completion date
    let completionDate = completedDate;
    if (status === 'completed' && !completedDate) {
      completionDate = new Date().toISOString().split('T')[0];
    }

    await db.run(
      `UPDATE roadmap_items SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        status = COALESCE(?, status),
        priority = COALESCE(?, priority),
        "targetDate" = COALESCE(?, "targetDate"),
        "startDate" = COALESCE(?, "startDate"),
        "completedDate" = COALESCE(?, "completedDate"),
        "estimatedHours" = COALESCE(?, "estimatedHours"),
        "actualHours" = COALESCE(?, "actualHours"),
        "blockedBy" = COALESCE(?, "blockedBy"),
        blocks = COALESCE(?, blocks),
        category = COALESCE(?, category),
        tags = COALESCE(?, tags),
        assignee = COALESCE(?, assignee),
        "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        title, description, status, priority, targetDate, startDate, completionDate,
        estimatedHours, actualHours,
        blockedBy ? JSON.stringify(blockedBy) : null,
        blocks ? JSON.stringify(blocks) : null,
        category,
        tags ? JSON.stringify(tags) : null,
        assignee,
        req.params.id
      ]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[Roadmap] Error updating item:', error);
    res.status(500).json({ error: 'Failed to update roadmap item' });
  }
});

// Delete roadmap item
app.delete('/api/roadmap/items/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    await db.run(
      'DELETE FROM roadmap_items WHERE id = ? AND "userId" = ?',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[Roadmap] Error deleting item:', error);
    res.status(500).json({ error: 'Failed to delete roadmap item' });
  }
});

// Get roadmap view (aggregated data for visualization)
app.get('/api/roadmap/view', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();

    // Get all items
    const items = await db.all(`
      SELECT ri.*, r.name as repoName
      FROM roadmap_items ri
      LEFT JOIN repositories r ON ri."repositoryId" = r.id
      WHERE ri."userId" = ?
      ORDER BY ri."targetDate" ASC NULLS LAST
    `, [req.user.id]);

    // Get milestones
    const milestones = await db.all(`
      SELECT * FROM roadmap_milestones WHERE "userId" = ?
      ORDER BY "targetDate" ASC
    `, [req.user.id]);

    // Calculate stats
    const byStatus = { planned: 0, 'in-progress': 0, blocked: 0, completed: 0, cancelled: 0 };
    const byPriority = { critical: 0, high: 0, medium: 0, low: 0 };
    const byRepository = {};
    let overdueCount = 0;
    let upcomingCount = 0;
    const today = new Date().toISOString().split('T')[0];
    const twoWeeksOut = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    items.forEach(item => {
      byStatus[item.status] = (byStatus[item.status] || 0) + 1;
      byPriority[item.priority] = (byPriority[item.priority] || 0) + 1;

      if (item.repositoryId) {
        if (!byRepository[item.repositoryId]) {
          byRepository[item.repositoryId] = { name: item.repoName, count: 0 };
        }
        byRepository[item.repositoryId].count++;
      }

      if (item.targetDate && item.status !== 'completed' && item.status !== 'cancelled') {
        if (item.targetDate < today) overdueCount++;
        else if (item.targetDate <= twoWeeksOut) upcomingCount++;
      }
    });

    // Build timeline (group by week)
    const timeline = [];
    const weekMap = new Map();

    items.forEach(item => {
      if (item.targetDate) {
        const weekStart = getWeekStart(item.targetDate);
        if (!weekMap.has(weekStart)) {
          weekMap.set(weekStart, { date: weekStart, items: [], milestones: [] });
        }
        weekMap.get(weekStart).items.push(item);
      }
    });

    milestones.forEach(ms => {
      const weekStart = getWeekStart(ms.targetDate);
      if (!weekMap.has(weekStart)) {
        weekMap.set(weekStart, { date: weekStart, items: [], milestones: [] });
      }
      weekMap.get(weekStart).milestones.push(ms);
    });

    // Sort timeline
    const sortedTimeline = Array.from(weekMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      items: items.map(item => ({
        ...item,
        blockedBy: typeof item.blockedBy === 'string' ? JSON.parse(item.blockedBy) : item.blockedBy || [],
        blocks: typeof item.blocks === 'string' ? JSON.parse(item.blocks) : item.blocks || [],
        tags: typeof item.tags === 'string' ? JSON.parse(item.tags) : item.tags || []
      })),
      milestones: milestones.map(ms => ({
        ...ms,
        itemIds: typeof ms.itemIds === 'string' ? JSON.parse(ms.itemIds) : ms.itemIds || []
      })),
      stats: {
        totalItems: items.length,
        byStatus,
        byPriority,
        byRepository,
        overdueCount,
        upcomingCount
      },
      timeline: sortedTimeline
    });
  } catch (error) {
    console.error('[Roadmap] Error generating view:', error);
    res.status(500).json({ error: 'Failed to generate roadmap view' });
  }
});

// Helper function to get week start date
function getWeekStart(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day;
  return new Date(date.setDate(diff)).toISOString().split('T')[0];
}

// Create milestone
app.post('/api/roadmap/milestones', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const { title, description, targetDate, itemIds = [] } = req.body;

    if (!title || !targetDate) {
      return res.status(400).json({ error: 'title and targetDate are required' });
    }

    const result = await db.run(
      `INSERT INTO roadmap_milestones ("userId", title, description, "targetDate", "itemIds")
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, title, description, targetDate, JSON.stringify(itemIds)]
    );

    res.json({ id: result.lastID, message: 'Milestone created' });
  } catch (error) {
    console.error('[Roadmap] Error creating milestone:', error);
    res.status(500).json({ error: 'Failed to create milestone' });
  }
});

// Import tasks from scan results as roadmap items
app.post('/api/roadmap/import-from-scan', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const { scanId, repositoryId, tasks } = req.body;

    if (!repositoryId || !tasks || !Array.isArray(tasks)) {
      return res.status(400).json({ error: 'repositoryId and tasks array are required' });
    }

    // Verify repo ownership
    const repo = await db.get(
      'SELECT id FROM repositories WHERE id = ? AND "userId" = ?',
      [repositoryId, req.user.id]
    );
    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const imported = [];

    for (const task of tasks) {
      const priority = task.impact === 'critical' ? 'critical' : task.impact === 'high' ? 'high' : task.impact === 'medium' ? 'medium' : 'low';

      const result = await db.run(
        `INSERT INTO roadmap_items ("userId", "repositoryId", title, description, status, priority, source, "sourceId", category)
         VALUES (?, ?, ?, ?, 'planned', ?, 'scan-task', ?, ?)`,
        [req.user.id, repositoryId, task.title, task.description, priority, scanId ? String(scanId) : null, task.category]
      );

      imported.push({ id: result.lastID, title: task.title });
    }

    res.json({ imported, count: imported.length });
  } catch (error) {
    console.error('[Roadmap] Error importing tasks:', error);
    res.status(500).json({ error: 'Failed to import tasks' });
  }
});

// Catch-all for 404s - BEFORE error handler
app.use('/api/*', (req, res) => {
  console.error('[Bridge Server] 404 - Route not found:', req.method, req.originalUrl);
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
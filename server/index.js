import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getDb } from './db.js';
import { processScan } from './worker.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

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
  const scope = 'read:user user:email';
  
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;
  
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

  res.json({
    id: user.id,
    username: 'Demo User',
    email: 'demo@bridge.dev',
    avatarUrl: 'https://github.com/ghost.png',
    isDemo: true
  });
});

// Get current user
app.get('/api/auth/me', async (req, res) => {
  // In production, this would check a session/JWT
  // For now, we'll use a simple approach
  const userId = req.headers['x-user-id'];
  
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const db = await getDb();
  const user = await db.get('SELECT id, username, email, "avatarUrl" FROM users WHERE id = ?', [userId]);
  
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  res.json(user);
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true });
});

// 1. Get All Repositories
app.get('/api/repositories', async (req, res) => {
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
      WHERE r."isActive" = 1
      ORDER BY r."updatedAt" DESC
    `);

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
app.post('/api/repositories', async (req, res) => {
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
    
    // Check if repo already exists
    const existing = await db.get('SELECT * FROM repositories WHERE "repoUrl" = ?', [repoUrl]);
    
    if (existing) {
      console.warn('[Bridge Server] Repository already exists:', repoUrl);
      return res.status(400).json({ error: 'Repository already connected' });
    }

    // Create repository entry
    const result = await db.run(
      'INSERT INTO repositories ("repoUrl", name, owner) VALUES (?, ?, ?)',
      [repoUrl, name, owner]
    );

    console.log('[Bridge Server] Added repository:', name, 'with ID:', result.lastID);
    res.json({ id: result.lastID, name, owner, repoUrl });
  } catch (error) {
    console.error('[Bridge Server] Error adding repository:', error);
    res.status(500).json({ error: 'Failed to add repository: ' + error.message });
  }
});

// 3. Delete/Disconnect Repository
app.delete('/api/repositories/:id', async (req, res) => {
  try {
    const db = await getDb();
    await db.run('UPDATE repositories SET "isActive" = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[Bridge Server] Error removing repository:', error);
    res.status(500).json({ error: 'Failed to remove repository' });
  }
});

// 4. Get Scan History for Repository
app.get('/api/repositories/:id/history', async (req, res) => {
  try {
    const db = await getDb();
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
app.post('/api/scan', async (req, res) => {
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

      const existing = await db.get('SELECT id FROM repositories WHERE "repoUrl" = ?', [repoUrl]);
      
      if (existing) {
        repoId = existing.id;
      } else {
        const result = await db.run(
          'INSERT INTO repositories ("repoUrl", name, owner) VALUES (?, ?, ?)',
          [repoUrl, name, owner]
        );
        repoId = result.lastID;
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
  console.log(`\n🌉 Bridge Server running on http://localhost:${PORT}`);
  console.log(`   GitHub Token: ${process.env.GITHUB_TOKEN ? '✓ Loaded' : '✗ Missing'}`);
  console.log(`   Gemini API Key: ${process.env.GEMINI_API_KEY ? '✓ Loaded' : '✗ Missing'}`);
  console.log(`   Ready to accept requests\n`);
});
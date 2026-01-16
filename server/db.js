import pg from 'pg';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const { Pool } = pg;

let pool = null;
let sqliteDb = null;
const USE_POSTGRES = !!process.env.DATABASE_URL;

// Database adapter that mimics sqlite's interface but uses PostgreSQL
class PostgresAdapter {
  constructor(pool) {
    this.pool = pool;
  }

  async run(sql, params = []) {
    const client = await this.pool.connect();
    try {
      // Convert ? placeholders to $1, $2, etc for PostgreSQL
      let pgSql = sql;
      let paramIndex = 0;
      pgSql = pgSql.replace(/\?/g, () => `$${++paramIndex}`);

      // Handle RETURNING for INSERT statements to get lastID
      if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.includes('RETURNING')) {
        pgSql = pgSql.replace(/;?\s*$/, ' RETURNING id;');
      }

      const result = await client.query(pgSql, params);
      return {
        lastID: result.rows[0]?.id,
        changes: result.rowCount
      };
    } finally {
      client.release();
    }
  }

  async get(sql, params = []) {
    const client = await this.pool.connect();
    try {
      let pgSql = sql;
      let paramIndex = 0;
      pgSql = pgSql.replace(/\?/g, () => `$${++paramIndex}`);

      const result = await client.query(pgSql, params);
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async all(sql, params = []) {
    const client = await this.pool.connect();
    try {
      let pgSql = sql;
      let paramIndex = 0;
      pgSql = pgSql.replace(/\?/g, () => `$${++paramIndex}`);

      const result = await client.query(pgSql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async exec(sql) {
    const client = await this.pool.connect();
    try {
      await client.query(sql);
    } finally {
      client.release();
    }
  }
}

export async function getDb() {
  // Use SQLite for local development if DATABASE_URL not set
  if (!USE_POSTGRES) {
    console.log('[DB] Using SQLite (local development mode)');

    if (sqliteDb) return sqliteDb;

    // Use DATABASE_PATH env var if set (for Electron), otherwise default
    const dbPath = process.env.DATABASE_PATH || './bridge.sqlite';
    console.log('[DB] SQLite database path:', dbPath);

    sqliteDb = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    
    // SQLite schema
    await sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        githubId TEXT UNIQUE NOT NULL,
        username TEXT NOT NULL,
        email TEXT,
        avatarUrl TEXT,
        accessToken TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        lastLoginAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS repositories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        repoUrl TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        owner TEXT,
        lastScanId INTEGER,
        lastScore INTEGER DEFAULT 0,
        isActive INTEGER DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
      )
    `);
    
    await sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repositoryId INTEGER NOT NULL,
        repoUrl TEXT,
        status TEXT DEFAULT 'pending',
        progress JSON,
        data JSON,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repositoryId) REFERENCES repositories(id)
      )
    `);

    await sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        config JSON DEFAULT '{}',
        schedule TEXT,
        isEnabled INTEGER DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
      )
    `);

    await sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS agent_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agentId INTEGER,
        repositoryId INTEGER,
        status TEXT DEFAULT 'pending',
        startedAt DATETIME,
        completedAt DATETIME,
        result JSON,
        logs TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agentId) REFERENCES agents(id),
        FOREIGN KEY (repositoryId) REFERENCES repositories(id)
      )
    `);

    // Update jobs table for automated dependency updates
    await sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS update_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repositoryId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        progress JSON,
        result JSON,
        logs TEXT,
        startedAt DATETIME,
        completedAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repositoryId) REFERENCES repositories(id),
        FOREIGN KEY (userId) REFERENCES users(id)
      )
    `);

    // Cleanup jobs table for removing unused dependencies
    await sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS cleanup_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repositoryId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        packagesToRemove JSON NOT NULL,
        status TEXT DEFAULT 'pending',
        progress JSON,
        result JSON,
        logs TEXT,
        startedAt DATETIME,
        completedAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repositoryId) REFERENCES repositories(id),
        FOREIGN KEY (userId) REFERENCES users(id)
      )
    `);

    // Automation settings per repository
    await sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS automation_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repositoryId INTEGER UNIQUE NOT NULL,
        scanEnabled INTEGER DEFAULT 0,
        scanFrequency TEXT DEFAULT 'manual',
        scanDayOfWeek INTEGER,
        scanDayOfMonth INTEGER,
        scanTime TEXT,
        patchEnabled INTEGER DEFAULT 0,
        patchFrequency TEXT DEFAULT 'manual',
        patchDayOfWeek INTEGER,
        patchDayOfMonth INTEGER,
        patchTime TEXT,
        patchAutoMerge INTEGER DEFAULT 0,
        reportEnabled INTEGER DEFAULT 0,
        reportFrequency TEXT DEFAULT 'manual',
        reportDayOfWeek INTEGER,
        reportDayOfMonth INTEGER,
        reportTime TEXT,
        reportRecipients JSON,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repositoryId) REFERENCES repositories(id)
      )
    `);

    console.log('[DB] SQLite initialized');
    return sqliteDb;
  }
  
  // PostgreSQL mode (production/deployed)
  if (pool) {
    return new PostgresAdapter(pool);
  }

  const connectionString = process.env.DATABASE_URL;

  console.log('[DB] Connecting to PostgreSQL...');

  pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false // Required for Supabase
    }
  });

  // Test connection
  try {
    const client = await pool.connect();
    console.log('[DB] PostgreSQL connected successfully');
    client.release();
  } catch (err) {
    console.error('[DB] PostgreSQL connection failed:', err.message);
    throw err;
  }

  const db = new PostgresAdapter(pool);

  // Create tables if they don't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      "githubId" TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      email TEXT,
      "avatarUrl" TEXT,
      "accessToken" TEXT,
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "lastLoginAt" TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      id SERIAL PRIMARY KEY,
      "userId" INTEGER REFERENCES users(id),
      "repoUrl" TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      owner TEXT,
      "lastScanId" INTEGER,
      "lastScore" INTEGER DEFAULT 0,
      "isActive" INTEGER DEFAULT 1,
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS scans (
      id SERIAL PRIMARY KEY,
      "repositoryId" INTEGER NOT NULL REFERENCES repositories(id),
      "repoUrl" TEXT,
      status TEXT DEFAULT 'pending',
      progress JSONB,
      data JSONB,
      "createdAt" TIMESTAMP DEFAULT NOW()
    )
  `);

  // Agents table for automated tasks
  await db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id SERIAL PRIMARY KEY,
      "userId" INTEGER REFERENCES users(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config JSONB DEFAULT '{}',
      schedule TEXT,
      "isEnabled" INTEGER DEFAULT 1,
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW()
    )
  `);

  // Agent runs history
  await db.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id SERIAL PRIMARY KEY,
      "agentId" INTEGER REFERENCES agents(id),
      "repositoryId" INTEGER REFERENCES repositories(id),
      status TEXT DEFAULT 'pending',
      "startedAt" TIMESTAMP,
      "completedAt" TIMESTAMP,
      result JSONB,
      logs TEXT,
      "createdAt" TIMESTAMP DEFAULT NOW()
    )
  `);

  // Update jobs table for automated dependency updates
  await db.exec(`
    CREATE TABLE IF NOT EXISTS update_jobs (
      id SERIAL PRIMARY KEY,
      "repositoryId" INTEGER NOT NULL REFERENCES repositories(id),
      "userId" INTEGER NOT NULL REFERENCES users(id),
      status TEXT DEFAULT 'pending',
      progress JSONB,
      result JSONB,
      logs TEXT,
      "startedAt" TIMESTAMP,
      "completedAt" TIMESTAMP,
      "createdAt" TIMESTAMP DEFAULT NOW()
    )
  `);

  // Cleanup jobs table for removing unused dependencies
  await db.exec(`
    CREATE TABLE IF NOT EXISTS cleanup_jobs (
      id SERIAL PRIMARY KEY,
      "repositoryId" INTEGER NOT NULL REFERENCES repositories(id),
      "userId" INTEGER NOT NULL REFERENCES users(id),
      "packagesToRemove" JSONB NOT NULL,
      status TEXT DEFAULT 'pending',
      progress JSONB,
      result JSONB,
      logs TEXT,
      "startedAt" TIMESTAMP,
      "completedAt" TIMESTAMP,
      "createdAt" TIMESTAMP DEFAULT NOW()
    )
  `);

  // Automation settings per repository
  await db.exec(`
    CREATE TABLE IF NOT EXISTS automation_settings (
      id SERIAL PRIMARY KEY,
      "repositoryId" INTEGER UNIQUE NOT NULL REFERENCES repositories(id),
      "scanEnabled" INTEGER DEFAULT 0,
      "scanFrequency" TEXT DEFAULT 'manual',
      "scanDayOfWeek" INTEGER,
      "scanDayOfMonth" INTEGER,
      "scanTime" TEXT,
      "patchEnabled" INTEGER DEFAULT 0,
      "patchFrequency" TEXT DEFAULT 'manual',
      "patchDayOfWeek" INTEGER,
      "patchDayOfMonth" INTEGER,
      "patchTime" TEXT,
      "patchAutoMerge" INTEGER DEFAULT 0,
      "reportEnabled" INTEGER DEFAULT 0,
      "reportFrequency" TEXT DEFAULT 'manual',
      "reportDayOfWeek" INTEGER,
      "reportDayOfMonth" INTEGER,
      "reportTime" TEXT,
      "reportRecipients" JSONB,
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW()
    )
  `);

  // Create indexes for performance
  try {
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_scans_repository ON scans("repositoryId")`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_repos_active ON repositories("isActive")`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_agents_user ON agents("userId")`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs("agentId")`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_runs_repo ON agent_runs("repositoryId")`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_update_jobs_repo ON update_jobs("repositoryId")`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_update_jobs_user ON update_jobs("userId")`);
  } catch (e) {
    // Indexes might already exist, that's fine
  }

  console.log('[DB] Database schema initialized');
  return db;
}

// Graceful shutdown
process.on('SIGINT', async () => {
  if (pool) {
    console.log('[DB] Closing PostgreSQL pool...');
    await pool.end();
  }
  process.exit(0);
});

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

    // Security scans table for code vulnerability analysis
    await sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS security_scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repositoryId INTEGER NOT NULL,
        repoUrl TEXT,
        status TEXT DEFAULT 'pending',
        generateFixes INTEGER DEFAULT 0,
        progress JSON,
        results JSON,
        startedAt DATETIME,
        completedAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repositoryId) REFERENCES repositories(id)
      )
    `);

    // Security fix jobs table for autonomous fix + PR creation
    await sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS security_fix_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repositoryId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        securityScanId INTEGER,
        findingData JSON NOT NULL,
        status TEXT DEFAULT 'pending',
        progress JSON,
        result JSON,
        logs TEXT,
        startedAt DATETIME,
        completedAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repositoryId) REFERENCES repositories(id),
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (securityScanId) REFERENCES security_scans(id)
      )
    `);

    // Software Capitalization (CapEx) entries
    await sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS capex_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repositoryId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        date TEXT NOT NULL,
        hoursSpent REAL NOT NULL,
        category TEXT NOT NULL,
        isCapitalizable INTEGER DEFAULT 1,
        capitalizablePercent INTEGER DEFAULT 100,
        description TEXT,
        ticketId TEXT,
        prUrl TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repositoryId) REFERENCES repositories(id),
        FOREIGN KEY (userId) REFERENCES users(id)
      )
    `);

    // CapEx settings per user
    await sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS capex_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER UNIQUE NOT NULL,
        defaultRates JSON DEFAULT '{}',
        fiscalYearStart TEXT DEFAULT '01-01',
        exportFormat TEXT DEFAULT 'csv',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
      )
    `);

    // Roadmap items
    await sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS roadmap_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        repositoryId INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'planned',
        priority TEXT DEFAULT 'medium',
        source TEXT DEFAULT 'manual',
        sourceId TEXT,
        sourceUrl TEXT,
        targetDate TEXT,
        startDate TEXT,
        completedDate TEXT,
        estimatedHours REAL,
        actualHours REAL,
        blockedBy JSON DEFAULT '[]',
        blocks JSON DEFAULT '[]',
        category TEXT,
        tags JSON DEFAULT '[]',
        assignee TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (repositoryId) REFERENCES repositories(id)
      )
    `);

    // Roadmap milestones
    await sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS roadmap_milestones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        targetDate TEXT NOT NULL,
        status TEXT DEFAULT 'upcoming',
        completedDate TEXT,
        itemIds JSON DEFAULT '[]',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
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

  // Security scans table for code vulnerability analysis
  await db.exec(`
    CREATE TABLE IF NOT EXISTS security_scans (
      id SERIAL PRIMARY KEY,
      "repositoryId" INTEGER NOT NULL REFERENCES repositories(id),
      "repoUrl" TEXT,
      status TEXT DEFAULT 'pending',
      "generateFixes" INTEGER DEFAULT 0,
      progress JSONB,
      results JSONB,
      "startedAt" TIMESTAMP,
      "completedAt" TIMESTAMP,
      "createdAt" TIMESTAMP DEFAULT NOW()
    )
  `);

  // Security fix jobs table for autonomous fix + PR creation
  await db.exec(`
    CREATE TABLE IF NOT EXISTS security_fix_jobs (
      id SERIAL PRIMARY KEY,
      "repositoryId" INTEGER NOT NULL REFERENCES repositories(id),
      "userId" INTEGER NOT NULL REFERENCES users(id),
      "securityScanId" INTEGER REFERENCES security_scans(id),
      "findingData" JSONB NOT NULL,
      status TEXT DEFAULT 'pending',
      progress JSONB,
      result JSONB,
      logs TEXT,
      "startedAt" TIMESTAMP,
      "completedAt" TIMESTAMP,
      "createdAt" TIMESTAMP DEFAULT NOW()
    )
  `);

  // Software Capitalization (CapEx) entries
  await db.exec(`
    CREATE TABLE IF NOT EXISTS capex_entries (
      id SERIAL PRIMARY KEY,
      "repositoryId" INTEGER NOT NULL REFERENCES repositories(id),
      "userId" INTEGER NOT NULL REFERENCES users(id),
      date TEXT NOT NULL,
      "hoursSpent" REAL NOT NULL,
      category TEXT NOT NULL,
      "isCapitalizable" INTEGER DEFAULT 1,
      "capitalizablePercent" INTEGER DEFAULT 100,
      description TEXT,
      "ticketId" TEXT,
      "prUrl" TEXT,
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW()
    )
  `);

  // CapEx settings per user
  await db.exec(`
    CREATE TABLE IF NOT EXISTS capex_settings (
      id SERIAL PRIMARY KEY,
      "userId" INTEGER UNIQUE NOT NULL REFERENCES users(id),
      "defaultRates" JSONB DEFAULT '{}',
      "fiscalYearStart" TEXT DEFAULT '01-01',
      "exportFormat" TEXT DEFAULT 'csv',
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW()
    )
  `);

  // Roadmap items
  await db.exec(`
    CREATE TABLE IF NOT EXISTS roadmap_items (
      id SERIAL PRIMARY KEY,
      "userId" INTEGER NOT NULL REFERENCES users(id),
      "repositoryId" INTEGER REFERENCES repositories(id),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'planned',
      priority TEXT DEFAULT 'medium',
      source TEXT DEFAULT 'manual',
      "sourceId" TEXT,
      "sourceUrl" TEXT,
      "targetDate" TEXT,
      "startDate" TEXT,
      "completedDate" TEXT,
      "estimatedHours" REAL,
      "actualHours" REAL,
      "blockedBy" JSONB DEFAULT '[]',
      blocks JSONB DEFAULT '[]',
      category TEXT,
      tags JSONB DEFAULT '[]',
      assignee TEXT,
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW()
    )
  `);

  // Roadmap milestones
  await db.exec(`
    CREATE TABLE IF NOT EXISTS roadmap_milestones (
      id SERIAL PRIMARY KEY,
      "userId" INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT,
      "targetDate" TEXT NOT NULL,
      status TEXT DEFAULT 'upcoming',
      "completedDate" TEXT,
      "itemIds" JSONB DEFAULT '[]',
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
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_security_scans_repo ON security_scans("repositoryId")`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_security_scans_status ON security_scans(status)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_security_fix_jobs_repo ON security_fix_jobs("repositoryId")`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_capex_entries_repo ON capex_entries("repositoryId")`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_capex_entries_user ON capex_entries("userId")`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_capex_entries_date ON capex_entries(date)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_roadmap_items_user ON roadmap_items("userId")`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_roadmap_items_repo ON roadmap_items("repositoryId")`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_roadmap_items_status ON roadmap_items(status)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_roadmap_milestones_user ON roadmap_milestones("userId")`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_security_fix_jobs_user ON security_fix_jobs("userId")`);
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

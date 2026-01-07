#!/usr/bin/env node

/**
 * Database migration helper
 * Checks schema and recreates if needed
 */

import fs from 'fs';
import { getDb } from './server/db.js';

async function migrate() {
  console.log('🔄 Checking database schema...\n');

  try {
    const db = await getDb();
    
    // Check if repositories table exists with correct schema
    const repoTable = await db.get(`
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name='repositories'
    `);
    
    const scansTable = await db.get(`
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name='scans'
    `);
    
    console.log('Repositories table:');
    console.log(repoTable ? '✓ Exists' : '✗ Missing');
    
    console.log('\nScans table:');
    console.log(scansTable ? '✓ Exists' : '✗ Missing');
    
    if (scansTable) {
      // Check if repositoryId column exists
      const hasRepoId = scansTable.sql.includes('repositoryId');
      console.log('Has repositoryId column:', hasRepoId ? '✓ Yes' : '✗ No');
      
      if (!hasRepoId) {
        console.log('\n⚠️  Schema is outdated!');
        console.log('Run: rm bridge.sqlite && npm start');
        console.log('This will recreate the database with the correct schema.\n');
        process.exit(1);
      }
    }
    
    // Test data integrity
    const repoCount = await db.get('SELECT COUNT(*) as count FROM repositories');
    const scanCount = await db.get('SELECT COUNT(*) as count FROM scans');
    
    console.log('\nData:');
    console.log(`Repositories: ${repoCount.count}`);
    console.log(`Scans: ${scanCount.count}`);
    
    console.log('\n✅ Database schema is correct!\n');
    
  } catch (error) {
    console.error('❌ Migration check failed:', error.message);
    console.log('\nTo fix: rm bridge.sqlite && npm start\n');
    process.exit(1);
  }
}

migrate();



#!/usr/bin/env node

/**
 * Cleanup script to remove leftover temp_scans directories
 * Run: node cleanup-temp.js
 */

import fs from 'fs-extra';
import path from 'path';

const TEMP_DIR = './temp_scans';

async function cleanup() {
  console.log('[CLEANUP] Cleaning up temporary scan directories...\n');

  try {
    if (await fs.pathExists(TEMP_DIR)) {
      const dirs = await fs.readdir(TEMP_DIR);

      if (dirs.length === 0) {
        console.log('[OK] No temp directories to clean');
        return;
      }

      console.log(`Found ${dirs.length} temp directories to remove:`);

      for (const dir of dirs) {
        const dirPath = path.join(TEMP_DIR, dir);
        console.log(`  Removing: ${dirPath}`);
        await fs.remove(dirPath);
      }

      // Remove the parent temp_scans directory
      await fs.remove(TEMP_DIR);

      console.log('\n[DONE] Cleanup complete!');
    } else {
      console.log('[OK] No temp_scans directory found - nothing to clean');
    }
  } catch (error) {
    console.error('[FAIL] Cleanup failed:', error.message);
    process.exit(1);
  }
}

cleanup();

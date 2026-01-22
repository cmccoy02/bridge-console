#!/usr/bin/env node

/**
 * Electron build script with proper memory management
 * This script runs electron-builder with increased memory limits
 */

const { spawn } = require('child_process');
const path = require('path');

// Set memory limit to 16GB (Electron packaging requires significant memory for large projects)
const memoryLimit = process.env.BUILD_MEMORY_LIMIT || '16384';
process.env.NODE_OPTIONS = `--max-old-space-size=${memoryLimit}`;

console.log(`Building Electron app with ${Math.round(memoryLimit/1024)}GB memory limit...\n`);

// Get platform argument if provided
const args = process.argv.slice(2);

// Run electron-builder
const builder = spawn('npx', ['electron-builder', ...args], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NODE_OPTIONS: '--max-old-space-size=8192'
  }
});

builder.on('close', (code) => {
  if (code !== 0) {
    console.error(`\nElectron build failed with code ${code}`);
    process.exit(code);
  }
  console.log('\n✅ Electron build completed successfully!');
});

builder.on('error', (err) => {
  console.error('Failed to start electron-builder:', err);
  process.exit(1);
});

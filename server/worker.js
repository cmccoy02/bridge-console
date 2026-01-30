import fs from 'fs-extra';
import path from 'path';
import { simpleGit } from 'simple-git';
import { exec } from 'child_process';
import util from 'util';
import madge from 'madge';
import ncu from 'npm-check-updates';
import { glob } from 'glob';
import depcheck from 'depcheck';
import { getRepoMetadata, getRepoMetadataWithToken } from './github.js';
import { analyzeAndPrioritize } from './prioritization.js';
import { calculateTechDebtScore } from './scoring.js';
import { analyzeMultiLanguagePackages, detectPackageManagers } from './package-detection.js';

// Helper to create authenticated clone URL
function getAuthenticatedCloneUrl(repoUrl, token) {
  if (!token) return repoUrl;

  // Convert GitHub URL to authenticated format
  // https://github.com/owner/repo -> https://x-access-token:TOKEN@github.com/owner/repo
  const urlMatch = repoUrl.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
  if (urlMatch) {
    const owner = urlMatch[1];
    const repo = urlMatch[2].replace('.git', '');
    return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
  }
  return repoUrl;
}

const execPromise = util.promisify(exec);

// Progress phases for scan tracking
const SCAN_PHASES = {
  INITIALIZING: { step: 1, total: 7, label: 'Initializing scan...' },
  CLONING: { step: 2, total: 7, label: 'Cloning repository...' },
  INSTALLING: { step: 3, total: 7, label: 'Installing dependencies...' },
  ANALYZING_STRUCTURE: { step: 4, total: 7, label: 'Analyzing code structure...' },
  ANALYZING_DEPS: { step: 5, total: 7, label: 'Analyzing dependencies...' },
  CALCULATING_SCORE: { step: 6, total: 7, label: 'Calculating health score...' },
  FINALIZING: { step: 7, total: 7, label: 'Finalizing results...' }
};

// Helper to update scan progress in database
async function updateProgress(db, scanId, phase, details = {}) {
  const progress = {
    phase: phase.label,
    step: phase.step,
    totalSteps: phase.total,
    percent: Math.round((phase.step / phase.total) * 100),
    timestamp: new Date().toISOString(),
    ...details
  };
  
  try {
    await db.run(
      'UPDATE scans SET progress = ? WHERE id = ?',
      [JSON.stringify(progress), scanId]
    );
  } catch (e) {
    console.warn('[Worker] Failed to update progress:', e.message);
  }
  
  return progress;
}

export async function processScan(scanId, repoUrl, repositoryId, db, userToken = null) {
  // Use TEMP_SCANS_DIR env var if set (for Electron), otherwise default
  const tempBase = process.env.TEMP_SCANS_DIR || path.resolve('./temp_scans');
  const TEMP_DIR = path.join(tempBase, String(scanId));
  const startTime = Date.now();

  // Use user's OAuth token if provided, fall back to env token
  const githubToken = userToken || process.env.GITHUB_TOKEN;

  try {
    console.log(`[Worker] Starting scan ${scanId} for ${repoUrl}`);
    console.log(`[Worker] Using ${userToken ? 'user OAuth token' : 'environment GITHUB_TOKEN'}`);
    await updateProgress(db, scanId, SCAN_PHASES.INITIALIZING);

    // Validate GitHub URL
    if (!repoUrl.includes('github.com')) {
      throw new Error('Invalid GitHub URL. Must contain github.com');
    }

    // Clean up any existing temp dir from failed previous attempt
    if (await fs.pathExists(TEMP_DIR)) {
      console.log(`[Worker] Cleaning up existing temp directory`);
      await fs.remove(TEMP_DIR);
    }

    // Extract Owner/Repo
    const urlParts = repoUrl.split('/');
    const repoName = urlParts.pop().replace('.git', '');
    const owner = urlParts.pop();

    // 1. Clone (with authentication if token available)
    await updateProgress(db, scanId, SCAN_PHASES.CLONING);
    await fs.ensureDir(TEMP_DIR);
    const git = simpleGit();
    const cloneUrl = getAuthenticatedCloneUrl(repoUrl, githubToken);
    await git.clone(cloneUrl, TEMP_DIR);
    console.log(`[Worker] Cloned to ${TEMP_DIR}`);

    // NOTE: Repomix disabled - AI analysis is turned off, no need to compress codebase
    // When AI is re-enabled, uncomment this section
    // console.log('[Worker] Running Repomix to compress codebase...');
    // const REPOMIX_OUTPUT = path.join(TEMP_DIR, 'repomix-output.md');
    // try {
    //     await execPromise(
    //         `npx repomix --output "${REPOMIX_OUTPUT}" --ignore "**/node_modules/**,**/*.log,**/dist/**,**/build/**,**/.git/**,**/coverage/**,**/.next/**,**/.nuxt/**,**/tmp/**"`,
    //         { cwd: TEMP_DIR, maxBuffer: 1024 * 1024 * 50, timeout: 120000 }
    //     );
    //     console.log('[Worker] Repomix compression complete');
    // } catch (e) {
    //     console.warn('[Worker] Repomix failed:', e.message.split('\n')[0]);
    //     await fs.writeFile(REPOMIX_OUTPUT, '# Codebase compression unavailable\n\nRepomix failed to process this repository.');
    // }
    console.log('[Worker] Skipping Repomix (AI analysis disabled)');

    // 2b. Install Dependencies (needed for analysis tools)
    await updateProgress(db, scanId, SCAN_PHASES.INSTALLING, { detail: 'Running npm install...' });
    console.log('[Worker] Installing dependencies...');
    try {
        await execPromise('npm install --ignore-scripts --no-audit --no-fund', { cwd: TEMP_DIR, maxBuffer: 1024 * 1024 * 5 });
    } catch(e) {
        console.warn('[Worker] npm install had warnings/errors, continuing anyway...');
    }

    // 3. Gather Metrics
    await updateProgress(db, scanId, SCAN_PHASES.ANALYZING_STRUCTURE, { detail: 'Analyzing git history...' });
    
    // A. Git Metadata (from cloned repo)
    const repoGit = simpleGit(TEMP_DIR);
    
    // Get repo age
    const firstCommit = await repoGit.raw(['rev-list', '--max-parents=0', 'HEAD']);
    const firstCommitLog = await repoGit.show([firstCommit.trim(), '--format=%ci', '--quiet']);
    const firstCommitDate = new Date(firstCommitLog.trim());
    const repoAgeDays = Math.floor((Date.now() - firstCommitDate.getTime()) / (1000 * 60 * 60 * 24));
    console.log(`[Worker] Repo age: ${repoAgeDays} days`);
    
    // Get all branches (local and remote)
    await repoGit.fetch(['--all']);
    const branchData = await repoGit.branch(['-a']);
    const allBranches = Object.keys(branchData.branches)
      .filter(b => b.includes('remotes/origin/') && !b.includes('HEAD'))
      .map(b => b.replace('remotes/origin/', ''));
    
    console.log(`[Worker] Found ${allBranches.length} branches`);
    
    // Analyze branch staleness
    const now = Date.now();
    const staleBranches = [];
    
    for (const branch of allBranches) {
      try {
        // Get last commit date for this branch
        const branchRef = `origin/${branch}`;
        const lastCommitDate = await repoGit.show([branchRef, '--format=%ci', '--quiet', '-s']);
        const commitDate = new Date(lastCommitDate.trim());
        const daysSinceUpdate = Math.floor((now - commitDate.getTime()) / (1000 * 60 * 60 * 24));
        
        let status = 'active';
        if (daysSinceUpdate > 180) status = 'dead';      // 6+ months
        else if (daysSinceUpdate > 90) status = 'stale'; // 3-6 months
        
        if (status !== 'active') {
          staleBranches.push({
            name: branch,
            daysSinceUpdate,
            status,
            lastCommitDate: commitDate.toISOString()
          });
        }
      } catch (err) {
        console.warn(`[Worker] Could not analyze branch ${branch}:`, err.message);
      }
    }
    
    // Sort stale branches by age (oldest first)
    staleBranches.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
    const deadBranchCount = staleBranches.filter(b => b.status === 'dead').length;
    
    console.log(`[Worker] Dead branches: ${deadBranchCount}, Stale branches: ${staleBranches.length - deadBranchCount}`);

    // B. SLOC and Code Analysis
    const allFiles = await glob('**/*.{js,ts,jsx,tsx}', { cwd: TEMP_DIR, ignore: 'node_modules/**' });
    let sloc = 0;
    let todoCount = 0;
    let consoleLogCount = 0;
    let tsFileCount = 0;
    let jsFileCount = 0;
    const largeFiles = [];
    const todoItems = []; // Detailed TODO/FIXME locations
    const consoleLogItems = []; // Detailed console.log locations

    for (const file of allFiles) {
        try {
            const content = await fs.readFile(path.join(TEMP_DIR, file), 'utf-8');
            const lines = content.split('\n');
            const lineCount = lines.length;
            sloc += lineCount;

            // Track TypeScript vs JavaScript
            if (file.endsWith('.ts') || file.endsWith('.tsx')) {
              tsFileCount++;
            } else {
              jsFileCount++;
            }

            // Large file detection (for god file scoring)
            if (lineCount > 300) {
              largeFiles.push({ path: file, lines: lineCount });
            }

            // TODO/FIXME detection with line numbers
            lines.forEach((line, idx) => {
              const todoMatch = line.match(/\/\/\s*(TODO|FIXME|XXX|HACK):\s*(.*)$/i);
              if (todoMatch) {
                todoCount++;
                if (todoItems.length < 100) { // Cap at 100 items to avoid huge payloads
                  todoItems.push({
                    file,
                    line: idx + 1,
                    type: todoMatch[1].toUpperCase(),
                    text: todoMatch[2].trim().slice(0, 200), // Truncate long comments
                    context: line.trim().slice(0, 150)
                  });
                }
              }
            });

            // console.log detection with line numbers (excluding test files)
            if (!file.includes('.test.') && !file.includes('.spec.') && !file.includes('__tests__')) {
              lines.forEach((line, idx) => {
                const consoleMatch = line.match(/console\.(log|warn|error|info|debug)\(/);
                if (consoleMatch) {
                  consoleLogCount++;
                  if (consoleLogItems.length < 100) { // Cap at 100 items
                    consoleLogItems.push({
                      file,
                      line: idx + 1,
                      type: consoleMatch[1],
                      context: line.trim().slice(0, 150)
                    });
                  }
                }
              });
            }
        } catch (e) {}
    }

    // Sort large files by line count
    largeFiles.sort((a, b) => b.lines - a.lines);

    // Detect TypeScript usage
    const hasTypeScript = tsFileCount > 0;
    const hasMixedTsJs = hasTypeScript && jsFileCount > 0 && jsFileCount > tsFileCount * 0.3;

    console.log(`[Worker] Code analysis: ${sloc} lines, ${todoCount} TODOs, ${consoleLogCount} console.logs, ${largeFiles.length} large files`);
    console.log(`[Worker] Language mix: ${tsFileCount} TS, ${jsFileCount} JS files (hasTypeScript: ${hasTypeScript}, mixed: ${hasMixedTsJs})`);

    // C. Test Detection
    const testFiles = await glob('**/*.{test,spec}.{js,ts,jsx,tsx}', {
      cwd: TEMP_DIR,
      ignore: 'node_modules/**'
    });
    const testDirFiles = await glob('**/__tests__/**/*.{js,ts,jsx,tsx}', {
      cwd: TEMP_DIR,
      ignore: 'node_modules/**'
    });
    const testFileCount = testFiles.length + testDirFiles.length;

    // Check for test configuration files
    const hasJestConfig = await fs.pathExists(path.join(TEMP_DIR, 'jest.config.js')) ||
                          await fs.pathExists(path.join(TEMP_DIR, 'jest.config.ts'));
    const hasVitestConfig = await fs.pathExists(path.join(TEMP_DIR, 'vitest.config.js')) ||
                            await fs.pathExists(path.join(TEMP_DIR, 'vitest.config.ts'));
    const hasMochaConfig = await fs.pathExists(path.join(TEMP_DIR, '.mocharc.json')) ||
                           await fs.pathExists(path.join(TEMP_DIR, '.mocharc.js'));
    const hasTestConfig = hasJestConfig || hasVitestConfig || hasMochaConfig;

    console.log(`[Worker] Testing: ${testFileCount} test files, config present: ${hasTestConfig}`);

    // D. Documentation Detection
    const readmePath = await glob('README*', { cwd: TEMP_DIR, nocase: true });
    const hasReadme = readmePath.length > 0;
    let readmeLength = 0;
    if (hasReadme) {
      try {
        const readmeContent = await fs.readFile(path.join(TEMP_DIR, readmePath[0]), 'utf-8');
        readmeLength = readmeContent.length;
      } catch (e) {}
    }

    const hasChangelog = (await glob('CHANGELOG*', { cwd: TEMP_DIR, nocase: true })).length > 0;
    const hasContributing = (await glob('CONTRIBUTING*', { cwd: TEMP_DIR, nocase: true })).length > 0;

    console.log(`[Worker] Docs: README (${hasReadme}, ${readmeLength} chars), CHANGELOG: ${hasChangelog}, CONTRIBUTING: ${hasContributing}`);

    // E. Deep Directory Detection
    const allDirs = await glob('**/', { cwd: TEMP_DIR, ignore: 'node_modules/**' });
    const deepDirectories = allDirs.filter(d => d.split('/').length > 6).length;

    console.log(`[Worker] Directory depth: ${deepDirectories} deeply nested directories`)

    // C. Madge (Circular Dependencies)
    console.log('[Worker] Analyzing circular dependencies...');
    const madgeRes = await madge(TEMP_DIR, {
        fileExtensions: ['js', 'ts', 'jsx', 'tsx'],
        excludeRegExp: [/node_modules/, /dist/, /build/, /test/, /\.test\./]
    });
    const circularRaw = madgeRes.circular();
    
    // Categorize by severity
    const circularDependencies = circularRaw.map(cycle => ({
      cycle,
      severity: cycle.length > 5 ? 'critical' : 'warning'
    }));
    
    console.log(`[Worker] Found ${circularDependencies.length} circular dependencies`);

    // D. NCU (Outdated Dependencies) with Enhanced Prioritization
    await updateProgress(db, scanId, SCAN_PHASES.ANALYZING_DEPS, { detail: 'Checking package versions...' });
    let outdatedDependencies = [];
    let enhancedDependencies = [];
    let dependencyAnalysis = null;
    let packageJson = {};

    try {
        // Read current package.json to get installed versions
        const packageJsonPath = path.join(TEMP_DIR, 'package.json');
        packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        const allDeps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies
        };

        const outdatedMap = await ncu.run({
            packageFile: packageJsonPath,
            upgrade: false,
            jsonUpgraded: true,
            silent: true
        });

        // Basic outdated dependencies (legacy format for backwards compatibility)
        outdatedDependencies = Object.entries(outdatedMap || {}).map(([pkg, latest]) => {
            const current = allDeps[pkg] || 'unknown';

            // Determine severity based on semver difference
            let severity = 'Low';
            try {
                const currentMajor = parseInt(current.replace(/[^\d]/g, '').charAt(0) || '0');
                const latestMajor = parseInt(latest.replace(/[^\d]/g, '').charAt(0) || '0');

                if (latestMajor > currentMajor + 2) severity = 'High';
                else if (latestMajor > currentMajor) severity = 'Medium';
            } catch (e) {
                severity = 'Medium';
            }

            return {
                package: pkg,
                current: current,
                latest: latest,
                severity
            };
        });

        console.log(`[Worker] Found ${outdatedDependencies.length} outdated packages`);

        // Enhanced dependency analysis with prioritization
        if (outdatedDependencies.length > 0) {
            console.log('[Worker] Running enhanced dependency prioritization...');
            const enhanced = await analyzeAndPrioritize(outdatedDependencies, packageJson);
            enhancedDependencies = enhanced.enhancedDependencies;
            dependencyAnalysis = enhanced.dependencyAnalysis;
            console.log(`[Worker] Prioritization complete: ${dependencyAnalysis.criticalCount} critical, ${dependencyAnalysis.highCount} high priority`);
        }
    } catch (e) {
        console.warn('[Worker] NCU analysis failed:', e.message);
    }

    // E-2. Multi-Language Package Detection (Python, Ruby, Elixir, Rust, Go)
    let multiLanguagePackages = null;
    try {
        console.log('[Worker] Checking for non-JavaScript package managers...');
        multiLanguagePackages = await analyzeMultiLanguagePackages(TEMP_DIR);

        if (multiLanguagePackages.summary.languages.length > 0) {
            console.log(`[Worker] Found ${multiLanguagePackages.summary.languages.join(', ')} packages`);
            // Merge non-JS outdated packages into the main list
            for (const pkg of multiLanguagePackages.allOutdated) {
                outdatedDependencies.push({
                    package: pkg.package,
                    current: pkg.current,
                    latest: pkg.latest,
                    severity: pkg.severity,
                    language: pkg.language,
                    packageManager: pkg.packageManager
                });
            }
        }
    } catch (e) {
        console.warn('[Worker] Multi-language package detection failed:', e.message);
    }

    // E. Depcheck (Unused & Missing Dependencies)
    console.log('[Worker] Running Depcheck analysis...');
    let unusedDependencies = [];
    let missingDependencies = {};
    
    try {
        const depcheckResult = await new Promise((resolve, reject) => {
            depcheck(TEMP_DIR, {
                ignoreBinPackage: false,
                skipMissing: false,
                ignorePatterns: ['dist', 'build', 'coverage', '.next', '.nuxt']
            }, resolve);
        });
        
        unusedDependencies = depcheckResult.dependencies || [];
        missingDependencies = depcheckResult.missing || {};
        
        console.log(`[Worker] Found ${unusedDependencies.length} unused deps, ${Object.keys(missingDependencies).length} missing deps`);
    } catch (e) {
        console.warn('[Worker] Depcheck failed:', e.message);
    }
    
    // F. Barrel Files Detection
    console.log('[Worker] Detecting barrel files...');
    const barrelFiles = [];
    
    try {
        const indexFiles = await glob('**/index.{ts,tsx,js,jsx}', { 
            cwd: TEMP_DIR, 
            ignore: ['node_modules/**', 'dist/**', 'build/**', '.next/**'] 
        });
        
        for (const file of indexFiles) {
            const fullPath = path.join(TEMP_DIR, file);
            const content = await fs.readFile(fullPath, 'utf-8');
            
            // Count export statements
            const exportMatches = content.match(/^export\s+(\{[^}]+\}|[\*]|\w+)/gm) || [];
            const reExportMatches = content.match(/^export\s+[\*]\s+from/gm) || [];
            const totalExports = exportMatches.length;
            
            // Barrel file heuristic: mostly re-exports
            if (reExportMatches.length > 2 || totalExports > 5) {
                let risk = 'low';
                if (totalExports > 20) risk = 'high';
                else if (totalExports > 10) risk = 'medium';
                
                barrelFiles.push({
                    path: file,
                    exports: totalExports,
                    risk
                });
            }
        }
        
        console.log(`[Worker] Found ${barrelFiles.length} barrel files`);
    } catch (e) {
        console.warn('[Worker] Barrel detection failed:', e.message);
    }

    // 4. Get GitHub metadata as fallback for language breakdown
    let languageBreakdown = {};
    try {
      // Use user's token for API calls
      const githubMeta = githubToken
        ? await getRepoMetadataWithToken(owner, repoName, githubToken)
        : await getRepoMetadata(owner, repoName);
      languageBreakdown = githubMeta.languageBreakdown || {};
    } catch (err) {
      console.warn('[Worker] GitHub API failed, using file extension fallback');
      // Simple fallback: count file extensions
      const extensions = {};
      for (const file of allFiles) {
        const ext = path.extname(file).slice(1);
        extensions[ext] = (extensions[ext] || 0) + 1;
      }
      // Convert to language names
      const extMap = { ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript' };
      Object.entries(extensions).forEach(([ext, count]) => {
        const lang = extMap[ext] || ext.toUpperCase();
        languageBreakdown[lang] = count;
      });
    }

    // 5. Calculate Rule-Based Tech Debt Score
    await updateProgress(db, scanId, SCAN_PHASES.CALCULATING_SCORE, { detail: 'Computing health metrics...' });
    console.log('[Worker] Calculating tech debt score...');
    const score = calculateTechDebtScore({
        // Dependencies
        circularDependencies,
        outdatedDependencies,
        enhancedDependencies,
        dependencyAnalysis,
        unusedDependencies,
        missingDependencies,
        // Architecture
        barrelFiles,
        largeFiles,
        deepDirectories,
        // Code Quality
        hasTypeScript,
        hasMixedTsJs,
        todoCount,
        consoleLogCount,
        // Testing
        testFileCount,
        totalFiles: allFiles.length,
        hasTestConfig,
        // Documentation
        hasReadme,
        readmeLength,
        hasChangelog,
        hasContributing,
        // Repository
        staleBranches,
        deadBranchCount,
        sloc
    });

    // 6. Final Payload (AI analysis disabled - using rule-based scoring only)
    const payload = {
        meta: {
            scanDate: new Date().toISOString(),
            projectName: repoName,
            repoUrl,
            totalFiles: allFiles.length,
            sloc,
            repoAgeDays,
            branchCount: allBranches.length,
            deadBranchCount,
            staleBranches: staleBranches.slice(0, 20), // Limit to top 20
            languageBreakdown,
            // New metrics for expanded scoring
            hasTypeScript,
            hasMixedTsJs,
            testFileCount,
            hasTestConfig,
            hasReadme,
            readmeLength,
            hasChangelog,
            hasContributing
        },
        score,
        issues: {
            circularDependencies,
            barrelFiles,
            largeFiles: largeFiles.slice(0, 20), // Top 20 largest files
            unusedDependencies,
            missingDependencies,
            outdatedDependencies,
            // Enhanced dependency analysis
            enhancedDependencies: enhancedDependencies.length > 0 ? enhancedDependencies : undefined,
            dependencyAnalysis: dependencyAnalysis || undefined,
            // Multi-language package info
            multiLanguagePackages: multiLanguagePackages?.summary?.languages?.length > 0 ? multiLanguagePackages : undefined
        },
        // Code quality metrics with detailed locations
        codeQuality: {
            todoCount,
            consoleLogCount,
            deepDirectories,
            todoItems: todoItems.slice(0, 50), // Top 50 for UI display
            consoleLogItems: consoleLogItems.slice(0, 50) // Top 50 for UI display
        }
        // Note: aiAnalysis removed - now using deterministic rule-based scoring
    };

    // 7. Save to DB
    await updateProgress(db, scanId, SCAN_PHASES.FINALIZING, { 
      detail: 'Saving results...',
      elapsed: Math.round((Date.now() - startTime) / 1000)
    });
    await db.run('UPDATE scans SET status = ?, data = ? WHERE id = ?', ['completed', JSON.stringify(payload), scanId]);

    // Update repository with latest scan info
    await db.run(
      'UPDATE repositories SET "lastScanId" = ?, "lastScore" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?',
      [scanId, score.total, repositoryId]
    );
    
    console.log(`[Worker] Scan ${scanId} completed successfully.`);

  } catch (error) {
    console.error(`[Worker] Scan ${scanId} failed:`, error.message);
    console.error(`[Worker] Error details:`, error.stack?.split('\n').slice(0, 3).join('\n'));
    try {
      await db.run('UPDATE scans SET status = ? WHERE id = ?', ['failed', scanId]);
    } catch (dbError) {
      console.error('[Worker] Failed to update scan status in DB:', dbError.message);
    }
  } finally {
    // 9. Cleanup
    try {
        console.log(`[Worker] Cleaning up temp directory: ${TEMP_DIR}`);
        await fs.remove(TEMP_DIR);
        console.log(`[Worker] Cleanup complete for scan ${scanId}`);
    } catch(e) {
        console.error(`[Worker] Failed to cleanup temp dir:`, e.message);
    }
  }
}

// Note: AI analysis (Gemini) has been disabled in favor of deterministic rule-based scoring.
// The scoring module (./scoring.js) now handles all health score calculations.
// This provides more consistent, explainable, and cost-effective results.
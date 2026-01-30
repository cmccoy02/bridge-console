import fs from 'fs-extra';
import path from 'path';
import { simpleGit } from 'simple-git';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

// Progress phases for update tracking
const UPDATE_PHASES = {
  INITIALIZING: { step: 1, total: 9, label: 'Initializing update...' },
  CLONING: { step: 2, total: 9, label: 'Cloning repository...' },
  CHECKOUT_BRANCH: { step: 3, total: 9, label: 'Preparing patch branch...' },
  CLEAN_INSTALL_1: { step: 4, total: 9, label: 'Clean install (phase 1)...' },
  NPM_UPDATE: { step: 5, total: 9, label: 'Running npm update...' },
  CLEAN_INSTALL_2: { step: 6, total: 9, label: 'Clean install (phase 2)...' },
  VALIDATION: { step: 7, total: 9, label: 'Validating updates...' },
  COMMIT_PUSH: { step: 8, total: 9, label: 'Committing and pushing changes...' },
  CREATE_PR: { step: 9, total: 9, label: 'Creating pull request...' }
};

const PATCH_BRANCH = 'bridge/patch-updates';

// Helper to update job progress in database
async function updateProgress(db, jobId, phase, details = {}) {
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
      'UPDATE update_jobs SET progress = ?, status = ? WHERE id = ?',
      [JSON.stringify(progress), 'running', jobId]
    );
  } catch (e) {
    console.warn('[UpdateWorker] Failed to update progress:', e.message);
  }

  return progress;
}

// Append to logs
async function appendLog(db, jobId, message) {
  const logEntry = `[${new Date().toISOString()}] ${message}\n`;
  console.log(`[UpdateWorker] ${message}`);

  try {
    await db.run(
      'UPDATE update_jobs SET logs = COALESCE(logs, \'\') || ? WHERE id = ?',
      [logEntry, jobId]
    );
  } catch (e) {
    console.warn('[UpdateWorker] Failed to append log:', e.message);
  }
}

// Parse package-lock.json to get actual resolved versions
async function getLockfileVersions(lockFilePath) {
  try {
    const content = await fs.readFile(lockFilePath, 'utf-8');
    const lock = JSON.parse(content);
    const versions = {};

    // npm v7+ uses "packages" with "" as root
    if (lock.packages) {
      for (const [pkgPath, pkgInfo] of Object.entries(lock.packages)) {
        // Skip root package and nested deps
        if (pkgPath === '' || pkgPath.includes('node_modules/node_modules')) continue;

        // Extract package name from path like "node_modules/lodash"
        const match = pkgPath.match(/^node_modules\/(.+)$/);
        if (match && pkgInfo.version) {
          const pkgName = match[1];
          // Skip scoped package nested deps
          if (!pkgName.includes('node_modules')) {
            versions[pkgName] = {
              version: pkgInfo.version,
              dev: pkgInfo.dev || false
            };
          }
        }
      }
    }
    // Fallback for npm v6 format
    else if (lock.dependencies) {
      for (const [name, info] of Object.entries(lock.dependencies)) {
        if (info.version) {
          versions[name] = {
            version: info.version,
            dev: info.dev || false
          };
        }
      }
    }

    return versions;
  } catch (e) {
    console.error('[UpdateWorker] Error parsing lock file:', e.message);
    return {};
  }
}

// Detect which validation scripts are available in package.json
async function detectValidationScripts(packageJsonPath) {
  try {
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);
    const scripts = pkg.scripts || {};

    const available = [];

    // Check for TypeScript/build validation
    if (scripts.build) {
      available.push({ name: 'build', command: 'npm run build', description: 'TypeScript/build check' });
    } else if (scripts['type-check'] || scripts.typecheck) {
      const cmd = scripts['type-check'] ? 'type-check' : 'typecheck';
      available.push({ name: cmd, command: `npm run ${cmd}`, description: 'TypeScript check' });
    }

    // Check for linting
    if (scripts.lint) {
      available.push({ name: 'lint', command: 'npm run lint', description: 'Linting' });
    }

    // Check for tests
    if (scripts.test && !scripts.test.includes('no test specified')) {
      available.push({ name: 'test', command: 'npm test', description: 'Tests' });
    }

    return available;
  } catch (e) {
    console.error('[UpdateWorker] Error detecting validation scripts:', e.message);
    return [];
  }
}

// Run validation scripts and return results
async function runValidation(cwd, scripts, db, jobId, appendLog) {
  const results = {
    passed: true,
    checks: [],
    failedCheck: null
  };

  if (scripts.length === 0) {
    await appendLog(db, jobId, 'No validation scripts found in package.json (build, lint, test)');
    return results;
  }

  await appendLog(db, jobId, `Found ${scripts.length} validation script(s): ${scripts.map(s => s.name).join(', ')}`);

  for (const script of scripts) {
    await appendLog(db, jobId, `Running ${script.description}...`);

    try {
      const { stdout, stderr } = await execPromise(script.command, {
        cwd,
        maxBuffer: 1024 * 1024 * 50,
        timeout: 5 * 60 * 1000 // 5 minute timeout per check
      });

      results.checks.push({
        name: script.name,
        passed: true,
        output: stdout.slice(-500) // Last 500 chars
      });

      await appendLog(db, jobId, `✓ ${script.description} passed`);
    } catch (error) {
      results.passed = false;
      results.failedCheck = script.name;

      // Extract useful error output
      const errorOutput = error.stderr || error.stdout || error.message;
      const truncatedError = errorOutput.slice(-1000); // Last 1000 chars of error

      results.checks.push({
        name: script.name,
        passed: false,
        output: truncatedError
      });

      await appendLog(db, jobId, `✗ ${script.description} failed`);
      await appendLog(db, jobId, `Error output:\n${truncatedError}`);

      // Stop on first failure
      break;
    }
  }

  return results;
}

// Compare two lockfile snapshots to find changes
function findChangedPackages(before, after) {
  const changes = [];

  for (const [name, afterInfo] of Object.entries(after)) {
    const beforeInfo = before[name];
    if (beforeInfo && beforeInfo.version !== afterInfo.version) {
      changes.push({
        name,
        from: beforeInfo.version,
        to: afterInfo.version,
        isDev: afterInfo.dev
      });
    }
  }

  // Sort by name for consistent output
  changes.sort((a, b) => a.name.localeCompare(b.name));
  return changes;
}

// Create PR via GitHub API
async function createPullRequest(accessToken, owner, repo, baseBranch, headBranch, changedPackages, validationResults = null) {
  const title = `chore(deps): update ${changedPackages.length} minor/patch dependencies`;

  const packageList = changedPackages
    .map(p => `- \`${p.name}\`: ${p.from} -> ${p.to}${p.isDev ? ' (dev)' : ''}`)
    .join('\n');

  // Build validation status section
  let validationSection = '';
  if (validationResults && validationResults.checks.length > 0) {
    const checkList = validationResults.checks
      .map(c => `- [x] ${c.name}`)
      .join('\n');
    validationSection = `### Pre-merge Validation
These checks passed before this PR was created:
${checkList}

`;
  }

  const body = `## Automated Dependency Updates

This PR was automatically created by Bridge to update minor and patch versions of dependencies.

### Updated Packages (${changedPackages.length})
${packageList}

### Changes Made
- Ran \`npm update\` to update minor/patch versions
- Performed clean reinstall to ensure lock file consistency
- Validated updates pass project checks

${validationSection}### Testing Checklist
- [ ] CI passes
- [ ] Manual smoke test (if applicable)

---
*Generated by [Bridge](https://github.com/cmccoy02/bridge-console) - Technical Debt Management Platform*`;

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Bridge-Console'
    },
    body: JSON.stringify({
      title,
      body,
      head: headBranch,
      base: baseBranch
    })
  });

  const data = await response.json();

  if (!response.ok) {
    // Check if PR already exists
    if (data.errors && data.errors.some(e => e.message?.includes('A pull request already exists'))) {
      // Try to find existing PR
      const listRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${headBranch}&base=${baseBranch}&state=open`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Bridge-Console'
          }
        }
      );
      const existingPRs = await listRes.json();
      if (existingPRs.length > 0) {
        return { ...existingPRs[0], alreadyExists: true };
      }
    }
    throw new Error(`GitHub API error: ${data.message || response.statusText}`);
  }

  return data;
}

export async function processUpdate(jobId, repository, accessToken, db) {
  // Use TEMP_UPDATES_DIR env var if set, otherwise use system temp directory
  // This ensures it works in all environments (local, Railway, etc.)
  const os = await import('os');
  const tempBase = process.env.TEMP_UPDATES_DIR || path.join(os.tmpdir(), 'bridge-updates');
  const TEMP_DIR = path.join(tempBase, String(jobId));
  const startTime = Date.now();

  try {
    // Mark as started
    await db.run(
      'UPDATE update_jobs SET "startedAt" = CURRENT_TIMESTAMP, status = ? WHERE id = ?',
      ['running', jobId]
    );

    await updateProgress(db, jobId, UPDATE_PHASES.INITIALIZING);
    await appendLog(db, jobId, `Starting update for ${repository.name}`);

    // Validate GitHub access token before proceeding
    await appendLog(db, jobId, 'Validating GitHub access token...');
    try {
      const tokenCheckResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (!tokenCheckResponse.ok) {
        throw new Error('GitHub token is invalid or expired. Please log out and log back in to Bridge to refresh your token.');
      }
      
      const user = await tokenCheckResponse.json();
      await appendLog(db, jobId, `Authenticated as: ${user.login}`);
    } catch (tokenError) {
      throw new Error(`Authentication failed: ${tokenError.message}`);
    }

    // Clean up any existing temp dir
    if (await fs.pathExists(TEMP_DIR)) {
      await fs.remove(TEMP_DIR);
    }

    // Extract owner/repo from URL
    const urlParts = repository.repoUrl.split('/');
    const repoName = urlParts.pop().replace('.git', '');
    const owner = urlParts.pop();

    // 1. Clone repository with auth
    await updateProgress(db, jobId, UPDATE_PHASES.CLONING);
    await appendLog(db, jobId, 'Cloning repository...');

    await fs.ensureDir(TEMP_DIR);
    const git = simpleGit();

    // Clone with access token for push permissions
    // Use x-access-token format for OAuth tokens (more explicit)
    const authUrl = repository.repoUrl.replace(
      'https://github.com',
      `https://x-access-token:${accessToken}@github.com`
    );
    
    // Log partial token for debugging (first 8 chars only)
    await appendLog(db, jobId, `Using OAuth token: ${accessToken.substring(0, 8)}...`);
    
    await git.clone(authUrl, TEMP_DIR);
    await appendLog(db, jobId, 'Repository cloned successfully');

    const repoGit = simpleGit(TEMP_DIR);

    // 2. Checkout/create patch branch
    await updateProgress(db, jobId, UPDATE_PHASES.CHECKOUT_BRANCH);
    await appendLog(db, jobId, `Preparing branch: ${PATCH_BRANCH}`);

    // Fetch all branches
    await repoGit.fetch(['--all']);

    // Get default branch
    const branchData = await repoGit.branch();
    const defaultBranch = branchData.current;
    await appendLog(db, jobId, `Default branch: ${defaultBranch}`);

    // Check if patch branch exists remotely and reset to default
    try {
      await repoGit.checkout(['-B', PATCH_BRANCH, `origin/${defaultBranch}`]);
      await appendLog(db, jobId, `Checked out ${PATCH_BRANCH} from ${defaultBranch}`);
    } catch (e) {
      // Branch might not exist remotely, create from current
      await repoGit.checkout(['-b', PATCH_BRANCH]);
      await appendLog(db, jobId, `Created new branch ${PATCH_BRANCH}`);
    }

    const packageJsonPath = path.join(TEMP_DIR, 'package.json');
    const nodeModulesPath = path.join(TEMP_DIR, 'node_modules');
    const lockFilePath = path.join(TEMP_DIR, 'package-lock.json');

    if (!await fs.pathExists(packageJsonPath)) {
      throw new Error('No package.json found in repository root');
    }

    // 3. Initial install to get current lock file state
    await updateProgress(db, jobId, UPDATE_PHASES.CLEAN_INSTALL_1, { detail: 'Installing current dependencies...' });
    await appendLog(db, jobId, 'Running initial npm install to get current versions...');

    // Clean first
    if (await fs.pathExists(nodeModulesPath)) {
      await fs.remove(nodeModulesPath);
    }
    // Keep existing lock file if present to preserve current versions

    await execPromise('npm install', { cwd: TEMP_DIR, maxBuffer: 1024 * 1024 * 50 });
    await appendLog(db, jobId, 'Initial npm install complete');

    // Capture BEFORE snapshot from lock file
    const beforeSnapshot = await getLockfileVersions(lockFilePath);
    const beforeCount = Object.keys(beforeSnapshot).length;
    await appendLog(db, jobId, `Captured ${beforeCount} package versions from lock file`);

    // 4. Run npm update to get latest minor/patch versions
    await updateProgress(db, jobId, UPDATE_PHASES.NPM_UPDATE, { detail: 'Updating minor/patch versions...' });
    await appendLog(db, jobId, 'Running npm update...');

    await execPromise('npm update --save', { cwd: TEMP_DIR, maxBuffer: 1024 * 1024 * 50 });
    await appendLog(db, jobId, 'npm update complete');

    // Capture AFTER snapshot from lock file
    const afterSnapshot = await getLockfileVersions(lockFilePath);
    const changedPackages = findChangedPackages(beforeSnapshot, afterSnapshot);
    await appendLog(db, jobId, `Found ${changedPackages.length} updated packages`);

    // 5. Clean slate script - Phase 2 (final clean install for consistency)
    await updateProgress(db, jobId, UPDATE_PHASES.CLEAN_INSTALL_2, { detail: 'Final clean install...' });
    await appendLog(db, jobId, 'Running clean install phase 2...');

    await fs.remove(nodeModulesPath);
    await fs.remove(lockFilePath);
    await execPromise('npm install', { cwd: TEMP_DIR, maxBuffer: 1024 * 1024 * 50 });
    await appendLog(db, jobId, 'Final npm install complete');

    if (changedPackages.length === 0) {
      await appendLog(db, jobId, 'No packages were updated - all dependencies are current');

      await db.run(
        'UPDATE update_jobs SET status = ?, result = ?, "completedAt" = CURRENT_TIMESTAMP WHERE id = ?',
        ['completed', JSON.stringify({
          message: 'No updates available',
          changedPackages: [],
          prUrl: null
        }), jobId]
      );

      // Cleanup
      await fs.remove(TEMP_DIR);
      return;
    }

    await appendLog(db, jobId, `Found ${changedPackages.length} updated packages`);
    changedPackages.forEach(p => {
      console.log(`[UpdateWorker]   - ${p.name}: ${p.from} -> ${p.to}`);
    });

    // 6. Validate updates pass build/lint/test
    await updateProgress(db, jobId, UPDATE_PHASES.VALIDATION, { detail: 'Running validation checks...' });
    await appendLog(db, jobId, 'Validating updates...');

    const validationScripts = await detectValidationScripts(packageJsonPath);
    const validationResults = await runValidation(TEMP_DIR, validationScripts, db, jobId, appendLog);

    if (!validationResults.passed) {
      const failedCheck = validationResults.failedCheck;
      const failedOutput = validationResults.checks.find(c => !c.passed)?.output || 'Unknown error';

      await appendLog(db, jobId, `Validation failed: ${failedCheck} check did not pass`);
      await appendLog(db, jobId, 'PR will not be created. Updates may have introduced breaking changes.');

      await db.run(
        'UPDATE update_jobs SET status = ?, result = ?, "completedAt" = CURRENT_TIMESTAMP WHERE id = ?',
        ['failed', JSON.stringify({
          error: `Validation failed: ${failedCheck}`,
          validationResults,
          changedPackages,
          message: 'Updates did not pass validation checks. The PR was not created to prevent breaking changes.'
        }), jobId]
      );

      // Cleanup
      await fs.remove(TEMP_DIR);
      return;
    }

    await appendLog(db, jobId, 'All validation checks passed');

    // 7. Commit and push
    await updateProgress(db, jobId, UPDATE_PHASES.COMMIT_PUSH, { detail: `Committing ${changedPackages.length} package updates...` });
    await appendLog(db, jobId, 'Staging changes...');

    // Check what files changed
    const status = await repoGit.status();
    await appendLog(db, jobId, `Modified files: ${status.modified.join(', ')}`);

    await repoGit.add(['package.json', 'package-lock.json']);

    const commitMessage = `chore(deps): update ${changedPackages.length} minor/patch dependencies

Updated packages:
${changedPackages.map(p => `- ${p.name}: ${p.from} -> ${p.to}`).join('\n')}

Generated by Bridge`;

    await repoGit.commit(commitMessage);
    await appendLog(db, jobId, 'Changes committed');

    // Push (force to handle branch already existing with old commits)
    await appendLog(db, jobId, `Pushing to origin/${PATCH_BRANCH}...`);
    
    // Set environment variables to prevent git from prompting for credentials
    // GIT_TERMINAL_PROMPT=0 prevents interactive prompts
    // GIT_ASKPASS=echo prevents credential helper prompts
    const pushEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: 'echo'
    };
    
    try {
      await repoGit.env(pushEnv).push(['--force', '-u', 'origin', PATCH_BRANCH]);
      await appendLog(db, jobId, `Pushed to origin/${PATCH_BRANCH}`);
    } catch (pushError) {
      // More detailed error logging for push failures
      await appendLog(db, jobId, `Push failed: ${pushError.message}`);
      throw new Error(`Failed to push to GitHub: ${pushError.message}. Check that your GitHub token has 'repo' write permissions.`);
    }

    // 7. Create PR
    await updateProgress(db, jobId, UPDATE_PHASES.CREATE_PR, { detail: 'Creating pull request...' });
    await appendLog(db, jobId, 'Creating pull request...');

    const pr = await createPullRequest(
      accessToken,
      owner,
      repoName,
      defaultBranch,
      PATCH_BRANCH,
      changedPackages,
      validationResults
    );

    if (pr.alreadyExists) {
      await appendLog(db, jobId, `Pull request already exists: ${pr.html_url}`);
    } else {
      await appendLog(db, jobId, `Pull request created: ${pr.html_url}`);
    }

    // 8. Mark complete
    const elapsedMs = Date.now() - startTime;
    await appendLog(db, jobId, `Update completed in ${Math.round(elapsedMs / 1000)}s`);

    const result = {
      prUrl: pr.html_url,
      prNumber: pr.number,
      changedPackages,
      baseBranch: defaultBranch,
      headBranch: PATCH_BRANCH
    };

    await db.run(
      'UPDATE update_jobs SET status = ?, result = ?, "completedAt" = CURRENT_TIMESTAMP WHERE id = ?',
      ['completed', JSON.stringify(result), jobId]
    );

    console.log(`[UpdateWorker] Job ${jobId} completed successfully. PR: ${pr.html_url}`);

  } catch (error) {
    console.error(`[UpdateWorker] Job ${jobId} failed:`, error);
    await appendLog(db, jobId, `ERROR: ${error.message}`);

    await db.run(
      'UPDATE update_jobs SET status = ?, result = ?, "completedAt" = CURRENT_TIMESTAMP WHERE id = ?',
      ['failed', JSON.stringify({ error: error.message }), jobId]
    );
  } finally {
    // Cleanup temp directory
    try {
      if (await fs.pathExists(TEMP_DIR)) {
        await fs.remove(TEMP_DIR);
      }
    } catch (e) {
      console.warn(`[UpdateWorker] Cleanup failed for job ${jobId}:`, e.message);
    }
  }
}

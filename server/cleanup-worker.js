import fs from 'fs-extra';
import path from 'path';
import { simpleGit } from 'simple-git';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

// Progress phases for cleanup tracking
const CLEANUP_PHASES = {
  INITIALIZING: { step: 1, total: 6, label: 'Initializing cleanup...' },
  CLONING: { step: 2, total: 6, label: 'Cloning repository...' },
  CHECKOUT_BRANCH: { step: 3, total: 6, label: 'Preparing cleanup branch...' },
  REMOVING_DEPS: { step: 4, total: 6, label: 'Removing unused dependencies...' },
  COMMIT_PUSH: { step: 5, total: 6, label: 'Committing and pushing changes...' },
  CREATE_PR: { step: 6, total: 6, label: 'Creating pull request...' }
};

const CLEANUP_BRANCH = 'bridge/remove-unused-deps';

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
      'UPDATE cleanup_jobs SET progress = ?, status = ? WHERE id = ?',
      [JSON.stringify(progress), 'running', jobId]
    );
  } catch (e) {
    console.warn('[CleanupWorker] Failed to update progress:', e.message);
  }

  return progress;
}

// Append to logs
async function appendLog(db, jobId, message) {
  const logEntry = `[${new Date().toISOString()}] ${message}\n`;
  console.log(`[CleanupWorker] ${message}`);

  try {
    await db.run(
      'UPDATE cleanup_jobs SET logs = COALESCE(logs, \'\') || ? WHERE id = ?',
      [logEntry, jobId]
    );
  } catch (e) {
    console.warn('[CleanupWorker] Failed to append log:', e.message);
  }
}

export async function processCleanup(jobId, repository, packagesToRemove, accessToken, db) {
  const tempBase = process.env.TEMP_UPDATES_DIR || path.resolve('./temp_updates');
  const TEMP_DIR = path.join(tempBase, `cleanup-${jobId}`);
  const startTime = Date.now();

  try {
    // Mark as started
    await db.run(
      'UPDATE cleanup_jobs SET "startedAt" = CURRENT_TIMESTAMP, status = ? WHERE id = ?',
      ['running', jobId]
    );

    await updateProgress(db, jobId, CLEANUP_PHASES.INITIALIZING);
    await appendLog(db, jobId, `Starting cleanup for ${repository.name}`);
    await appendLog(db, jobId, `Packages to remove: ${packagesToRemove.join(', ')}`);

    // Validate GitHub access token
    await appendLog(db, jobId, 'Validating GitHub access token...');
    try {
      const tokenCheckResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!tokenCheckResponse.ok) {
        throw new Error('GitHub token is invalid or expired');
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

    // 1. Clone repository
    await updateProgress(db, jobId, CLEANUP_PHASES.CLONING);
    await appendLog(db, jobId, 'Cloning repository...');

    await fs.ensureDir(TEMP_DIR);
    const git = simpleGit();

    const authUrl = repository.repoUrl.replace(
      'https://github.com',
      `https://x-access-token:${accessToken}@github.com`
    );

    await git.clone(authUrl, TEMP_DIR);
    await appendLog(db, jobId, 'Repository cloned successfully');

    const repoGit = simpleGit(TEMP_DIR);

    // 2. Checkout/create cleanup branch
    await updateProgress(db, jobId, CLEANUP_PHASES.CHECKOUT_BRANCH);
    await appendLog(db, jobId, `Preparing branch: ${CLEANUP_BRANCH}`);

    await repoGit.fetch(['--all']);

    const branchData = await repoGit.branch();
    const defaultBranch = branchData.current;
    await appendLog(db, jobId, `Default branch: ${defaultBranch}`);

    try {
      await repoGit.checkout(['-B', CLEANUP_BRANCH, `origin/${defaultBranch}`]);
      await appendLog(db, jobId, `Checked out ${CLEANUP_BRANCH} from ${defaultBranch}`);
    } catch (e) {
      await repoGit.checkout(['-b', CLEANUP_BRANCH]);
      await appendLog(db, jobId, `Created new branch ${CLEANUP_BRANCH}`);
    }

    const packageJsonPath = path.join(TEMP_DIR, 'package.json');

    if (!await fs.pathExists(packageJsonPath)) {
      throw new Error('No package.json found in repository root');
    }

    // 3. Remove unused dependencies from package.json
    await updateProgress(db, jobId, CLEANUP_PHASES.REMOVING_DEPS);
    await appendLog(db, jobId, 'Removing unused dependencies...');

    const packageJson = await fs.readJson(packageJsonPath);
    const removedDeps = [];
    const removedDevDeps = [];

    for (const pkg of packagesToRemove) {
      if (packageJson.dependencies && packageJson.dependencies[pkg]) {
        delete packageJson.dependencies[pkg];
        removedDeps.push(pkg);
        await appendLog(db, jobId, `Removed ${pkg} from dependencies`);
      }
      if (packageJson.devDependencies && packageJson.devDependencies[pkg]) {
        delete packageJson.devDependencies[pkg];
        removedDevDeps.push(pkg);
        await appendLog(db, jobId, `Removed ${pkg} from devDependencies`);
      }
    }

    if (removedDeps.length === 0 && removedDevDeps.length === 0) {
      await appendLog(db, jobId, 'No packages found to remove');

      await db.run(
        'UPDATE cleanup_jobs SET status = ?, result = ?, "completedAt" = CURRENT_TIMESTAMP WHERE id = ?',
        ['completed', JSON.stringify({
          message: 'No packages found to remove',
          removedPackages: [],
          prUrl: null
        }), jobId]
      );

      await fs.remove(TEMP_DIR);
      return;
    }

    // Write updated package.json
    await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
    await appendLog(db, jobId, 'Updated package.json');

    // Run npm install to update lock file
    await appendLog(db, jobId, 'Running npm install to update lock file...');
    const lockFilePath = path.join(TEMP_DIR, 'package-lock.json');
    const nodeModulesPath = path.join(TEMP_DIR, 'node_modules');

    if (await fs.pathExists(nodeModulesPath)) {
      await fs.remove(nodeModulesPath);
    }
    if (await fs.pathExists(lockFilePath)) {
      await fs.remove(lockFilePath);
    }

    await execPromise('npm install', { cwd: TEMP_DIR, maxBuffer: 1024 * 1024 * 50 });
    await appendLog(db, jobId, 'npm install complete');

    // 4. Commit and push
    await updateProgress(db, jobId, CLEANUP_PHASES.COMMIT_PUSH);
    await appendLog(db, jobId, 'Committing changes...');

    const allRemoved = [...removedDeps, ...removedDevDeps];
    const commitMessage = allRemoved.length === 1
      ? `chore(deps): remove unused dependency ${allRemoved[0]}`
      : `chore(deps): remove ${allRemoved.length} unused dependencies\n\nRemoved:\n${allRemoved.map(p => `- ${p}`).join('\n')}`;

    await repoGit.add(['package.json', 'package-lock.json']);
    await repoGit.commit(commitMessage);
    await appendLog(db, jobId, 'Changes committed');

    await repoGit.push(['--force', '-u', 'origin', CLEANUP_BRANCH]);
    await appendLog(db, jobId, `Pushed to ${CLEANUP_BRANCH}`);

    // 5. Create Pull Request
    await updateProgress(db, jobId, CLEANUP_PHASES.CREATE_PR);
    await appendLog(db, jobId, 'Creating pull request...');

    const prTitle = allRemoved.length === 1
      ? `Remove unused dependency: ${allRemoved[0]}`
      : `Remove ${allRemoved.length} unused dependencies`;

    const prBody = `## Summary

This PR removes unused dependencies identified by Bridge.

### Removed Packages
${allRemoved.map(p => `- \`${p}\``).join('\n')}

### Why these packages?
These packages were detected as unused by static analysis. They are not imported anywhere in the codebase.

### Testing
- [ ] Run \`npm install\` to verify dependencies resolve correctly
- [ ] Run your test suite to ensure no runtime dependencies were missed
- [ ] Build your application to verify it compiles successfully

---
Generated by [Bridge](https://github.com/bridge-console/bridge)`;

    const prResponse = await fetch(`https://api.github.com/repos/${owner}/${repoName}/pulls`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: prTitle,
        body: prBody,
        head: CLEANUP_BRANCH,
        base: defaultBranch
      })
    });

    let prUrl = null;
    if (prResponse.ok) {
      const pr = await prResponse.json();
      prUrl = pr.html_url;
      await appendLog(db, jobId, `Pull request created: ${prUrl}`);
    } else {
      const errorText = await prResponse.text();
      await appendLog(db, jobId, `PR creation failed: ${errorText}`);

      // PR might already exist
      if (prResponse.status === 422) {
        await appendLog(db, jobId, 'PR may already exist - checking...');

        const existingPRResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repoName}/pulls?head=${owner}:${CLEANUP_BRANCH}&state=open`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          }
        );

        if (existingPRResponse.ok) {
          const prs = await existingPRResponse.json();
          if (prs.length > 0) {
            prUrl = prs[0].html_url;
            await appendLog(db, jobId, `Found existing PR: ${prUrl}`);
          }
        }
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    await appendLog(db, jobId, `Cleanup completed in ${duration}s`);

    await db.run(
      'UPDATE cleanup_jobs SET status = ?, result = ?, "completedAt" = CURRENT_TIMESTAMP WHERE id = ?',
      ['completed', JSON.stringify({
        message: `Removed ${allRemoved.length} unused dependencies`,
        removedPackages: allRemoved,
        prUrl
      }), jobId]
    );

    // Cleanup temp directory
    await fs.remove(TEMP_DIR);

  } catch (error) {
    console.error('[CleanupWorker] Error:', error);
    await appendLog(db, jobId, `ERROR: ${error.message}`);

    await db.run(
      'UPDATE cleanup_jobs SET status = ?, result = ?, "completedAt" = CURRENT_TIMESTAMP WHERE id = ?',
      ['failed', JSON.stringify({ error: error.message }), jobId]
    );

    // Cleanup on error
    if (await fs.pathExists(TEMP_DIR)) {
      await fs.remove(TEMP_DIR);
    }
  }
}

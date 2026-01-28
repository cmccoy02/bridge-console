/**
 * Security Fix Worker
 * Handles the autonomous security fix workflow:
 * Clone → Generate Fix → Apply Patch → Commit → Create PR
 *
 * Bridge becomes the engineer that lives inside your code.
 */

import fs from 'fs-extra';
import path from 'path';
import { simpleGit } from 'simple-git';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SECURITY_AGENT_PATH = path.join(__dirname, '..', 'security-agent');

// Progress phases for security fix tracking
const FIX_PHASES = {
  INITIALIZING: { step: 1, total: 7, label: 'Initializing security fix...' },
  CLONING: { step: 2, total: 7, label: 'Cloning repository...' },
  GENERATING_FIX: { step: 3, total: 7, label: 'Generating AI-powered fix...' },
  APPLYING_PATCH: { step: 4, total: 7, label: 'Applying security patch...' },
  VALIDATING: { step: 5, total: 7, label: 'Validating changes...' },
  COMMITTING: { step: 6, total: 7, label: 'Committing changes...' },
  CREATING_PR: { step: 7, total: 7, label: 'Creating pull request...' }
};

// Helper to update job progress
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
      'UPDATE security_fix_jobs SET progress = ?, status = ? WHERE id = ?',
      [JSON.stringify(progress), 'running', jobId]
    );
  } catch (e) {
    console.warn('[SecurityFixWorker] Failed to update progress:', e.message);
  }

  return progress;
}

// Append to logs
async function appendLog(db, jobId, message) {
  const logEntry = `[${new Date().toISOString()}] ${message}\n`;
  console.log(`[SecurityFixWorker] ${message}`);

  try {
    await db.run(
      'UPDATE security_fix_jobs SET logs = COALESCE(logs, \'\') || ? WHERE id = ?',
      [logEntry, jobId]
    );
  } catch (e) {
    console.warn('[SecurityFixWorker] Failed to append log:', e.message);
  }
}

// Generate AI fix using Python security agent
async function generateAIFix(finding) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PYTHONPATH: SECURITY_AGENT_PATH,
    };

    const findingJson = JSON.stringify(finding)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");

    const pythonScript = `
import sys
import json
sys.path.insert(0, '${SECURITY_AGENT_PATH.replace(/\\/g, '\\\\')}')

from ai_fixer import AIFixer

fixer = AIFixer()
finding = json.loads('${findingJson}')
result = fixer.generate_secure_solution(finding)

print(json.dumps(result), flush=True)
`;

    const pythonProcess = spawn('python3', ['-c', pythonScript], {
      cwd: SECURITY_AGENT_PATH,
      env,
    });

    let outputBuffer = '';
    let errorBuffer = '';

    pythonProcess.stdout.on('data', (data) => {
      outputBuffer += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorBuffer += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          error: `AI fix generation failed: ${errorBuffer}`,
        });
        return;
      }

      try {
        const result = JSON.parse(outputBuffer.trim());
        resolve(result);
      } catch (e) {
        resolve({
          success: false,
          error: `Failed to parse AI fix: ${e.message}`,
        });
      }
    });

    pythonProcess.on('error', (err) => {
      resolve({
        success: false,
        error: `Failed to start AI fixer: ${err.message}`,
      });
    });
  });
}

// Apply the patch using Python patcher
async function applyPatch(repoPath, finding, fix) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PYTHONPATH: SECURITY_AGENT_PATH,
    };

    const findingJson = JSON.stringify(finding)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");
    const fixJson = JSON.stringify(fix)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");

    const pythonScript = `
import sys
import json
sys.path.insert(0, '${SECURITY_AGENT_PATH.replace(/\\/g, '\\\\')}')

from patcher import SecurityPatcher

patcher = SecurityPatcher('${repoPath.replace(/\\/g, '\\\\')}')
finding = json.loads('${findingJson}')
fix = json.loads('${fixJson}')

result = patcher.apply_fix(finding, fix)
print(json.dumps(result), flush=True)
`;

    const pythonProcess = spawn('python3', ['-c', pythonScript], {
      cwd: SECURITY_AGENT_PATH,
      env,
    });

    let outputBuffer = '';
    let errorBuffer = '';

    pythonProcess.stdout.on('data', (data) => {
      outputBuffer += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorBuffer += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          error: `Patch application failed: ${errorBuffer}`,
        });
        return;
      }

      try {
        const result = JSON.parse(outputBuffer.trim());
        resolve(result);
      } catch (e) {
        resolve({
          success: false,
          error: `Failed to parse patch result: ${e.message}`,
        });
      }
    });

    pythonProcess.on('error', (err) => {
      resolve({
        success: false,
        error: `Failed to start patcher: ${err.message}`,
      });
    });
  });
}

// Create a pull request on GitHub
async function createSecurityPR(accessToken, owner, repo, baseBranch, headBranch, finding, fix) {
  const severityEmoji = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🔵'
  };

  const emoji = severityEmoji[finding.severity] || '⚠️';
  const issueTitle = finding.issue.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const title = `${emoji} Security Fix: ${issueTitle} in ${finding.file}`;

  const body = `## 🛡️ Automated Security Fix

This PR was automatically created by **Bridge** to fix a security vulnerability.

### Vulnerability Details
| Field | Value |
|-------|-------|
| **Issue** | ${issueTitle} |
| **Severity** | ${finding.severity.toUpperCase()} |
| **CWE** | ${finding.cwe} |
| **File** | \`${finding.file}\` |
| **Line** | ${finding.line} |

### Vulnerable Code
\`\`\`${finding.language || ''}
${finding.code}
\`\`\`

### Applied Fix
\`\`\`${finding.language || ''}
${fix.solution_code || 'See diff for changes'}
\`\`\`

### AI Explanation
${fix.explanation || 'No explanation provided.'}

### Testing Checklist
- [ ] CI passes
- [ ] Security scan confirms fix
- [ ] Code review completed
- [ ] Manual testing (if applicable)

### References
- [CWE-${finding.cwe.split('-')[1]}](https://cwe.mitre.org/data/definitions/${finding.cwe.split('-')[1]}.html)
${finding.owasp ? `- OWASP: ${finding.owasp}` : ''}

---
*🤖 Automatically generated by [Bridge](https://github.com/cmccoy02/bridge-console) - The engineer that lives inside your code*`;

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

/**
 * Process a security fix job
 * @param {number} jobId - The job ID
 * @param {object} repository - Repository info
 * @param {object} finding - The security finding to fix
 * @param {string} accessToken - GitHub access token
 * @param {object} db - Database connection
 */
export async function processSecurityFix(jobId, repository, finding, accessToken, db) {
  const tempBase = process.env.TEMP_UPDATES_DIR || path.resolve('./temp_updates');
  const TEMP_DIR = path.join(tempBase, `security-fix-${jobId}`);
  const startTime = Date.now();

  // Generate branch name from finding
  const branchName = `bridge/security-fix-${finding.cwe.toLowerCase()}-${Date.now()}`;

  try {
    // 1. Initialize
    await updateProgress(db, jobId, FIX_PHASES.INITIALIZING);
    await appendLog(db, jobId, `Starting security fix for ${finding.issue} in ${finding.file}`);

    // Ensure temp directory exists and is clean
    await fs.remove(TEMP_DIR);
    await fs.ensureDir(TEMP_DIR);

    // Extract owner/repo from URL
    const urlParts = repository.repoUrl.split('/');
    const repoName = urlParts.pop().replace('.git', '');
    const owner = urlParts.pop();

    // 2. Clone repository
    await updateProgress(db, jobId, FIX_PHASES.CLONING);
    await appendLog(db, jobId, `Cloning ${repository.repoUrl}...`);

    const git = simpleGit();
    const cloneUrl = `https://x-access-token:${accessToken}@github.com/${owner}/${repoName}.git`;

    await git.clone(cloneUrl, TEMP_DIR, ['--depth', '100']);
    await appendLog(db, jobId, 'Repository cloned successfully');

    const repoGit = simpleGit(TEMP_DIR);

    // Get default branch
    const remoteInfo = await repoGit.remote(['show', 'origin']);
    const defaultBranchMatch = remoteInfo.match(/HEAD branch: (\S+)/);
    const defaultBranch = defaultBranchMatch ? defaultBranchMatch[1] : 'main';
    await appendLog(db, jobId, `Default branch: ${defaultBranch}`);

    // Create fix branch
    await repoGit.checkoutLocalBranch(branchName);
    await appendLog(db, jobId, `Created branch: ${branchName}`);

    // 3. Generate AI fix
    await updateProgress(db, jobId, FIX_PHASES.GENERATING_FIX);
    await appendLog(db, jobId, 'Generating AI-powered security fix...');

    const fix = await generateAIFix(finding);

    if (!fix.success) {
      throw new Error(`Failed to generate fix: ${fix.error}`);
    }

    await appendLog(db, jobId, `Fix generated successfully`);

    // 4. Apply patch
    await updateProgress(db, jobId, FIX_PHASES.APPLYING_PATCH);
    await appendLog(db, jobId, `Applying patch to ${finding.file}:${finding.line}...`);

    const patchResult = await applyPatch(TEMP_DIR, finding, fix);

    if (!patchResult.success) {
      throw new Error(`Failed to apply patch: ${patchResult.error}`);
    }

    await appendLog(db, jobId, `Patch applied: ${patchResult.strategy || 'unknown strategy'}`);

    // 5. Validate (check file was modified)
    await updateProgress(db, jobId, FIX_PHASES.VALIDATING);
    await appendLog(db, jobId, 'Validating changes...');

    const status = await repoGit.status();

    if (status.modified.length === 0 && status.created.length === 0) {
      throw new Error('No files were modified. Patch may not have been applied correctly.');
    }

    await appendLog(db, jobId, `Modified files: ${status.modified.join(', ')}`);

    // 6. Commit changes
    await updateProgress(db, jobId, FIX_PHASES.COMMITTING);
    await appendLog(db, jobId, 'Committing changes...');

    const issueTitle = finding.issue.replace(/-/g, ' ');
    const commitMessage = `fix(security): ${issueTitle} in ${finding.file}

- Fixed ${finding.cwe} vulnerability
- Severity: ${finding.severity}
- Line: ${finding.line}

Generated by Bridge Security Agent`;

    await repoGit.add('.');
    await repoGit.commit(commitMessage);

    // Push branch
    const pushEnv = {
      GIT_ASKPASS: 'echo',
      GIT_TERMINAL_PROMPT: '0'
    };

    await repoGit.env(pushEnv).push(['-u', 'origin', branchName]);
    await appendLog(db, jobId, `Pushed to origin/${branchName}`);

    // 7. Create PR
    await updateProgress(db, jobId, FIX_PHASES.CREATING_PR);
    await appendLog(db, jobId, 'Creating pull request...');

    const pr = await createSecurityPR(
      accessToken,
      owner,
      repoName,
      defaultBranch,
      branchName,
      finding,
      fix
    );

    await appendLog(db, jobId, `Pull request created: ${pr.html_url}`);

    // Success!
    const duration = Math.round((Date.now() - startTime) / 1000);

    await db.run(
      `UPDATE security_fix_jobs SET
        status = 'completed',
        result = ?,
        "completedAt" = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify({
        success: true,
        prUrl: pr.html_url,
        prNumber: pr.number,
        branch: branchName,
        fix: {
          file: finding.file,
          line: finding.line,
          issue: finding.issue,
          severity: finding.severity
        },
        duration
      }), jobId]
    );

    return {
      success: true,
      prUrl: pr.html_url,
      prNumber: pr.number
    };

  } catch (error) {
    console.error(`[SecurityFixWorker] Job ${jobId} failed:`, error);

    await db.run(
      `UPDATE security_fix_jobs SET
        status = 'failed',
        result = ?,
        "completedAt" = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify({
        success: false,
        error: error.message
      }), jobId]
    );

    return {
      success: false,
      error: error.message
    };

  } finally {
    // Cleanup temp directory
    try {
      await fs.remove(TEMP_DIR);
    } catch (e) {
      console.warn('[SecurityFixWorker] Failed to cleanup temp dir:', e.message);
    }
  }
}
